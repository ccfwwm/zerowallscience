import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { mkdtemp, mkdir, readFile, rm, stat, writeFile, rename, realpath, symlink, cp, readdir, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { carrierIndex, carrierName, offlineContentDigest, readCarrierFile } from '../../tools/commands/offline-carrier.mjs'
import { offlineFiles, profileCarrier, readOfflineReceipt, verifiedGeneration, verifyOfflineProfile } from '../../tools/commands/offline-profile.mjs'
import { copyProfileTree } from '../../tools/commands/profile-copy.mjs'
import { repairProfileLayout } from '../../tools/commands/profile-layout.mjs'
import { materializationFile, verifyMaterializedProfile } from '../../tools/commands/profile-materialization.mjs'
import { createResourceManager } from '../../tools/commands/resource-manager.mjs'
import { initializeProfile } from '../../tools/commands/profile.mjs'
import { signCatalog, fileDigest } from '../../tools/commands/resource-catalog.mjs'
const { createPackageWithOptions } = createRequire(new URL('../../desktop/package.json', import.meta.url))('@electron/asar')
const target = { desktopVersion: '8.0.9', dshVersion: '0.2.0-rc.2', dshCommit: 'a'.repeat(40), platform: 'win32', architecture: 'x64' }

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'zws-carrier-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const input = join(root, 'input'), source = join(root, 'source'), home = join(root, '用户 配置')
  const id = '@zerowallscience/plugin-base', defaults = [id]
  await mkdir(join(input, 'node_modules', id), { recursive: true })
  await mkdir(join(input, 'node_modules', 'shared'), { recursive: true })
  await writeFile(join(input, 'node_modules', id, 'package.json'), JSON.stringify({ name: id, version: '0.2.0', main: './index.js', zerowall: { desktop: { min: '8.0.9' } } }))
  await writeFile(join(input, 'node_modules', id, 'index.js'), 'module.exports = require("shared")\n')
  await writeFile(join(input, 'node_modules/shared/package.json'), '{"name":"shared","version":"1.0.0","main":"index.js"}')
  await writeFile(join(input, 'node_modules/shared/index.js'), 'module.exports = { ready: true }\n')
  await mkdir(source)
  await createPackageWithOptions(input, join(source, carrierName), { unpackDir: 'node_modules/@zerowallscience/plugin-base' })
  const files = (await offlineFiles(join(input, 'node_modules'), 'modules/')).sort((a,b) => a.path.localeCompare(b.path))
  const payloadFiles = [{ path: carrierName, size: (await stat(join(source, carrierName))).size, sha256: await fileDigest(join(source, carrierName)) }, ...await offlineFiles(join(source, carrierName + '.unpacked'), carrierName + '.unpacked/')].sort((a,b) => a.path.localeCompare(b.path))
  const pair = generateKeyPairSync('ed25519'), keys = { test: pair.publicKey }
  const unsigned = { schema: 2, kind: 'offline-profile', profileArchitecture: 7, applicationVersion: '8.0.9', buildId: 'first', dshCommit: target.dshCommit, dshRange: { min: target.dshVersion, max: target.dshVersion }, desktopRange: { min: '8.0.9' }, platform: ['win32'], architecture: ['x64'], plugins: [{ id, version: '0.2.0' }], files, payloadFiles, defaultPatch: [] }
  unsigned.contentDigest = offlineContentDigest(unsigned)
  await writeFile(join(source, 'receipt.json'), JSON.stringify(signCatalog(unsigned, pair.privateKey, 'test')))
  await initializeProfile(home, defaults)
  const phases = []
  const manager = createResourceManager({ home, keys, target, defaultPlugins: defaults, onOfflinePhase: event => phases.push(event), stopHost: async () => {}, startHost: async () => {}, callHost: async () => ({ ready: true, entries: [] }) })
  return { root, home, source, keys, unsigned, pair, id, manager, phases }
}

