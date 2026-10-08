import { describe, expect, it, vi } from 'vitest'
import { ensurePythonCoreAtStartup } from '../src/main/python-startup.js'
import type { McpPythonInfo, PythonDependencyTask } from '../src/shared/contracts.js'

function makeInfo(overrides: Partial<McpPythonInfo> = {}): McpPythonInfo {
  return { ready: true, coreReady: false, officialPackageCount: 42, corePackageCount: 0, packages: [], ...overrides }
}

function makeTask(overrides: Partial<PythonDependencyTask> = {}): PythonDependencyTask {
  const now = new Date().toISOString()
  return { taskId: '11111111-1111-4111-8111-111111111111', requestId: 'prior-core', action: 'sync', layer: 'core', state: 'running', stage: 'installing', progress: 31, completedPackages: 4, totalPackages: 42, currentPackage: 'mcp', message: 'Installing mcp', logLines: ['Installing mcp'], createdAt: now, updatedAt: now, ...overrides }
}

function setup({ info = makeInfo(), task }: { info?: McpPythonInfo; task?: PythonDependencyTask } = {}) {
  const updater = {
    checkForUpdates: vi.fn(async () => ({ phase: 'ready' as const })),
    autoUpdate: vi.fn(async () => ({ phase: 'ready' as const })),
    pythonCoreInfo: vi.fn(async () => info),
    resumeAutomaticCoreOperation: vi.fn(() => true),
  }
  const api = {
    request: vi.fn(async (request: { action: string }) => request.action === 'status' && task ? { task } : { taskId: '22222222-2222-4222-8222-222222222222', queued: true }),
    persistRuntimeSummary: vi.fn(async () => undefined),
    resumeCoreSyncTask: vi.fn(async (taskId: string) => ({ taskId, queued: true, task: { ...task!, state: 'queued' } })),
  }
  return { updater, api }
}

describe('Python startup inspection', () => {
  it('checks an incomplete core generation without queuing an install', async () => {
    const { updater, api } = setup()
    const result = await ensurePythonCoreAtStartup(updater as never, api as never, () => 'startup-request')
    expect(result).toEqual({ state: 'inventory-unavailable', info: makeInfo() })
    expect(updater.checkForUpdates).toHaveBeenCalledOnce()
    expect(updater.autoUpdate).not.toHaveBeenCalled()
    expect(updater.pythonCoreInfo).toHaveBeenCalledOnce()
    expect(api.persistRuntimeSummary).toHaveBeenCalledWith(expect.objectContaining({ officialPackageCount: 42 }))
    expect(api.request).toHaveBeenCalledWith({ action: 'status', requestId: 'startup-request' })
    expect(api.request).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'sync' }))
  })

  it('does not create a duplicate when the saved core task is still running', async () => {
    const task = makeTask()
    const { updater, api } = setup({ task })
    await expect(ensurePythonCoreAtStartup(updater as never, api as never)).resolves.toEqual({ state: 'sync-running', taskId: task.taskId })
    expect(api.resumeCoreSyncTask).not.toHaveBeenCalled()
    expect(updater.pythonCoreInfo).not.toHaveBeenCalled()
    expect(api.request).toHaveBeenCalledTimes(1)
  })

  it('retains an interrupted core task until the user resumes it after desktop restart', async () => {
    const task = makeTask({ state: 'interrupted' })
    const { updater, api } = setup({ task })
    await expect(ensurePythonCoreAtStartup(updater as never, api as never)).resolves.toEqual({ state: 'sync-paused', taskId: task.taskId })
    expect(api.resumeCoreSyncTask).not.toHaveBeenCalled()
    expect(updater.pythonCoreInfo).not.toHaveBeenCalled()
  })

  it('does not unpause a saved worker job during the startup check', async () => {
    const task = makeTask({ state: 'interrupted', underlyingTaskId: '33333333-3333-4333-8333-333333333333' })
    const { updater, api } = setup({ task })
    updater.checkForUpdates.mockResolvedValue({ phase: 'paused' } as never)
    const result = await ensurePythonCoreAtStartup(updater as never, api as never, () => 'startup-request')
    expect(result).toEqual({ state: 'sync-paused', taskId: task.taskId })
    expect(updater.resumeAutomaticCoreOperation).not.toHaveBeenCalled()
    expect(api.resumeCoreSyncTask).not.toHaveBeenCalled()
  })

  it('does not resume a core task when its recorded updater transaction is missing', async () => {
    const task = makeTask({ state: 'interrupted', underlyingTaskId: '33333333-3333-4333-8333-333333333333' })
    const { updater, api } = setup({ task })
    updater.checkForUpdates.mockResolvedValue({ phase: 'paused' } as never)
    updater.resumeAutomaticCoreOperation.mockReturnValue(false)
    await expect(ensurePythonCoreAtStartup(updater as never, api as never)).resolves.toEqual({ state: 'sync-paused', taskId: task.taskId })
    expect(api.resumeCoreSyncTask).not.toHaveBeenCalled()
    expect(api.request).toHaveBeenCalledTimes(1)
  })

  it('keeps science installation untouched when the signed core layer is complete', async () => {
    const info = makeInfo({ coreReady: true, corePackageCount: 42 })
    const { updater, api } = setup({ info })
    await expect(ensurePythonCoreAtStartup(updater as never, api as never)).resolves.toEqual({ state: 'core-ready', info })
    expect(api.request).toHaveBeenCalledTimes(1)
    expect(api.request).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'sync' }))
  })

  it('does not queue dependencies until the Python and pip bootstrap is ready', async () => {
    const { updater, api } = setup()
    updater.checkForUpdates.mockResolvedValue({ phase: 'unavailable' } as never)
    await expect(ensurePythonCoreAtStartup(updater as never, api as never)).resolves.toMatchObject({ state: 'runtime-unavailable' })
    expect(updater.pythonCoreInfo).not.toHaveBeenCalled()
    expect(api.request).toHaveBeenCalledWith({ action: 'status', requestId: expect.any(String) })
    expect(api.request).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'sync' }))
    expect(updater.autoUpdate).not.toHaveBeenCalled()
  })
})
