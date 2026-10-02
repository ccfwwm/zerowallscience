import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { assertCompatible, downloadResource, fileDigest, signCatalog, verifyCatalog } from '../../tools/release/resource-catalog.mjs'
import { createResourceManager } from '../../tools/commands/resource-manager.mjs'
import { initializeProfile } from '../../tools/commands/profile.mjs'

const target = { desktopVersion: '8.0.0', dshVersion: '0.2.0-rc.2', platform: 'win32', architecture: 'x64' }
async function fixture() {
  const home = await mkdtemp(join(tmpdir(), 'zws-resource-test-'))
  const pair = generateKeyPairSync('ed25519')
  const keys = { test: pair.publicKey }
  const path = join(home, 'plugin.tgz')
  await writeFile(path, 'signed test artifact')
  const resource = { id: '@zerowallscience/plugin-test', kind: 'plugin', version: '0.1.0', dshRange: { min: target.dshVersion, max: target.dshVersion }, desktopRange: { min: '8.0.0' },
    platform: ['win32'], architecture: ['x64'], downloadUrl: pathToFileURL(path).href, sha256: await fileDigest(path), size: 20, restartRequired: true, rollbackSupported: true }
  const document = signCatalog({ schema: 1, localOnly: true, resources: [resource] }, pair.privateKey, 'test')
  const source = join(home, 'catalog.json')
  await writeFile(source, JSON.stringify(document))
  return { home, resource, document, source, keys, path, privateKey: pair.privateKey }
}

test('signature and runtime compatibility reject tampering and an incorrect rc version', async () => {
  const f = await fixture()
  verifyCatalog(f.document, f.keys, { local: true })
  assertCompatible(f.resource, target)
  assert.throws(() => verifyCatalog({ ...f.document, resources: [] }, f.keys, { local: true }), /signature/)
  assert.throws(() => assertCompatible(f.resource, { ...target, dshVersion: '0.2.0-rc.3' }), /exact/)
  assert.throws(() => verifyCatalog(f.document, f.keys), /HTTPS/)
  assert.throws(() => verifyCatalog(signCatalog({ ...f.document, resources: [{ ...f.resource, id: '../escape' }] }, f.privateKey, 'test'), f.keys, { local: true }), /identity/)
})

test('a damaged payload is never activated as a package', async () => {
  const f = await fixture()
  const destination = await downloadResource(f.resource, join(f.home, 'downloads'), { local: true })
  assert.equal(await fileDigest(destination), f.resource.sha256)
  await writeFile(f.path, 'wrong payload length')
  await assert.rejects(downloadResource(f.resource, join(f.home, 'bad'), { local: true }), /SHA-256|size/)
})

test('profile migration is idempotent and preserves deliberate plugin removal', async () => {
  const f = await fixture()
  await initializeProfile(f.home, [f.resource.id])
  const file = join(f.home, 'profiles/web/package.json')
  const manifest = JSON.parse(await readFile(file))
  manifest.dsh.profile.bundles = manifest.dsh.profile.bundles.filter(id => id !== f.resource.id)
  await writeFile(file, JSON.stringify(manifest))
  await initializeProfile(f.home, [f.resource.id])
  assert.deepEqual(JSON.parse(await readFile(file)), manifest)
})

test('catalog checks are read-only and report a selected plugin update', async () => {
  const f = await fixture()
  await initializeProfile(f.home, [f.resource.id])
  const installed = join(f.home, 'profiles/web/node_modules', f.resource.id)
  await mkdir(installed, { recursive: true })
  await writeFile(join(installed, 'package.json'), JSON.stringify({ name: f.resource.id, version: '0.1.0' }))
  const newer = { ...f.resource, version: '0.2.0' }
  await writeFile(f.source, JSON.stringify(signCatalog({ schema: 1, localOnly: true, resources: [newer] }, f.privateKey, 'test')))
  const manager = createResourceManager({ ...f, target, local: true })
  const before = await readFile(join(f.home, 'profiles/web/package.json'), 'utf8')
  const result = await manager.check('plugin', f.source)
  assert.equal(result.resources[0].updateAvailable, true)
  assert.equal(result.resources[0].installedVersion, '0.1.0')
  assert.equal(await readFile(join(f.home, 'profiles/web/package.json'), 'utf8'), before)
})

test('MCP updates match server identity rather than the display name and preserve disabled status', async () => {
  const f = await fixture()
  const template = { name: 'New friendly label', serverName: 'fixture-server', transport: 'streamable-http', url: 'https://example.test/mcp', enabled: true }
  await writeFile(f.path, JSON.stringify(template))
  const resource = { ...f.resource, id: template.serverName, kind: 'mcp', sha256: await fileDigest(f.path), size: Buffer.byteLength(JSON.stringify(template)), restartRequired: false }
  await writeFile(f.source, JSON.stringify(signCatalog({ schema: 1, localOnly: true, resources: [resource] }, f.privateKey, 'test')))
  const edits = []
  const manager = createResourceManager({ ...f, target, local: true, callHost: async (operation, args) => {
    if (operation === 'mcp.list') return [{ id: 'connection-1', name: 'Friendly label', serverName: template.serverName, enabled: false }]
    assert.equal(operation, 'mcp.edit')
    edits.push(args[0])
    return { id: 'connection-1' }
  } })
  assert.equal((await manager.update('mcp', f.source)).updated, 1)
  assert.equal(edits[0].changes.enabled, false)
})

