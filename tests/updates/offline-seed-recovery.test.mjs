import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { offlineFiles } from '../../tools/commands/offline-profile.mjs'
import { initializeProfile } from '../../tools/commands/profile.mjs'
import { createResourceManager } from '../../tools/commands/resource-manager.mjs'
import { signCatalog } from '../../tools/release/resource-catalog.mjs'

const id = 'dsh-ppt-maker'
const target = { desktopVersion: '8.3.6', dshVersion: '0.2.0-rc.2', dshCommit: 'c'.repeat(40), platform: 'win32', architecture: 'x64' }

async function fixture(t, { version = '1.0.1-zws.1', pin, failStart = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'zws-seed-recovery-'))
  t.after(async () => { assert(resolve(root).startsWith(resolve(tmpdir()) + sep)); await rm(root, { recursive: true, force: true }) })
  const home = join(root, '用户 配置'), source = join(root, 'installer/offline-profile')
  const active = join(home, 'profiles/web'), plugin = join(active, 'node_modules', id)
  await initializeProfile(home, [id])
  const files = [['package.json', JSON.stringify({ name: id, version, type: 'module', main: 'index.js' })], ['index.js', 'export const ready = true\n']]
  for (const [file, text] of files) { const path = join(source, 'modules', id, file); await mkdir(dirname(path), { recursive: true }); await writeFile(path, text) }
  const pair = generateKeyPairSync('ed25519'), keys = { test: pair.publicKey }
  const receipt = { schema: 1, kind: 'offline-profile', profileArchitecture: 7, applicationVersion: target.desktopVersion, buildId: 'current-installer', dshCommit: target.dshCommit,
    dshRange: { min: target.dshVersion, max: target.dshVersion }, desktopRange: { min: target.desktopVersion, max: target.desktopVersion }, platform: ['win32'], architecture: ['x64'],
    plugins: [{ id, version }], files: (await offlineFiles(source)).sort((a, b) => a.path.localeCompare(b.path)), defaultPatch: [] }
  await writeFile(join(source, 'receipt.json'), JSON.stringify(signCatalog(receipt, pair.privateKey, 'test')))
  const missingGeneration = join(home, 'resources/offline', 'a'.repeat(64))
  const oldPlugin = join(missingGeneration, 'profile-runtime.asar/node_modules', id)
  await mkdir(dirname(plugin), { recursive: true })
  await symlink(oldPlugin, plugin, process.platform === 'win32' ? 'junction' : 'dir')
  const manifestFile = join(active, 'package.json'), manifest = JSON.parse(await readFile(manifestFile))
  manifest.dependencies = { ...manifest.dependencies, [id]: 'link:' + oldPlugin.replaceAll('\\', '/') }
  manifest.zerowall.offlineGeneration = 'a'.repeat(64)
  await writeFile(manifestFile, JSON.stringify(manifest))
  if (pin) { await mkdir(join(home, 'resources/plugins'), { recursive: true }); await writeFile(join(home, 'resources/plugins/selection.json'), JSON.stringify({ pinned: { [id]: pin } })) }
  const calls = { stop: 0, start: 0, host: 0 }
  const manager = createResourceManager({ home, keys, target, defaultPlugins: [id], bundledPlugins: receipt.plugins, yaml: JSON,
    stopHost: async () => { calls.stop++ }, startHost: async () => { calls.start++; if (failStart) throw new Error('candidate unhealthy') }, callHost: async () => { calls.host++; return { ready: true, entries: [] } } })
  return { home, source, active, plugin, manifestFile, missingGeneration, manager, calls, version }
}

test('failed repair restores the already broken original and preserves the primary Host error', async t => {
  const f = await fixture(t, { failStart: true }), before = await readFile(f.manifestFile)
  await assert.rejects(f.manager.repairOffline(f.source), /candidate unhealthy/u)
  assert.deepEqual(await readFile(f.manifestFile), before)
  assert((await lstat(f.plugin)).isSymbolicLink())
  const journal = JSON.parse(await readFile(join(f.home, 'resources/transaction.json')))
  assert.equal(journal.state, 'rolled-back')
  assert.equal(journal.error, 'candidate unhealthy')
  assert(journal.recoveryErrors.some(row => row.phase === 'original-host'))
})

for (const version of ['1.0.0', '1.0.1-zws.1']) test(`signed installer ${version} replaces a default broken old offline link without the old receipt`, async t => {
  const f = await fixture(t, { version })
  await assert.rejects(lstat(f.missingGeneration), { code: 'ENOENT' })
  assert((await lstat(f.plugin)).isSymbolicLink())
  const result = await f.manager.repairOffline(f.source)
  assert.equal(result.repaired, true)
  assert.equal((await lstat(f.plugin)).isSymbolicLink(), false)
  assert.equal(await realpath(f.plugin), resolve(f.plugin))
  assert.equal(JSON.parse(await readFile(join(f.plugin, 'package.json'))).version, version)
  const manifest = JSON.parse(await readFile(f.manifestFile))
  assert.equal(manifest.zerowall.profileLayout, 3)
  assert.equal(manifest.dependencies[id], 'link:./node_modules/' + id)
  await assert.rejects(lstat(f.missingGeneration), { code: 'ENOENT' })
  // The installer supplies bytes directly. Fresh recovery and normal repeat
  // launch must not create or depend on a home offline generation cache.
  await assert.rejects(lstat(join(f.home, 'resources/offline')), { code: 'ENOENT' })
  const calls = { ...f.calls }
  assert.equal((await f.manager.repairOffline(f.source)).repaired, false)
  assert.deepEqual(f.calls, calls)
  await assert.rejects(lstat(join(f.home, 'resources/offline')), { code: 'ENOENT' })
})

