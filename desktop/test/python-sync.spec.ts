import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PythonSyncService } from '../src/main/python-sync.js'
import { parsePythonDependencyManifest } from '../src/main/python-dependency-manifest.js'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'python-sync-')); roots.push(root)
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const unsigned = { schema: 3, runtimeId: 'zerowall-science-python', platform: 'win32-x64', pythonVersion: '3.12.10', environmentVersion: '7.0.3', revision: 'r1', createdAt: '2026-09-23T00:00:00Z', index: { indexUrl: 'https://mirrors.aliyun.com/pypi/simple' }, packages: [{ name: 'numpy', version: '2.3.0', required: true, capabilities: ['science'] }], compatibility: { minApplicationVersion: '7.0.3' } }
  const manifest = { ...unsigned, signature: { algorithm: 'ed25519', keyId: 'test', value: sign(null, Buffer.from(JSON.stringify(unsigned)), privateKey).toString('base64') } }
  const apply = vi.fn(() => ({ taskId: 'task-1' }))
  const updater = { pythonInfo: vi.fn(async () => ({ ready: true, version: '3.12.10', packages: [] })), previewDependencyManifest: vi.fn(async (dependencyManifest?: object) => {
    const plan = { planId: randomUUID(), snapshotId: 'old', requested: ['numpy==2.3.0'], changes: [{ name: 'numpy', from: '2.2.0', to: '2.3.0' }], wheels: [{ name: 'numpy', version: '2.3.0', hash: 'a'.repeat(64), url: 'https://mirror.example/numpy.whl' }], dependencyManifest: dependencyManifest ?? { ...manifest, layer: 'science' } }
    await mkdir(join(root, 'plans')); await writeFile(join(root, 'plans', `${plan.planId}.json`), JSON.stringify(plan))
    return plan
  }), applyPackagePlan: apply }
  const service = new PythonSyncService({ root, updater: updater as any, keys: { test: publicKey.export({ type: 'spki', format: 'pem' }).toString() }, applicationVersion: '7.0.3', feedUrl: 'https://example.test/latest.json', fetcher: vi.fn(async () => new Response(JSON.stringify(manifest))) as typeof fetch })
  return { service, apply, root, manifest, updater, privateKey, key: publicKey.export({ type: 'spki', format: 'pem' }).toString() }
}

