import { randomUUID } from 'node:crypto'
import type { McpEnvironmentStatus, McpPythonInfo, PythonDependencyTask } from '../shared/contracts.js'
import type { PythonEnvironmentApi } from './python-environment-api.js'
import type { PythonUpdaterService } from './python-updater-service.js'

export type PythonCoreStartupResult =
  | { state: 'runtime-unavailable'; status: McpEnvironmentStatus }
  | { state: 'sync-running'; taskId: string }
  | { state: 'sync-paused'; taskId: string }
  | { state: 'sync-failed'; taskId?: string; error?: string }
  | { state: 'sync-partial'; taskId: string; layer: 'science'; info?: McpPythonInfo }
  | { state: 'core-ready'; info: McpPythonInfo }
  | { state: 'inventory-unavailable'; info?: McpPythonInfo }

export interface PythonStartupOptions {
  /** Maximum time spent waiting for one durable task receipt. */
  taskTimeoutMs?: number
  /** Maximum time allowed without a task progress change. */
  taskNoProgressTimeoutMs?: number
  /** Poll interval used while waiting for a durable task receipt. */
  taskPollIntervalMs?: number
  /** Aborts startup reconciliation when the application is closing. */
  signal?: AbortSignal
}

/**
 * Start the signed Python dependency pipeline after the desktop is usable.
 * The caller deliberately invokes this without awaiting it: bootstrap and
 * dependency work use the durable worker queue and never hold up navigation.
 */
