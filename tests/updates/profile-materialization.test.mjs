import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync } from 'node:crypto'
import { createRequire } from 'node:module'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, mkdir, readFile, realpath, rename, rm, symlink, writeFile, lstat, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { offlineFiles } from '../../tools/commands/offline-profile.mjs'
import { createResourceManager } from '../../tools/commands/resource-manager.mjs'
import { materializationFile, physicalizeProfilePlugins, preparePhysicalRootsForPnpm, verifyMaterializedProfile } from '../../tools/commands/profile-materialization.mjs'
import { repairProfileLayout } from '../../tools/commands/profile-layout.mjs'
import { initializeProfile } from '../../tools/commands/profile.mjs'
import { signCatalog } from '../../tools/commands/resource-catalog.mjs'
import { physicalFs } from '../../tools/commands/physical-fs.mjs'
import { importHistoricalPlugin, verifyHistoricalPluginImports } from '../../tools/commands/historical-plugin.mjs'
import { scanProfileLinks } from '../../tools/commands/profile-link-scan.mjs'

for (const damage of ['self', 'multi-hop', 'dangling']) test(`signed repair recovers an existing ${damage} nested dependency and remains stable`, async t => {
  const f = await fixture(t), source = await f.supply('1.0.0')
  await f.manager.repairOffline(source)
  const dependency = join(f.active, 'node_modules/plugin-a/node_modules/shared')
  await unlink(dependency)
  const second = join(f.active, '.zerowall/install-sources/broken/node_modules/shared')
  await mkdir(dirname(second), { recursive: true })
  await symlink(damage === 'self' ? dependency : damage === 'multi-hop' ? second : join(f.root, 'absent'), dependency, process.platform === 'win32' ? 'junction' : 'dir')
  if (damage === 'multi-hop') await symlink(dependency, second, process.platform === 'win32' ? 'junction' : 'dir')
  const evidence = await scanProfileLinks(f.active)
  assert(evidence.some(row => row.fault === (damage === 'dangling' ? 'dangling' : 'cycle')))
  assert.equal((await f.manager.repairOffline(source)).repaired, true)
  const loaded = await promisify(execFile)(process.execPath, ['-e', 'console.log(require("./node_modules/plugin-a"))'], { cwd: f.active, windowsHide: true })
  assert.equal(loaded.stdout.trim(), '1.0.0')
  assert.equal((await f.manager.repairOffline(source)).repaired, false)
})

test('physicalization copies nested dependency bytes and preserves a normal package cycle', async t => {
  const f = await fixture(t, ['plugin-a'])
  const source = join(f.active, '.zerowall/install-sources/test')
  const nested = join(source, 'node_modules/yaml')
  await mkdir(join(nested, 'node_modules'), { recursive: true })
  await writeFile(join(source, 'package.json'), JSON.stringify({ name: 'plugin-a', version: '1.0.0', dependencies: { yaml: '1.0.0' } }))
  await writeFile(join(nested, 'package.json'), JSON.stringify({ name: 'yaml', version: '1.0.0', main: 'index.cjs', dependencies: { 'plugin-a': '1.0.0' } }))
  await writeFile(join(nested, 'index.cjs'), 'module.exports="nested-bytes"')
  await symlink(source, join(nested, 'node_modules/plugin-a'), process.platform === 'win32' ? 'junction' : 'dir')
  await mkdir(join(f.active, 'node_modules'), { recursive: true })
  await symlink(source, join(f.active, 'node_modules/plugin-a'), process.platform === 'win32' ? 'junction' : 'dir')
  await physicalizeProfilePlugins({ profile: f.active, ids: ['plugin-a'] })
  const actual = join(f.active, 'node_modules/plugin-a/node_modules/yaml')
  assert.equal((await lstat(actual)).isSymbolicLink(), false)
  assert.equal(await readFile(join(actual, 'index.cjs'), 'utf8'), 'module.exports="nested-bytes"')
  assert.equal(await realpath(join(actual, 'node_modules/plugin-a')), await realpath(join(f.active, 'node_modules/plugin-a')))
  assert.deepEqual(await scanProfileLinks(f.active), [])
})