test('signed schema 2 history uses its original range and exact DSH identity across a desktop upgrade', async t => {
  const f = await fixture(t), upgraded = { ...target, desktopVersion: '8.0.10' }
  const before = await readFile(join(f.source, 'receipt.json'), 'utf8')
  const accepted = await readOfflineReceipt(f.source, f.keys, upgraded, { generation: true })
  assert.equal(accepted.receipt.applicationVersion, target.desktopVersion)
  assert.deepEqual(accepted.receipt.desktopRange, f.unsigned.desktopRange)
  assert.equal(await readFile(join(f.source, 'receipt.json'), 'utf8'), before)
  await assert.rejects(readOfflineReceipt(f.source, f.keys, { ...upgraded, dshCommit: 'b'.repeat(40) }, { generation: true }), error => error.code === 'OFFLINE_PROFILE_MISMATCH'
    && error.diagnostics.receiptDshCommit === target.dshCommit && error.diagnostics.expectedDshCommit === 'b'.repeat(40))
  await assert.rejects(readOfflineReceipt(f.source, f.keys, { ...upgraded, dshVersion: '0.2.1' }, { generation: true }), /different exact runtime/u)
  const incompatible = { ...f.unsigned, desktopRange: { min: target.desktopVersion, max: target.desktopVersion } }
  incompatible.contentDigest = offlineContentDigest(incompatible)
  await writeFile(join(f.source, 'receipt.json'), JSON.stringify(signCatalog(incompatible, f.pair.privateKey, 'test')))
  await assert.rejects(readOfflineReceipt(f.source, f.keys, upgraded, { generation: true }), /different exact runtime/u)
  await assert.rejects(readOfflineReceipt(f.source, f.keys, upgraded), /different exact runtime/u)
})

test('v2 carrier binds packed and physical bytes and rejects archive or unpacked corruption', async t => {
  const f = await fixture(t)
  const verified = await verifyOfflineProfile(f.source, f.keys, target)
  assert.equal(verified.digest, f.unsigned.contentDigest)
  assert.equal((await carrierIndex(f.source)).rows.length, 4)
  assert.match((await readCarrierFile(f.source, 'modules/shared/index.js')).toString(), /ready/)
  const path = join(f.source, carrierName), bytes = await readFile(path)
  bytes[bytes.length - 1] ^= 1
  await writeFile(path, bytes)
  await assert.rejects(verifyOfflineProfile(f.source, f.keys, target), /mismatch/)
  bytes[bytes.length - 1] ^= 1
  await writeFile(path, bytes)
  await writeFile(join(f.source, carrierName + '.unpacked/node_modules', f.id, 'index.js'), 'corrupt')
  await assert.rejects(verifyOfflineProfile(f.source, f.keys, target), /mismatch/)
})

test('stale physical assets from an in-place upgrade block activation without weakening signed file-set checks', async t => {
  const f = await fixture(t)
  const before = await readFile(join(f.home, 'profiles/web/package.json'))
  const stale = join(f.source, carrierName + '.unpacked/node_modules/retired-presentation/old-hash.js')
  await mkdir(join(stale, '..'), { recursive: true })
  await writeFile(stale, 'old installer asset')
  await assert.rejects(f.manager.repairOffline(f.source), /file set mismatch/)
  assert.deepEqual(await readFile(join(f.home, 'profiles/web/package.json')), before)
})

test('Desktop rebuild and compatible patch upgrade reuse generation without activation or copying', async t => {
  const f = await fixture(t)
  assert.equal((await f.manager.repairOffline(f.source)).repaired, true)
  const manifestFile = join(f.home, 'profiles/web/package.json'), before = await readFile(manifestFile)
  const changedEnvelope = { ...f.unsigned, buildId: 'second', applicationVersion: '8.0.10', builtAt: new Date().toISOString() }
  assert.equal(offlineContentDigest(changedEnvelope), f.unsigned.contentDigest)
  await writeFile(join(f.source, 'receipt.json'), JSON.stringify(signCatalog(changedEnvelope, f.pair.privateKey, 'test')))
  let activated = false
  const next = createResourceManager({ home: f.home, keys: f.keys, target: { ...target, desktopVersion: '8.0.10' }, defaultPlugins: [f.id], onOfflinePhase: event => f.phases.push(event), stopHost: async () => { activated = true } })
  assert.equal((await next.repairOffline(f.source)).repaired, false)
  assert.equal(activated, false)
  assert.deepEqual(await readFile(manifestFile), before)
  assert.equal(f.phases.filter(event => event.phase === 'offline-copy' && event.state === 'started').length, 0)
  assert.equal(f.phases.filter(event => event.phase === 'profile-prepare' && event.state === 'started').length, 1)
})

test('candidate copying reuses signed fixed-root metadata without an active archive', async t => {
  const f = await fixture(t)
  await f.manager.repairOffline(f.source)
  const active = join(f.home, 'profiles/web')
  const candidate = join(f.home, 'profiles/copy-fixture')
  await copyProfileTree(active, candidate)
  await repairProfileLayout(candidate, { from: active, home: f.home })
  const reused = await verifyMaterializedProfile({ profile: candidate, keys: f.keys, target, expected: [f.id], digest: f.unsigned.contentDigest })
  assert.equal(reused?.digest, f.unsigned.contentDigest)
})