test('a missing pinned package blocks instead of accepting a different installer version', async t => {
  const f = await fixture(t, { pin: '1.0.0' }), before = await readFile(f.manifestFile)
  const result = await f.manager.repairOffline(f.source)
  assert.equal(result.repaired, false)
  assert.deepEqual(result.blocked.map(row => [row.id, row.version]), [[id, '1.0.0']])
  assert.deepEqual(await readFile(f.manifestFile), before)
  assert((await lstat(f.plugin)).isSymbolicLink())
  assert.deepEqual(f.calls, { stop: 0, start: 0, host: 0 })
})

test('a missing pinned package recovers when the current installer carries the exact pin', async t => {
  const f = await fixture(t, { pin: '1.0.1-zws.1' })
  assert.equal((await f.manager.repairOffline(f.source)).repaired, true)
  assert.equal(JSON.parse(await readFile(join(f.plugin, 'package.json'))).version, f.version)
  assert.equal((await lstat(f.plugin)).isSymbolicLink(), false)
  assert.equal((await f.manager.repairOffline(f.source)).repaired, false)
})

for (const pinned of [false, true]) test(`a retained ${pinned ? 'pinned' : 'higher'} package with missing historical dependency supply cannot be downgraded`, async t => {
  const version = '1.1.0', f = await fixture(t, { ...(pinned ? { pin: version } : {}) })
  await rm(f.plugin)
  await mkdir(join(f.plugin, 'node_modules'), { recursive: true })
  await writeFile(join(f.plugin, 'package.json'), JSON.stringify({ name: id, version, main: 'index.js', dependencies: { 'old-shared': '1.0.0' } }))
  await writeFile(join(f.plugin, 'index.js'), 'module.exports = require("old-shared")\n')
  await symlink(join(f.missingGeneration, 'node_modules/old-shared'), join(f.plugin, 'node_modules/old-shared'), process.platform === 'win32' ? 'junction' : 'dir')
  const manifest = JSON.parse(await readFile(f.manifestFile))
  manifest.dependencies[id] = version
  await writeFile(f.manifestFile, JSON.stringify(manifest))
  const before = await readFile(f.manifestFile)
  await assert.rejects(f.manager.repairOffline(f.source), /Nested offline dependency requires a verified plugin import/u)
  assert.deepEqual(await readFile(f.manifestFile), before)
  assert.equal(JSON.parse(await readFile(join(f.plugin, 'package.json'))).version, version)
  assert.deepEqual(f.calls, { stop: 0, start: 0, host: 0 })
})

for (const state of ['disabled', 'removed']) for (const nested of [false, true]) test(`${state} managed broken ${nested ? 'nested' : 'root'} supply links are archived without importing old supply or altering the selection`, async t => {
  const f = await fixture(t), selection = { [state]: [id], pinned: { [id]: '1.0.0' }, sentinel: 'preserved' }
  if (nested) {
    await rm(f.plugin)
    await mkdir(join(f.plugin, 'node_modules'), { recursive: true })
    await writeFile(join(f.plugin, 'package.json'), JSON.stringify({ name: id, version: '1.0.0' }))
    await symlink(join(f.missingGeneration, 'node_modules/old-shared'), join(f.plugin, 'node_modules/old-shared'), process.platform === 'win32' ? 'junction' : 'dir')
  }
  const provenanceFile = join(f.active, '.zerowall/plugin-imports', encodeURIComponent(id) + '.json')
  await mkdir(dirname(provenanceFile), { recursive: true }); await writeFile(provenanceFile, '{"original":"provenance evidence"}')
  const selectionFile = join(f.home, 'resources/plugins/selection.json')
  await mkdir(dirname(selectionFile), { recursive: true }); await writeFile(selectionFile, JSON.stringify(selection))
  assert.equal((await f.manager.repairOffline(f.source)).repaired, true)
  assert.deepEqual(JSON.parse(await readFile(selectionFile)), selection)
  const manifest = JSON.parse(await readFile(f.manifestFile))
  assert(!manifest.dsh.profile.bundles.includes(id))
  assert(!Object.hasOwn(manifest.dependencies, id))
  await assert.rejects(lstat(f.plugin), { code: 'ENOENT' })
  // Inactive managed roots are discarded in place; the fast DSH-style repair
  // no longer creates a rollback snapshot or copies the old supply closure.
  const history = join(f.active, '.zerowall/inactive-plugin-history')
  assert.deepEqual(await readdir(history).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error)), [])
  await assert.rejects(lstat(join(f.home, 'resources/offline')), { code: 'ENOENT' })
  assert.equal((await f.manager.repairOffline(f.source)).repaired, false)
})

test('inactive third-party physical packages remain untouched by managed leftover archival', async t => {
  const f = await fixture(t), thirdParty = 'custom-third-party', root = join(f.active, 'node_modules', thirdParty)
  await mkdir(root, { recursive: true }); await writeFile(join(root, 'package.json'), JSON.stringify({ name: thirdParty, version: '9.0.0' })); await writeFile(join(root, 'keep.txt'), 'third-party owned')
  const selectionFile = join(f.home, 'resources/plugins/selection.json')
  await mkdir(dirname(selectionFile), { recursive: true }); await writeFile(selectionFile, JSON.stringify({ disabled: [thirdParty] }))
  assert.equal((await f.manager.repairOffline(f.source)).repaired, true)
  assert.equal(await readFile(join(root, 'keep.txt'), 'utf8'), 'third-party owned')
})