const target = { desktopVersion: '8.3.6', dshVersion: '0.2.0-rc.2', dshCommit: 'a'.repeat(40), platform: 'win32', architecture: 'x64' }
async function fixture(t, ids = ['plugin-a', 'plugin-b'], { supportIds = [] } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'zws-physical-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const home = join(root, '用户 项目'), runtimeModules = join(root, 'runtime/node_modules')
  const pair = generateKeyPairSync('ed25519'), keys = { test: pair.publicKey }
  await initializeProfile(home, ids)
  const allIds = [...ids, ...supportIds]
  async function supply(version, pluginFields = {}, { sharedFields = {}, extraFiles = [], runtimeTarget = target } = {}) {
    const source = join(root, 'installer-' + version)
    for (const id of [...allIds, 'shared']) {
      const path = join(source, 'modules', id)
      await mkdir(path, { recursive: true })
      await writeFile(join(path, 'package.json'), JSON.stringify({ name: id, version, main: 'index.cjs', ...(id === 'shared' ? sharedFields : { dependencies: { shared: version }, ...(typeof pluginFields === 'function' ? pluginFields(id) : pluginFields) }) }))
      await writeFile(join(path, 'index.cjs'), id === 'shared' ? 'module.exports=' + JSON.stringify(version) : 'module.exports=require("shared")')
    }
    for (const [local, bytes] of extraFiles) {
      const file = join(source, 'modules', local)
      await mkdir(dirname(file), { recursive: true }); await writeFile(file, bytes)
    }
    const receipt = { schema: 1, kind: 'offline-profile', profileArchitecture: 7, applicationVersion: runtimeTarget.desktopVersion, buildId: version, dshCommit: runtimeTarget.dshCommit, dshRange: { min: runtimeTarget.dshVersion, max: runtimeTarget.dshVersion }, desktopRange: { min: runtimeTarget.desktopVersion }, platform: ['win32'], architecture: ['x64'], plugins: allIds.map(id => ({ id, version })), files: await offlineFiles(source), defaultPatch: [] }
    await writeFile(join(source, 'receipt.json'), JSON.stringify(signCatalog(receipt, pair.privateKey, 'test')))
    return source
  }
  let activations = 0
  const createManager = (runtimeTarget = target) => createResourceManager({ home, keys, target: runtimeTarget, runtimeModules, defaultPlugins: ids, bundledPlugins: allIds.map(id => ({ id, managed: true })), yaml: JSON, stopHost: async () => { activations++ }, startHost: async () => {}, callHost: async () => ({ ready: true, entries: [] }) })
  return { root, home, ids, keys, manager: createManager(), createManager, supply, runtimeModules, active: join(home, 'profiles/web'), activations: () => activations }
}

for (const mode of ['active', 'pinned', 'disabled', 'removed']) test(`DSH upgrade handles historical managed support provenance without enabling it as a bundle (${mode})`, async t => {
  const id = '@dsh-external/zotero-harvest', f = await fixture(t, ['plugin-a'], { supportIds: [id] })
  const first = await f.supply('1.0.0'), text = await readFile(join(first, 'receipt.json'), 'utf8')
  await rename(join(first, 'modules'), join(first, 'node_modules'))
  await importHistoricalPlugin({ profile: f.active, source: first, digest: createHash('sha256').update(text).digest('hex'), id, keys: f.keys, target, runtimeModules: f.runtimeModules })
  const file = join(f.active, 'package.json'), manifest = JSON.parse(await readFile(file))
  manifest.dependencies[id] = 'link:./node_modules/' + id
  await writeFile(file, JSON.stringify(manifest))
  const selection = mode === 'pinned' ? { pinned: { [id]: '1.0.0' } } : mode === 'active' ? undefined : { [mode]: [id] }
  if (selection) {
    await mkdir(join(f.home, 'resources/plugins'), { recursive: true })
    await writeFile(join(f.home, 'resources/plugins/selection.json'), JSON.stringify(selection))
  }
  const upgraded = { ...target, desktopVersion: '8.4.0', dshVersion: '0.2.1-rc.2', dshCommit: 'b'.repeat(40) }
  const second = await f.supply('2.0.0', {}, { runtimeTarget: upgraded }), manager = f.createManager(upgraded)
  const result = await manager.repairOffline(second)
  if (mode === 'pinned') {
    assert.equal(result.repaired, false)
    assert.equal(result.blocked[0].id, id)
    assert.match(result.blocked[0].reason, /Pinned package cannot run on the current runtime/u)
    assert.equal(JSON.parse(await readFile(join(f.active, 'node_modules', id, 'package.json'))).version, '1.0.0')
    assert.equal(f.activations(), 0)
    return
  }
  assert.equal(result.repaired, true)
  if (mode === 'disabled' || mode === 'removed') {
    await assert.rejects(lstat(join(f.active, '.zerowall/plugin-imports', encodeURIComponent(id) + '.json')), { code: 'ENOENT' })
    await assert.rejects(lstat(join(f.active, 'node_modules', id)), { code: 'ENOENT' })
    assert.deepEqual(JSON.parse(await readFile(join(f.home, 'resources/plugins/selection.json'))), selection)
    assert.equal((await manager.repairOffline(second)).repaired, false)
    return
  }
  assert.equal(JSON.parse(await readFile(join(f.active, 'node_modules', id, 'package.json'))).version, '2.0.0')
  assert(!(JSON.parse(await readFile(file))).dsh.profile.bundles.includes(id))
  assert.deepEqual(await verifyHistoricalPluginImports({ profile: f.active, keys: f.keys, target: upgraded, runtimeModules: f.runtimeModules }), [])
  assert(await verifyMaterializedProfile({ profile: f.active, keys: f.keys, target: upgraded, expected: [...f.ids, id], full: true }))
  assert.equal((await manager.repairOffline(second)).repaired, false)
})