test('first preparation rejects changed source bytes without activating a profile', async t => {
  const f = await fixture(t)
  const active = join(f.home, 'profiles/web/package.json'), before = await readFile(active)
  const path = join(f.source, carrierName), bytes = await readFile(path)
  bytes[bytes.length - 1] ^= 1
  await writeFile(path, bytes)
  await assert.rejects(f.manager.repairOffline(f.source), /mismatch/)
  assert.deepEqual(await readFile(active), before)
  await assert.rejects(stat(join(f.home, 'resources/offline', f.unsigned.contentDigest)), { code: 'ENOENT' })
})

test('a changed signed runtime switches owned links even when plugin semver is unchanged', async t => {
  const f = await fixture(t)
  await f.manager.repairOffline(f.source)
  const input = join(f.root, 'input'), code = 'module.exports = { ready: true, revision: 2 }\n'
  await writeFile(join(input, 'node_modules', f.id, 'index.js'), code)
  await createPackageWithOptions(input, join(f.source, carrierName), { unpackDir: 'node_modules/@zerowallscience/plugin-base' })
  const files = (await offlineFiles(join(input, 'node_modules'), 'modules/')).sort((a,b) => a.path.localeCompare(b.path))
  const payloadFiles = [{ path: carrierName, size: (await stat(join(f.source, carrierName))).size, sha256: await fileDigest(join(f.source, carrierName)) }, ...await offlineFiles(join(f.source, carrierName + '.unpacked'), carrierName + '.unpacked/')].sort((a,b) => a.path.localeCompare(b.path))
  const changed = { ...f.unsigned, files, payloadFiles }
  changed.contentDigest = offlineContentDigest(changed)
  await writeFile(join(f.source, 'receipt.json'), JSON.stringify(signCatalog(changed, f.pair.privateKey, 'test')))
  assert.equal((await f.manager.repairOffline(f.source)).repaired, true)
  const manifest = JSON.parse(await readFile(join(f.home, 'profiles/web/package.json')))
  assert.equal(manifest.zerowall.offlineGeneration, changed.contentDigest)
  assert.equal(await readFile(join(f.home, 'profiles/web/node_modules', f.id, 'index.js'), 'utf8'), code)
})

test('missing required entry repairs an owned generation atomically', async t => {
  const f = await fixture(t)
  await f.manager.repairOffline(f.source)
  const entry = join(f.home, 'profiles/web/node_modules', f.id, 'index.js')
  await rm(entry)
  assert.equal((await f.manager.repairOffline(f.source)).repaired, true)
  assert.match(await readFile(entry, 'utf8'), /require/)
})

test('damaged cached signature repairs only from a fully authenticated installer source', async t => {
  const f = await fixture(t)
  await f.manager.repairOffline(f.source)
  const cached = join(f.home, 'profiles/web', materializationFile)
  const document = JSON.parse(await readFile(cached, 'utf8'))
  document.receipt.buildId = 'tampered'
  await writeFile(cached, JSON.stringify(document))
  assert.equal((await f.manager.repairOffline(f.source)).repaired, true)
  assert.equal(JSON.parse(await readFile(cached, 'utf8')).receipt.buildId, 'first')
  document.receipt.applicationVersion = 'tampered'
  await writeFile(join(f.source, 'receipt.json'), JSON.stringify(document.receipt))
  await assert.rejects(f.manager.repairOffline(f.source), /signature/i)
})

test('an independently installed older plugin takes precedence over the offline seed', async t => {
  const f = await fixture(t)
  const installed = join(f.home, 'profiles/web/node_modules', f.id)
  await mkdir(installed, { recursive: true })
  const bytes = JSON.stringify({ name: f.id, version: '0.1.0', main: 'index.js' })
  await writeFile(join(installed, 'package.json'), bytes)
  await writeFile(join(installed, 'index.js'), 'module.exports = "independent"')
  const result = await f.manager.repairOffline(f.source)
  assert.deepEqual(result.changed, [])
  assert.equal(await readFile(join(installed, 'package.json'), 'utf8'), bytes)
  assert.equal(await readFile(join(installed, 'index.js'), 'utf8'), 'module.exports = "independent"')
})

