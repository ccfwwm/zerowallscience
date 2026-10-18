import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync } from 'node:crypto'
import { createRequire } from 'node:module'
import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { carrierName, offlineContentDigest } from '../../tools/commands/offline-carrier.mjs'
import { archiveHistoricalPluginProvenance, importHistoricalPlugin, restoreHistoricalPluginSnapshot, verifyCurrentRuntimeDependency, verifyHistoricalPluginImports } from '../../tools/commands/historical-plugin.mjs'
import { offlineFiles, readOfflineReceipt } from '../../tools/commands/offline-profile.mjs'
import { fileDigest, signCatalog } from '../../tools/commands/resource-catalog.mjs'

const { createPackageWithOptions } = createRequire(new URL('../../desktop/package.json', import.meta.url))('@electron/asar')
const target = { desktopVersion: '8.3.6', dshVersion: '0.2.0-rc.2', dshCommit: 'c'.repeat(40), platform: 'win32', architecture: 'x64' }
const id = '@dsh-external/zotero-harvest', core = '@deepseek-ai/dsh-tools'

async function fixture(t, { schema = 2, missing = false, runtimeAsar = false, desktopMax, dshVersion = target.dshVersion, pluginFields = {}, runtimePackages = [] } = {}) {
  const home = await mkdtemp(join(tmpdir(), 'zws-historical-plugin-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  const profile = join(home, 'profiles/candidate'), input = join(home, 'input'), source = join(home, 'source'), runtime = join(home, 'runtime')
  const pair = generateKeyPairSync('ed25519'), keys = { test: pair.publicKey }
  const rows = [
    ['modules/' + id + '/package.json', JSON.stringify({ name: id, version: '0.2.2', type: 'module', main: 'index.mjs', dsh: { bundle: { patch: 'cordis.patch.yml' } }, dependencies: { [core]: 'workspace:*', 'private-dep': '^1.0.0' }, ...pluginFields })],
    ['modules/' + id + '/index.mjs', 'export const version = "0.2.2"\n'],
    ['modules/' + id + '/cordis.patch.yml', '- name: ' + id + '\n'],
    ['modules/' + id + '/docs/original.txt', 'original signed asset'],
    ['modules/' + core + '/package.json', JSON.stringify({ name: core, version: target.dshVersion, main: 'index.js' })],
    ['modules/' + core + '/index.js', 'throw new Error("OLD CORE MUST NEVER LOAD")\n'],
  ]
  if (!missing) rows.push(
    ['modules/private-dep/package.json', JSON.stringify({ name: 'private-dep', version: '1.1.0', main: 'index.js', dependencies: { 'nested-dep': '2.0.0' }, optionalDependencies: { 'absent-optional': '^1.0.0' } })],
    ['modules/private-dep/index.js', 'module.exports = require("nested-dep")\n'],
    ['modules/private-dep/node_modules/nested-dep/package.json', '{"name":"nested-dep","version":"2.0.0","main":"index.js"}'],
    ['modules/private-dep/node_modules/nested-dep/index.js', 'module.exports = "private closure"\n'],
  )
  for (const [path, text] of rows) { await mkdir(dirname(join(input, path)), { recursive: true }); await writeFile(join(input, path), text) }
  const files = (await offlineFiles(input)).sort((a, b) => a.path.localeCompare(b.path))
  const unsigned = { schema, kind: 'offline-profile', profileArchitecture: 7, applicationVersion: '8.3.0', buildId: 'old-signed', dshCommit: 'a'.repeat(40), dshRange: { min: dshVersion, max: dshVersion }, desktopRange: { min: '8.1.3', ...(desktopMax ? { max: desktopMax } : {}) }, platform: ['win32'], architecture: ['x64'], plugins: [{ id, version: '0.2.2', core: false }, { id: core, version: dshVersion, core: true }], files, defaultPatch: [] }
  await mkdir(source)
  if (schema === 1) await rename(join(input, 'modules'), join(source, 'node_modules'))
  else {
    const archiveInput = join(home, 'archive-input')
    await mkdir(archiveInput)
    await rename(join(input, 'modules'), join(archiveInput, 'node_modules'))
    await createPackageWithOptions(archiveInput, join(source, carrierName), { unpackDir: 'node_modules/@dsh-external/zotero-harvest' })
    unsigned.payloadFiles = [{ path: carrierName, size: (await stat(join(source, carrierName))).size, sha256: await fileDigest(join(source, carrierName)) }, ...await offlineFiles(join(source, carrierName + '.unpacked'), carrierName + '.unpacked/')].sort((a, b) => a.path.localeCompare(b.path))
    unsigned.contentDigest = offlineContentDigest(unsigned)
  }
  const receiptText = JSON.stringify(signCatalog(unsigned, pair.privateKey, 'test'))
  const digest = schema === 2 ? unsigned.contentDigest : createHash('sha256').update(receiptText).digest('hex')
  await writeFile(join(source, 'receipt.json'), receiptText)
  const runtimeRoot = join(runtime, 'node_modules', core)
  await mkdir(runtimeRoot, { recursive: true })
  await writeFile(join(runtimeRoot, 'package.json'), JSON.stringify({ name: core, version: target.dshVersion, main: 'index.js', exports: { '.': './index.js' } }))
  await writeFile(join(runtimeRoot, 'index.js'), 'module.exports = { current: true }\n')
  for (const manifest of runtimePackages) {
    const root = join(runtime, 'node_modules', manifest.name)
    await mkdir(root, { recursive: true })
    await writeFile(join(root, 'package.json'), JSON.stringify({ main: 'index.js', ...manifest }))
    await writeFile(join(root, 'index.js'), 'module.exports = {}\n')
  }
  let runtimeModules = join(runtime, 'node_modules')
  if (runtimeAsar) { await createPackageWithOptions(runtime, join(home, 'app.asar'), {}); runtimeModules = join(home, 'app.asar/node_modules') }
  return { home, profile, source, runtimeModules, keys, target, digest, id, receiptText, unsigned, pair }
}

for (const schema of [1, 2]) test(`schema ${schema} independently imports a newer signed plugin with private closure and current core`, async t => {
  const f = await fixture(t, { schema })
  await assert.rejects(readOfflineReceipt(f.source, f.keys, target, { generation: true }), /does not match/u)
  const imported = await importHistoricalPlugin(f)
  assert.equal(imported.version, '0.2.2')
  assert.equal(imported.path, join(f.profile, 'node_modules', id))
  assert(!(await lstat(imported.path)).isSymbolicLink())
  assert.equal(await readFile(join(imported.path, 'docs/original.txt'), 'utf8'), 'original signed asset')
  assert.equal(await readFile(join(imported.path, 'node_modules/private-dep/node_modules/nested-dep/index.js'), 'utf8'), 'module.exports = "private closure"\n')
  await assert.rejects(lstat(join(imported.path, 'node_modules', core)), { code: 'ENOENT' })
  const provenance = JSON.parse(await readFile(imported.provenance, 'utf8'))
  assert.equal(provenance.receiptText, f.receiptText)
  assert.equal(provenance.sourceDshCommit, 'a'.repeat(40))
  assert(provenance.files.every(row => !row.path.startsWith('modules/@deepseek-ai/')))
  assert.equal(provenance.runtime[0].version, target.dshVersion)
  assert.deepEqual(provenance.optionalMissing, [{ from: '.zerowall-dependencies/1', id: 'absent-optional', range: '^1.0.0' }])
  await rename(f.source, f.source + '.retained')
  assert.deepEqual(await verifyHistoricalPluginImports(f), [{ id, version: '0.2.2', digest: f.digest }])
  assert.deepEqual(await verifyHistoricalPluginImports({ ...f, full: false }), [{ id, version: '0.2.2', digest: f.digest }])
})

test('ordinary Node verifies current shared runtime inside app.asar without copying it', async t => {
  const f = await fixture(t, { runtimeAsar: true })
  const imported = await importHistoricalPlugin(f)
  assert.equal(imported.version, '0.2.2')
  assert.equal((await verifyHistoricalPluginImports(f)).length, 1)
  await assert.rejects(lstat(join(imported.path, 'node_modules', core)), { code: 'ENOENT' })
})

test('shared current runtime validation checks archived entries and the actual DSH version', async t => {
  const f = await fixture(t, { runtimeAsar: true })
  assert.deepEqual(await verifyCurrentRuntimeDependency({ ...f, id: core, range: 'workspace:*' }), { id: core, range: 'workspace:*', version: target.dshVersion })
  await assert.rejects(verifyCurrentRuntimeDependency({ ...f, id: core, range: 'workspace:*', target: { ...target, dshVersion: '0.2.0-rc.1' } }), /version is incompatible/u)
  await assert.rejects(verifyCurrentRuntimeDependency({ ...f, id: '../unsigned', range: 'workspace:*' }), /Invalid historical plugin identity/u)
  const runtime = join(f.home, 'runtime/node_modules', core)
  await rm(join(runtime, 'index.js'))
  await assert.rejects(verifyCurrentRuntimeDependency({ ...f, runtimeModules: join(f.home, 'runtime/node_modules'), id: core, range: 'workspace:*' }), /entry is missing/u)
})

test('DSH dependency ranges admit the pinned prerelease while exact version and incompatible ranges still fail', async t => {
  const f = await fixture(t)
  for (const range of ['>=0.1.5-alpha.1', '>=0.1.0-rc.6 <0.3.0-0', 'workspace:^', 'workspace:~']) {
    assert.equal((await verifyCurrentRuntimeDependency({ ...f, id: core, range })).version, target.dshVersion)
  }
  await assert.rejects(verifyCurrentRuntimeDependency({ ...f, id: core, range: '0.2.0-rc.1' }), /version is incompatible/u)
  await assert.rejects(verifyCurrentRuntimeDependency({ ...f, id: core, range: '>=0.3.0' }), /version is incompatible/u)
  await assert.rejects(verifyCurrentRuntimeDependency({ ...f, id: core, range: '>=0.1.5-alpha.1', target: { ...target, dshVersion: '0.2.0-rc.1' } }), /version is incompatible/u)
})

test('vendor packages keep independent normal semver and workspace shorthand uses their own versions', async t => {
  const f = await fixture(t, { runtimeAsar: true, runtimePackages: [
    { name: '@deepseek-ai/cordis', version: '4.0.4' },
    { name: '@deepseek-ai/schemastery', version: '3.16.1' },
    { name: '@deepseek-ai/cosmokit', version: '1.8.1' },
    { name: '@deepseek-ai/vendor-preview', version: '4.1.0-beta.1' },
    { name: '@deepseek-ai/vendor-invalid', version: 'not-semver' },
  ] })
  for (const [id, range, version] of [
    ['@deepseek-ai/cordis', '^4.0.4', '4.0.4'],
    ['@deepseek-ai/cordis', 'workspace:^', '4.0.4'],
    ['@deepseek-ai/schemastery', '^3.0.0', '3.16.1'],
    ['@deepseek-ai/cosmokit', 'workspace:~', '1.8.1'],
  ]) assert.equal((await verifyCurrentRuntimeDependency({ ...f, id, range })).version, version)
  await assert.rejects(verifyCurrentRuntimeDependency({ ...f, id: '@deepseek-ai/vendor-preview', range: '^4.0.4' }), /version is incompatible/u)
  await assert.rejects(verifyCurrentRuntimeDependency({ ...f, id: '@deepseek-ai/cordis', range: '^5.0.0' }), /version is incompatible/u)
  await assert.rejects(verifyCurrentRuntimeDependency({ ...f, id: '@deepseek-ai/vendor-invalid', range: 'workspace:*' }), /version is incompatible/u)
})

for (const runtimeAsar of [false, true]) test(`optional shared runtime manifests may be absent in ${runtimeAsar ? 'ASAR' : 'physical'} runtime`, async t => {
  const f = await fixture(t, { runtimeAsar })
  const request = { ...f, id: '@deepseek-ai/dsh-client-runtime', range: '>=0.1.0-rc.6 <0.3.0-0' }
  assert.equal(await verifyCurrentRuntimeDependency({ ...request, optional: true }), undefined)
  await assert.rejects(verifyCurrentRuntimeDependency(request), /dependency is missing/u)
})

test('optional shared dependencies fail on incompatible versions, malformed manifests, missing entries and corrupt ASAR', async t => {
  const f = await fixture(t), request = { ...f, id: core, range: 'workspace:*', optional: true }
  await assert.rejects(verifyCurrentRuntimeDependency({ ...request, range: '>=0.3.0' }), /version is incompatible/u)
  const manifest = join(f.runtimeModules, core, 'package.json'), original = await readFile(manifest)
  await writeFile(manifest, '{ malformed JSON')
  await assert.rejects(verifyCurrentRuntimeDependency(request), SyntaxError)
  await writeFile(manifest, original)
  await rm(join(f.runtimeModules, core, 'index.js'))
  await assert.rejects(verifyCurrentRuntimeDependency(request), /entry is missing/u)
  const archived = await fixture(t, { runtimeAsar: true })
  await writeFile(join(archived.home, 'app.asar'), 'corrupt archive')
  await assert.rejects(verifyCurrentRuntimeDependency({ ...archived, id: core, range: 'workspace:*', optional: true }), /shared runtime archive/u)
  const linked = '@deepseek-ai/vendor-link', linkedArchive = join(f.home, 'linked-app.asar')
  await symlink(join(f.runtimeModules, core), join(f.runtimeModules, linked), process.platform === 'win32' ? 'junction' : 'dir')
  await createPackageWithOptions(join(f.home, 'runtime'), linkedArchive, {})
  await assert.rejects(verifyCurrentRuntimeDependency({ ...f, runtimeModules: join(linkedArchive, 'node_modules'), id: linked, range: '*', optional: true }), /must not be a link/u)
})

test('shared archive header cache is invalidated by replacement and corruption at the same path', async t => {
  const f = await fixture(t, { runtimeAsar: true }), request = { ...f, id: core, range: 'workspace:*', optional: true }
  assert.equal((await verifyCurrentRuntimeDependency(request)).version, target.dshVersion)
  const runtime = join(f.home, 'runtime'), manifest = join(runtime, 'node_modules', core, 'package.json'), archive = join(f.home, 'app.asar')
  await writeFile(manifest, JSON.stringify({ name: core, version: '0.2.0-rc.1', main: 'index.js' }))
  const replacement = join(f.home, 'replacement.asar')
  await createPackageWithOptions(runtime, replacement, {})
  await rename(archive, archive + '.retained'); await rename(replacement, archive)
  await assert.rejects(verifyCurrentRuntimeDependency(request), /version is incompatible/u)
  await writeFile(archive, 'corrupt archive')
  await assert.rejects(verifyCurrentRuntimeDependency(request), /shared runtime archive/u)
})

test('historical import records missing optional shared dependencies and still checks present optional peers', async t => {
  const optional = '@deepseek-ai/dsh-client-runtime', range = '>=0.1.0-rc.6 <0.3.0-0'
  const options = { pluginFields: { peerDependencies: { [optional]: range }, peerDependenciesMeta: { [optional]: { optional: true } }, optionalDependencies: { '@deepseek-ai/absent-vendor': '^1.0.0' } } }
  const f = await fixture(t, options), imported = await importHistoricalPlugin(f)
  const provenance = JSON.parse(await readFile(imported.provenance, 'utf8'))
  assert(provenance.optionalMissing.some(row => row.id === optional && row.range === range))
  assert(provenance.optionalMissing.some(row => row.id === '@deepseek-ai/absent-vendor'))
  assert.equal((await verifyHistoricalPluginImports(f)).length, 1)
  const incompatible = await fixture(t, { ...options, runtimePackages: [{ name: optional, version: '0.3.0' }] })
  await assert.rejects(importHistoricalPlugin(incompatible), /version is incompatible/u)
})

test('missing signed closure or current core fails before replacing an existing candidate package', async t => {
  const f = await fixture(t, { missing: true })
  const root = join(f.profile, 'node_modules', id)
  await mkdir(root, { recursive: true }); await writeFile(join(root, 'keep.txt'), 'keep existing candidate')
  await assert.rejects(importHistoricalPlugin(f), /Required signed dependency is missing: private-dep/u)
  assert.equal(await readFile(join(root, 'keep.txt'), 'utf8'), 'keep existing candidate')
  await assert.rejects(importHistoricalPlugin({ ...f, runtimeModules: undefined }), /Current shared runtime is unavailable/u)
  assert.equal(await readFile(join(root, 'keep.txt'), 'utf8'), 'keep existing candidate')
})

test('original signed desktop and DSH ranges still reject incompatible standalone imports', async t => {
  const desktop = await fixture(t, { desktopMax: '8.3.5' })
  await assert.rejects(importHistoricalPlugin(desktop), /runtime is incompatible/u)
  const dsh = await fixture(t, { dshVersion: '0.2.0-rc.1' })
  await assert.rejects(importHistoricalPlugin(dsh), /different exact runtime/u)
  await assert.rejects(importHistoricalPlugin({ ...dsh, target: { ...target, dshVersion: '0.2.0-rc.1' } }), /runtime dependency version is incompatible/u)
})

test('corrupt plugin bytes cannot be imported and the historical receipt is not rewritten', async t => {
  const f = await fixture(t)
  const asset = join(f.source, carrierName + '.unpacked/node_modules', id, 'index.mjs')
  await writeFile(asset, 'corrupt')
  await assert.rejects(importHistoricalPlugin(f), /signed size or SHA-256 mismatch/u)
  assert.equal(await readFile(join(f.source, 'receipt.json'), 'utf8'), f.receiptText)
  await assert.rejects(lstat(join(f.profile, 'node_modules', id)), { code: 'ENOENT' })
})

test('provenance and full imported bytes remain verifiable for rollback and corruption repair', async t => {
  const f = await fixture(t), imported = await importHistoricalPlugin(f)
  const root = imported.path, asset = join(root, 'docs/original.txt')
  await writeFile(asset, 'changed bytes')
  await assert.rejects(verifyHistoricalPluginImports(f), /signed size or SHA-256 mismatch/u)
  await writeFile(asset, 'original signed asset')
  const original = await readFile(imported.provenance, 'utf8'), row = JSON.parse(original)
  row.files.push({ path: 'modules/unsigned.js', destination: 'unsigned.js', size: 1, sha256: '0'.repeat(64) })
  await writeFile(imported.provenance, JSON.stringify(row))
  await assert.rejects(verifyHistoricalPluginImports(f), /provenance differs/u)
  await writeFile(imported.provenance, original)
  await writeFile(join(root, 'unsigned.js'), 'unsigned executable')
  await assert.rejects(verifyHistoricalPluginImports(f), /physical file set mismatch/u)
  await rm(join(root, 'unsigned.js'))
  await rm(join(root, 'node_modules/private-dep'))
  await assert.rejects(verifyHistoricalPluginImports(f), /ENOENT/u)
})

test('a signed core package cannot be re-admitted as an independent plugin', async t => {
  const f = await fixture(t)
  await assert.rejects(importHistoricalPlugin({ ...f, id: core }), /Only a signed non-core/u)
})

test('an independently imported physical snapshot restores its signed private closure without the old supply', async t => {
  const f = await fixture(t, { runtimeAsar: true }), imported = await importHistoricalPlugin(f)
  const profile = join(f.home, 'profiles/rollback'), previousProfile = f.profile
  const existing = join(profile, 'node_modules', id)
  await mkdir(existing, { recursive: true }); await writeFile(join(existing, 'keep.txt'), 'current generation')
  await rename(f.source, f.source + '.retained')
  const result = await restoreHistoricalPluginSnapshot({ ...f, profile, previousProfile })
  assert.equal(result.path, existing)
  assert.equal(result.version, '0.2.2')
  assert.equal((await lstat(existing)).isSymbolicLink(), false)
  assert.equal(await readFile(join(existing, 'node_modules/private-dep/node_modules/nested-dep/index.js'), 'utf8'), 'module.exports = "private closure"\n')
  assert.equal(await readFile(result.provenance, 'utf8'), await readFile(imported.provenance, 'utf8'))
  await rename(previousProfile, previousProfile + '.retained')
  assert.deepEqual(await verifyHistoricalPluginImports({ ...f, profile }), [{ id, version: '0.2.2', digest: f.digest }])
})

test('a corrupt imported snapshot blocks restore before touching the candidate generation', async t => {
  const f = await fixture(t), imported = await importHistoricalPlugin(f)
  const profile = join(f.home, 'profiles/rollback'), existing = join(profile, 'node_modules', id)
  await mkdir(existing, { recursive: true }); await writeFile(join(existing, 'keep.txt'), 'current generation')
  await writeFile(join(imported.path, 'docs/original.txt'), 'corrupt signed historical bytes')
  await assert.rejects(restoreHistoricalPluginSnapshot({ ...f, profile, previousProfile: f.profile }), /signed size or SHA-256 mismatch/u)
  assert.equal(await readFile(join(existing, 'keep.txt'), 'utf8'), 'current generation')
  assert.equal(await restoreHistoricalPluginSnapshot({ ...f, profile, previousProfile: join(f.home, 'no-such-snapshot') }), undefined)
})

test('explicit replacement archives only its generated provenance and keeps rollback evidence', async t => {
  const f = await fixture(t), imported = await importHistoricalPlugin(f)
  const original = await readFile(imported.provenance, 'utf8')
  const destination = await archiveHistoricalPluginProvenance(f)
  assert.equal(await readFile(destination, 'utf8'), original)
  await assert.rejects(lstat(imported.provenance), { code: 'ENOENT' })
  assert.equal(await readFile(join(imported.path, 'docs/original.txt'), 'utf8'), 'original signed asset')
  assert.equal(await archiveHistoricalPluginProvenance(f), undefined)
  assert.deepEqual(await verifyHistoricalPluginImports(f), [])
})
