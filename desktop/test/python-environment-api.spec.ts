import { mkdir, mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalizePythonRuntimePath, PythonEnvironmentApi } from '../src/main/python-environment-api.js'
import type { PythonUpdaterService } from '../src/main/python-updater-service.js'

const roots: string[] = []
const apis: PythonEnvironmentApi[] = []
function createApi(...args: ConstructorParameters<typeof PythonEnvironmentApi>) { const api = new PythonEnvironmentApi(...args); apis.push(api); return api }
afterEach(async () => { await Promise.all(apis.splice(0).map(api => api.flush())); await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true }))) })
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'python-api-')); roots.push(root)
  let progressListener: ((status: any) => void) | undefined
  const updater = {
    current: vi.fn(() => ({ phase: 'ready' })),
    rollback: vi.fn(() => ({ taskId: 'rollback-1' })),
    pythonInfo: vi.fn(async () => ({ packages: [] })),
    stop: vi.fn(),
    taskStatus: vi.fn(async () => ({ state: 'complete' })),
    watchProgress: vi.fn((listener: (status: any) => void) => { progressListener = listener }),
  }
  const sync = { checkManifest: vi.fn(async () => ({ revision: 'r1' })), previewSync: vi.fn(async () => ({ planId: 'plan-1' })), applySync: vi.fn(async () => ({ taskId: 'job-1' })) }
  return { root, updater, sync, emitProgress: (status: any) => progressListener?.(status), api: createApi(root, updater as unknown as PythonUpdaterService, sync) }
}
async function waitForTask(api: PythonEnvironmentApi, taskId: string) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const receipt = await api.request({ action: 'task_status', taskId, requestId: `poll-${taskId}` })
    const task = receipt.task as { state?: string }
    if (task.state === 'succeeded' || task.state === 'failed' || task.state === 'interrupted') return receipt
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  throw new Error(`Python task ${taskId} did not reach a terminal state.`)
}
async function waitForSync(api: PythonEnvironmentApi, request: { action: 'sync'; requestId: string; confirm: true }) {
  const accepted = await api.request(request)
  if (accepted.queued !== true) return accepted
  await waitForTask(api, String(accepted.taskId))
  return api.request(request)
}
describe('shared Python environment API', () => {
  it('reads status with a fixed installation root before current.json or Python exists', async () => {
    const { root, updater, sync } = await setup()
    const runtime = join(root, 'installation', 'Python')
    const api = createApi(join(runtime, '.zerowall'), updater as unknown as PythonUpdaterService, sync, join(root, 'location.json'), join(root, 'installation'), runtime)
    await expect(api.request({ action: 'status', requestId: 'fresh-install' })).resolves.toMatchObject({ runtimeRoot: runtime })
    expect(updater.pythonInfo).not.toHaveBeenCalled()
    expect(sync.applySync).not.toHaveBeenCalled()
    await expect(readFile(join(runtime, 'python.exe'))).rejects.toMatchObject({ code: 'ENOENT' })
  })
  it('pages a fresh local inventory while preserving the full detected count', async () => {
    const { api, updater } = await setup()
    updater.pythonInfo.mockResolvedValue({ ready: true, inventoryComplete: true, packageCount: 3, packages: [{ name: 'pandas', version: '1.0.0' }, { name: 'pandas-extra', version: '2' }, { name: 'numpy', version: '9' }] } as never)
    expect(await api.request({ action: 'list_packages', requestId: 'paged', query: 'pandas', offset: 1, limit: 1 })).toMatchObject({ inventory: { packageCount: 3, packages: [{ name: 'pandas-extra', version: '2' }] }, total: 2, nextOffset: null })
  })
  it('does not interrupt a task still owned by another live worker or cache its old state', async () => {
    const { api, root } = await setup()
    const taskId = '00000000-0000-4000-8000-000000000001'
    await mkdir(join(root, 'jobs'))
    const task = { taskId, ownerPid: process.ppid, state: 'running', stage: 'installing', logLines: [] }
    await writeFile(join(root, 'jobs/latest.json'), JSON.stringify({ taskId }))
    await writeFile(join(root, 'jobs', taskId + '.json'), JSON.stringify(task))
    expect(await api.request({ action: 'status', requestId: 'live-owner' })).toMatchObject({ task: { state: 'running' } })
    await writeFile(join(root, 'jobs', taskId + '.json'), JSON.stringify({ ...task, state: 'succeeded' }))
    expect(await api.request({ action: 'status', requestId: 'completed-owner' })).toMatchObject({ task: { state: 'succeeded' } })
  })
  it('cancels a pending package preview without starting the install when the preview returns late', async () => {
    const { api, updater } = await setup()
    let finish!: (value: unknown) => void
    const previewPackages = vi.fn(() => new Promise(resolve => { finish = resolve }))
    const applyPackagePlan = vi.fn()
    Object.assign(updater, { previewPackages, applyPackagePlan, ensureReady: vi.fn(async () => ({ phase: 'ready' })), cancel: vi.fn() })
    const accepted = await api.request({ action: 'install_package', requestId: 'cancel-preview', packageSpec: 'pandas', confirm: true })
    await vi.waitFor(() => expect(previewPackages).toHaveBeenCalled())
    await api.request({ action: 'cancel', requestId: 'cancel', taskId: String(accepted.taskId) })
    finish({ planId: 'late', changes: [{ name: 'pandas', to: '3.0.5' }] })
    await vi.waitFor(() => expect(api.hasPendingWork()).toBe(false))
    expect(applyPackagePlan).not.toHaveBeenCalled()
    expect(await api.request({ action: 'task_status', requestId: 'cancelled-status', taskId: String(accepted.taskId) })).toMatchObject({ task: { state: 'cancelled' } })
  })
  it('reports missing MCP core packages from a ready interpreter without starting repair', async () => {
    const { root, updater, sync } = await setup()
    const apiRoot = join(root, 'zerowall-python'), generation = join(apiRoot, 'slots', 'a-test')
    const runtimeRoot = join(generation, 'Python')
    await mkdir(runtimeRoot, { recursive: true })
    await writeFile(join(runtimeRoot, 'runtime.json'), JSON.stringify({ rootPath: runtimeRoot, executablePath: join(runtimeRoot, 'python.exe') }))
    await writeFile(join(apiRoot, 'current.json'), JSON.stringify({ root: generation, runtimeRoot: generation, health: 'ready', generation: true }))
    updater.pythonInfo.mockResolvedValue({ ready: true, coreReady: false, missingCorePackages: ['mcp==1.13.1'], packages: [] } as never)
    const ensureReady = vi.fn()
    ;(updater as typeof updater & { ensureReady: typeof ensureReady }).ensureReady = ensureReady
    const api = createApi(apiRoot, updater as unknown as PythonUpdaterService, sync)
    await api.request({ action: 'list_packages', requestId: 'initial-inventory' })
    await expect(api.request({ action: 'status', requestId: 'old-core' })).resolves.toMatchObject({
      runtimeRoot: join(root, 'Python'), layers: { bootstrap: 'ready', core: 'missing', science: 'not-installed' }, coreReady: false, missingCorePackages: ['mcp==1.13.1'],
    })
    updater.pythonInfo.mockResolvedValue({ ready: true, coreReady: true, missingCorePackages: [], packages: [] } as never)
    await api.request({ action: 'list_packages', requestId: 'repaired-inventory' })
    await expect(api.request({ action: 'status', requestId: 'repaired-core' })).resolves.toMatchObject({ layers: { bootstrap: 'ready', core: 'ready' }, coreReady: true })
    expect(ensureReady).not.toHaveBeenCalled()
    expect(sync.applySync).not.toHaveBeenCalled()
  })
  it('normalizes a picked parent directory to its dedicated Python child', () => {
    expect(normalizePythonRuntimePath('C:/ZeroWall Data')).toMatch(/ZeroWall Data[\\/]Python$/u)
    expect(normalizePythonRuntimePath('C:/ZeroWall Data/Python')).toMatch(/ZeroWall Data[\\/]Python$/u)
    expect(() => normalizePythonRuntimePath('C:/')).toThrow(/磁盘根目录/u)
  })

  it('requires concrete confirmation and does not enqueue on unapproved requests', async () => {
    const { api, sync } = await setup()
    await expect(api.request({ action: 'apply_sync', requestId: 'missing-confirm', planId: 'p', manifestRevision: 'r' })).rejects.toThrow('CONFIRMATION_REQUIRED')
    expect(sync.applySync).not.toHaveBeenCalled()
  })
  it('deduplicates concurrent retries and retains the receipt across Host restart', async () => {
    const { root, api, updater, sync } = await setup()
    const request = { action: 'apply_sync' as const, requestId: 'same-request', planId: 'p', manifestRevision: 'r', confirm: true }
    const results = await Promise.all([api.request(request), api.request(request)])
    expect(results[0]).toEqual(results[1]); expect(results[0]).toMatchObject({ queued: true })
    await waitForTask(api, String(results[0]!.taskId))
    expect(sync.applySync).toHaveBeenCalledTimes(1)
    const restarted = createApi(root, updater as unknown as PythonUpdaterService, sync)
    await expect(restarted.request(request)).resolves.toMatchObject({ taskId: results[0]!.taskId, underlyingTaskId: 'job-1', queued: false })
    expect(sync.applySync).toHaveBeenCalledTimes(1)
    await expect(restarted.request({ ...request, manifestRevision: 'r2' })).rejects.toThrow('REQUEST_ID_CONFLICT')
  })
  it('runs one-click sync as check, plan and apply under a single receipt', async () => {
    const { root, api, sync } = await setup()
    sync.checkManifest = vi.fn(async () => ({ revision: 'r2', packageCount: 140, changes: [{ name: 'numpy', from: '2.0.0', to: '2.1.0' }] })) as never
    sync.previewSync = vi.fn(async () => ({ planId: 'signed-plan', manifestRevision: 'r2', snapshotId: 'gen-a', requested: [], changes: [{ name: 'numpy', from: '2.0.0', to: '2.1.0' }] })) as never
    const request = { action: 'sync' as const, requestId: 'one-click', confirm: true as const }
    const accepted = await api.request(request)
    expect(accepted).toMatchObject({ requestId: 'one-click', queued: true })
    await waitForTask(api, String(accepted.taskId))
    const result = await api.request(request)
    expect(result).toMatchObject({ taskId: accepted.taskId, underlyingTaskId: 'job-1', manifestRevision: 'r2', changes: [{ name: 'numpy', from: '2.0.0', to: '2.1.0' }] })
    expect(sync.applySync).toHaveBeenCalledWith('signed-plan', 'r2', true)
    // The receipt is what makes a repeated click and a restart both resolve to
    // the same task rather than enqueueing the install again.
    await expect(api.request(request)).resolves.toMatchObject({ taskId: accepted.taskId, underlyingTaskId: 'job-1' })
    const restarted = createApi(root, { current: vi.fn(), rollback: vi.fn(), pythonInfo: vi.fn() } as unknown as PythonUpdaterService, sync)
    await expect(restarted.request(request)).resolves.toMatchObject({ taskId: accepted.taskId, underlyingTaskId: 'job-1' })
    // Only the original submission reaches the sync service; the later two read
    // the receipt written by that first call.
    expect(sync.applySync).toHaveBeenCalledTimes(1)
  })
  it('refuses one-click sync without confirmation and applies nothing when already current', async () => {
    const { api, sync } = await setup()
    await expect(api.request({ action: 'sync', requestId: 'unconfirmed' })).rejects.toThrow('CONFIRMATION_REQUIRED')
    expect(sync.applySync).not.toHaveBeenCalled()
    sync.previewSync = vi.fn(async () => ({ planId: 'empty-plan', manifestRevision: 'r1', snapshotId: 'gen-a', requested: [], changes: [] })) as never
    await expect(waitForSync(api, { action: 'sync', requestId: 'already-current', confirm: true })).resolves.toMatchObject({ upToDate: true, changes: [] })
    expect(sync.applySync).not.toHaveBeenCalled()
  })

  it('checks manifests without initializing a missing runtime', async () => {
    const { api, updater, sync } = await setup()
    const ensureReady = vi.fn(async () => ({ phase: 'ready' as const }))
    ;(updater as typeof updater & { ensureReady: typeof ensureReady }).ensureReady = ensureReady
    sync.checkManifest = vi.fn(async () => ({ revision: 'r1', changes: [] })) as never
    const accepted = await api.request({ action: 'check_manifest', requestId: 'runtime-gate' })
    expect(accepted).toMatchObject({ queued: true })
    await expect(waitForTask(api, String(accepted.taskId))).resolves.toMatchObject({ task: { state: 'succeeded', result: { manifest: { revision: 'r1' } } } })
    expect(ensureReady).not.toHaveBeenCalled()
    expect(sync.checkManifest).toHaveBeenCalledTimes(1)
  })
  it.each(['sync', 'install_runtime'] as const)('reports initialization failure for %s even when the fixed interpreter remains ready', async action => {
    const { api, updater, sync } = await setup()
    Object.assign(updater, { ensureReady: vi.fn(async () => ({ phase: 'ready', lastUpdateError: 'Bootstrap signature is invalid.' })) })
    const accepted = await api.request({ action, requestId: `failed-bootstrap-${action}`, confirm: true })
    expect(await waitForTask(api, String(accepted.taskId))).toMatchObject({ task: { state: 'failed', error: 'Bootstrap signature is invalid.' } })
    expect(sync.previewSync).not.toHaveBeenCalled()
    expect(sync.applySync).not.toHaveBeenCalled()
  })
  it('returns a local status snapshot without rescanning packages or contacting manifests', async () => {
    const { api, updater, sync } = await setup()
    await expect(api.request({ action: 'status', requestId: 'fast-status' })).resolves.toMatchObject({ task: undefined })
    expect(updater.pythonInfo).not.toHaveBeenCalled()
    expect(sync.checkManifest).not.toHaveBeenCalled()
    expect(sync.previewSync).not.toHaveBeenCalled()
  })
  it('persists task progress and pip output, waits for the install receipt, and restores it after restart', async () => {
    const { root, api, updater, sync, emitProgress } = await setup()
    let finishInstall: ((value: unknown) => void) | undefined
    sync.checkManifest = vi.fn(async () => ({ revision: 'r1', changes: [{ name: 'numpy', to: '1.0.0' }] })) as never
    sync.previewSync = vi.fn(async () => ({ planId: 'plan-1', manifestRevision: 'r1', changes: [{ name: 'numpy', to: '1.0.0' }] })) as never
    updater.taskStatus.mockImplementation(() => new Promise(resolve => { finishInstall = resolve }) as never)
    const request = { action: 'sync' as const, requestId: 'durable-install', confirm: true as const }
    const accepted = await api.request(request)
    const deadline = Date.now() + 5000
    while (!finishInstall && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5))
    expect(finishInstall).toBeTypeOf('function')
    const status = {
      phase: 'installing', progress: 47, message: '正在安装 numpy',
      updateJob: { taskId: 'job-1', kind: 'applyPackagePlan', stage: 'installing', canPause: false, completedFiles: 7, totalFiles: 42, targetVersion: 'numpy', logLines: ['Downloading numpy', 'Installing numpy'] },
    }
    updater.current.mockReturnValue(status as never)
    emitProgress(status)
    await api.flush()
    const running = await api.request({ action: 'task_status', taskId: String(accepted.taskId), requestId: 'read-durable-progress' })
    expect(running.task).toMatchObject({ state: 'running', progress: 47, completedPackages: 7, totalPackages: 42, currentPackage: 'numpy' })
    expect((running.task as { logLines: string[] }).logLines).toContain('Installing numpy')
    const diskTask = JSON.parse(await readFile(join(root, 'jobs', `${accepted.taskId}.json`), 'utf8'))
    expect(diskTask.logLines).toContain('Installing numpy')
    const operations = await readFile(join(root, 'logs', 'environment-events.jsonl'), 'utf8')
    expect(operations).toContain('Installing numpy')
    finishInstall!({ state: 'complete' })
    await waitForTask(api, String(accepted.taskId))
    const restarted = createApi(root, updater as unknown as PythonUpdaterService, sync)
    await expect(restarted.request({ action: 'status', requestId: 'restore-terminal-task' })).resolves.toMatchObject({ task: { taskId: accepted.taskId, state: 'succeeded', logLines: expect.arrayContaining(['Installing numpy']) } })
  })
  it('marks a task interrupted after restart while keeping its saved progress and logs', async () => {
    const { root, updater, sync } = await setup()
    const taskId = '77d07c54-98e0-40b0-8424-25a8394dba2a'
    const now = new Date().toISOString()
    const task = { taskId, requestId: 'interrupted-task', action: 'sync', layer: 'core', state: 'running', stage: 'installing', progress: 31, completedPackages: 4, totalPackages: 42, currentPackage: 'mcp', message: '正在安装 mcp', logLines: ['Collecting mcp', 'Installing mcp'], createdAt: now, updatedAt: now }
    await mkdir(join(root, 'jobs'), { recursive: true })
    await writeFile(join(root, 'jobs', `${taskId}.json`), JSON.stringify(task))
    await writeFile(join(root, 'jobs', 'latest.json'), JSON.stringify({ taskId, updatedAt: now }))
    const restarted = createApi(root, updater as unknown as PythonUpdaterService, sync)
    await expect(restarted.request({ action: 'status', requestId: 'recover-interrupted-task' })).resolves.toMatchObject({
      task: { taskId, state: 'interrupted', progress: 31, completedPackages: 4, totalPackages: 42, logLines: ['Collecting mcp', 'Installing mcp'] },
    })
  })
  it('resumes an interrupted core sync with the same task id and keeps its saved progress', async () => {
    const { root, api, updater, sync } = await setup()
    const taskId = '88d07c54-98e0-40b0-8424-25a8394dba2a'
    const requestId = 'startup-core-resume'
    const now = new Date().toISOString()
    const task = { taskId, requestId, action: 'sync', layer: 'core', state: 'interrupted', stage: 'installing', progress: 31, completedPackages: 4, totalPackages: 42, currentPackage: 'mcp', message: '上次安装中断', error: '任务因桌面进程结束而中断。', logLines: ['Collecting mcp', 'Installing mcp'], createdAt: now, updatedAt: now, completedAt: now }
    const requestPath = join(root, 'requests', `${requestId}.json`)
    await mkdir(join(root, 'jobs'), { recursive: true })
    await mkdir(join(root, 'requests'), { recursive: true })
    await writeFile(join(root, 'jobs', `${taskId}.json`), JSON.stringify(task))
    await writeFile(join(root, 'jobs', 'latest.json'), JSON.stringify({ taskId, updatedAt: now }))
    await writeFile(requestPath, JSON.stringify({ fingerprint: 'signed-request-receipt', state: 'failed', taskId }))
    let finishInstall: ((value: unknown) => void) | undefined
    updater.taskStatus.mockImplementation(() => new Promise(resolve => { finishInstall = resolve }) as never)
    sync.checkManifest = vi.fn(async () => ({ revision: 'r1', changes: [{ name: 'mcp', to: '1.0.0' }] })) as never
    sync.previewSync = vi.fn(async () => ({ planId: 'plan-1', manifestRevision: 'r1', changes: [{ name: 'mcp', to: '1.0.0' }] })) as never

    const resumed = await api.resumeCoreSyncTask(taskId)
    expect(resumed).toMatchObject({ taskId, queued: true, task: { progress: 31, logLines: ['Collecting mcp', 'Installing mcp'] } })
    const deadline = Date.now() + 5000
    while (!finishInstall && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5))
    expect(finishInstall).toBeTypeOf('function')
    expect(sync.applySync).toHaveBeenCalledOnce()
    const running = await api.request({ action: 'task_status', taskId, requestId: 'read-resumed-core' })
    expect(running.task).toMatchObject({ taskId, state: 'running', progress: 31, completedPackages: 4, totalPackages: 42, logLines: expect.arrayContaining(['Collecting mcp', 'Installing mcp']) })
    finishInstall!({ state: 'complete' })
    await waitForTask(api, taskId)
    expect(JSON.parse(await readFile(requestPath, 'utf8'))).toMatchObject({ state: 'completed', taskId })
  })
  it('continues the existing core install receipt after restart instead of creating a second plan', async () => {
    const { root, api, updater, sync } = await setup()
    const taskId = '99d07c54-98e0-40b0-8424-25a8394dba2a'
    const underlyingTaskId = 'aa111111-1111-4111-8111-111111111111'
    const requestId = 'resume-existing-core-transaction'
    const now = new Date().toISOString()
    const task = { taskId, underlyingTaskId, requestId, action: 'sync', layer: 'core', state: 'interrupted', stage: 'installing', progress: 58, completedPackages: 24, totalPackages: 42, currentPackage: 'numpy', message: '正在安装 numpy', error: '任务因桌面进程结束而中断。', logLines: ['Downloading numpy', 'Installing numpy'], createdAt: now, updatedAt: now, completedAt: now }
    const requestPath = join(root, 'requests', `${requestId}.json`)
    await mkdir(join(root, 'jobs'), { recursive: true })
    await mkdir(join(root, 'requests'), { recursive: true })
    await writeFile(join(root, 'jobs', `${taskId}.json`), JSON.stringify(task))
    await writeFile(join(root, 'jobs', 'latest.json'), JSON.stringify({ taskId, updatedAt: now }))
    await writeFile(requestPath, JSON.stringify({ fingerprint: 'same-core-request', state: 'failed', taskId }))
    const syncWithVerification = sync as typeof sync & { verifyInstalled?: (...args: any[]) => Promise<unknown> }
    syncWithVerification.verifyInstalled = vi.fn(async () => ({ layer: 'core', pendingPackageCount: 0, installedPackageCount: 42 }))
    ;(updater as typeof updater & { pythonCoreInfo: () => Promise<unknown> }).pythonCoreInfo = vi.fn(async () => ({ ready: true, coreReady: true, officialPackageCount: 42, corePackageCount: 42, missingCorePackages: [], packages: [] }))

    await expect(api.resumeCoreSyncTask(taskId)).resolves.toMatchObject({ taskId, queued: true })
    await expect(waitForTask(api, taskId)).resolves.toMatchObject({ task: { state: 'succeeded', progress: 100, logLines: expect.arrayContaining(['Downloading numpy', 'Installing numpy']) } })
    expect(updater.taskStatus).toHaveBeenCalledWith(underlyingTaskId)
    expect(sync.checkManifest).not.toHaveBeenCalled()
    expect(sync.previewSync).not.toHaveBeenCalled()
    expect(sync.applySync).not.toHaveBeenCalled()
    expect(syncWithVerification.verifyInstalled).toHaveBeenCalledWith('core', undefined, expect.any(Function), expect.any(Array))
    expect(JSON.parse(await readFile(join(root, 'python-summary.json'), 'utf8'))).toMatchObject({ coreReady: true, corePackageCount: 42 })
  })
  it.each(['core', 'science'] as const)('keeps a skipped version pin pending in automatic %s sync when unresolved excludes it', async layer => {
    const { root, api, updater, sync } = await setup()
    const failure = { name: 'numpy', version: '2.0.0', message: 'mirror unavailable' }
    sync.checkManifest = vi.fn(async () => ({ revision: 'r1', changes: [{ name: 'numpy', from: '1.0.0', to: '2.0.0' }] })) as never
    sync.previewSync = vi.fn(async () => ({ planId: 'plan-1', manifestRevision: 'r1', changes: [{ name: 'numpy', from: '1.0.0', to: '2.0.0' }] })) as never
    const verifyInstalled = vi.fn(async () => ({
      layer, pendingPackageCount: 1, unresolvedPackageCount: 0, installedPackageCount: 41, skippedPackages: [failure],
    }))
    Object.assign(sync, { installFailures: vi.fn(async () => [failure]), verifyInstalled })
    Object.assign(updater, { pythonCoreInfo: vi.fn(async () => ({ ready: true, coreReady: true, packages: [{ name: 'numpy', version: '1.0.0' }] })) })
    const request = { action: 'sync' as const, layer, automatic: true as const, requestId: `automatic-${layer}-skipped-pin`, confirm: true as const }
    const accepted = await api.request(request)
    const expectedState = layer === 'core' ? 'failed' : 'partial'
    await vi.waitFor(async () => expect(await api.request({ action: 'task_status', taskId: String(accepted.taskId), requestId: 'skipped-pin-status' })).toMatchObject({
      task: { state: expectedState, ...(layer === 'core' ? { error: expect.stringContaining('1 个依赖缺失或版本未同步') } : { result: { partial: true, skippedPackages: [failure] } }) },
    }))
    expect(verifyInstalled).toHaveBeenCalledWith(layer, undefined, expect.any(Function), [failure], { includeVersionUpdates: true })
    expect(updater.rollback).not.toHaveBeenCalled()
    expect(sync.applySync).toHaveBeenCalledOnce()
    expect(JSON.parse(await readFile(join(root, 'jobs', `${accepted.taskId}.json`), 'utf8'))).toMatchObject({ state: expectedState })
  })
  it.each(['queued', 'running', 'paused'] as const)('resumes the exact automatic core receipt when the updater persisted it as %s', async persistedState => {
    const { root, api, updater } = await setup()
    const taskId = 'ab111111-1111-4111-8111-111111111111'
    const underlyingTaskId = 'bc222222-2222-4222-8222-222222222222'
    const requestId = `resume-automatic-${persistedState}`
    const now = new Date().toISOString()
    const task = { taskId, underlyingTaskId, requestId, action: 'sync', layer: 'core', automatic: true, state: 'interrupted', stage: 'installing', progress: 58, completedPackages: 24, totalPackages: 42, currentPackage: 'numpy', message: '正在安装 numpy', error: '任务因桌面进程结束而中断。', logLines: ['Downloading numpy'], createdAt: now, updatedAt: now, completedAt: now }
    await mkdir(join(root, 'jobs'), { recursive: true })
    await mkdir(join(root, 'requests'), { recursive: true })
    await writeFile(join(root, 'jobs', `${taskId}.json`), JSON.stringify(task))
    await writeFile(join(root, 'requests', `${requestId}.json`), JSON.stringify({ fingerprint: 'automatic-receipt', state: 'failed', taskId }))
    const resume = vi.fn(() => true)
    Object.assign(updater, { resumeAutomaticCoreOperation: resume })
    updater.taskStatus.mockResolvedValueOnce({ state: persistedState }).mockResolvedValue({ state: 'complete' })

    await expect(api.resumeAutomaticSyncTask(taskId)).resolves.toMatchObject({ taskId, queued: true })
    expect(resume).toHaveBeenCalledWith(underlyingTaskId)
    await expect(waitForTask(api, taskId)).resolves.toMatchObject({ task: { state: 'succeeded', underlyingTaskId } })
  })
  it('does not merge an old science inventory into a newer incomplete detection', async () => {
    const { root, api } = await setup()
    await mkdir(root, { recursive: true })
    await writeFile(join(root, 'python-summary.json'), JSON.stringify({ sciencePackageCount: 529, scienceInstalledPackageCount: 117, packageCount: 164, inventoryComplete: true }))
    await api.persistRuntimeSummary({ ready: true, coreReady: true, officialPackageCount: 42, corePackageCount: 42, sciencePackageCount: 0, scienceInstalledPackageCount: 0, inventoryComplete: false, missingCorePackages: [], packages: [] })
    const saved = JSON.parse(await readFile(join(root, 'python-summary.json'), 'utf8'))
    expect(saved).toMatchObject({ inventoryComplete: false, coreReady: true })
    expect(saved).not.toHaveProperty('scienceInstalledPackageCount')
    expect(saved).not.toHaveProperty('packageCount')
  })
  it('keeps the last complete scan during a real writer lock and never persists a failed refresh as missing packages', async () => {
    const { root, updater, sync } = await setup()
    const runtime = join(root, 'installation/Python'), manager = join(runtime, '.zerowall')
    const api = createApi(manager, updater as unknown as PythonUpdaterService, sync, undefined, join(root, 'installation'), runtime)
    const inventory = { ready: true, runtimeRoot: runtime, inventoryComplete: true, coreReady: true, officialPackageCount: 43, corePackageCount: 43, packageCount: 171, packages: [{ name: 'pandas', version: '1.0', source: 'core' as const, health: 'healthy' as const }], missingCorePackages: [] }
    await api.persistRuntimeSummary(inventory)
    await writeFile(join(manager, 'local-inventory.json'), JSON.stringify({ state: 'complete', inventory }))
    await writeFile(join(manager, 'write-lock.json'), JSON.stringify({ pid: process.pid }))
    await api.request({ action: 'scan_local', requestId: 'refresh-while-installing' })
    await vi.waitFor(async () => expect(await api.request({ action: 'status', requestId: 'scan-result' })).toMatchObject({ inventory: { coreReady: true, corePackageCount: 43 }, scan: { state: 'complete' } }))
    expect(updater.pythonInfo).not.toHaveBeenCalled()
    await api.persistRuntimeSummary({ ...inventory, ready: false, inventoryComplete: false, coreReady: false, corePackageCount: 0, packages: [] })
    expect(JSON.parse(await readFile(join(manager, 'python-summary.json'), 'utf8'))).toMatchObject({ inventoryComplete: true, coreReady: true, corePackageCount: 43 })
  })
  it('flushes progress and stops the updater before desktop shutdown completes', async () => {
    const { api, updater } = await setup()
    await api.shutdown()
    expect(updater.stop).toHaveBeenCalledOnce()
  })
  it('reads a missing runtime inventory without starting installation', async () => {
    const { api, updater, sync } = await setup()
    const ensureReady = vi.fn(async () => ({ phase: 'ready' as const }))
    ;(updater as typeof updater & { ensureReady: typeof ensureReady }).ensureReady = ensureReady
    updater.current.mockReturnValue({ phase: 'idle' })
    updater.pythonInfo.mockResolvedValue({ ready: false, packages: [] } as never)
    for (const requestId of ['open-settings', 'refresh-settings']) {
      await expect(api.request({ action: 'list_packages', requestId })).resolves.toMatchObject({ inventory: { ready: false, packages: [] } })
    }
    expect(updater.pythonInfo).toHaveBeenCalledTimes(2)
    expect(ensureReady).not.toHaveBeenCalled()
    expect(sync.checkManifest).not.toHaveBeenCalled()
    expect(sync.applySync).not.toHaveBeenCalled()
  })
  it('compares mirror revisions and writes only application settings', async () => {
    const { root, api } = await setup()
    await expect(api.request({ action: 'configure', requestId: 'read' })).resolves.toMatchObject({ revision: 0, mirrorUrl: 'https://mirrors.ustc.edu.cn/pypi/simple' })
    await api.request({ action: 'configure', requestId: 'set', mirrorUrl: 'https://example.org/simple', expectedRevision: 0 })
    await expect(api.request({ action: 'configure', requestId: 'stale', mirrorUrl: 'https://example.org/simple', expectedRevision: 0 })).rejects.toThrow('REVISION_CONFLICT')
    expect(JSON.parse(await readFile(join(root, 'settings.json'), 'utf8'))).toEqual({ revision: 1, mirrorUrl: 'https://example.org/simple' })
  })

  it('stores a user-selected parent directory and requests a restart', async () => {
    const { root, api } = await setup()
    const result = await api.request({ action: 'configure', requestId: 'path', runtimeRoot: join(root, 'custom-runtime') })
    expect(result).toMatchObject({ restartRequired: true, runtimeRoot: join(root, 'custom-runtime', 'Python') })
    expect(JSON.parse(await readFile(join(root, 'python-location.json'), 'utf8'))).toEqual({ schema: 2, source: 'user-selected', runtimeRoot: join(root, 'custom-runtime', 'Python') })
  })

  it('reports the LocalAppData-style default before any Roaming profile exists', async () => {
    const { root, updater, sync } = await setup()
    const missingRoamingLocation = join(root, 'not-created', 'zerowall-science', 'python-location.json')
    const api = createApi(join(root, 'zerowall-python'), updater as unknown as PythonUpdaterService, sync, missingRoamingLocation)
    await expect(api.request({ action: 'status', requestId: 'first-run-path' })).resolves.toMatchObject({ runtimeRoot: join(root, 'Python') })
    await expect(readFile(missingRoamingLocation, 'utf8')).rejects.toThrow()
  })

  it('reads runtime metadata directly from the canonical single Python directory', async () => {
    const { root, updater, sync } = await setup()
    const managementRoot = join(root, 'ZeroWall Science', 'Python', '.zerowall')
    const runtimeRoot = join(root, 'ZeroWall Science', 'Python')
    await mkdir(managementRoot, { recursive: true })
    await mkdir(runtimeRoot, { recursive: true })
    await writeFile(join(managementRoot, 'current.json'), JSON.stringify({ root: runtimeRoot, runtimeRoot, health: 'ready' }))
    await writeFile(join(runtimeRoot, 'runtime.json'), JSON.stringify({ rootPath: runtimeRoot, executablePath: join(runtimeRoot, 'python.exe'), sitePackagesPath: join(runtimeRoot, 'Lib', 'site-packages'), pythonVersion: '3.12.10' }))
    const api = createApi(managementRoot, updater as unknown as PythonUpdaterService, sync, join(root, 'python-location.json'), undefined, runtimeRoot)
    await expect(api.request({ action: 'status', requestId: 'single-directory-status' })).resolves.toMatchObject({
      runtimeRoot,
      runtime: expect.objectContaining({ rootPath: runtimeRoot }),
    })
  })

  it('never exposes a legacy runtime.json path as the active shared path', async () => {
    const { root, updater, sync } = await setup()
    const legacy = join(root, 'Roaming', 'zerowall-science', 'Python')
    await mkdir(legacy, { recursive: true })
    await writeFile(join(root, 'current.json'), JSON.stringify({ health: 'ready', runtimeRoot: legacy, root: legacy }))
    await writeFile(join(legacy, 'runtime.json'), JSON.stringify({ rootPath: legacy }))
    const api = createApi(join(root, 'zerowall-python'), updater as unknown as PythonUpdaterService, sync)
    const result = await api.request({ action: 'status', requestId: 'ignore-legacy-runtime' })
    expect(result.runtimeRoot).toBe(join(root, 'Python'))
    expect(result.runtime).toBeUndefined()
  })

  it('keeps diagnostics usable when an old profile is awaiting direct bundle replacement', async () => {
    const { root, updater, sync } = await setup()
    const apiRoot = join(root, 'zerowall-python')
    const legacy = join(root, 'Roaming', 'zerowall-science', 'Python')
    await mkdir(legacy, { recursive: true })
    await mkdir(apiRoot, { recursive: true })
    await writeFile(join(apiRoot, 'current.json'), JSON.stringify({
      health: 'ready',
      runtimeRoot: legacy,
      root: join(root, 'slots', 'a'),
      manifest: { python: { relativeExecutable: 'bio-tools/python/python.exe', relativeSitePackages: 'bio-tools/python/Lib/site-packages' } },
    }))
    const api = createApi(apiRoot, updater as unknown as PythonUpdaterService, sync)
    await expect(api.request({ action: 'diagnose', requestId: 'legacy-diagnostics' })).resolves.toMatchObject({
      diagnostics: { python: { status: 'unavailable', message: expect.stringContaining('不会迁移') } },
    })
  })

  it('can change the path when the previously selected drive is unavailable', async () => {
    const { root, updater, sync } = await setup()
    const unavailableRuntime = join(root, 'missing-drive', 'zerowall-python')
    const control = join(root, 'local-control')
    const location = join(control, 'python-location.json')
    const api = createApi(unavailableRuntime, updater as unknown as PythonUpdaterService, sync, location)
    const result = await api.request({ action: 'configure', requestId: 'recover-path', runtimeRoot: join(root, 'writable-runtime') })
    expect(result).toMatchObject({ restartRequired: true, runtimeRoot: join(root, 'writable-runtime', 'Python') })
    expect(JSON.parse(await readFile(location, 'utf8')).runtimeRoot).toBe(join(root, 'writable-runtime', 'Python'))
  })
})
