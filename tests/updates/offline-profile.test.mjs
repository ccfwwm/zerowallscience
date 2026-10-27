import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync } from 'node:crypto'
import { lstat, mkdtemp, mkdir, readFile, readdir, readlink, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { declaredResolutionRoots, migrateOfflineProfileLinks, offlineFiles, prepareOfflineCandidate, readOfflineReceipt, verifyOfflineProfile } from '../../tools/commands/offline-profile.mjs'
import { createResourceManager } from '../../tools/commands/resource-manager.mjs'
import { initializeProfile } from '../../tools/commands/profile.mjs'
import { signCatalog } from '../../tools/release/resource-catalog.mjs'
import { materializationFile } from '../../tools/commands/profile-materialization.mjs'

const target = { desktopVersion: '8.0.8', dshVersion: '0.2.0-rc.2', dshCommit: '86b6740d0e671cee0b3fd0168de484c0efbf46ea', platform: 'win32', architecture: 'x64' }
const defaults = ['base', 'mcp', 'skills', 'python'].map(id => '@zerowallscience/plugin-' + id)
async function fixture(t, { onOfflinePhase = () => {} } = {}) {
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
  const manager = createResourceManager({ home, keys, target, defaultPlugins: defaults, bundledPlugins: unsigned.plugins, yaml: JSON, stopHost: async () => {}, startHost: async () => {}, callHost: async () => ({ ready: true, entries: [] }), onOfflinePhase })
  return { root, home, source, keys, target, defaults, bundledPlugins: unsigned.plugins, yaml: JSON, manager, unsigned, pair }
}

test('startup source retention recognizes local package and workspace declarations only for resolution UUID roots', () => {
  const profile = join(tmpdir(), 'zws-declaration-fixture')
  const uuid = '44444444-4444-4444-8444-444444444444'
  const root = '.zerowall/install-sources/resolution-' + uuid
  const legacy = '.zerowall/install-sources/resolution-old'
  assert.deepEqual(declaredResolutionRoots(profile, [
    { dependencies: { linked: 'link:' + root + '/node_modules/linked', ordinary: '1.2.3' } },
    { overrides: { declared: 'file:' + root + '/node_modules/declared', old: 'link:' + legacy + '/node_modules/old' } },
  ]), [root])
})

for (const layout of [2, 3]) test(`desktop upgrade archives a pre-rename media adaptation and obsolete provenance in layout ${layout}`, async t => {
  const f = await fixture(t), old = '@oh-story/dsh', next = '@zerowallscience/plugin-videos'
  const active = join(f.home, 'profiles/web'), oldRoot = join(active, 'node_modules', old)
  const currentDefaults = [...defaults, next]
  await mkdir(join(f.source, 'modules', next), { recursive: true })
  await writeFile(join(f.source, 'modules', next, 'package.json'), JSON.stringify({ name: next, version: '0.2.0', main: 'index.js' }))
  await writeFile(join(f.source, 'modules', next, 'index.js'), 'export const ready = true\n')
  const plugins = [...f.bundledPlugins, { id: next, version: '0.2.0' }]
  const incoming = { ...f.unsigned, plugins, files: (await offlineFiles(f.source)).filter(row => row.path !== 'receipt.json') }
  await writeFile(join(f.source, 'receipt.json'), JSON.stringify(signCatalog(incoming, f.pair.privateKey, 'test')))
  await mkdir(oldRoot, { recursive: true })
  const oldManifest = { name: old, version: '0.1.16-zws.25', main: 'index.js', zerowall: {
    capabilities: ['media.create'], requiredServices: ['zerowallMedia'], dsh: { min: '0.2.0-rc.1', max: '0.2.0-rc.1' },
  } }
  await writeFile(join(oldRoot, 'package.json'), JSON.stringify(oldManifest))
  await writeFile(join(oldRoot, 'index.js'), 'old adaptation bytes')
  const legacyResolution = join(active, '.zerowall/install-sources/resolution-legacy-media/node_modules', old)
  await mkdir(dirname(legacyResolution), { recursive: true })
  await symlink(oldRoot, legacyResolution, process.platform === 'win32' ? 'junction' : 'dir')
  const manifest = JSON.parse(await readFile(join(active, 'package.json')))
  manifest.dependencies = { [old]: 'link:./node_modules/' + old }
  manifest.dsh.profile.bundles.push(old)
  manifest.zerowall.profileLayout = layout
  await writeFile(join(active, 'package.json'), JSON.stringify(manifest))
  // An older signed exact runtime was retained by the previous layout. It
  // must never be authenticated as an active source after the rename.
  const oldReceipt = signCatalog({ ...f.unsigned, dshRange: { min: '0.2.0-rc.1', max: '0.2.0-rc.1' }, plugins: [{ id: old, version: oldManifest.version }] }, f.pair.privateKey, 'test')
  await mkdir(join(active, '.zerowall/plugin-imports'), { recursive: true })
  const provenance = JSON.stringify({ schema: 1, kind: 'historical-plugin-import', id: old, receiptText: JSON.stringify(oldReceipt), digest: 'a'.repeat(64) })
  await writeFile(join(active, '.zerowall/plugin-imports', encodeURIComponent(old) + '.json'), provenance)
  await writeFile(join(active, materializationFile), JSON.stringify({ ids: [old], receipt: oldReceipt, digest: 'a'.repeat(64), preserved: [] }))
  const selectionFile = join(f.home, 'resources/plugins/selection.json')
  await mkdir(join(f.home, 'resources/plugins'), { recursive: true })
  const selection = JSON.stringify({ disabled: [], pinned: {}, custom: 'preserved' })
  await writeFile(selectionFile, selection)
  const settings = '{"model":"selected-model","reasoningEffort":"xhigh"}'
  await writeFile(join(active, 'settings.json'), settings)
  await initializeProfile(f.home, currentDefaults, plugins)
  const initialized = JSON.parse(await readFile(join(active, 'package.json')))
  assert(!initialized.dsh.profile.bundles.includes(old))
  assert(initialized.dsh.profile.bundles.includes(next))
  const initializedSelection = await readFile(selectionFile, 'utf8')
  assert.deepEqual(JSON.parse(initializedSelection), { ...JSON.parse(selection), removed: [] })
  const manager = createResourceManager({ ...f, defaultPlugins: currentDefaults, bundledPlugins: plugins,
    stopHost: async () => {}, startHost: async () => {}, callHost: async () => ({ ready: true, entries: [] }) })
  assert.equal((await manager.repairOffline(f.source)).repaired, true)
  await assert.rejects(lstat(oldRoot), { code: 'ENOENT' })
  await assert.rejects(lstat(legacyResolution), { code: 'ENOENT' })
  await assert.rejects(lstat(join(active, '.zerowall/plugin-imports', encodeURIComponent(old) + '.json')), { code: 'ENOENT' })
  await assert.rejects(lstat(join(active, '.zerowall/retired-plugin-history')), { code: 'ENOENT' })
  assert.equal((await readdir(join(f.home, 'resources/history')).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error))).length, 0)
  assert.equal(JSON.parse(await readFile(join(active, 'node_modules', next, 'package.json'))).name, next)
  assert.equal(await readFile(selectionFile, 'utf8'), initializedSelection)
  assert.equal(await readFile(join(active, 'settings.json'), 'utf8'), settings)
  assert.equal((await manager.repairOffline(f.source)).repaired, false)
})