export async function ensurePythonCoreAtStartup(
  updater: Pick<PythonUpdaterService, 'checkForUpdates' | 'pythonCoreInfo'> & Partial<Pick<PythonUpdaterService, 'autoUpdate'>>,
  api: Pick<PythonEnvironmentApi, 'request' | 'persistRuntimeSummary'> & Partial<Pick<PythonEnvironmentApi, 'resumeAutomaticSyncTask'>>,
  makeRequestId: () => string = () => randomUUID(),
  options: PythonStartupOptions = {},
): Promise<PythonCoreStartupResult> {
  // `autoUpdate` performs only the signed runtime bootstrap/recovery. The
  // dependency manifests are checked by each queued sync below, so an online
  // catalog update is applied without a second user action.
  const status = await (updater.autoUpdate?.() ?? updater.checkForUpdates())
  const saved = await api.request({ action: 'status', requestId: makeRequestId() })
  const savedTask = saved.task as PythonDependencyTask | undefined
  // A startup-owned sync can outlive the desktop process. Wait for its durable
  // receipt before coordinating the next layer; returning here would resume
  // core on restart and permanently skip the science layer.
  const taskTimeoutMs = options.taskTimeoutMs ?? 120_000
  const taskNoProgressTimeoutMs = options.taskNoProgressTimeoutMs ?? 30_000
  const taskPollIntervalMs = options.taskPollIntervalMs ?? 500
  let recoveredCoreTaskSucceeded = false
  let recoveredScienceTaskFinished = false
  let partialTaskId: string | undefined
  const wait = async (milliseconds: number): Promise<void> => {
    if (options.signal?.aborted) throw new Error('Python dependency synchronization was cancelled.')
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        options.signal?.removeEventListener('abort', onAbort)
        resolve()
      }, milliseconds)
      const onAbort = () => {
        clearTimeout(timer)
        reject(new Error('Python dependency synchronization was cancelled.'))
      }
      options.signal?.addEventListener('abort', onAbort, { once: true })
    })
  }
  const waitForExistingTask = async (taskId: string): Promise<PythonCoreStartupResult | undefined> => {
    const startedAt = Date.now()
    let lastProgress = startedAt
    let lastSignature = ''
    for (;;) {
      if (options.signal?.aborted) return { state: 'sync-failed', taskId, error: 'Python dependency synchronization was cancelled.' }
      if (Date.now() - startedAt > taskTimeoutMs) return { state: 'sync-failed', taskId, error: 'Python dependency synchronization timed out.' }
      const current = await api.request({ action: 'task_status', taskId, requestId: makeRequestId() })
      const task = current.task as PythonDependencyTask | undefined
      if (!task) return { state: 'sync-failed', taskId, error: 'Python task receipt unavailable.' }
      const signature = JSON.stringify([task.state, task.progress, task.completedPackages, task.totalPackages, task.currentPackage, task.updatedAt])
      if (signature !== lastSignature) { lastSignature = signature; lastProgress = Date.now() }
      if (task.state === 'queued' || task.state === 'running') {
        if (Date.now() - lastProgress > taskNoProgressTimeoutMs) return { state: 'sync-failed', taskId, error: 'Python dependency synchronization made no progress.' }
        try { await wait(taskPollIntervalMs) } catch (error) { return { state: 'sync-failed', taskId, error: error instanceof Error ? error.message : String(error) } }
        continue
      }
      if (task.state === 'succeeded') {
        if (task.layer === 'core') recoveredCoreTaskSucceeded = true
        if (task.layer === 'science') recoveredScienceTaskFinished = true
        return undefined
      }
      if (task.state === 'partial') {
        if (task.layer === 'science') {
          recoveredScienceTaskFinished = true
          partialTaskId = task.taskId
          return undefined
        }
        return { state: 'sync-failed', taskId, error: 'Core Python dependency task completed partially; core dependencies are not ready.' }
      }
      return { state: 'sync-failed', taskId, error: task.error ?? task.message }
    }
  }
  if (savedTask && (savedTask.state === 'queued' || savedTask.state === 'running')) {
    if (savedTask.automatic && savedTask.action === 'sync') {
      const failure = await waitForExistingTask(savedTask.taskId)
      if (failure) return failure
    } else return { state: 'sync-running', taskId: savedTask.taskId }
  }
  if (savedTask && savedTask.state === 'interrupted') {
    if (savedTask.automatic && api.resumeAutomaticSyncTask) {
      try {
        const resumed = await api.resumeAutomaticSyncTask(savedTask.taskId)
        if (resumed) {
          const failure = await waitForExistingTask(savedTask.taskId)
          if (failure) return failure
        } else return { state: 'sync-paused', taskId: savedTask.taskId }
      } catch (error) {
        return { state: 'sync-failed', taskId: savedTask.taskId, error: error instanceof Error ? error.message : String(error) }
      }
    } else return { state: 'sync-paused', taskId: savedTask.taskId }
  }
  // `autoUpdate()` can return `paused` while the updater has found a durable
  // package job to recover. After its receipt succeeds, that original status
  // is stale: use the fresh local core inventory below to verify readiness.
  // Do not consult the optional online runtime feed before dependency sync.
  const recoveredTask = recoveredCoreTaskSucceeded || recoveredScienceTaskFinished
  if (!recoveredTask && status.phase !== 'ready' && status.phase !== 'manual') return { state: 'runtime-unavailable', status }

  // Only inspect the signed core closure, not the full Python
  // site-packages inventory or the much larger science dependency layer.
  const info = await updater.pythonCoreInfo()
  await api.persistRuntimeSummary(info)
  if (!info.ready) return { state: 'inventory-unavailable', info }

  const waitForSync = async (layer: 'core' | 'science'): Promise<PythonCoreStartupResult | undefined> => {
    const accepted = await api.request({ action: 'sync', layer, confirm: true, automatic: true, requestId: makeRequestId() })
    const taskId = typeof accepted.taskId === 'string' ? accepted.taskId : undefined
    if (!taskId) return { state: 'sync-failed', error: 'Python sync task did not return a durable task ID.' }
    return waitForExistingTask(taskId)
  }

  // Always reconcile both signed layers. The automatic flag makes the
  // manifest comparison include compatible version changes, so an already
  // healthy interpreter still receives online dependency updates.
  const coreFailure = recoveredCoreTaskSucceeded && info.coreReady === true ? undefined : await waitForSync('core')
  if (coreFailure) return coreFailure
  // Core is required by every consumer. Once it is verified, reconcile the
  // signed science layer in the same durable queue. Existing packages are
  // retained unless the signed manifest explicitly changed their version.
  const scienceFailure = recoveredScienceTaskFinished ? undefined : await waitForSync('science')
  if (scienceFailure) return scienceFailure
  const finalInfo = await updater.pythonCoreInfo()
  await api.persistRuntimeSummary(finalInfo)
  if (partialTaskId) return { state: 'sync-partial', taskId: partialTaskId, layer: 'science', info: finalInfo }
  return finalInfo.ready && finalInfo.coreReady === true ? { state: 'core-ready', info: finalInfo } : { state: 'inventory-unavailable', info: finalInfo }
}