test('8.4.0 replaces newer-looking managed releases and their old exact-runtime provenance while retaining user plugins', async t => {
  const support = '@dsh-external/zotero-harvest', user = 'dsh-context'
  const f = await fixture(t, ['plugin-a'], { supportIds: [support] })
  const old = await f.supply('0.2.2')
  await f.manager.repairOffline(old)
  const text = await readFile(join(old, 'receipt.json'), 'utf8')
  await rename(join(old, 'modules'), join(old, 'node_modules'))
  await importHistoricalPlugin({ profile: f.active, source: old, digest: createHash('sha256').update(text).digest('hex'), id: support, keys: f.keys, target, runtimeModules: f.runtimeModules })
  const manifestPath = join(f.active, 'package.json'), manifest = JSON.parse(await readFile(manifestPath))
  manifest.dependencies[support] = 'link:./node_modules/' + support
  manifest.dependencies[user] = '^0.70.0'
  manifest.dsh.profile.bundles.push(user)
  await writeFile(manifestPath, JSON.stringify(manifest))
  const userRoot = join(f.active, 'node_modules', user)
  await mkdir(userRoot, { recursive: true })
  const userManifest = JSON.stringify({ name: user, version: '0.70.0', main: 'index.cjs' })
  await writeFile(join(userRoot, 'package.json'), userManifest)
  await writeFile(join(userRoot, 'index.cjs'), 'module.exports="user-installed"')
  const upgraded = { ...target, desktopVersion: '8.4.0', dshVersion: '0.2.1-rc.2', dshCommit: 'b'.repeat(40) }
  const current = await f.supply('0.2.2-zws.1', {}, { runtimeTarget: upgraded }), manager = f.createManager(upgraded)
  assert.equal((await manager.repairOffline(current)).repaired, true)
  const marker = JSON.parse(await readFile(join(f.active, materializationFile)))
  assert.equal(marker.receipt.applicationVersion, '8.4.0')
  assert.deepEqual(marker.preserved, [])
  assert(marker.ids.includes(support))
  assert.equal(JSON.parse(await readFile(join(f.active, 'node_modules', support, 'package.json'))).version, '0.2.2-zws.1')
  assert.deepEqual(await verifyHistoricalPluginImports({ profile: f.active, keys: f.keys, target: upgraded, runtimeModules: f.runtimeModules }), [])
  assert.equal(await readFile(join(f.active, 'node_modules', user, 'package.json'), 'utf8'), userManifest)
  assert.equal(createRequire(manifestPath)(user), 'user-installed')
  const updated = JSON.parse(await readFile(manifestPath))
  assert.equal(updated.dependencies[user], '^0.70.0')
  assert(updated.dsh.profile.bundles.includes(user))
  assert(!(updated.dsh.profile.bundles.includes(support)))
  assert.equal((await manager.repairOffline(current)).repaired, false)
})

test('installer bytes create physical plugin roots and fixed profile dependencies without creating an offline cache', async t => {
  const f = await fixture(t), source = await f.supply('1.0.0')
  assert.equal((await f.manager.repairOffline(source)).repaired, true)
  for (const id of f.ids) {
    const path = join(f.active, 'node_modules', id)
    assert.equal((await lstat(path)).isSymbolicLink(), false)
    assert.equal(await realpath(path), path)
    assert.equal(createRequire(join(f.active, 'package.json'))(id), '1.0.0')
  }
  await assert.rejects(lstat(join(f.home, 'resources/offline')), { code: 'ENOENT' })
  const count = f.activations()
  assert.equal((await f.manager.repairOffline(source)).repaired, false)
  assert.equal(f.activations(), count)
})

test('materialization accepts current DSH prerelease and independent vendor versions with absent optional peers', async t => {
  const f = await fixture(t), optional = '@deepseek-ai/dsh-client-runtime'
  for (const [id, version] of [['@deepseek-ai/dsh-tools', target.dshVersion], ['@deepseek-ai/cordis', '4.0.4']]) {
    const root = join(f.runtimeModules, id)
    await mkdir(root, { recursive: true }); await writeFile(join(root, 'package.json'), JSON.stringify({ name: id, version, main: 'index.cjs' })); await writeFile(join(root, 'index.cjs'), 'module.exports={}')
  }
  const source = await f.supply('1.0.0', { peerDependencies: { '@deepseek-ai/dsh-tools': '>=0.1.5-alpha.1', '@deepseek-ai/cordis': '^4.0.4', [optional]: '>=0.1.0-rc.6 <0.3.0-0' }, peerDependenciesMeta: { [optional]: { optional: true } } })
  assert.equal((await f.manager.repairOffline(source)).repaired, true)
  await assert.rejects(lstat(join(f.active, 'node_modules/plugin-a/node_modules', optional)), { code: 'ENOENT' })
  assert.equal((await f.manager.repairOffline(source)).repaired, false)
})