test('desktop upgrade archives incompatible provenance for a managed non-media plugin', async t => {
  const f = await fixture(t), id = '@dsh-external/zotero-harvest', active = join(f.home, 'profiles/web')
  const root = join(active, 'node_modules', id), provenancePath = join(active, '.zerowall/plugin-imports', encodeURIComponent(id) + '.json')
  await mkdir(root, { recursive: true }); await writeFile(join(root, 'package.json'), JSON.stringify({ name: id, version: '0.2.2', main: 'index.js' }))
  await writeFile(join(root, 'index.js'), 'old runtime')
  const manifest = JSON.parse(await readFile(join(active, 'package.json')))
  manifest.dependencies = { [id]: 'link:./node_modules/' + id }; manifest.dsh.profile.bundles.push(id)
  await writeFile(join(active, 'package.json'), JSON.stringify(manifest))
  const oldReceipt = signCatalog({ ...f.unsigned, dshRange: { min: '0.2.0-rc.1', max: '0.2.0-rc.1' }, plugins: [{ id, version: '0.2.2' }] }, f.pair.privateKey, 'test')
  await mkdir(dirname(provenancePath), { recursive: true })
  await writeFile(provenancePath, JSON.stringify({ schema: 1, kind: 'historical-plugin-import', id, receiptText: JSON.stringify(oldReceipt), digest: 'b'.repeat(64) }))
  const next = { ...f.unsigned, plugins: [...f.unsigned.plugins, { id, version: '0.2.3' }] }
  await mkdir(join(f.source, 'modules', id), { recursive: true })
  await writeFile(join(f.source, 'modules', id, 'package.json'), JSON.stringify({ name: id, version: '0.2.3', main: 'index.js' }))
  await writeFile(join(f.source, 'modules', id, 'index.js'), 'new runtime')
  next.files = (await offlineFiles(f.source)).filter(row => row.path !== 'receipt.json')
  await writeFile(join(f.source, 'receipt.json'), JSON.stringify(signCatalog(next, f.pair.privateKey, 'test')))
  const manager = createResourceManager({ ...f, defaultPlugins: [...f.defaults, id], bundledPlugins: next.plugins,
    stopHost: async () => {}, startHost: async () => {}, callHost: async () => ({ ready: true, entries: [] }) })
  assert.equal((await manager.repairOffline(f.source)).repaired, true)
  assert.equal(JSON.parse(await readFile(join(root, 'package.json'))).version, '0.2.3')
  await assert.rejects(lstat(provenancePath), { code: 'ENOENT' })
})
test('signed schema 1 history admits the actual desktop range without weakening current installer or DSH checks', async t => {
  const f = await fixture(t)
  const old = { ...f.unsigned, applicationVersion: '8.0.7', desktopRange: { min: '8.0.7', max: target.desktopVersion } }
  const text = JSON.stringify(signCatalog(old, f.pair.privateKey, 'test'))
  await writeFile(join(f.source, 'receipt.json'), text)
  const historical = await readOfflineReceipt(f.source, f.keys, target, { generation: true })
  assert.equal(historical.receipt.applicationVersion, '8.0.7')
  assert.deepEqual(historical.receipt.desktopRange, old.desktopRange)
  assert.equal(await readFile(join(f.source, 'receipt.json'), 'utf8'), text)
  await assert.rejects(readOfflineReceipt(f.source, f.keys, target), error => error.code === 'OFFLINE_PROFILE_MISMATCH'
    && error.diagnostics.expectedDesktopVersion === target.desktopVersion && error.diagnostics.generation === false)
  await assert.rejects(readOfflineReceipt(f.source, f.keys, { ...target, dshCommit: '0'.repeat(40) }, { generation: true }), error => error.code === 'OFFLINE_PROFILE_MISMATCH'
    && error.diagnostics.expectedDshCommit === '0'.repeat(40) && error.diagnostics.receiptDshCommit === target.dshCommit)
  const bounded = { ...old, desktopRange: { min: '8.0.7', max: '8.0.7' } }
  await writeFile(join(f.source, 'receipt.json'), JSON.stringify(signCatalog(bounded, f.pair.privateKey, 'test')))
  await assert.rejects(readOfflineReceipt(f.source, f.keys, target, { generation: true }), /different exact runtime/u)
  await writeFile(join(f.source, 'receipt.json'), JSON.stringify({ ...signCatalog(old, f.pair.privateKey, 'test'), applicationVersion: target.desktopVersion }))
  await assert.rejects(readOfflineReceipt(f.source, f.keys, target, { generation: true }), /signature/u)
})

