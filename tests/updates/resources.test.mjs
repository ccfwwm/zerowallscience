import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as yaml from 'yaml'
import { c as createArchive } from 'tar'
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

test('a selected update links unchanged offline packages without resolving their workspace manifests', async () => {
  const f = await fixture()
  await initializeProfile(f.home, [f.resource.id, 'legacy-plugin'])
  const offline = join(f.home, 'resources/offline/generation/node_modules/legacy-plugin')
  await mkdir(offline, { recursive: true })
  await writeFile(join(offline, 'package.json'), JSON.stringify({ name: 'legacy-plugin', version: '0.8.5', dependencies: { '@deepseek-ai/internal': 'workspace:*' } }))
  const file = join(f.home, 'profiles/web/package.json')
  const manifest = JSON.parse(await readFile(file))
  manifest.dependencies = { 'legacy-plugin': 'file:' + offline.replaceAll('\\', '/'), [f.resource.id]: '0.0.1' }
  await writeFile(file, JSON.stringify(manifest))
  await writeFile(join(f.home, 'profiles/web/pnpm-workspace.yaml'), JSON.stringify({ overrides: { 'legacy-plugin': 'file:old-override.tgz', custom: '1.2.3' }, allowBuilds: { custom: false } }))
  const before = await readFile(file, 'utf8')
  const manager = createResourceManager({ ...f, target, local: true, runPlugin: async (args, generation) => {
    const candidate = join(f.home, 'profiles', generation)
    const next = JSON.parse(await readFile(join(candidate, 'package.json')))
    const workspace = JSON.parse(await readFile(join(candidate, 'pnpm-workspace.yaml')))
    assert.equal(next.dependencies['legacy-plugin'], 'link:' + offline.replaceAll('\\', '/'))
    assert.match(next.dependencies[f.resource.id], /^file:.*\.tgz$/u)
    assert.equal(workspace.overrides['legacy-plugin'], undefined)
    assert.equal(workspace.overrides.custom, '1.2.3')
    assert.equal(workspace.autoInstallPeers, false)
    assert.equal(workspace.allowBuilds.custom, false)
    assert.equal(workspace.allowBuilds['@scarf/scarf'], false)
    assert.equal(args[0], 'add')
    throw new Error('fixture stops before activation')
  } })
  await assert.rejects(manager.plugin(f.resource.id, f.source), /fixture stops/)
  assert.equal(await readFile(file, 'utf8'), before)
  assert.equal(JSON.parse(await readFile(join(offline, 'package.json'))).dependencies['@deepseek-ai/internal'], 'workspace:*')
})

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

test('Skills checks detect unversioned imports, use detail versions, and preserve disabled versions', async () => {
  const f = await fixture()
  const ids = ['old-skill', 'current-skill', 'disabled-skill', 'bundled-skill', 'old-bundled-skill']
  const resources = ids.map(id => ({ ...f.resource, id, kind: 'skill', version: '0.1.2' }))
  await writeFile(f.source, JSON.stringify(signCatalog({ schema: 1, localOnly: true, resources }, f.privateKey, 'test')))
  const disabled = join(f.home, 'zerowall-skills/disabled/disabled-skill')
  await mkdir(disabled, { recursive: true })
  await writeFile(join(disabled, 'SKILL.md'), '---\nname: disabled-skill\nmetadata:\n  zerowall:\n    version: 0.1.2\n---\nContent\n')
  const calls = []
  const manager = createResourceManager({ ...f, target, yaml, local: true, bundledSkillVersions: { 'bundled-skill': '0.1.2', 'old-bundled-skill': '0.1.1' }, callHost: async (operation, args) => {
    calls.push([operation, args])
    if (operation === 'skill.list') return ids.map(name => ({ name }))
    if (operation === 'skill.sources') return { enabled: ids.slice(0, 2), disabled: ['disabled-skill'] }
    assert.equal(operation, 'skill.get')
    return args[0] === 'current-skill' ? { declaredVersion: '0.1.2' } : {}
  } })
  const result = await manager.check('skill', f.source)
  assert.deepEqual(result.resources.map(item => item.updateAvailable), [true, false, false, false, true])
  assert.equal(result.resources[0].installedVersion, undefined)
  assert.equal(result.resources[1].installedVersion, '0.1.2')
  assert.equal(result.resources[2].enabled, false)
  assert.equal(calls.some(([, args]) => args[0] === 'bundled-skill'), false)
  assert.ok(calls.every(([operation]) => ['skill.list', 'skill.sources', 'skill.get'].includes(operation)))
})