test('materialization does not skip a present incompatible optional shared peer', async t => {
  const f = await fixture(t), id = '@deepseek-ai/dsh-client-runtime', root = join(f.runtimeModules, id)
  await mkdir(root, { recursive: true }); await writeFile(join(root, 'package.json'), JSON.stringify({ name: id, version: '0.3.0', main: 'index.cjs' })); await writeFile(join(root, 'index.cjs'), 'module.exports={}')
  const source = await f.supply('1.0.0', { peerDependencies: { [id]: '>=0.1.0-rc.6 <0.3.0-0' }, peerDependenciesMeta: { [id]: { optional: true } } })
  await assert.rejects(f.manager.repairOffline(source), /version is incompatible/u)
  assert.equal(f.activations(), 0)
})

test('runtime exports are verified while declaration-only TSX exports are not required in the payload', async t => {
  const f = await fixture(t), source = await f.supply('1.0.0', { exports: { '.': { types: './src/index.ts', default: './index.cjs' }, './client': { types: './src/client/index.tsx', default: './index.cjs' } } })
  assert.equal((await f.manager.repairOffline(source)).repaired, true)
  assert(await verifyMaterializedProfile({ profile: f.active, keys: f.keys, target, expected: f.ids, full: true }))
  await rm(join(f.active, 'node_modules/plugin-a/index.cjs'))
  assert.equal(await verifyMaterializedProfile({ profile: f.active, keys: f.keys, target, expected: f.ids, full: true }), undefined)
})

test('full profile checks hash all bytes of non-entrypoint assets, including beyond the stream buffer', async t => {
  const f = await fixture(t), bytes = Buffer.alloc(192 * 1024 + 17, 37)
  const source = await f.supply('1.0.0', {}, { extraFiles: [['plugin-a/assets/chart.bin', bytes], ['plugin-a/assets/empty.bin', Buffer.alloc(0)]] })
  await f.manager.repairOffline(source)
  assert(await verifyMaterializedProfile({ profile: f.active, keys: f.keys, target, expected: f.ids, full: true }))
  bytes[bytes.length - 1] ^= 1
  await writeFile(join(f.active, 'node_modules/plugin-a/assets/chart.bin'), bytes)
  assert.equal(await verifyMaterializedProfile({ profile: f.active, keys: f.keys, target, expected: f.ids, full: true }), undefined)
})

test('warning plugin policy permits signature and installed digest differences but requires runtime entrypoints', async t => {
  const f = await fixture(t), source = await f.supply('1.0.0', {}, { extraFiles: [['plugin-a/assets/info.txt', 'original asset']] })
  await f.manager.repairOffline(source)
  const relaxed = { ...target, pluginVerification: { signature: 'warn', installedContent: 'warn' } }
  const markerPath = join(f.active, materializationFile)
  const marker = JSON.parse(await readFile(markerPath, 'utf8'))
  marker.receipt.signature.value = 'invalid'
  await writeFile(markerPath, JSON.stringify(marker))
  await writeFile(join(f.active, 'node_modules/plugin-a/index.cjs'), 'module.exports="local change"')
  await rm(join(f.active, 'node_modules/plugin-a/assets/info.txt'))
  const warnings = []
  t.mock.method(console, 'warn', message => warnings.push(message))
  assert(await verifyMaterializedProfile({ profile: f.active, keys: f.keys, target: relaxed, expected: f.ids, full: true }))
  assert(warnings.some(message => message.includes('signature')))
  assert(warnings.some(message => message.includes('SHA-256')))
  assert(warnings.some(message => message.includes('asset is missing')))
  assert.equal(await verifyMaterializedProfile({ profile: f.active, keys: f.keys, target, expected: f.ids, full: true }), undefined)
  await rm(join(f.active, 'node_modules/plugin-a/index.cjs'))
  assert.equal(await verifyMaterializedProfile({ profile: f.active, keys: f.keys, target: relaxed, expected: f.ids, full: true }), undefined)
})