test('offline-link migration accepts a historical profile without node_modules', async t => {
  const f = await fixture(t), active = join(f.home, 'profiles/web')
  const manifest = JSON.parse(await readFile(join(active, 'package.json')))
  const before = structuredClone(manifest)
  await assert.rejects(lstat(join(active, 'node_modules')), { code: 'ENOENT' })
  await migrateOfflineProfileLinks(active, f.home, manifest, f.keys, f.target, false)
  assert.deepEqual(manifest, before)
  await assert.rejects(lstat(join(active, 'node_modules')), { code: 'ENOENT' })
})

test('offline-link migration still rejects a missing signed generation inside an existing dependency tree', async t => {
  const f = await fixture(t), active = join(f.home, 'profiles/web')
  const manifest = JSON.parse(await readFile(join(active, 'package.json')))
  const directory = join(active, 'node_modules/@third-party')
  await mkdir(directory, { recursive: true })
  const generation = join(f.home, 'resources/offline', 'a'.repeat(64), 'node_modules/plugin')
  await symlink(generation, join(directory, 'plugin'), process.platform === 'win32' ? 'junction' : 'dir')
  await assert.rejects(migrateOfflineProfileLinks(active, f.home, manifest, f.keys, f.target, false), { code: 'ENOENT' })
})

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