describe('signed dependency sync', () => {
  it('imports a signed catalog manifest but rejects tampering and a revision downgrade', async () => {
    const { service, root, manifest, privateKey, apply } = await setup()
    const file = join(root, 'import.json')
    const { signature, ...unsigned } = manifest
    const updated = { ...unsigned, revision: 'r2' }
    await writeFile(file, JSON.stringify({ ...updated, signature: { ...signature, value: sign(null, Buffer.from(JSON.stringify(updated)), privateKey).toString('base64') } }))
    await service.importManifest(file)
    expect((await service.previewSync()).manifestRevision).toBe('r2')
    await writeFile(file, JSON.stringify(manifest))
    await expect(service.importManifest(file)).rejects.toThrow(/降级/)
    await writeFile(file, JSON.stringify({ ...manifest, revision: 'r3' }))
    await expect(service.importManifest(file)).rejects.toThrow(/签名/)
    expect(apply).not.toHaveBeenCalled()
  })

  it('checks without installing, binds a preview and requires confirmation before queueing', async () => {
    const { service, apply } = await setup()
    // The signed plan installs a missing package and never overwrites an existing one.
    expect((await service.checkManifest()).changes).toHaveLength(1)
    expect(apply).not.toHaveBeenCalled()
    const preview = await service.previewSync()
    await expect(service.applySync(preview.planId, 'r1', false)).rejects.toThrow(/确认/)
    await expect(service.applySync(preview.planId, 'r2', true)).rejects.toThrow(/已改变/)
    expect(await service.applySync(preview.planId, 'r1', true)).toEqual({ taskId: 'task-1' })
    expect(apply).toHaveBeenCalledExactlyOnceWith(preview.planId)
  })
  it('checks capability subsets from the signed science manifest and keeps updates explicit', async () => {
    const { service, apply } = await setup()
    const checked = await service.checkManifest('capability')
    expect(checked).toMatchObject({ layer: 'capability', revision: 'r1', capabilityCounts: { science: { packageCount: 1, pendingPackageCount: 1 } } })
    expect(apply).not.toHaveBeenCalled()
    const preview = await service.previewSync('capability', 'science')
    await expect(service.applySync(preview.planId, 'r1', false)).rejects.toThrow(/确认/)
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

  it('never lets a legacy cached or remote revision replace a newer bundled science manifest', async () => {
    const { root, manifest, updater, privateKey, key } = await setup()
    const { signature: _oldSignature, ...manifestUnsigned } = manifest
    const newerUnsigned = { ...manifestUnsigned, environmentVersion: '8.0.5', revision: 'r14', packages: [{ name: 'pandas', version: '2.3.0', required: true, capabilities: ['science'] }] }
    const newer = { ...newerUnsigned, signature: { ...manifest.signature, value: sign(null, Buffer.from(JSON.stringify(newerUnsigned)), privateKey).toString('base64') } }
    expect(() => parsePythonDependencyManifest(newer, { test: key }, '8.0.5')).not.toThrow()
    const bundledManifestPath = join(root, 'bundled.json')
    await writeFile(bundledManifestPath, JSON.stringify(newer))
    const service = new PythonSyncService({ root, updater: updater as any, keys: { test: key }, applicationVersion: '8.0.5', feedUrl: 'https://example.test/latest.json', bundledManifestPath, fetcher: vi.fn(async () => new Response(JSON.stringify(manifest))) as typeof fetch })
    const result = await service.checkManifest()
    expect(result.manifestRevision).toBe('r14')
    expect(result.source).toBe('bundled')
    expect(result.packageCount).toBe(1)
    expect(result.pendingPackageCount).toBe(1)
    expect(JSON.parse(await readFile(join(root, 'dependency-sync', 'manifest.json'), 'utf8')).revision).toBe('r14')
  })

  it('keeps a package preflight failure as a retryable item while applying the remaining packages', async () => {
    const { service, root, updater, privateKey, manifest } = await setup()
    const { signature: oldSignature, ...unsigned } = manifest
    const expandedUnsigned = { ...unsigned, packages: [
      ...(unsigned.packages as Array<Record<string, unknown>>),
      { name: 'vedo', version: '2026.6.1', required: false, capabilities: ['science'], source: 'wheel', filename: 'vedo.whl', sha256: 'b'.repeat(64) },
    ] }
    const expandedManifest = { ...expandedUnsigned, signature: { ...oldSignature, value: sign(null, Buffer.from(JSON.stringify(expandedUnsigned)), privateKey).toString('base64') } }
    await mkdir(join(root, 'dependency-sync'), { recursive: true })
    await writeFile(join(root, 'dependency-sync', 'manifest.json'), JSON.stringify(expandedManifest))
    await service.checkManifest()
    const preflight = vi.spyOn(updater, 'previewDependencyManifest').mockResolvedValue({
      planId: randomUUID(), snapshotId: 'old', requested: [], changes: [], wheels: [{ name: 'numpy', version: '2.3.0', hash: 'a'.repeat(64), url: 'https://mirror.example/numpy.whl' }],
      preparationFailures: [{ name: 'numpy', version: '2.3.0', message: 'ResolutionImpossible' }],
    } as any)
    const plan = await service.previewSync()
    expect(plan.error).toBeUndefined()
    expect(plan.preparationFailures).toEqual([{ name: 'numpy', version: '2.3.0', message: 'ResolutionImpossible' }])
    expect(plan.planId).toBeTruthy()
    expect(JSON.parse(await readFile(join(root, 'dependency-sync', `${plan.planId}.json`), 'utf8'))).toMatchObject({ preparationFailures: [{ name: 'numpy', version: '2.3.0' }] })
  })
})
