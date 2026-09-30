import { mkdir, mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalizePythonRuntimePath, PythonEnvironmentApi } from '../src/main/python-environment-api.js'
import type { PythonUpdaterService } from '../src/main/python-updater-service.js'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true }))) })
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'python-api-')); roots.push(root)
  const updater = { current: vi.fn(() => ({ phase: 'ready' })), rollback: vi.fn(() => ({ taskId: 'rollback-1' })), pythonInfo: vi.fn(async () => ({ packages: [] })) }
  const sync = { checkManifest: vi.fn(async () => ({ revision: 'r1' })), previewSync: vi.fn(async () => ({ planId: 'plan-1' })), applySync: vi.fn(async () => ({ taskId: 'job-1' })) }
  return { root, updater, sync, api: new PythonEnvironmentApi(root, updater as unknown as PythonUpdaterService, sync) }
}
async function waitForSync(api: PythonEnvironmentApi, request: { action: 'sync'; requestId: string; confirm: true }) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const receipt = await api.request(request)
    if (receipt.queued !== true) return receipt
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  throw new Error(`Python sync task ${request.requestId} did not reach a terminal state.`)
}
describe('shared Python environment API', () => {
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
    expect(results[0]).toEqual(results[1]); expect(sync.applySync).toHaveBeenCalledTimes(1)
    const restarted = new PythonEnvironmentApi(root, updater as unknown as PythonUpdaterService, sync)
    await expect(restarted.request(request)).resolves.toMatchObject({ taskId: 'job-1' })
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
    const result = await waitForSync(api, request)
    expect(result).toMatchObject({ taskId: 'job-1', manifestRevision: 'r2', changes: [{ name: 'numpy', from: '2.0.0', to: '2.1.0' }] })
    expect(sync.applySync).toHaveBeenCalledWith('signed-plan', 'r2', true)
    // The receipt is what makes a repeated click and a restart both resolve to
    // the same task rather than enqueueing the install again.
    await expect(api.request(request)).resolves.toMatchObject({ taskId: 'job-1' })
    const restarted = new PythonEnvironmentApi(root, { current: vi.fn(), rollback: vi.fn(), pythonInfo: vi.fn() } as unknown as PythonUpdaterService, sync)
    await expect(restarted.request(request)).resolves.toMatchObject({ taskId: 'job-1' })
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

  it('waits for the signed shared runtime before dependency operations', async () => {
    const { api, updater, sync } = await setup()
    const ensureReady = vi.fn(async () => ({ phase: 'ready' as const }))
    ;(updater as typeof updater & { ensureReady: typeof ensureReady }).ensureReady = ensureReady
    sync.checkManifest = vi.fn(async () => ({ revision: 'r1', changes: [] })) as never
    await expect(api.request({ action: 'check_manifest', requestId: 'runtime-gate' })).resolves.toMatchObject({ manifest: { revision: 'r1' } })
    expect(ensureReady).toHaveBeenCalledTimes(1)
    expect(sync.checkManifest).toHaveBeenCalledTimes(1)
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
    expect(JSON.parse(await readFile(join(root, 'python-location.json'), 'utf8'))).toEqual({ runtimeRoot: join(root, 'custom-runtime', 'Python') })
  })

  it('reports the LocalAppData-style default before any Roaming profile exists', async () => {
    const { root, updater, sync } = await setup()
    const missingRoamingLocation = join(root, 'not-created', 'zerowall-science', 'python-location.json')
    const api = new PythonEnvironmentApi(join(root, 'zerowall-python'), updater as unknown as PythonUpdaterService, sync, missingRoamingLocation)
    await expect(api.request({ action: 'status', requestId: 'first-run-path' })).resolves.toMatchObject({ runtimeRoot: join(root, 'Python') })
    await expect(readFile(missingRoamingLocation, 'utf8')).rejects.toThrow()
  })

  it('never exposes a legacy runtime.json path as the active shared path', async () => {
    const { root, updater, sync } = await setup()
    const legacy = join(root, 'Roaming', 'zerowall-science', 'Python')
    await mkdir(legacy, { recursive: true })
    await writeFile(join(root, 'current.json'), JSON.stringify({ health: 'ready', runtimeRoot: legacy, root: legacy }))
    await writeFile(join(legacy, 'runtime.json'), JSON.stringify({ rootPath: legacy }))
    const api = new PythonEnvironmentApi(join(root, 'zerowall-python'), updater as unknown as PythonUpdaterService, sync)
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
    const api = new PythonEnvironmentApi(apiRoot, updater as unknown as PythonUpdaterService, sync)
    await expect(api.request({ action: 'diagnose', requestId: 'legacy-diagnostics' })).resolves.toMatchObject({
      diagnostics: { python: { status: 'pending', message: expect.stringContaining('不会迁移') } },
    })
  })

  it('can change the path when the previously selected drive is unavailable', async () => {
    const { root, updater, sync } = await setup()
    const unavailableRuntime = join(root, 'missing-drive', 'zerowall-python')
    const control = join(root, 'local-control')
    const location = join(control, 'python-location.json')
    const api = new PythonEnvironmentApi(unavailableRuntime, updater as unknown as PythonUpdaterService, sync, location)
    const result = await api.request({ action: 'configure', requestId: 'recover-path', runtimeRoot: join(root, 'writable-runtime') })
    expect(result).toMatchObject({ restartRequired: true, runtimeRoot: join(root, 'writable-runtime', 'Python') })
    expect(JSON.parse(await readFile(location, 'utf8')).runtimeRoot).toBe(join(root, 'writable-runtime', 'Python'))
  })
})
