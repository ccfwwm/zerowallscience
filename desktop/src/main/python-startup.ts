import { randomUUID } from 'node:crypto'
import type { McpEnvironmentStatus, McpPythonInfo, PythonDependencyTask } from '../shared/contracts.js'
import type { PythonEnvironmentApi } from './python-environment-api.js'
import type { PythonUpdaterService } from './python-updater-service.js'

export type PythonCoreStartupResult =
  | { state: 'runtime-unavailable'; status: McpEnvironmentStatus }
  | { state: 'sync-running'; taskId: string }
  | { state: 'sync-paused'; taskId: string }
  | { state: 'core-ready'; info: McpPythonInfo }
  | { state: 'inventory-unavailable'; info?: McpPythonInfo }

/**
 * Read-only startup inspection for the optional Python generation. Existing
 * interrupted tasks remain paused; an empty or outdated environment waits
 * for an explicit user action in the Python environment UI.
 */
export async function ensurePythonCoreAtStartup(
  updater: Pick<PythonUpdaterService, 'checkForUpdates' | 'pythonCoreInfo'>,
  api: Pick<PythonEnvironmentApi, 'request' | 'persistRuntimeSummary'>,
  makeRequestId: () => string = () => randomUUID(),
): Promise<PythonCoreStartupResult> {
  // The worker's check method reads the signed manifest only. autoUpdate is
  // reserved for explicit dependency operations that may bootstrap Python.
  const status = await updater.checkForUpdates()
  const saved = await api.request({ action: 'status', requestId: makeRequestId() })
  const savedTask = saved.task as PythonDependencyTask | undefined
  if (savedTask?.layer === 'core') {
    if (savedTask.state === 'queued' || savedTask.state === 'running') return { state: 'sync-running', taskId: savedTask.taskId }
    if (savedTask.state === 'interrupted') {
      return { state: 'sync-paused', taskId: savedTask.taskId }
    }
  }
  if (status.phase !== 'ready' && status.phase !== 'manual') return { state: 'runtime-unavailable', status }

  // Only inspect the signed core closure (42 packages), not the full Python
  // site-packages inventory or the much larger science dependency layer.
  const info = await updater.pythonCoreInfo()
  await api.persistRuntimeSummary(info)
  if (!info.ready) return { state: 'inventory-unavailable', info }
  if (info.coreReady === true) return { state: 'core-ready', info }
  return { state: 'inventory-unavailable', info }
}
