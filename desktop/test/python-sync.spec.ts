import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PythonSyncService } from '../src/main/python-sync.js'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'python-sync-')); roots.push(root)
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const unsigned = { schema: 3, runtimeId: 'zerowall-science-python', platform: 'win32-x64', pythonVersion: '3.12.10', environmentVersion: '7.0.3', revision: 'r1', createdAt: '2026-09-23T00:00:00Z', index: { indexUrl: 'https://mirrors.aliyun.com/pypi/simple' }, packages: [{ name: 'numpy', version: '2.3.0', required: true, capabilities: ['science'] }], compatibility: { minApplicationVersion: '7.0.3' } }
  const manifest = { ...unsigned, signature: { algorithm: 'ed25519', keyId: 'test', value: sign(null, Buffer.from(JSON.stringify(unsigned)), privateKey).toString('base64') } }
  const apply = vi.fn(() => ({ taskId: 'task-1' }))
  const updater = { pythonInfo: vi.fn(async () => ({ ready: true, version: '3.12.10', packages: [{ name: 'numpy', version: '2.2.0' }] })), previewDependencyManifest: vi.fn(async () => {
    const plan = { planId: randomUUID(), snapshotId: 'old', requested: ['numpy==2.3.0'], changes: [{ name: 'numpy', from: '2.2.0', to: '2.3.0' }], wheels: [{ name: 'numpy', version: '2.3.0', hash: 'a'.repeat(64), url: 'https://mirror.example/numpy.whl' }], dependencyManifest: manifest }
    await mkdir(join(root, 'plans')); await writeFile(join(root, 'plans', `${plan.planId}.json`), JSON.stringify(plan))
    return plan
  }), applyPackagePlan: apply }
  const service = new PythonSyncService({ root, updater: updater as any, keys: { test: publicKey.export({ type: 'spki', format: 'pem' }).toString() }, applicationVersion: '7.0.3', feedUrl: 'https://example.test/latest.json', fetcher: vi.fn(async () => new Response(JSON.stringify(manifest))) as typeof fetch })
  return { service, apply, root, manifest, updater, key: publicKey.export({ type: 'spki', format: 'pem' }).toString() }
}

describe('signed dependency sync', () => {
  it('checks without installing, binds a preview and requires confirmation before queueing', async () => {
    const { service, apply } = await setup()
    expect((await service.checkManifest()).changes).toHaveLength(1)
    expect(apply).not.toHaveBeenCalled()
    const preview = await service.previewSync()
    await expect(service.applySync(preview.planId, 'r1', false)).rejects.toThrow(/确认/)
    await expect(service.applySync(preview.planId, 'r2', true)).rejects.toThrow(/已改变/)
    expect(await service.applySync(preview.planId, 'r1', true)).toEqual({ taskId: 'task-1' })
    expect(apply).toHaveBeenCalledExactlyOnceWith(preview.planId)
  })
  it('rejects a tampered installer plan after confirmation', async () => {
    const { service, apply, root } = await setup()
    await service.checkManifest(); const preview = await service.previewSync()
    await writeFile(join(root, 'plans', `${preview.planId}.json`), JSON.stringify({ ...preview, wheels: [{ ...preview.wheels[0], version: '2.4.0' }] }))
    await expect(service.applySync(preview.planId, 'r1', true)).rejects.toThrow(/已改变/)
    expect(apply).not.toHaveBeenCalled()
  })
  it('uses bundled signed metadata on 404 but rejects a bad remote signature', async () => {
    const { root, manifest, updater, key } = await setup()
    const bundledManifestPath = join(root, 'bundled.json'); await writeFile(bundledManifestPath, JSON.stringify(manifest))
    const options = { root, updater: updater as any, keys: { test: key }, applicationVersion: '7.0.3', feedUrl: 'https://example.test/latest.json', bundledManifestPath }
    const offline = new PythonSyncService({ ...options, fetcher: vi.fn(async () => new Response('', { status: 404 })) as typeof fetch })
    expect((await offline.checkManifest()).source).toBe('bundled')
    const tampered = new PythonSyncService({ ...options, fetcher: vi.fn(async () => new Response(JSON.stringify({ ...manifest, revision: 'r3' }))) as typeof fetch })
    await expect(tampered.checkManifest()).rejects.toThrow(/签名/)
  })
})
