import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PythonEnvironmentApi } from '../src/main/python-environment-api.js'
import type { PythonUpdaterService } from '../src/main/python-updater-service.js'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true }))) })
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'python-api-')); roots.push(root)
  const updater = { current: vi.fn(() => ({ phase: 'idle' })), rollback: vi.fn(() => ({ taskId: 'rollback-1' })), pythonInfo: vi.fn(async () => ({ packages: [] })) }
  const sync = { checkManifest: vi.fn(async () => ({ revision: 'r1' })), previewSync: vi.fn(async () => ({ planId: 'plan-1' })), applySync: vi.fn(async () => ({ taskId: 'job-1' })) }
  return { root, updater, sync, api: new PythonEnvironmentApi(root, updater as unknown as PythonUpdaterService, sync) }
}
describe('shared Python environment API', () => {
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
    const result = await api.request({ action: 'sync', requestId: 'one-click', confirm: true })
    expect(result).toMatchObject({ taskId: 'job-1', manifestRevision: 'r2', changes: [{ name: 'numpy', from: '2.0.0', to: '2.1.0' }] })
    expect(sync.applySync).toHaveBeenCalledWith('signed-plan', 'r2', true)
    // The receipt is what makes a repeated click and a restart both resolve to
    // the same task rather than enqueueing the install again.
    await expect(api.request({ action: 'sync', requestId: 'one-click', confirm: true })).resolves.toMatchObject({ taskId: 'job-1' })
    const restarted = new PythonEnvironmentApi(root, { current: vi.fn(), rollback: vi.fn(), pythonInfo: vi.fn() } as unknown as PythonUpdaterService, sync)
    await expect(restarted.request({ action: 'sync', requestId: 'one-click', confirm: true })).resolves.toMatchObject({ taskId: 'job-1' })
    // Only the original submission reaches the sync service; the later two read
    // the receipt written by that first call.
    expect(sync.applySync).toHaveBeenCalledTimes(1)
  })
  it('refuses one-click sync without confirmation and applies nothing when already current', async () => {
    const { api, sync } = await setup()
    await expect(api.request({ action: 'sync', requestId: 'unconfirmed' })).rejects.toThrow('CONFIRMATION_REQUIRED')
    expect(sync.applySync).not.toHaveBeenCalled()
    sync.previewSync = vi.fn(async () => ({ planId: 'empty-plan', manifestRevision: 'r1', snapshotId: 'gen-a', requested: [], changes: [] })) as never
    await expect(api.request({ action: 'sync', requestId: 'already-current', confirm: true })).resolves.toMatchObject({ upToDate: true, changes: [] })
    expect(sync.applySync).not.toHaveBeenCalled()
  })
  it('compares mirror revisions and writes only application settings', async () => {
    const { root, api } = await setup()
    await expect(api.request({ action: 'configure', requestId: 'read' })).resolves.toMatchObject({ revision: 0, mirrorUrl: 'https://mirrors.ustc.edu.cn/pypi/simple' })
    await api.request({ action: 'configure', requestId: 'set', mirrorUrl: 'https://example.org/simple', expectedRevision: 0 })
    await expect(api.request({ action: 'configure', requestId: 'stale', mirrorUrl: 'https://example.org/simple', expectedRevision: 0 })).rejects.toThrow('REVISION_CONFLICT')
    expect(JSON.parse(await readFile(join(root, 'settings.json'), 'utf8'))).toEqual({ revision: 1, mirrorUrl: 'https://example.org/simple' })
  })
})
