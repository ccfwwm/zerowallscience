import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { offlineFiles, prepareOfflineCandidate, verifyOfflineProfile } from '../../tools/commands/offline-profile.mjs'
import { createResourceManager } from '../../tools/commands/resource-manager.mjs'
import { initializeProfile } from '../../tools/commands/profile.mjs'
import { signCatalog } from '../../tools/release/resource-catalog.mjs'

const target = { desktopVersion: '8.0.8', dshVersion: '0.2.0-rc.2', dshCommit: '86b6740d0e671cee0b3fd0168de484c0efbf46ea', platform: 'win32', architecture: 'x64' }
const defaults = ['base', 'mcp', 'skills', 'python'].map(id => '@zerowallscience/plugin-' + id)
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'zws-offline-'))
  t.after(async () => { assert(resolve(root).startsWith(resolve(tmpdir()) + sep)); await rm(root, { recursive: true, force: true }) })
  const home = join(root, '用户 配置'), source = join(root, 'resources/offline-profile')
  await initializeProfile(home, defaults)
  const pair = generateKeyPairSync('ed25519'), keys = { test: pair.publicKey }
  for (const id of defaults) {
    const directory = join(source, 'modules', id)
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, 'package.json'), JSON.stringify({ name: id, version: '0.2.0', main: 'index.js' }))
    await writeFile(join(directory, 'index.js'), 'export const ready = true\n')
  }
  const unsigned = { schema: 1, kind: 'offline-profile', profileArchitecture: 7, applicationVersion: target.desktopVersion, buildId: 'test-build', dshCommit: target.dshCommit, dshRange: { min: target.dshVersion, max: target.dshVersion }, desktopRange: { min: target.desktopVersion, max: target.desktopVersion }, platform: ['win32'], architecture: ['x64'], plugins: defaults.map(id => ({ id, version: '0.2.0' })), files: (await offlineFiles(source)).sort((a,b) => a.path.localeCompare(b.path)), defaultPatch: [] }
  await writeFile(join(source, 'receipt.json'), JSON.stringify(signCatalog(unsigned, pair.privateKey, 'test')))
  const manager = createResourceManager({ home, keys, target, defaultPlugins: defaults, bundledPlugins: unsigned.plugins, yaml: JSON, stopHost: async () => {}, startHost: async () => {}, callHost: async () => ({ ready: true, entries: [] }) })
  return { root, home, source, keys, target, defaults, bundledPlugins: unsigned.plugins, yaml: JSON, manager, unsigned, pair }
}
test('damaged architecture 6 is repaired offline and repeated repair preserves explicit choices', async t => {
  const f = await fixture(t), active = join(f.home, 'profiles/web')
  await writeFile(join(active, 'custom-config.json'), '{"model":"selected-model","reasoningEffort":"xhigh"}')
  await mkdir(join(active, 'node_modules/third-party'), { recursive: true })
  await writeFile(join(active, 'node_modules/third-party/package.json'), '{"name":"third-party","version":"1.2.3"}')
  const selection = { disabled: [defaults[2]], removed: [defaults[3]], pinned: {}, custom: { keep: true } }
  await mkdir(join(f.home, 'resources/plugins'), { recursive: true })
  await writeFile(join(f.home, 'resources/plugins/selection.json'), JSON.stringify(selection))
  const result = await f.manager.repairOffline(f.source)
  assert.equal(result.architecture, 7)
  const manifest = JSON.parse(await readFile(join(active, 'package.json')))
  assert.equal(manifest.zerowall.pluginArchitecture, 7)
  assert(manifest.dsh.profile.bundles.includes(defaults[1]))
  assert(!manifest.dsh.profile.bundles.includes(defaults[2]))
  assert(!manifest.dsh.profile.bundles.includes(defaults[3]))
  assert.equal(JSON.parse(await readFile(join(active, 'node_modules', defaults[1], 'package.json'))).version, '0.2.0')
  assert.equal(await readFile(join(active, 'custom-config.json'), 'utf8'), '{"model":"selected-model","reasoningEffort":"xhigh"}')
  assert.equal(JSON.parse(await readFile(join(active, 'node_modules/third-party/package.json'))).version, '1.2.3')
  assert.deepEqual(JSON.parse(await readFile(join(f.home, 'resources/plugins/selection.json'))), selection)
  assert.equal((await f.manager.repairOffline(f.source)).repaired, false)
  // Replacing the installer payload cannot mutate the already-owned cache.
  await rename(f.source, f.source + '.retained')
  assert.equal(JSON.parse(await readFile(join(active, 'node_modules', defaults[1], 'package.json'))).version, '0.2.0')
})
test('an unavailable pinned version is reported without replacing the active profile', async t => {
  const f = await fixture(t), file = join(f.home, 'profiles/web/package.json')
  await mkdir(join(f.home, 'resources/plugins'), { recursive: true })
  await writeFile(join(f.home, 'resources/plugins/selection.json'), JSON.stringify({ pinned: { [defaults[1]]: '0.1.9' } }))
  const before = await readFile(file)
  const result = await f.manager.repairOffline(f.source)
  assert.equal(result.repaired, false)
  assert.equal(result.blocked[0].version, '0.1.9')
  assert.deepEqual(await readFile(file), before)
})
test('8.0.6 architecture 5 migration retains account, model, MCP and exact pinned packages', async t => {
  const f = await fixture(t), active = join(f.home, 'profiles/web')
  const manifest = JSON.parse(await readFile(join(active, 'package.json')))
  manifest.zerowall.pluginArchitecture = 5
  manifest.dsh.profile.bundles.push('third-party')
  manifest.dependencies = { 'third-party': '1.2.3', [defaults[1]]: '0.1.9' }
  await writeFile(join(active, 'package.json'), JSON.stringify(manifest))
  for (const [id, version] of [[defaults[1], '0.1.9'], ['third-party', '1.2.3']]) {
    await mkdir(join(active, 'node_modules', id), { recursive: true })
    await writeFile(join(active, 'node_modules', id, 'package.json'), JSON.stringify({ name: id, version }))
  }
  const patch = [{ id: 'zerowall-mcp', config: { servers: [{ serverName: 'custom-mcp', enabled: false, tokenRef: 'vault:existing-reference' }] } }]
  await writeFile(join(active, 'cordis.patch.yml'), JSON.stringify(patch))
  const settings = '{"accountId":"existing-account","model":"selected-model","reasoningEffort":"xhigh","imageModel":"gpt-image-2","projects":["existing-project"],"environmentReferences":["SCI_KEY"]}'
  await writeFile(join(f.home, 'settings.yaml'), settings)
  await mkdir(join(f.home, 'resources/plugins'), { recursive: true })
  const selection = { pinned: { [defaults[1]]: '0.1.9' }, disabled: [defaults[2]], removed: [defaults[3]] }
  await writeFile(join(f.home, 'resources/plugins/selection.json'), JSON.stringify(selection))
  await initializeProfile(f.home, defaults, f.bundledPlugins)
  await f.manager.repairOffline(f.source)
  const migrated = JSON.parse(await readFile(join(active, 'package.json')))
  assert.equal(migrated.zerowall.pluginArchitecture, 7)
  assert(migrated.dsh.profile.bundles.includes('third-party'))
  assert.equal(JSON.parse(await readFile(join(active, 'node_modules', defaults[1], 'package.json'))).version, '0.1.9')
  assert.deepEqual(JSON.parse(await readFile(join(active, 'cordis.patch.yml'))), patch)
  assert.equal(await readFile(join(f.home, 'settings.yaml'), 'utf8'), settings)
  assert.deepEqual(JSON.parse(await readFile(join(f.home, 'resources/plugins/selection.json'))), selection)
  assert.equal((await f.manager.repairOffline(f.source)).repaired, false)
})
test('signature, changed bytes, target mismatch and unexpected files prevent offline activation', async t => {
  const f = await fixture(t)
  await verifyOfflineProfile(f.source, f.keys, target)
  await assert.rejects(verifyOfflineProfile(f.source, f.keys, { ...target, dshCommit: '0'.repeat(40) }), /match/)
  await writeFile(join(f.source, 'extra.js'), 'unexpected')
  await assert.rejects(verifyOfflineProfile(f.source, f.keys, target), /mismatch/)
  await rm(join(f.source, 'extra.js'))
  await writeFile(join(f.source, 'modules', defaults[1], 'index.js'), 'different bytes')
  await assert.rejects(prepareOfflineCandidate(f), /mismatch/)
  await writeFile(join(f.source, 'receipt.json'), JSON.stringify({ ...signCatalog(f.unsigned, f.pair.privateKey, 'test'), buildId: 'tampered' }))
  await assert.rejects(f.manager.repairOffline(f.source), /signature/)
})
test('offline desktop repair retains a newer independently installed plugin generation', async t => {
  const f = await fixture(t), directory = join(f.home, 'profiles/web/node_modules', defaults[1])
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'package.json'), JSON.stringify({ name: defaults[1], version: '0.3.0' }))
  await writeFile(join(directory, 'user-generation.json'), '{"preserve":true}')
  await f.manager.repairOffline(f.source)
  assert.equal(JSON.parse(await readFile(join(directory, 'package.json'))).version, '0.3.0')
  assert.equal(await readFile(join(directory, 'user-generation.json'), 'utf8'), '{"preserve":true}')
})
test('candidate health failure restores the previous profile and records the failed repair', async t => {
  const f = await fixture(t), file = join(f.home, 'profiles/web/package.json')
  const before = await readFile(file)
  let starts = 0
  const manager = createResourceManager({ ...f, defaultPlugins: defaults, stopHost: async () => {}, startHost: async () => { if (++starts === 1) throw new Error('candidate unhealthy') } })
  await assert.rejects(manager.repairOffline(f.source), /unhealthy/)
  assert.deepEqual(await readFile(file), before)
  assert.equal(JSON.parse(await readFile(join(f.home, 'resources/transaction.json'))).state, 'rolled-back')
})