test('named plugin locale exports survive materialization and are required at startup', async t => {
  const f = await fixture(t)
  const source = await f.supply('1.0.0', { exports: { '.': './index.cjs', './locale/en.json': './locale/en.json' } },
    { extraFiles: f.ids.map(id => [id + '/locale/en.json', '{"hello":"Hello"}']) })
  assert.equal((await f.manager.repairOffline(source)).repaired, true)
  assert(await verifyMaterializedProfile({ profile: f.active, keys: f.keys, target, expected: f.ids, full: true }))
  await rm(join(f.active, 'node_modules/plugin-a/locale/en.json'))
  assert.equal(await verifyMaterializedProfile({ profile: f.active, keys: f.keys, target, expected: f.ids, full: true }), undefined)
})

for (const size of [32, 128 * 1024]) test('failed full profile checks drain concurrent ' + (size <= 65536 ? 'small-file' : 'stream') + ' readers before returning to rollback', { timeout: 15000 }, async t => {
  const f = await fixture(t), assets = Array.from({ length: 24 }, (_, index) => ['plugin-a/assets/' + String(index).padStart(2, '0') + '.bin', Buffer.alloc(size, index)])
  const source = await f.supply('1.0.0', {}, { extraFiles: assets })
  await f.manager.repairOffline(source)
  const corrupt = Buffer.from(assets[1][1]); corrupt[corrupt.length - 1] ^= 1
  await writeFile(join(f.active, 'node_modules/plugin-a/assets/01.bin'), corrupt)
  const createReadStream = physicalFs.createReadStream.bind(physicalFs), seen = new Set()
  const physicalReadFile = physicalFs.promises.readFile.bind(physicalFs.promises)
  let active = 0, peak = 0, returned = false, release, entered
  const gate = new Promise(resolve => { release = resolve }), started = new Promise(resolve => { entered = resolve })
  t.mock.method(physicalFs.promises, 'readFile', async (path, ...args) => {
    if (!String(path).replaceAll('\\', '/').includes('/plugin-a/assets/')) return physicalReadFile(path, ...args)
    active++; peak = Math.max(peak, active); seen.add(String(path))
    try {
      if (String(path).endsWith('00.bin')) { entered(); await gate }
      return await physicalReadFile(path, ...args)
    } finally { active-- }
  })
  t.mock.method(physicalFs, 'createReadStream', (path, options) => {
    const stream = createReadStream(path, options)
    if (!String(path).replaceAll('\\', '/').includes('/plugin-a/assets/')) return stream
    const iterator = stream[Symbol.asyncIterator].bind(stream)
    stream[Symbol.asyncIterator] = async function * () {
      active++; peak = Math.max(peak, active); seen.add(String(path))
      try {
        if (String(path).endsWith('00.bin')) { entered(); await gate }
        yield * iterator()
      } finally { active-- }
    }
    return stream
  })
  const verification = verifyMaterializedProfile({ profile: f.active, keys: f.keys, target, expected: f.ids, full: true }).then(result => { returned = true; return result })
  try {
    await started
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(returned, false)
    assert(active > 0)
  } finally { release() }
  assert.equal(await verification, undefined)
  assert.equal(active, 0)
  assert(peak > 1 && peak <= 4, 'full checks must use bounded concurrent readers')
  assert.equal(seen.size, assets.length, 'remaining signed assets are still verified after a reader fails')
})

test('full verification shares installed entry reads only within that invocation and detects same-size later mutations', async t => {
  const f = await fixture(t), source = await f.supply('1.0.0')
  await f.manager.repairOffline(source)
  const entry = join(f.active, 'node_modules/plugin-a/index.cjs')
  const bytes = await readFile(entry)
  const physicalReadFile = physicalFs.promises.readFile.bind(physicalFs.promises)
  let reads = 0
  t.mock.method(physicalFs.promises, 'readFile', async (path, ...args) => {
    if (resolve(String(path)) === resolve(entry)) reads++
    return physicalReadFile(path, ...args)
  })
  assert(await verifyMaterializedProfile({ profile: f.active, keys: f.keys, target, expected: f.ids, full: true }))
  assert.equal(reads, 1, 'graph, required entry and complete sweep share one installed-byte check')
  bytes[bytes.length - 1] ^= 1; await writeFile(entry, bytes)
  assert.equal(await verifyMaterializedProfile({ profile: f.active, keys: f.keys, target, expected: f.ids, full: true }), undefined)
  assert.equal(reads, 2, 'a subsequent verification reads the modified installed file again')
})

test('full verification rejects a linked asset directory even when external bytes match the signature', async t => {
  const f = await fixture(t), source = await f.supply('1.0.0', {}, { extraFiles: [['plugin-a/assets/figure.bin', 'signed original figure']] })
  await f.manager.repairOffline(source)
  const external = join(f.root, 'external-assets'), assets = join(f.active, 'node_modules/plugin-a/assets')
  await mkdir(external); await writeFile(join(external, 'figure.bin'), 'signed original figure')
  await rm(assets, { recursive: true }); await symlink(external, assets, process.platform === 'win32' ? 'junction' : 'dir')
  assert.equal(await verifyMaterializedProfile({ profile: f.active, keys: f.keys, target, expected: f.ids, full: true }), undefined)
})

