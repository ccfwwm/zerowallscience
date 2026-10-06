import { randomUUID } from 'node:crypto'
import type { McpEnvironmentStatus, McpPythonInfo, PythonDependencyTask } from '../shared/contracts.js'
import type { PythonEnvironmentApi } from './python-environment-api.js'
import type { PythonUpdaterService } from './python-updater-service.js'

export type PythonCoreStartupResult =
  | { state: 'runtime-unavailable'; status: McpEnvironmentStatus }
  | { state: 'sync-running'; taskId: string }
  | { state: 'sync-started'; taskId: string }
  | { state: 'core-ready'; info: McpPythonInfo }
  | { state: 'inventory-unavailable'; info?: McpPythonInfo }

/**
 * First-run orchestration for the small Python bootstrap and its signed core
 * dependency layer. This runs outside app launch and returns as soon as the
 * durable 42-package task has been queued.
 */
export async function ensurePythonCoreAtStartup(
  updater: Pick<PythonUpdaterService, 'autoUpdate' | 'pythonCoreInfo' | 'resumeAutomaticCoreOperation'>,
  api: Pick<PythonEnvironmentApi, 'request' | 'persistRuntimeSummary' | 'resumeCoreSyncTask'>,
  makeRequestId: () => string = () => randomUUID(),
): Promise<PythonCoreStartupResult> {
  // autoUpdate restores updater receipts and installs the thin Python + pip
  // runtime when absent. Its ready-runtime path is a local check only; remote
  // update-feed requests are scheduled separately after core dependencies.
  const status = await updater.autoUpdate()
  const saved = await api.request({ action: 'status', requestId: makeRequestId() })
  const savedTask = saved.task as PythonDependencyTask | undefined
  if (savedTask?.layer === 'core') {
    if (savedTask.state === 'queued' || savedTask.state === 'running') return { state: 'sync-running', taskId: savedTask.taskId }
    if (savedTask.state === 'interrupted') {
      if (status.phase === 'paused' && !updater.resumeAutomaticCoreOperation(savedTask.underlyingTaskId)) {
        return { state: 'runtime-unavailable', status }
      }
      if (status.phase !== 'ready' && status.phase !== 'manual' && status.phase !== 'paused') return { state: 'runtime-unavailable', status }
      const resumed = await api.resumeCoreSyncTask(savedTask.taskId)
      if (resumed?.taskId) return { state: 'sync-running', taskId: String(resumed.taskId) }
    }
  }
  if (status.phase !== 'ready' && status.phase !== 'manual') return { state: 'runtime-unavailable', status }

  // Only inspect the signed core closure (42 packages), not the full Python
  // site-packages inventory or the much larger science dependency layer.
  const info = await updater.pythonCoreInfo()
  await api.persistRuntimeSummary(info)
  if (!info.ready) return { state: 'inventory-unavailable', info }
  if (info.coreReady === true) return { state: 'core-ready', info }

  const queued = await api.request({ action: 'sync', layer: 'core', confirm: true, requestId: makeRequestId() })
  const taskId = typeof queued.taskId === 'string' ? queued.taskId : (queued.task as PythonDependencyTask | undefined)?.taskId
  if (!taskId) throw new Error('Python 核心依赖同步没有创建可追踪的后台任务。')
  return { state: 'sync-started', taskId }
}