test('layout 3 offline repair keeps the active profile root and commits package paths', async t => {
  const phases = []
  const f = await fixture(t, { onOfflinePhase: event => phases.push(event) }), active = join(f.home, 'profiles/web')
  const manifestFile = join(active, 'package.json')
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'))
  manifest.zerowall = { ...manifest.zerowall, pluginArchitecture: 7, profileLayout: 3 }
  await writeFile(manifestFile, JSON.stringify(manifest))
  const activeIdentity = await realpath(active)

  const result = await f.manager.repairOffline(f.source)

  assert.equal(result.repaired, true)
  assert.equal(await realpath(active), activeIdentity)
  assert.equal(JSON.parse(await readFile(manifestFile, 'utf8')).zerowall.profileLayout, 3)
  assert.equal((await lstat(join(active, 'node_modules', defaults[1], 'package.json'))).isFile(), true)
  assert.equal((await lstat(join(active, 'node_modules/.zerowall-dependencies'))).isDirectory(), true)
  assert.equal(phases.some(event => event.phase === 'offline-package-install' && event.durationMs >= 0), true)
  const activationPhases = phases.filter(event => event.phase === 'profile-activation')
  assert.equal(activationPhases.some(event => event.step === 'backup-copied'), false)
  assert.equal((await f.manager.repairOffline(f.source)).repaired, false)
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

test('legacy schema 1 migration imports retained pins and archives disabled supply links without activating retired plugins', async t => {
  const f = await fixture(t), active = join(f.home, 'profiles/web'), oldSource = join(f.root, 'legacy-source')
  const retained = [[defaults[1], '0.1.9'], [defaults[2], '0.1.8']]
  const retired = ['dsh-univer-office', 'dsh-genui', '@changfenhuang/dsh-genui']
  for (const [id, version] of [...retained, ...retired.map(id => [id, '1.0.0'])]) {
    const directory = join(oldSource, 'modules', id)
    await mkdir(join(directory, 'data'), { recursive: true })
    await writeFile(join(directory, 'package.json'), JSON.stringify({ name: id, version, main: 'index.js' }))
    await writeFile(join(directory, 'index.js'), 'export const ready = true\n')
    await writeFile(join(directory, 'data/schema.previous-version.json'), 'signed original asset')
  }
  const unsigned = { ...f.unsigned, applicationVersion: '8.0.7', desktopRange: { min: '8.0.7', max: target.desktopVersion }, buildId: 'legacy-schema-1', plugins: [...retained.map(([id, version]) => ({ id, version })), ...retired.map(id => ({ id, version: '1.0.0' }))], files: (await offlineFiles(oldSource)).sort((a,b) => a.path.localeCompare(b.path)) }
  const text = JSON.stringify(signCatalog(unsigned, f.pair.privateKey, 'test')), digest = createHash('sha256').update(text).digest('hex')
  const oldGeneration = join(f.home, 'resources/offline', digest)
  await mkdir(oldGeneration, { recursive: true })
  await rename(join(oldSource, 'modules'), join(oldGeneration, 'node_modules'))
  await writeFile(join(oldGeneration, 'receipt.json'), text)
  const manifest = JSON.parse(await readFile(join(active, 'package.json')))
  manifest.dependencies = {}
  for (const id of [...retained.map(([id]) => id), ...retired]) {
    const original = join(oldGeneration, 'node_modules', id), link = join(active, 'node_modules', id)
    await mkdir(resolve(link, '..'), { recursive: true })
    await symlink(original, link, process.platform === 'win32' ? 'junction' : 'dir')
    manifest.dependencies[id] = 'link:' + original.replaceAll('\\', '/')
  }
  manifest.dsh.profile.bundles.push(...retired)
  await writeFile(join(active, 'package.json'), JSON.stringify(manifest))
  const disabledId = defaults[2], originalDisabledTarget = join(oldGeneration, 'node_modules', disabledId)
  const disabledEvidence = JSON.stringify({ id: disabledId, originalSource: oldGeneration, receiptText: text })
  await mkdir(join(active, '.zerowall/plugin-imports'), { recursive: true })
  await writeFile(join(active, '.zerowall/plugin-imports', encodeURIComponent(disabledId) + '.json'), disabledEvidence)
  const selection = { pinned: { [defaults[1]]: '0.1.9' }, disabled: [defaults[2]], removed: [], custom: { keep: true } }
  await mkdir(join(f.home, 'resources/plugins'), { recursive: true })
  await writeFile(join(f.home, 'resources/plugins/selection.json'), JSON.stringify(selection))
  const retiredAsset = join(oldGeneration, 'node_modules', retained[0][0], 'data/schema.previous-version.json')
  const before = await readFile(join(active, 'package.json'))
  await writeFile(retiredAsset, 'corrupt signed retired bytes')
  await assert.rejects(f.manager.repairOffline(f.source), /signed size or SHA-256 mismatch/u)
  assert.deepEqual(await readFile(join(active, 'package.json')), before)
  await writeFile(retiredAsset, 'signed original asset')
  const originalGenerationFiles = await offlineFiles(oldGeneration)
  assert.equal((await f.manager.repairOffline(f.source)).repaired, true)
  const migrated = JSON.parse(await readFile(join(active, 'package.json')))
  assert.equal(await readFile(join(oldGeneration, 'receipt.json'), 'utf8'), text)
  const [pinnedId, pinnedVersion] = retained[0], pinnedRoot = join(active, 'node_modules', pinnedId)
  assert.equal(JSON.parse(await readFile(join(pinnedRoot, 'package.json'))).version, pinnedVersion)
  assert.equal((await lstat(pinnedRoot)).isSymbolicLink(), false)
  assert.equal(await realpath(pinnedRoot), pinnedRoot)
  assert(migrated.dsh.profile.bundles.includes(pinnedId))
  const evidence = JSON.parse(await readFile(join(active, '.zerowall/plugin-imports', encodeURIComponent(pinnedId) + '.json')))
  assert.equal(evidence.receiptText, text)
  const pinnedPrefix = 'modules/' + pinnedId + '/'
  assert.deepEqual(await offlineFiles(pinnedRoot), unsigned.files.filter(file => file.path.startsWith(pinnedPrefix)).map(file => ({ ...file, path: file.path.slice(pinnedPrefix.length) })))
  assert(!migrated.dsh.profile.bundles.includes(disabledId))
  assert(migrated.zerowall.disabledPlugins.includes(disabledId))
  assert.equal(migrated.dependencies?.[disabledId], undefined)
  await assert.rejects(lstat(join(active, 'node_modules', disabledId)), { code: 'ENOENT' })
  await assert.rejects(lstat(join(active, '.zerowall/plugin-imports', encodeURIComponent(disabledId) + '.json')), { code: 'ENOENT' })
  await assert.rejects(lstat(join(active, '.zerowall/inactive-plugin-history')), { code: 'ENOENT' })
  assert.equal((await readdir(join(f.home, 'resources/history')).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error))).length, 0)
  for (const id of retired) {
    assert(!migrated.dsh.profile.bundles.includes(id))
    assert.equal(migrated.dependencies?.[id], undefined)
    await assert.rejects(lstat(join(active, 'node_modules', id)), /ENOENT/u)
  }
  assert.deepEqual(await offlineFiles(oldGeneration), originalGenerationFiles)
  assert.deepEqual(JSON.parse(await readFile(join(f.home, 'resources/plugins/selection.json'))), selection)
  await rename(join(f.home, 'resources/offline'), join(f.home, 'resources/offline-retained'))
  assert.equal(await readFile(join(pinnedRoot, 'data/schema.previous-version.json'), 'utf8'), 'signed original asset')
  assert.equal(disabledEvidence.length > 0, true)
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

test('offline preparation supports callers without a bundled management inventory', async t => {
  const f = await fixture(t)
  const result = await prepareOfflineCandidate({ ...f, bundledPlugins: undefined })
  assert.deepEqual(result.blocked, [])
  assert.equal(result.changed.length, defaults.length)
})

test('offline candidates remove retired manifest and workspace resolver rules while preserving the active profile', async t => {
  const f = await fixture(t), active = join(f.home, 'profiles/web')
  const file = join(active, 'package.json'), manifest = JSON.parse(await readFile(file, 'utf8'))
  manifest.pnpm = { overrides: { 'dsh-univer-office': 'file:old-univer.tgz', kept: '2' }, onlyBuiltDependencies: ['kept'] }
  manifest.overrides = { 'dsh-genui': '1', kept: { '.': '2', shared: '3' } }
  manifest.resolutions = { '**/@changfenhuang/dsh-genui': '1', '**/@other/dsh-genui': '4' }
  const workspace = { packages: ['.'], overrides: { 'dsh-univer-office': 'file:old-univer.tgz', '@changfenhuang/dsh-genui': '1', '@other/dsh-genui': '4', kept: '2' }, allowBuilds: { kept: false } }
  await writeFile(file, JSON.stringify(manifest))
  await writeFile(join(active, 'pnpm-workspace.yaml'), JSON.stringify(workspace))
  const before = await readFile(file, 'utf8')
  const result = await prepareOfflineCandidate(f)
  const candidate = JSON.parse(await readFile(join(result.candidate, 'package.json'), 'utf8'))
  assert.deepEqual(candidate.pnpm, { overrides: { kept: '2' }, onlyBuiltDependencies: ['kept'] })
  assert.deepEqual(candidate.overrides, { kept: { '.': '2', shared: '3' } })
  assert.deepEqual(candidate.resolutions, { '**/@other/dsh-genui': '4' })
  assert.deepEqual(JSON.parse(await readFile(join(result.candidate, 'pnpm-workspace.yaml'), 'utf8')), { ...workspace, overrides: { '@other/dsh-genui': '4', kept: '2' } })
  assert.equal(await readFile(file, 'utf8'), before)
  assert.deepEqual(JSON.parse(await readFile(join(active, 'pnpm-workspace.yaml'), 'utf8')), workspace)
})

test('desktop upgrade replaces an older unpinned managed catalog installation offline', async t => {
  const f = await fixture(t), directory = join(f.home, 'profiles/web/node_modules', defaults[1])
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'package.json'), JSON.stringify({ name: defaults[1], version: '0.1.0' }))
  const result = await f.manager.repairOffline(f.source)
  assert.equal(result.repaired, true)
  assert.equal(JSON.parse(await readFile(join(directory, 'package.json'))).version, '0.2.0')
})