test('missing managed dependency namespace is repaired from current installer without traversing obsolete links', async t => {
  const f = await fixture(t), source = await f.supply('1.0.0')
  await f.manager.repairOffline(source)
  await rm(join(f.active, 'node_modules/.zerowall-dependencies'), { recursive: true })
  assert.equal((await f.manager.repairOffline(source)).repaired, true)
  assert.equal(JSON.parse(await readFile(join(f.active, 'node_modules/plugin-a/node_modules/shared/package.json'))).version, '1.0.0')
  await rm(join(f.active, materializationFile))
  assert.equal((await f.manager.repairOffline(source)).repaired, true)
})

test('ordinary checks detect missing dependency entries and nested/transitive package directories before reusing the profile', async t => {
  const f = await fixture(t), source = await f.supply('1.0.0', { dependencies: { shared: '1.0.0', nested: '1.0.0' } }, {
    sharedFields: { dependencies: { transitive: '1.0.0' } },
    extraFiles: [
      ['transitive/package.json', '{"name":"transitive","version":"1.0.0","main":"dist/index.cjs"}'],
      ['transitive/dist/index.cjs', 'module.exports="transitive"'],
      ...f.ids.flatMap(id => [
        [id + '/node_modules/nested/package.json', '{"name":"nested","version":"1.0.0","main":"dist/index.cjs","dependencies":{"transitive":"1.0.0"}}'],
        [id + '/node_modules/nested/dist/index.cjs', 'module.exports=require("transitive")'],
      ]),
    ],
  })
  await f.manager.repairOffline(source)
  for (const local of [
    'node_modules/.zerowall-dependencies/node_modules/shared/index.cjs',
    'node_modules/plugin-a/node_modules/nested',
    'node_modules/.zerowall-dependencies/node_modules/transitive',
    'node_modules/plugin-a/node_modules/nested/dist',
  ]) {
    await rm(join(f.active, local), { recursive: true })
    assert.equal(await verifyMaterializedProfile({ profile: f.active, keys: f.keys, target, expected: f.ids }), undefined, local)
    assert.equal((await f.manager.repairOffline(source)).repaired, true, local)
    assert(await verifyMaterializedProfile({ profile: f.active, keys: f.keys, target, expected: f.ids }))
  }
})

test('the installer repairs missing entries and internal dependencies of an installed exact pin without changing the selection', async t => {
  const f = await fixture(t), source = await f.supply('1.0.0')
  await f.manager.repairOffline(source)
  const selection = { pinned: { 'plugin-a': '1.0.0' }, sentinel: 'keep pin and metadata' }, selectionFile = join(f.home, 'resources/plugins/selection.json')
  await mkdir(dirname(selectionFile), { recursive: true }); await writeFile(selectionFile, JSON.stringify(selection))
  for (const local of ['index.cjs', 'node_modules/shared']) {
    await rm(join(f.active, 'node_modules/plugin-a', local), { recursive: true })
    assert.equal((await f.manager.repairOffline(source)).repaired, true)
    assert.equal(createRequire(join(f.active, 'package.json'))('plugin-a'), '1.0.0')
    assert.deepEqual(JSON.parse(await readFile(selectionFile)), selection)
    assert.equal((await lstat(join(f.active, 'node_modules/plugin-a'))).isSymbolicLink(), false)
  }
  assert.equal((await f.manager.repairOffline(source)).repaired, false)
})

test('editing local selected ids cannot bypass signed required entrypoint verification', async t => {
  const f = await fixture(t), source = await f.supply('1.0.0')
  await f.manager.repairOffline(source)
  const path = join(f.active, materializationFile), marker = JSON.parse(await readFile(path))
  marker.ids = []
  await writeFile(path, JSON.stringify(marker))
  await writeFile(join(f.active, 'node_modules/plugin-a/index.cjs'), 'unsigned code')
  assert.equal(await verifyMaterializedProfile({ profile: f.active, keys: f.keys, target, expected: f.ids }), undefined)
  assert.equal((await f.manager.repairOffline(source)).repaired, true)
  assert.equal(await readFile(join(f.active, 'node_modules/plugin-a/index.cjs'), 'utf8'), 'module.exports=require("shared")')
})

