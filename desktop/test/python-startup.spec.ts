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

type SetupOptions = {
  info?: McpPythonInfo
  task?: PythonDependencyTask
  taskStatus?: (taskId: string, layer: 'core' | 'science') => PythonDependencyTask | undefined
  autoUpdatePhase?: 'ready' | 'paused' | 'unavailable'
}

function setup({ info = makeInfo(), task, taskStatus, autoUpdatePhase = 'ready' }: SetupOptions = {}) {
  let syncCount = 0
  const updater = {
    checkForUpdates: vi.fn(async () => ({ phase: 'ready' as const })),
    autoUpdate: vi.fn(async () => ({ phase: autoUpdatePhase })),
    pythonCoreInfo: vi.fn(async () => info),
  }
  const api = {
    request: vi.fn(async (request: { action: string; taskId?: string; layer?: 'core' | 'science' }) => {
      if (request.action === 'status') return task ? { task } : { task: undefined }
      if (request.action === 'sync') {
        syncCount += 1
        return { taskId: `${request.layer ?? 'core'}-task-${syncCount}`, queued: true }
      }
      if (request.action === 'task_status') {
        const layer = request.taskId?.startsWith('science-') ? 'science' : 'core'
        return { task: taskStatus ? taskStatus(request.taskId ?? '', layer) : makeTask({ taskId: request.taskId ?? '22222222-2222-4222-8222-222222222222', layer, state: 'succeeded', stage: 'complete' }) }
      }
      return { queued: true }
    }),
    persistRuntimeSummary: vi.fn(async () => undefined),
  }
  return { updater, api }
}