test('signed Skill updates stamp the catalog version and merge metadata without changing archive bytes', async () => {
  const f = await fixture()
  const folder = join(f.home, 'source')
  await mkdir(folder)
  const metadata = { name: 'fixture-skill', description: 'A useful Skill', metadata: { zerowall: { version: '0.1.1', source: 'user', custom: 'retained' }, owner: 'retained' }, custom: { flag: true } }
  await writeFile(join(folder, 'SKILL.md'), `---\n${yaml.stringify(metadata)}---\nBody stays intact.\n`)
  await createArchive({ file: f.path, cwd: folder, gzip: true }, ['SKILL.md'])
  const sha256 = await fileDigest(f.path)
  const resource = { ...f.resource, id: 'fixture-skill', kind: 'skill', version: '0.1.2', sha256, size: (await readFile(f.path)).length }
  await writeFile(f.source, JSON.stringify(signCatalog({ schema: 1, localOnly: true, resources: [resource] }, f.privateKey, 'test')))
  const manager = createResourceManager({ ...f, target, yaml, local: true, callHost: async (operation, args) => {
    assert.equal(operation, 'skill.update')
    const markdown = await readFile(join(args[0].sourcePath, 'SKILL.md'), 'utf8')
    const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/u.exec(markdown)
    assert.deepEqual(yaml.parse(match[1]), { ...metadata, metadata: { ...metadata.metadata, zerowall: { version: '0.1.2', source: 'catalog', custom: 'retained' } } })
    assert.equal(match[2], 'Body stays intact.\n')
    return { declaredVersion: '0.1.2' }
  } })
  assert.equal((await manager.resource('skill', resource.id, f.source)).declaredVersion, '0.1.2')
  assert.equal(await fileDigest(f.path), sha256)
})

test('MCP checks compare the installed generation version independently of Skill sources', async () => {
  const f = await fixture()
  const resource = { ...f.resource, id: 'fixture-server', kind: 'mcp', version: '0.2.0' }
  await writeFile(f.source, JSON.stringify(signCatalog({ schema: 1, localOnly: true, resources: [resource] }, f.privateKey, 'test')))
  const folder = join(f.home, 'resources/mcp/fixture-server')
  await mkdir(folder, { recursive: true })
  const manager = createResourceManager({ ...f, target, local: true, callHost: async operation => {
    assert.equal(operation, 'mcp.list')
    return [{ id: 'connection', serverName: resource.id, enabled: false }]
  } })
  await writeFile(join(folder, 'current.json'), JSON.stringify({ version: '0.1.0' }))
  assert.equal((await manager.check('mcp', f.source)).resources[0].updateAvailable, true)
  await writeFile(join(folder, 'current.json'), JSON.stringify({ version: '0.2.0' }))
  assert.equal((await manager.check('mcp', f.source)).resources[0].updateAvailable, false)
})

test('Core profiles can browse signed Skills/MCP catalogs before installing their domain plugins', async () => {
  const f = await fixture()
  for (const kind of ['skill', 'mcp']) {
    const resource = { ...f.resource, id: 'optional-resource', kind }
    await writeFile(f.source, JSON.stringify(signCatalog({ schema: 1, localOnly: true, resources: [resource] }, f.privateKey, 'test')))
    const manager = createResourceManager({ ...f, target, local: true, callHost: async () => {
      throw new Error('Requested plugin service is unavailable')
    } })
    const result = await manager.check(kind, f.source)
    assert.equal(result.domainAvailable, false)
    assert.equal(result.catalogStatus, 'checked')
    assert.equal(result.resources.length, 1)
    assert.equal(result.resources[0].source, 'catalog')
    assert.equal(result.resources[0].signed, true)
    assert.equal(result.resources[0].updateAvailable, undefined)
    const broken = createResourceManager({ ...f, target, local: true, callHost: async () => { throw new Error('Host is not ready') } })
    const unavailable = await broken.check(kind, f.source)
    assert.equal(unavailable.domainAvailable, false)
    assert.equal(unavailable.catalogStatus, 'checked')
  }
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
    assert.equal(result.resources.find(item => item.id === f.resource.id).installedVersion, undefined)
    assert.equal(result.resources.find(item => item.id === f.resource.id).installState, 'missing')
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
test('repair and local import preserve the offline closure without resolving workspace dependencies', async () => {
  for (const args of [['install'], ['add', 'user-plugin.tgz']]) {
    const f = await fixture()
    await initializeProfile(f.home, ['legacy-plugin'])
    const offline = join(f.home, 'resources/offline/generation/node_modules/legacy-plugin')
    await mkdir(offline, { recursive: true })
    await writeFile(join(offline, 'package.json'), JSON.stringify({ name: 'legacy-plugin', version: '0.8.5', dependencies: { '@deepseek-ai/internal': 'workspace:*' } }))
    const file = join(f.home, 'profiles/web/package.json')
    const manifest = JSON.parse(await readFile(file))
    manifest.dependencies = { 'legacy-plugin': 'file:' + offline.replaceAll('\\', '/') }
    await writeFile(file, JSON.stringify(manifest))
    const before = await readFile(file, 'utf8')
    const manager = createResourceManager({ ...f, target, local: true, runPlugin: async (actual, generation) => {
      assert.deepEqual(actual, args)
      const candidate = JSON.parse(await readFile(join(f.home, 'profiles', generation, 'package.json')))
      assert.equal(candidate.dependencies['legacy-plugin'], 'link:' + offline.replaceAll('\\', '/'))
      throw new Error('fixture stops before activation')
    } })
    await assert.rejects(manager.mutate(args), /fixture stops/)
    assert.equal(await readFile(file, 'utf8'), before)
  }
})