test('architecture 6 repair restores a missing manifest before resolving retained inactive package junctions', async t => {
  const f = await fixture(t, ['plugin-a', 'plugin-b', 'plugin-c', 'plugin-d'])
  const source = await f.supply('1.0.0', id => ['plugin-b', 'plugin-c'].includes(id) ? { dependencies: { 'plugin-a': '1.0.0' } } : {})
  await f.manager.repairOffline(source)
  const manifestFile = join(f.active, 'package.json'), manifest = JSON.parse(await readFile(manifestFile))
  manifest.zerowall.pluginArchitecture = 6; delete manifest.zerowall.offlineBuildId
  manifest.dsh.profile.bundles.push('third-party')
  await writeFile(manifestFile, JSON.stringify(manifest))
  const thirdParty = join(f.active, 'node_modules/third-party')
  await mkdir(thirdParty); await writeFile(join(thirdParty, 'package.json'), '{"name":"third-party","version":"9.0.0"}')
  await writeFile(join(thirdParty, 'index.cjs'), 'user plugin bytes')
  const selection = { disabled: ['plugin-b'], removed: ['plugin-c'], pinned: { 'plugin-d': '1.0.0' } }
  const selectionFile = join(f.home, 'resources/plugins/selection.json')
  await mkdir(dirname(selectionFile), { recursive: true }); await writeFile(selectionFile, JSON.stringify(selection))
  const patchBefore = await readFile(join(f.active, 'cordis.patch.yml'))
  const packageFile = join(f.active, 'node_modules/plugin-a/package.json'), packageBefore = await readFile(packageFile)
  await rm(packageFile)
  assert.equal((await f.manager.repairOffline(source)).repaired, true)
  assert.deepEqual(await readFile(packageFile), packageBefore)
  assert.deepEqual(await readFile(join(f.active, 'cordis.patch.yml')), patchBefore)
  assert.equal(await realpath(join(f.active, 'node_modules/plugin-b/node_modules/plugin-a')), join(f.active, 'node_modules/plugin-a'))
  assert.equal(await realpath(join(f.active, 'node_modules/plugin-c/node_modules/plugin-a')), join(f.active, 'node_modules/plugin-a'))
  assert.equal(await readFile(join(thirdParty, 'index.cjs'), 'utf8'), 'user plugin bytes')
  assert.equal(JSON.parse(await readFile(join(f.active, 'node_modules/plugin-d/package.json'))).version, '1.0.0')
  assert.deepEqual(JSON.parse(await readFile(selectionFile)), selection)
  const repaired = JSON.parse(await readFile(manifestFile))
  assert.equal(repaired.zerowall.pluginArchitecture, 7)
  assert(repaired.dsh.profile.bundles.includes('third-party'))
  assert(!repaired.dsh.profile.bundles.includes('plugin-b')); assert(!repaired.dsh.profile.bundles.includes('plugin-c'))
  assert(await verifyMaterializedProfile({ profile: f.active, keys: f.keys, target, expected: ['plugin-a', 'plugin-d'], full: true }))
  assert.equal((await f.manager.repairOffline(source)).repaired, false)
})

test('same-version pinned provenance retains its exact namespace and still verifies every signed byte', async t => {
  const f = await fixture(t), source = await f.supply('1.0.0')
  await f.manager.repairOffline(source)
  const selectionFile = join(f.home, 'resources/plugins/selection.json'), selection = { pinned: { 'plugin-b': '1.0.0' } }
  await mkdir(dirname(selectionFile), { recursive: true }); await writeFile(selectionFile, JSON.stringify(selection))
  const manifestFile = join(f.active, 'package.json'), manifest = JSON.parse(await readFile(manifestFile))
  manifest.zerowall.pluginArchitecture = 6; await writeFile(manifestFile, JSON.stringify(manifest))
  assert.equal((await f.manager.repairOffline(source)).repaired, true)
  const markerFile = join(f.active, materializationFile), marker = JSON.parse(await readFile(markerFile))
  assert.deepEqual(marker.ids, ['plugin-a'])
  assert.deepEqual(marker.preserved[0].ids, ['plugin-b'])
  const pinnedDependency = await realpath(join(f.active, 'node_modules/plugin-b/node_modules/shared'))
  assert(pinnedDependency.startsWith(join(f.active, '.zerowall/dependency-history')))
  const verify = () => verifyMaterializedProfile({ profile: f.active, keys: f.keys, target, expected: f.ids, full: true })
  assert(await verify())
  const unsigned = structuredClone(marker); unsigned.preserved[0].receipt.buildId = 'untrusted'
  await writeFile(markerFile, JSON.stringify(unsigned)); assert.equal(await verify(), undefined)
  const unknown = structuredClone(marker); unknown.preserved[0].ids.push('unknown-package')
  await writeFile(markerFile, JSON.stringify(unknown)); assert.equal(await verify(), undefined)
  const conflicting = structuredClone(marker); conflicting.preserved[0].ids.push('plugin-a')
  await writeFile(markerFile, JSON.stringify(conflicting)); assert.equal(await verify(), undefined)
  await writeFile(markerFile, JSON.stringify(marker))
  await writeFile(join(pinnedDependency, 'index.cjs'), 'unsigned dependency bytes')
  assert.equal(await verify(), undefined)
  assert.deepEqual(JSON.parse(await readFile(selectionFile)), selection)
})