for (const layout of [2, 3]) test(`desktop upgrade removes an undeclared older core shadow but preserves an exact pin in layout ${layout}`, async t => {
  const f = await fixture(t), id = defaults[0], active = join(f.home, 'profiles/web')
  f.unsigned.plugins[0].core = true
  await writeFile(join(f.source, 'receipt.json'), JSON.stringify(signCatalog(f.unsigned, f.pair.privateKey, 'test')))
  const directory = join(active, 'node_modules', id)
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'package.json'), JSON.stringify({ name: id, version: '0.1.0' }))
  const oldResolution = join(active, '.zerowall/install-sources/resolution-old-core/node_modules', id)
  await mkdir(dirname(oldResolution), { recursive: true })
  await symlink(directory, oldResolution, process.platform === 'win32' ? 'junction' : 'dir')
  const manifest = JSON.parse(await readFile(join(active, 'package.json')))
  // A physical leftover can shadow the desktop runtime even after its old
  // dependency declaration was removed by initialization.
  manifest.zerowall.profileLayout = layout
  await writeFile(join(active, 'package.json'), JSON.stringify(manifest))
  await mkdir(join(f.home, 'resources/plugins'), { recursive: true })
  await writeFile(join(f.home, 'resources/plugins/selection.json'), JSON.stringify({ pinned: { [id]: '0.1.0' } }))
  await f.manager.repairOffline(f.source)
  assert.equal(JSON.parse(await readFile(join(directory, 'package.json'))).version, '0.1.0')
  await writeFile(join(f.home, 'resources/plugins/selection.json'), JSON.stringify({ pinned: {} }))
  assert.equal((await f.manager.repairOffline(f.source)).repaired, true)
  await assert.rejects(readFile(join(directory, 'package.json')), { code: 'ENOENT' })
  assert.equal((await lstat(oldResolution)).isSymbolicLink(), true)
  await assert.rejects(lstat(join(active, '.zerowall/inactive-plugin-history')), { code: 'ENOENT' })
  assert.equal((await readdir(join(f.home, 'resources/history')).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error))).length, 0)
  assert.equal(JSON.parse(await readFile(join(active, 'package.json'))).dependencies[id], undefined)
  assert(JSON.parse(await readFile(join(active, 'package.json'))).dsh.profile.bundles.includes(id), 'Removing a core shadow must retain activation of the packaged runtime plugin')
  assert.equal((await f.manager.repairOffline(f.source)).repaired, false)
})
for (const layout of [2, 3]) test(`migration removes equal-version core shadows with nested links to a retired base in layout ${layout}`, async t => {
  const f = await fixture(t), active = join(f.home, 'profiles/web'), base = defaults[0], environment = defaults[1]
  f.unsigned.plugins[0].core = true
  f.unsigned.plugins[1].core = true
  await writeFile(join(f.source, 'receipt.json'), JSON.stringify(signCatalog(f.unsigned, f.pair.privateKey, 'test')))
  for (const [id, version] of [[base, '0.1.0'], [environment, '0.2.0']]) {
    const root = join(active, 'node_modules', id)
    await mkdir(root, { recursive: true })
    await writeFile(join(root, 'package.json'), JSON.stringify({ name: id, version }))
  }
  const nested = join(active, 'node_modules', environment, 'node_modules', base)
  await mkdir(dirname(nested), { recursive: true })
  await symlink(join(active, 'node_modules', base), nested, process.platform === 'win32' ? 'junction' : 'dir')
  const file = join(active, 'package.json'), manifest = JSON.parse(await readFile(file))
  manifest.zerowall.profileLayout = layout
  await writeFile(file, JSON.stringify(manifest))
  const manager = createResourceManager({ ...f, defaultPlugins: defaults, runtimeModules: join(f.source, 'modules'),
    stopHost: async () => {}, startHost: async () => {}, callHost: async () => ({ ready: true, entries: [] }) })
  const result = await manager.repairOffline(f.source)
  assert.equal(result.repaired, true)
  for (const id of [base, environment]) await assert.rejects(lstat(join(active, 'node_modules', id)), { code: 'ENOENT' })
  const migrated = JSON.parse(await readFile(file))
  for (const id of [base, environment]) assert(migrated.dsh.profile.bundles.includes(id), 'Runtime core declaration lost: ' + id)
  assert.equal(JSON.parse(await readFile(join(active, 'node_modules', defaults[2], 'package.json'))).version, '0.2.0')
  assert.equal((await manager.repairOffline(f.source)).repaired, false)
  await assert.rejects(lstat(join(f.home, 'profiles/zerowall')), { code: 'ENOENT' })
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