test('8.3.5 legacy links migrate inside profile while retained pins, settings and rollback remain independent', async t => {
  const f = await fixture(t)
  await f.manager.repairOffline(f.source)
  const active = join(f.home, 'profiles/web'), file = join(active, 'package.json')
  const manifest = JSON.parse(await readFile(file))
  // Recreate the actual 8.3.5 layout rather than seeding through the new copier.
  const packagePath = join(active, 'node_modules', f.id)
  await rm(packagePath, {recursive:true})
  await cp(f.source, join(f.home, 'resources/offline', f.unsigned.contentDigest), { recursive: true })
  const oldModules = join(f.home, 'resources/offline', f.unsigned.contentDigest, carrierName + '.unpacked/node_modules')
  await symlink(join(oldModules, f.id), packagePath, process.platform === 'win32' ? 'junction' : 'dir')
  const pinned = 'pinned-third-party', oldPinned = join(oldModules, pinned)
  await mkdir(oldPinned, { recursive: true })
  await writeFile(join(oldPinned, 'package.json'), JSON.stringify({name:pinned, version:'9.0.0'}))
  // This package is independently retained; use a physical package pin fixture.
  await mkdir(join(active,'node_modules',pinned), {recursive:true})
  await cp(oldPinned,join(active,'node_modules',pinned),{recursive:true})
  manifest.dependencies = { [f.id]: 'file:' + join(oldModules, f.id).replaceAll('\\','/'), [pinned]:'9.0.0', 'dsh-univer-office':'0.3.7', 'dsh-genui':'0.12.1' }
  manifest.dsh.profile.bundles.push('dsh-univer-office','dsh-genui',pinned)
  delete manifest.zerowall.profileLayout
  await writeFile(file,JSON.stringify(manifest))
  for(const id of ['dsh-univer-office','dsh-genui']) await symlink(join(oldModules,f.id),join(active,'node_modules',id),process.platform === 'win32' ? 'junction' : 'dir')
  const shadow = 'old-plugin.previous-00000000-0000-4000-8000-000000000000'
  await mkdir(join(active,'node_modules',shadow),{recursive:true})
  await writeFile(join(active,'node_modules',shadow,'old'),'retained in rollback')
  await writeFile(join(active,'settings.json'),'{"model":"chosen","effort":"max"}')
  await writeFile(join(f.home,'resources/plugins/selection.json'),JSON.stringify({pinned:{[pinned]:'9.0.0'},disabled:['custom-disabled']}))
  assert.equal((await f.manager.repairOffline(f.source)).repaired,true)
  const after = JSON.parse(await readFile(file))
  assert.equal(after.zerowall.profileLayout,3)
  assert(!after.dsh.profile.bundles.some(id => ['dsh-univer-office','dsh-genui'].includes(id)))
  assert.equal(await realpath(packagePath),packagePath)
  assert.equal(JSON.parse(await readFile(join(active,'node_modules',pinned,'package.json'))).version,'9.0.0')
  assert.equal(await readFile(join(active,'settings.json'),'utf8'),'{"model":"chosen","effort":"max"}')
  const names=await readdir(join(active,'node_modules'))
  assert(!names.some(name=>name.includes('.previous-') || name==='dsh-genui' || name==='dsh-univer-office'))
  // Cache corruption cannot mutate active bytes, and ordinary launch never
  // falls back into that supply directory after the migration.
  await rename(join(f.home,'resources/offline'),join(f.home,'resources/offline-retained'))
  assert.equal((await f.manager.repairOffline(f.source)).repaired,false)
  assert.match(await readFile(join(packagePath,'index.js'),'utf8'),/require/)
})

