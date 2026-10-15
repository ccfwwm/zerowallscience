import { generateKeyPairSync, randomUUID, sign } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { canonicalManifest, McpEnvironmentController, type McpEnvironmentManifest } from '../src/worker/mcp-environment.js'
import { prepareManifestPackagePlan, applyPackagePlanFiles } from '../src/worker/python-packages.js'

vi.mock('../src/worker/python-local-inventory.js', () => ({ scanFixedPython: vi.fn(async (root: string) => ({ ready: true, pipReady: true, version: '3.12.10', executable: join(root, 'python.exe'), sitePackages: join(root, 'Lib/site-packages'), runtimeRoot: root, packages: [{ name: 'pandas', version: '1.0.0', source: 'custom' }], inventoryComplete: true })) }))
vi.mock('../src/worker/python-packages.js', async importOriginal => ({ ...await importOriginal<object>(), prepareManifestPackagePlan: vi.fn(async (_manager, context) => ({ planId: randomUUID(), snapshotId: context.root, requested: [], changes: [], wheels: [] })), applyPackagePlanFiles: vi.fn(async () => ({ installed: 0, skipped: [], pipCheckPassed: true, importCheckPassed: true })) }))

const roots: string[] = []
afterEach(async () => { vi.clearAllMocks(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
async function fixture(pointer: 'legacy' | 'absent' | 'fixed' = 'legacy', installed = true) {
  const base = await mkdtemp(join(tmpdir(), 'zws-fixed-context-')); roots.push(base)
  const root = join(base, '安装 目录', 'Python'), manager = join(root, '.zerowall')
  await mkdir(join(root, 'Lib/site-packages'), { recursive: true }); await mkdir(manager)
  await writeFile(join(root, 'python.exe'), 'fixed interpreter sentinel')
  await writeFile(join(root, 'Lib/site-packages', 'user.py'), 'user package sentinel')
  const keys = generateKeyPairSync('ed25519'), key = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString()
  const manifest: McpEnvironmentManifest = { schema: 2, environmentId: 'zerowall-python', environmentVersion: '1.5.2', contentRevision: 1, platform: 'win32', architecture: 'x64', archiveUrl: 'https://fixture.invalid/bootstrap.zip', archiveSha256: 'a'.repeat(64), archiveSize: 1, python: { version: '3.12.10', relativeExecutable: 'Python/python.exe', relativeSitePackages: 'Python/Lib/site-packages', modules: ['pip'], supportsZeroWallTool: true, bootstrapOnly: true }, pythonHealth: { imports: ['pip'], bioServer: 'bio', ketcherServer: 'ketcher' }, skillsRoot: 'skills', sci: { version: '1', nodeMinimum: '24', cli: 'cli', mcp: 'mcp' }, mcp: { bioToolsVersion: '1', ketcherChemistryVersion: '1', sciMasterVersion: '1', publicToolCount: 0, internalToolCount: 0, servers: [] }, source: { claudeScienceRuntime: 'fixture', sourceHashes: {} }, signature: { algorithm: 'ed25519', keyId: 'fixture', value: '' } }
  manifest.signature.value = sign(null, canonicalManifest(manifest), keys.privateKey).toString('base64')
  const signedBytes = JSON.stringify(manifest)
  if (installed) await writeFile(join(root, 'manifest.json'), signedBytes)
  const stale = JSON.stringify(pointer === 'fixed' ? { root, health: 'ready', customizations: { pandas: '1.0.0' }, extensionNames: ['pandas'], localRevision: 7 } : { root: join(manager, 'slots', 'a-old'), health: 'ready', generation: true, customizations: { 'legacy-only': '9' } })
  if (pointer !== 'absent') await writeFile(join(manager, 'current.json'), stale)
  const fetcher = vi.fn(async () => new Response(signedBytes))
  const publish = vi.fn()
  const controller = new McpEnvironmentController({ root: manager, runtimeRoot: root, manifestUrl: 'https://fixture.invalid/bootstrap.json', publicKey: key, publicKeys: { fixture: key }, fetcher, publish })
  return { root, manager, manifest, signedBytes, stale, fetcher, controller, keys, publish }
}
function dependencyManifest(keys: ReturnType<typeof generateKeyPairSync>) {
  const manifest = { schema: 3, runtimeId: 'zerowall-science-python', platform: 'win32-x64', pythonVersion: '3.12.10', environmentVersion: '3.12.10', revision: 'fixture', layer: 'science', createdAt: new Date().toISOString(), index: { indexUrl: 'https://mirrors.ustc.edu.cn/pypi/simple' }, compatibility: { minApplicationVersion: '8.1.3' }, packages: [{ name: 'pandas', version: '3.0.5', required: true, capabilities: [] }], signature: { algorithm: 'ed25519', keyId: 'fixture', value: '' } }
  const { signature, ...unsigned } = manifest
  signature.value = sign(null, Buffer.from(JSON.stringify(unsigned)), keys.privateKey).toString('base64')
  return manifest
}

describe('fixed Python package context', () => {
  it.each(['legacy', 'absent'] as const)('previews with %s metadata using fixed files without rewriting the pointer', async pointer => {
    const f = await fixture(pointer)
    const plan = await f.controller.previewDependencyManifest(dependencyManifest(f.keys) as never)
    expect(plan.snapshotId).toBe(f.root)
    expect(prepareManifestPackagePlan).toHaveBeenCalledWith(f.manager, expect.objectContaining({ root: f.root, executable: join(f.root, 'python.exe'), sitePackages: join(f.root, 'Lib/site-packages'), manifest: expect.objectContaining({ python: expect.objectContaining({ relativeExecutable: 'python.exe' }) }) }), expect.anything(), expect.anything(), expect.any(Function))
    if (pointer === 'legacy') expect(await readFile(join(f.manager, 'current.json'), 'utf8')).toBe(f.stale)
    else await expect(readFile(join(f.manager, 'current.json'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(f.fetcher).not.toHaveBeenCalled()
  })
  it.each(['legacy', 'absent'] as const)('repairs %s metadata only on explicit apply while preserving installed bytes', async pointer => {
    const f = await fixture(pointer), planId = randomUUID()
    await mkdir(join(f.manager, 'plans')); await writeFile(join(f.manager, 'plans', `${planId}.json`), JSON.stringify({ planId, snapshotId: f.root, requested: [], changes: [], wheels: [] }))
    await f.controller.applyPackagePlan(planId)
    expect(applyPackagePlanFiles).toHaveBeenCalledWith(f.manager, expect.objectContaining({ root: f.root }), f.root, expect.anything(), expect.any(Function))
    const current = JSON.parse(await readFile(join(f.manager, 'current.json'), 'utf8'))
    expect(current).toMatchObject({ root: f.root, runtimeRoot: f.root, generation: false, health: 'ready' })
    expect(current.customizations).not.toHaveProperty('legacy-only')
    expect(await readFile(join(f.root, 'python.exe'), 'utf8')).toBe('fixed interpreter sentinel')
    expect(await readFile(join(f.root, 'Lib/site-packages/user.py'), 'utf8')).toBe('user package sentinel')
    expect(await readFile(join(f.root, 'manifest.json'), 'utf8')).toBe(f.signedBytes)
    expect(f.fetcher).not.toHaveBeenCalled()
  })
  it('rejects a legacy-slot plan before changing metadata or applying packages', async () => {
    const f = await fixture(), planId = randomUUID()
    await mkdir(join(f.manager, 'plans')); await writeFile(join(f.manager, 'plans', `${planId}.json`), JSON.stringify({ planId, snapshotId: join(f.manager, 'slots', 'a-old'), changes: [], wheels: [] }))
    await expect(f.controller.applyPackagePlan(planId)).rejects.toThrow('环境已变化')
    expect(await readFile(join(f.manager, 'current.json'), 'utf8')).toBe(f.stale)
    expect(applyPackagePlanFiles).not.toHaveBeenCalled()
  })
  it('keeps the package name and successful count in progress when the bootstrap version is known', async () => {
    const f = await fixture('fixed'), planId = randomUUID()
    await f.controller.localStatus()
    await mkdir(join(f.manager, 'plans')); await writeFile(join(f.manager, 'plans', `${planId}.json`), JSON.stringify({ planId, snapshotId: f.root, requested: [], changes: [], wheels: [] }))
    vi.mocked(applyPackagePlanFiles).mockImplementationOnce(async (_manager, _context, _root, _plan, progress) => {
      progress?.({ completed: 1, total: 1, name: 'six', stage: '已安装 six' })
      return { installed: 1, skipped: [], importCheckPassed: true, pipCheckPassed: true }
    })
    await f.controller.applyPackagePlan(planId)
    expect(f.publish).toHaveBeenCalledWith(expect.objectContaining({ phase: 'installing', updateJob: expect.objectContaining({ targetVersion: 'six', completedFiles: 1, totalFiles: 1 }) }))
  })
  it('initializes fixed metadata offline and preserves canonical customization history', async () => {
    const f = await fixture('fixed')
    expect(await f.controller.initialize()).toMatchObject({ phase: 'ready' })
    expect(JSON.parse(await readFile(join(f.manager, 'current.json'), 'utf8'))).toMatchObject({ customizations: { pandas: '1.0.0' }, extensionNames: ['pandas'], localRevision: 8 })
    expect(f.fetcher).not.toHaveBeenCalled()
    expect(await readFile(join(f.root, 'manifest.json'), 'utf8')).toBe(f.signedBytes)
  })
  it('uses the fixed manifest during read-only update checks and leaves legacy metadata untouched', async () => {
    const f = await fixture()
    expect(await f.controller.checkForUpdates()).toMatchObject({ phase: 'ready', updateAvailable: false, python: { executable: join(f.root, 'python.exe') } })
    expect(await readFile(join(f.manager, 'current.json'), 'utf8')).toBe(f.stale)
  })
  it('recovers missing manifest metadata from a signed bootstrap on explicit initialization', async () => {
    const f = await fixture('absent', false)
    expect(await f.controller.initialize()).toMatchObject({ phase: 'ready' })
    expect(JSON.parse(await readFile(join(f.root, 'manifest.json'), 'utf8'))).toEqual(f.manifest)
    expect(JSON.parse(await readFile(join(f.manager, 'current.json'), 'utf8'))).toMatchObject({ root: f.root, generation: false })
  })
  it('refuses an invalid bootstrap signature without registering metadata', async () => {
    const f = await fixture('absent', false)
    const tampered = { ...f.manifest, archiveSha256: 'b'.repeat(64) }
    f.fetcher.mockImplementation(async () => new Response(JSON.stringify(tampered)))
    expect(await f.controller.initialize()).toMatchObject({ lastUpdateError: 'MCP environment manifest signature is invalid.' })
    await expect(readFile(join(f.manager, 'current.json'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(join(f.root, 'manifest.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  })
  it.each([true, false])('uses the actual interpreter with remote bootstrapOnly=%s and different archive version', async bootstrapOnly => {
    const f = await fixture('absent', false)
    const mismatched = { ...f.manifest, python: { ...f.manifest.python, version: '3.13.0', bootstrapOnly } }
    mismatched.signature.value = sign(null, canonicalManifest(mismatched), f.keys.privateKey).toString('base64')
    f.fetcher.mockImplementation(async () => new Response(JSON.stringify(mismatched)))
    expect(await f.controller.initialize()).toMatchObject({ phase: 'ready', python: { version: '3.12.10' } })
    expect(JSON.parse(await readFile(join(f.manager, 'current.json'), 'utf8'))).toMatchObject({ root: f.root, manifest: { python: { version: '3.12.10' } } })
    expect(JSON.parse(await readFile(join(f.root, 'manifest.json'), 'utf8'))).toEqual(mismatched)
    expect(await f.controller.previewDependencyManifest(dependencyManifest(f.keys) as never)).toMatchObject({ snapshotId: f.root })
    expect(await readFile(join(f.root, 'python.exe'), 'utf8')).toBe('fixed interpreter sentinel')
  })
  it.each(['legacy', 'absent'] as const)('applies dependencies with %s metadata despite a different remote runtime version', async pointer => {
    const f = await fixture(pointer, false)
    const remote = { ...f.manifest, python: { ...f.manifest.python, version: '3.13.0', bootstrapOnly: false } }
    remote.signature.value = sign(null, canonicalManifest(remote), f.keys.privateKey).toString('base64')
    f.fetcher.mockImplementation(async () => new Response(JSON.stringify(remote)))
    const manifest = dependencyManifest(f.keys)
    const planId = randomUUID()
    await mkdir(join(f.manager, 'plans'))
    await writeFile(join(f.manager, 'plans', `${planId}.json`), JSON.stringify({ planId, snapshotId: f.root, requested: [], changes: [], wheels: [], dependencyManifest: manifest }))
    await f.controller.applyPackagePlan(planId)
    expect(applyPackagePlanFiles).toHaveBeenCalledWith(f.manager, expect.objectContaining({ root: f.root, executable: join(f.root, 'python.exe') }), f.root, expect.anything(), expect.any(Function))
    expect(JSON.parse(await readFile(join(f.manager, 'current.json'), 'utf8'))).toMatchObject({ root: f.root, generation: false, manifest: { python: { version: '3.12.10' } } })
    expect(JSON.parse(await readFile(join(f.root, 'manifest.json'), 'utf8'))).toEqual(remote)
    expect(await readFile(join(f.root, 'python.exe'), 'utf8')).toBe('fixed interpreter sentinel')
    expect(await readFile(join(f.root, 'Lib/site-packages/user.py'), 'utf8')).toBe('user package sentinel')
  })
})