test('Python catalog activation verifies the payload before invoking the dedicated updater', async () => {
  const f = await fixture()
  const resource = { ...f.resource, id: 'science-dependencies', kind: 'python', role: 'dependency-manifest', restartRequired: false }
  await writeFile(f.source, JSON.stringify(signCatalog({ schema: 1, localOnly: true, resources: [resource] }, f.privateKey, 'test')))
  const calls = []
  const manager = createResourceManager({ ...f, target, local: true, applyPython: async (entry, file) => {
    calls.push(entry.id)
    assert.equal(await fileDigest(file), resource.sha256)
    return { taskId: 'signed-python-sync' }
  } })
  assert.deepEqual(await manager.resource('python', resource.id, f.source), { taskId: 'signed-python-sync' })
  assert.deepEqual(calls, [resource.id])
  const bad = { ...resource, sha256: '0'.repeat(64) }
  await writeFile(f.source, JSON.stringify(signCatalog({ schema: 1, localOnly: true, resources: [bad] }, f.privateKey, 'test')))
  await assert.rejects(manager.resource('python', resource.id, f.source), /SHA-256/)
  assert.equal(calls.length, 1)
})

test('unpublished catalogs keep complete local inventory and bundled versions without pretending absent selections are enabled', async () => {
  const f = await fixture()
  await initializeProfile(f.home, [f.resource.id])
  const other = '@zerowallscience/plugin-other'
  const core = '@deepseek-ai/dsh-base'
  const manager = createResourceManager({ ...f, target, bundledPlugins: [{ id: f.resource.id, version: '0.1.0' }, { id: other, version: '0.2.0' }, { id: core, version: target.dshVersion, core: true, managed: false }], defaultPlugins: [f.resource.id, other, core] })
  const fetchBefore = globalThis.fetch
  globalThis.fetch = async () => new Response('', { status: 404 })
  try {
    const before = await readFile(join(f.home, 'profiles/web/package.json'), 'utf8')
    const result = await manager.check('plugin')
    assert.equal(result.catalogStatus, 'unpublished')
    assert.equal(result.error, undefined)
    assert.equal(result.resources.find(item => item.id === other).enabled, false)
    assert.equal(result.resources.find(item => item.id === core).managed, false)
    assert.equal(result.resources.find(item => item.id === core).version, target.dshVersion)
    assert.equal(result.resources.find(item => item.id === f.resource.id).installedVersion, '0.1.0')
    assert.equal(await readFile(join(f.home, 'profiles/web/package.json'), 'utf8'), before)
    globalThis.fetch = async () => { throw new Error('Local inventory must never access the network') }
    assert.equal((await manager.check('plugin', undefined, { localOnly: true })).catalogStatus, 'local')
    globalThis.fetch = async () => { throw new Error('offline fixture') }
    const unavailable = await manager.check('plugin')
    assert.equal(unavailable.catalogStatus, 'unavailable')
    assert.equal(unavailable.resources.length, result.resources.length)
    assert.match(unavailable.error, /offline/)
  } finally { globalThis.fetch = fetchBefore }
})

test('failed Host activation restores the old profile, while successful activation supports rollback', async () => {
  const f = await fixture()
  await initializeProfile(f.home, [f.resource.id])
  let rejectActivation = true
  let starts = 0
  const manager = createResourceManager({ ...f, target, local: true,
    runPlugin: async (_args, generation) => {
      const workspace = JSON.parse(await readFile(join(f.home, 'profiles', generation, 'pnpm-workspace.yaml'), 'utf8'))
      assert.equal(workspace.allowBuilds['@scarf/scarf'], false)
      assert.equal(workspace.dangerouslyAllowAllBuilds, undefined)
      const file = join(f.home, 'profiles', generation, 'package.json')
      const value = JSON.parse(await readFile(file)); value.testVersion = 'new'
      await writeFile(file, JSON.stringify(value))
    }, stopHost: async () => {}, startHost: async () => {
      starts++
      if (rejectActivation && starts === 1) throw new Error('Host failed')
    }, callHost: async () => {} })
  await assert.rejects(manager.plugin(f.resource.id, f.source), /Host failed/)
  const file = join(f.home, 'profiles/web/package.json')
  assert.equal(JSON.parse(await readFile(file)).testVersion, undefined)
  rejectActivation = false
  await manager.plugin(f.resource.id, f.source)
  assert.equal(JSON.parse(await readFile(file)).testVersion, 'new')
  await manager.rollbackPlugin(f.resource.id)
  assert.equal(JSON.parse(await readFile(file)).testVersion, undefined)
})