test('Electron resolves physical plugin entry plus archived CJS and ESM dependencies', { skip: !process.env.ZEROWALL_TEST_ELECTRON }, async t => {
  const f = await fixture(t)
  await f.manager.repairOffline(f.source)
  const entry = pathToFileURL(join(f.home, 'profiles/web/node_modules', f.id, 'index.js')).href
  const script = `const plugin = await import(${JSON.stringify(entry)}); const shared = await import('shared'); if (!plugin.default.ready || !shared.default.ready) throw new Error('Archived dependency failed'); console.log('CARRIER_RESOLUTION_OK')`
  const output = execFileSync(process.env.ZEROWALL_TEST_ELECTRON, ['--import', new URL('../../desktop/build/runtime-esm-register.mjs', import.meta.url).href, '--input-type=module', '--eval', script], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', DSH_HOME: f.home, ZEROWALL_RUNTIME_ANCHOR: pathToFileURL(join(f.root, 'anchor/package.json')).href }, windowsHide: true, encoding: 'utf8', timeout: 20_000 })
  assert.match(output, /CARRIER_RESOLUTION_OK/)
})

test('physical ESM importers preserve archived nested instances, import conditions and package imports', { skip: !process.env.ZEROWALL_TEST_ELECTRON }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'zws-esm-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const input = join(root, 'input'), home = join(root, 'home'), digest = 'a'.repeat(64)
  const output = join(home, 'resources/offline', digest)
  for (const [id, version] of [['left', '1'], ['right', '2']]) {
    const plugin = join(input, 'node_modules', id)
    const dep = join(plugin, 'node_modules/carrier-peer')
    await mkdir(dep, { recursive: true })
    await writeFile(join(plugin, 'package.json'), JSON.stringify({ name: id, type: 'module', imports: { '#peer': 'carrier-peer' } }))
    await writeFile(join(plugin, 'entry.mjs'), 'import value from "#peer"; export default value')
    await writeFile(join(dep, 'package.json'), JSON.stringify({ name: 'carrier-peer', type: 'module', exports: { '.': { import: './esm.js', require: './cjs.cjs' } } }))
    await writeFile(join(dep, 'esm.js'), `export default ${JSON.stringify(version)}`)
    await writeFile(join(dep, 'cjs.cjs'), 'module.exports = "wrong-condition"')
  }
  await mkdir(output, { recursive: true })
  await createPackageWithOptions(input, join(output, carrierName), { unpack: '**/entry.mjs' })
  await mkdir(join(home, 'profiles/web'), { recursive: true })
  await writeFile(join(home, 'profiles/web/package.json'), JSON.stringify({ zerowall: { offlineGeneration: digest } }))
  const entries = ['left', 'right'].map(id => pathToFileURL(join(output, carrierName + '.unpacked/node_modules', id, 'entry.mjs')).href)
  const script = `const values = await Promise.all(${JSON.stringify(entries)}.map(entry => import(entry).then(m => m.default))); if (values.join(',') !== '1,2') throw new Error('Wrong peer instances: ' + values); console.log('CARRIER_ESM_CONTEXT_OK')`
  const stdout = execFileSync(process.env.ZEROWALL_TEST_ELECTRON, ['--import', new URL('../../desktop/build/runtime-esm-register.mjs', import.meta.url).href, '--input-type=module', '--eval', script], {
    cwd: root, env: { ...process.env, NODE_PATH: '', ELECTRON_RUN_AS_NODE: '1', DSH_HOME: home, ZEROWALL_RUNTIME_ANCHOR: pathToFileURL(join(root, 'anchor/package.json')).href }, windowsHide: true, encoding: 'utf8', timeout: 20_000,
  })
  assert.match(stdout, /CARRIER_ESM_CONTEXT_OK/)
})

test('Electron verifies raw carrier bytes and atomically prepares its first generation', { skip: !process.env.ZEROWALL_TEST_ELECTRON }, async t => {
  const f = await fixture(t)
  const publicKeys = join(f.root, 'public-keys.json')
  await writeFile(publicKeys, JSON.stringify({ test: f.pair.publicKey.export({ format: 'pem', type: 'spki' }) }))
  const script = `
    import { readFile } from 'node:fs/promises';
    import { verifyOfflineProfile } from ${JSON.stringify(new URL('../../tools/commands/offline-profile.mjs', import.meta.url).href)};
    import { createResourceManager } from ${JSON.stringify(new URL('../../tools/commands/resource-manager.mjs', import.meta.url).href)};
    const keys = JSON.parse(await readFile(${JSON.stringify(publicKeys)}));
    const target = ${JSON.stringify(target)}, source = ${JSON.stringify(f.source)};
    await verifyOfflineProfile(source, keys, target);
    const manager = createResourceManager({ home: ${JSON.stringify(f.home)}, keys, target, defaultPlugins: [${JSON.stringify(f.id)}],
      stopHost: async () => {}, startHost: async () => {}, callHost: async () => ({ ready: true, entries: [] }) });
    if (!(await manager.repairOffline(source)).repaired) throw new Error('First generation was not prepared');
    if ((await manager.repairOffline(source)).repaired) throw new Error('Verified generation was not reused');
    console.log('CARRIER_PHYSICAL_VERIFY_OK');
  `
  const output = execFileSync(process.env.ZEROWALL_TEST_ELECTRON, ['--input-type=module', '--eval', script], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, encoding: 'utf8', timeout: 20_000 })
  assert.match(output, /CARRIER_PHYSICAL_VERIFY_OK/)
})