describe('Python startup dependency reconciliation', () => {
  it('uses autoUpdate, then reconciles core and science without requiring a second UI action', async () => {
    const { updater, api } = setup()
    const result = await ensurePythonCoreAtStartup(updater as never, api as never, () => 'startup-request')
    expect(result).toEqual({ state: 'inventory-unavailable', info: makeInfo() })
    expect(updater.autoUpdate).toHaveBeenCalledOnce()
    expect(updater.checkForUpdates).not.toHaveBeenCalled()
    expect(updater.pythonCoreInfo).toHaveBeenCalledTimes(2)
    expect(api.persistRuntimeSummary).toHaveBeenCalledWith(expect.objectContaining({ officialPackageCount: 42 }))
    expect(api.request).toHaveBeenCalledWith({ action: 'status', requestId: 'startup-request' })
    const syncs = api.request.mock.calls.filter(([request]) => request.action === 'sync').map(([request]) => request)
    expect(syncs).toEqual([
      { action: 'sync', layer: 'core', confirm: true, automatic: true, requestId: expect.any(String) },
      { action: 'sync', layer: 'science', confirm: true, automatic: true, requestId: expect.any(String) },
    ])
  })

  it('does not create a duplicate when the saved task is still running', async () => {
    const task = makeTask()
    const { updater, api } = setup({ task })
    await expect(ensurePythonCoreAtStartup(updater as never, api as never)).resolves.toEqual({ state: 'sync-running', taskId: task.taskId })
    expect(updater.pythonCoreInfo).not.toHaveBeenCalled()
    expect(api.request).toHaveBeenCalledTimes(1)
  })

  it('retains an interrupted task until the user resumes it after desktop restart', async () => {
    const task = makeTask({ state: 'interrupted' })
    const { updater, api } = setup({ task })
    await expect(ensurePythonCoreAtStartup(updater as never, api as never)).resolves.toEqual({ state: 'sync-paused', taskId: task.taskId })
    expect(updater.pythonCoreInfo).not.toHaveBeenCalled()
  })

  it('automatically resumes an interrupted startup-owned task without creating a new task', async () => {
    const task = makeTask({ state: 'interrupted', automatic: true })
    const { updater, api } = setup({ task })
    const resumeAutomaticSyncTask = vi.fn(async () => ({ taskId: task.taskId, queued: true }))
    Object.assign(api, { resumeAutomaticSyncTask })
    await expect(ensurePythonCoreAtStartup(updater as never, api as never)).resolves.toMatchObject({ state: 'inventory-unavailable' })
    expect(resumeAutomaticSyncTask).toHaveBeenCalledWith(task.taskId)
    expect(api.request).toHaveBeenCalledWith(expect.objectContaining({ action: 'task_status', taskId: task.taskId }))
    expect(api.request).toHaveBeenCalledWith(expect.objectContaining({ action: 'sync', layer: 'science', automatic: true }))
  })

  it('rechecks local readiness after recovering a paused updater before reconciling science', async () => {
    const task = makeTask({ state: 'interrupted', automatic: true })
    const info = makeInfo({ coreReady: true, corePackageCount: 42 })
    const { updater, api } = setup({ task, autoUpdatePhase: 'paused', info })
    const resumeAutomaticSyncTask = vi.fn(async () => ({ taskId: task.taskId, queued: true }))
    Object.assign(api, { resumeAutomaticSyncTask })

    await expect(ensurePythonCoreAtStartup(updater as never, api as never)).resolves.toEqual({ state: 'core-ready', info })
    expect(updater.autoUpdate).toHaveBeenCalledOnce()
    expect(updater.checkForUpdates).not.toHaveBeenCalled()
    expect(updater.pythonCoreInfo).toHaveBeenCalledTimes(2)
    expect(api.request).toHaveBeenCalledWith(expect.objectContaining({ action: 'sync', layer: 'science', automatic: true }))
  })

  it('does not continue a recovered task when the fresh local runtime inventory is unavailable', async () => {
    const task = makeTask({ state: 'interrupted', automatic: true })
    const info = makeInfo({ ready: false })
    const { updater, api } = setup({ task, autoUpdatePhase: 'paused', info })
    Object.assign(api, { resumeAutomaticSyncTask: vi.fn(async () => ({ taskId: task.taskId, queued: true })) })

    await expect(ensurePythonCoreAtStartup(updater as never, api as never)).resolves.toEqual({ state: 'inventory-unavailable', info })
    expect(updater.checkForUpdates).not.toHaveBeenCalled()
    expect(api.request).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'sync' }))
  })

  it('waits for an already-running automatic core task, then continues with science', async () => {
    const task = makeTask({ state: 'running', automatic: true })
    const { updater, api } = setup({ task })
    await expect(ensurePythonCoreAtStartup(updater as never, api as never)).resolves.toMatchObject({ state: 'inventory-unavailable' })
    expect(api.request).toHaveBeenCalledWith(expect.objectContaining({ action: 'task_status', taskId: task.taskId }))
    expect(api.request).toHaveBeenCalledWith(expect.objectContaining({ action: 'sync', layer: 'science', automatic: true }))
    expect(api.request).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'sync', layer: 'core', automatic: true }))
  })

  it('reports a failed package task with its durable ID and does not start science', async () => {
    const { updater, api } = setup({ taskStatus: taskId => makeTask({ taskId, state: 'failed', stage: 'failed', error: 'numpy download failed' }) })
    await expect(ensurePythonCoreAtStartup(updater as never, api as never)).resolves.toEqual({ state: 'sync-failed', taskId: 'core-task-1', error: 'numpy download failed' })
    expect(api.request).toHaveBeenCalledWith(expect.objectContaining({ action: 'sync', layer: 'core', automatic: true }))
    expect(api.request).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'sync', layer: 'science' }))
  })

  it('reports a partial core task as a failure and does not start science', async () => {
    const { updater, api } = setup({ taskStatus: taskId => makeTask({ taskId, layer: 'core', state: 'partial', stage: 'partial' }) })
    await expect(ensurePythonCoreAtStartup(updater as never, api as never)).resolves.toEqual({ state: 'sync-failed', taskId: 'core-task-1', error: 'Core Python dependency task completed partially; core dependencies are not ready.' })
    expect(api.request).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'sync', layer: 'science' }))
  })

  it('keeps science partial explicit after reconciling the startup layers', async () => {
    const info = makeInfo({ coreReady: true, corePackageCount: 42 })
    const { updater, api } = setup({ info, taskStatus: taskId => makeTask({ taskId, layer: taskId.startsWith('science-') ? 'science' : 'core', state: taskId.startsWith('science-') ? 'partial' : 'succeeded', stage: taskId.startsWith('science-') ? 'partial' : 'complete' }) })
    await expect(ensurePythonCoreAtStartup(updater as never, api as never)).resolves.toEqual({ state: 'sync-partial', taskId: 'science-task-2', layer: 'science', info })
    expect(api.request).toHaveBeenCalledWith(expect.objectContaining({ action: 'sync', layer: 'core', automatic: true }))
    expect(api.request).toHaveBeenCalledWith(expect.objectContaining({ action: 'sync', layer: 'science', automatic: true }))
  })

  it('fails fast when a queued task has no durable receipt and does not start science', async () => {
    const { updater, api } = setup({ taskStatus: () => undefined })
    await expect(ensurePythonCoreAtStartup(updater as never, api as never)).resolves.toEqual({ state: 'sync-failed', taskId: 'core-task-1', error: 'Python task receipt unavailable.' })
    expect(api.request).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'sync', layer: 'science' }))
  })

  it('fails fast when an existing automatic task loses its receipt', async () => {
    const task = makeTask({ state: 'running', automatic: true })
    const { updater, api } = setup({ task, taskStatus: () => undefined })
    await expect(ensurePythonCoreAtStartup(updater as never, api as never)).resolves.toEqual({ state: 'sync-failed', taskId: task.taskId, error: 'Python task receipt unavailable.' })
    expect(api.request).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'sync' }))
  })

  it('waits for durable task completion while the caller can keep startup work detached', async () => {
    let resolveStatus!: (value: unknown) => void
    const pending = new Promise(resolve => { resolveStatus = resolve })
    const { updater, api } = setup()
    api.request.mockImplementation((async (request: { action: string; taskId?: string; layer?: 'core' | 'science' }) => {
      if (request.action === 'status') return { task: undefined }
      if (request.action === 'sync') return { taskId: 'core-task-1', queued: true }
      if (request.action === 'task_status') return pending
      return { queued: true }
    }) as never)
    let settled = false
    const startup = ensurePythonCoreAtStartup(updater as never, api as never).finally(() => { settled = true })
    await vi.waitFor(() => expect(api.request).toHaveBeenCalledWith(expect.objectContaining({ action: 'sync', layer: 'core' })))
    expect(settled).toBe(false)
    resolveStatus({ task: makeTask({ taskId: 'core-task-1', state: 'succeeded', stage: 'complete' }) })
    await startup
  })

  it('reconciles an already healthy core before checking the science layer', async () => {
    const info = makeInfo({ coreReady: true, corePackageCount: 42 })
    const { updater, api } = setup({ info })
    await expect(ensurePythonCoreAtStartup(updater as never, api as never)).resolves.toEqual({ state: 'core-ready', info })
    const layers = api.request.mock.calls.filter(([request]) => request.action === 'sync').map(([request]) => request.layer)
    expect(layers).toEqual(['core', 'science'])
  })

  it('does not queue dependencies until the Python and pip bootstrap is ready', async () => {
    const { updater, api } = setup()
    updater.autoUpdate.mockResolvedValue({ phase: 'unavailable' } as never)
    await expect(ensurePythonCoreAtStartup(updater as never, api as never)).resolves.toMatchObject({ state: 'runtime-unavailable' })
    expect(updater.pythonCoreInfo).not.toHaveBeenCalled()
    expect(api.request).toHaveBeenCalledWith({ action: 'status', requestId: expect.any(String) })
    expect(api.request).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'sync' }))
  })
})