for (const planned of [false, true]) test(`offline repair rejects an ${planned ? 'unfilled planned' : 'unknown'} missing internal link without activating`, async t => {
  const f = await fixture(t), source = await f.supply('1.0.0')
  await f.manager.repairOffline(source)
  const selectionFile = join(f.home, 'resources/plugins/selection.json')
  await mkdir(dirname(selectionFile), { recursive: true }); await writeFile(selectionFile, JSON.stringify({ disabled: ['plugin-b'] }))
  const local = planned ? 'plugin-a/user-only' : 'unknown-package'
  const linkTarget = join(f.active, 'node_modules', local), candidateTarget = join(f.home, 'profiles/zerowall/node_modules', local)
  if (planned) await mkdir(linkTarget)
  await symlink(linkTarget, join(f.active, 'node_modules/plugin-b/node_modules/user-link'), process.platform === 'win32' ? 'junction' : 'dir')
  const manifestFile = join(f.active, 'package.json'), manifest = JSON.parse(await readFile(manifestFile))
  manifest.zerowall.pluginArchitecture = 6; await writeFile(manifestFile, JSON.stringify(manifest))
  const activations = f.activations(), manifestBefore = await readFile(join(f.active, 'package.json'))
  await assert.rejects(f.manager.repairOffline(source), { code: 'ENOENT', path: candidateTarget })
  assert.equal(f.activations(), activations)
  assert.deepEqual(await readFile(join(f.active, 'package.json')), manifestBefore)
})

test('retained exact pin keeps its original dependency bytes when installer updates other plugins', async t => {
  const f = await fixture(t), first = await f.supply('1.0.0')
  await f.manager.repairOffline(first)
  await mkdir(join(f.home, 'resources/plugins'), { recursive: true })
  await writeFile(join(f.home, 'resources/plugins/selection.json'), JSON.stringify({ pinned: { 'plugin-b': '1.0.0' } }))
  const second = await f.supply('2.0.0')
  assert.equal((await f.manager.repairOffline(second)).repaired, true)
  assert.equal(JSON.parse(await readFile(join(f.active, 'node_modules/plugin-a/node_modules/shared/package.json'))).version, '2.0.0')
  assert.equal(JSON.parse(await readFile(join(f.active, 'node_modules/plugin-b/node_modules/shared/package.json'))).version, '1.0.0')
  await rm(first, { recursive: true })
  assert.equal((await f.manager.repairOffline(second)).repaired, false)
  assert.equal(JSON.parse(await readFile(join(f.active, 'node_modules/plugin-b/package.json'))).version, '1.0.0')
  assert(await verifyMaterializedProfile({ profile: f.active, keys: f.keys, target, expected: f.ids, full: true }))
  await writeFile(join(f.active, 'node_modules/plugin-b/node_modules/shared/index.cjs'), 'corrupt preserved dependency')
  assert.equal(await verifyMaterializedProfile({ profile: f.active, keys: f.keys, target, expected: f.ids, full: true }), undefined)
})

test('explicit bundled pnpm install keeps physical roots and exact dependencies after candidate activation', async t => {
  const f = await fixture(t), source = await f.supply('1.0.0')
  await f.manager.repairOffline(source)
  const manifestPath = join(f.active, 'package.json'), manifest = JSON.parse(await readFile(manifestPath))
  await preparePhysicalRootsForPnpm({ profile: f.active, ids: f.ids, manifest })
  await writeFile(manifestPath, JSON.stringify(manifest))
  await writeFile(join(f.active, 'pnpm-workspace.yaml'), JSON.stringify({ overrides: { ...manifest.dependencies }, autoInstallPeers: false }))
  const pnpm = resolve('deepseek-harness/apps/desktop/node_modules/pnpm/bin/pnpm.cjs'), executor = resolve('tools/commands/pnpm-executor.mjs')
  await promisify(execFile)(process.execPath, [executor, pnpm, 'install', '--offline', '--ignore-scripts', '--config.node-linker=isolated', '--config.auto-install-peers=false'], { cwd: f.active, env: { ...process.env, DSH_HOME: f.home }, windowsHide: true })
  await physicalizeProfilePlugins({ profile: f.active, ids: f.ids })
  for (const id of f.ids) assert.equal((await lstat(join(f.active, 'node_modules', id))).isSymbolicLink(), false)
  const moved = join(f.home, 'profiles/activated-fixture')
  await rename(f.active, moved)
  await repairProfileLayout(moved, { from: f.active, home: f.home })
  assert.equal(JSON.parse(await readFile(join(moved, 'node_modules/plugin-a/node_modules/shared/package.json'))).version, '1.0.0')
  assert.equal(createRequire(join(moved, 'package.json'))('plugin-b'), '1.0.0')
})
