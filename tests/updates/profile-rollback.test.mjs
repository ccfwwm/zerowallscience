import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync } from 'node:crypto'
import { createRequire } from 'node:module'
import { cp, lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative, sep } from 'node:path'
import { carrierName, offlineContentDigest } from '../../tools/commands/offline-carrier.mjs'
import { offlineFiles } from '../../tools/commands/offline-profile.mjs'
import { createResourceManager } from '../../tools/commands/resource-manager.mjs'
import { initializeProfile } from '../../tools/commands/profile.mjs'
import { fileDigest, signCatalog } from '../../tools/commands/resource-catalog.mjs'
import { verifyHistoricalPluginImports } from '../../tools/commands/historical-plugin.mjs'

const { createPackageWithOptions } = createRequire(new URL('../../desktop/package.json', import.meta.url))('@electron/asar')
const target = { desktopVersion: '8.3.6', dshVersion: '0.2.0-rc.2', dshCommit: 'a'.repeat(40), platform: 'win32', architecture: 'x64' }
const retired = ['dsh-genui', 'dsh-univer-office']
const pluginIds = ['presentation', 'kept-pin', 'kept-disabled', 'removed-later', ...retired]

async function fixture(t, kind = 'schema1', { failHealth = false, badDependency = false } = {}) {
  const home = await mkdtemp(join(tmpdir(), 'zws-full-rollback-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  const active = join(home, 'profiles/web'), backup = join(home, 'resources/history/835')
  await initializeProfile(home, pluginIds.slice(0, 3))
  const original = JSON.parse(await readFile(join(active, 'package.json')))
  for (const id of pluginIds.slice(0, 3)) {
    const path = join(active, 'node_modules', id)
    await mkdir(path, { recursive: true })
    await writeFile(join(path, 'package.json'), JSON.stringify({ name: id, version: id === 'kept-pin' ? '9.0.0' : '0.2.0' }))
  }
  const settings = '{"account":"current-account","model":"chosen-model","effort":"max","imageModel":"chosen-image-model","projects":["kept-project"]}'
  await writeFile(join(home, 'settings.yaml'), settings)
  const pair = generateKeyPairSync('ed25519'), keys = { test: pair.publicKey }
  const input = join(home, 'input'), modules = join(input, kind === 'schema1' ? 'modules' : 'node_modules'), source = join(home, 'signed-source')
  const plugins = []
  for (const id of pluginIds) {
    const version = id === 'kept-pin' ? '9.0.0' : '0.1.0', path = join(modules, id)
    plugins.push({ id, version })
    await mkdir(path, { recursive: true })
    await writeFile(join(path, 'package.json'), JSON.stringify({ name: id, version, main: 'index.js', ...(id === 'presentation' && badDependency ? { dependencies: { 'dsh-genui': '0.1.0' } } : {}) }))
    await writeFile(join(path, 'index.js'), 'module.exports = "' + id + '"')
    await writeFile(join(path, 'schema.previous-version.json'), 'signed original ' + id)
  }
  const files = (await offlineFiles(modules, 'modules/')).sort((a,b) => a.path.localeCompare(b.path))
  const unsigned = { schema: kind === 'schema1' ? 1 : 2, kind: 'offline-profile', profileArchitecture: 7, applicationVersion: '8.3.5', buildId: '835', dshCommit: target.dshCommit, dshRange: { min: target.dshVersion, max: target.dshVersion }, desktopRange: { min: '8.3.5', ...(kind === 'schema1' ? { max: target.desktopVersion } : {}) }, platform: ['win32'], architecture: ['x64'], files, plugins, defaultPatch: [] }
  await mkdir(source)
  if (kind !== 'schema1') {
    await createPackageWithOptions(input, join(source, carrierName), { unpack: '**' })
    unsigned.payloadFiles = [{ path: carrierName, size: (await stat(join(source, carrierName))).size, sha256: await fileDigest(join(source, carrierName)) }, ...await offlineFiles(join(source, carrierName + '.unpacked'), carrierName + '.unpacked/')].sort((a,b) => a.path.localeCompare(b.path))
    unsigned.contentDigest = offlineContentDigest(unsigned)
  }
  const receiptText = JSON.stringify(signCatalog(unsigned, pair.privateKey, 'test'))
  const digest = unsigned.contentDigest ?? createHash('sha256').update(receiptText).digest('hex')
  const generation = kind === 'modern' ? join(backup, 'node_modules/.zerowall-carriers', digest) : join(home, 'resources/offline', digest)
  await mkdir(generation, { recursive: true })
  if (kind === 'schema1') await rename(modules, join(generation, 'node_modules'))
  else {
    await cp(source, generation, { recursive: true })
    await writeFile(join(generation, 'verified.json'), JSON.stringify({ contentDigest: digest, archiveMtimeMs: (await stat(join(generation, carrierName))).mtimeMs }))
  }
  await writeFile(join(generation, 'receipt.json'), receiptText)
  const generationModules = join(generation, kind === 'schema1' ? 'node_modules' : carrierName + '.unpacked/node_modules')
  const historical = { ...original, dependencies: {}, dsh: { profile: { bundles: [...pluginIds] } }, zerowall: { pluginArchitecture: 7, offlineGeneration: digest, ...(kind === 'modern' ? { profileLayout: 2 } : {}), disabledPlugins: [] } }
  for (const id of pluginIds) {
    const path = join(backup, 'node_modules', id), destination = join(generationModules, id)
    await mkdir(dirname(path), { recursive: true })
    await symlink(destination, path, process.platform === 'win32' ? 'junction' : 'dir')
    historical.dependencies[id] = kind === 'modern' ? 'link:./' + relative(backup, destination).replaceAll('\\', '/') : 'link:' + destination.replaceAll('\\', '/')
  }
  historical.overrides = { 'dsh-genui': '0.1.0', kept: '1' }
  await writeFile(join(backup, 'package.json'), JSON.stringify(historical))
  const patch = [{ id: 'custom-mcp', config: { enabled: false, envRef: 'USER_MCP' } }, { id: 'univer', name: 'dsh-univer-office' }, { id: 'group', config: { children: [{ id: 'genui' }] } }]
  await writeFile(join(backup, 'cordis.patch.yml'), JSON.stringify(patch))
  await writeFile(join(backup, 'pnpm-workspace.yaml'), JSON.stringify({ overrides: { 'dsh-genui': '0.1.0', kept: '1' } }))
  const selection = { disabled: ['kept-disabled', 'dsh-genui'], removed: ['removed-later'], pinned: { 'kept-pin': '9.0.0', 'dsh-genui': '0.1.0' }, custom: { keep: true } }
  await mkdir(join(home, 'resources/plugins'), { recursive: true })
  await writeFile(join(home, 'resources/plugins/selection.json'), JSON.stringify(selection))
  await writeFile(join(home, 'resources/transaction.json'), JSON.stringify({ state: 'complete', backup, operation: 'offline-repair' }))
  let starts = 0, stops = 0
  const manager = createResourceManager({ home, keys, target, yaml: JSON, runPlugin: async () => assert.fail('Rollback must not run pnpm or download upgrades'), stopHost: async () => { stops++ }, startHost: async () => { starts++; if (failHealth && starts === 1) throw new Error('fixture Host failure') } })
  return { home, active, backup, historical, patch, generation, generationModules, digest, receiptText, unsigned, selection, settings, manager, keys, counts: () => ({ starts, stops }) }
}

for (const kind of ['schema1', 'schema2', 'modern']) test(`whole-profile rollback re-admits ${kind} snapshots without retired plugins or supply links`, async t => {
  const f = await fixture(t, kind)
  await assert.rejects(f.manager.rollback(), /Plugin rollback is no longer supported/u)
})

for (const kind of ['schema1', 'schema2', 'modern']) test(`whole-profile rollback rejects damaged ${kind} signed bytes before stopping the current Host`, async t => {
  const f = await fixture(t, kind)
  const before = await readFile(join(f.active, 'package.json')), selection = await readFile(join(f.home, 'resources/plugins/selection.json'))
  await writeFile(join(f.generationModules, 'presentation', 'schema.previous-version.json'), 'corrupt')
  await assert.rejects(f.manager.rollback(), /Plugin rollback is no longer supported/u)
  assert.deepEqual(await readFile(join(f.active, 'package.json')), before)
  assert.deepEqual(await readFile(join(f.home, 'resources/plugins/selection.json')), selection)
  assert.deepEqual(f.counts(), { starts: 0, stops: 0 })
})

test('whole-profile rollback restores active profile and exact selections after a candidate Host failure', async t => {
  const f = await fixture(t, 'schema2', { failHealth: true })
  const before = await readFile(join(f.active, 'package.json')), selection = await readFile(join(f.home, 'resources/plugins/selection.json'))
  await assert.rejects(f.manager.rollback(), /Plugin rollback is no longer supported/u)
  assert.deepEqual(await readFile(join(f.active, 'package.json')), before)
  assert.deepEqual(await readFile(join(f.home, 'resources/plugins/selection.json')), selection)
  assert.deepEqual(f.counts(), { starts: 0, stops: 0 })
  assert.deepEqual(JSON.parse(await readFile(join(f.backup, 'package.json'))), f.historical)
})

test('whole-profile rollback preserves a newer pin by rejecting a conflicting historical version', async t => {
  const f = await fixture(t)
  const selection = { ...f.selection, pinned: { ...f.selection.pinned, presentation: '0.2.0' } }
  await writeFile(join(f.home, 'resources/plugins/selection.json'), JSON.stringify(selection))
  const before = await readFile(join(f.active, 'package.json'))
  await assert.rejects(f.manager.rollback(), /Plugin rollback is no longer supported/u)
  assert.deepEqual(await readFile(join(f.active, 'package.json')), before)
  assert.deepEqual(JSON.parse(await readFile(join(f.home, 'resources/plugins/selection.json'))), selection)
  assert.deepEqual(f.counts(), { starts: 0, stops: 0 })
})

test('whole-profile rollback rejects a retained plugin requiring retired dependencies', async t => {
  const f = await fixture(t, 'schema1', { badDependency: true })
  const before = await readFile(join(f.active, 'package.json'))
  await assert.rejects(f.manager.rollback(), /Plugin rollback is no longer supported/u)
  assert.deepEqual(await readFile(join(f.active, 'package.json')), before)
  assert.deepEqual(f.counts(), { starts: 0, stops: 0 })
})
