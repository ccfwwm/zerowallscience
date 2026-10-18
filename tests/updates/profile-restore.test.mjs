import test from 'node:test'
import assert from 'node:assert/strict'
import { lstat, mkdtemp, mkdir, readFile, realpath, rename, symlink, writeFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import { generateKeyPairSync } from 'node:crypto'
import { restorePackageClosure } from '../../tools/commands/profile-restore.mjs'
import { repairProfileLayout } from '../../tools/commands/profile-layout.mjs'
import { carrierName, offlineContentDigest } from '../../tools/commands/offline-carrier.mjs'
import { offlineFiles } from '../../tools/commands/offline-profile.mjs'
import { signCatalog, fileDigest } from '../../tools/commands/resource-catalog.mjs'
import { verifyHistoricalPluginImports } from '../../tools/commands/historical-plugin.mjs'

const execute = promisify(execFile)
const { createPackageWithOptions } = createRequire(new URL('../../desktop/package.json', import.meta.url))('@electron/asar')

test('rollback checks shared dependency ranges and optional metadata without accepting present invalid packages', async t => {
  const home = await mkdtemp(join(tmpdir(), 'zws-restore-shared-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  const previousProfile = join(home, 'resources/history/old'), plugin = join(previousProfile, 'node_modules/plugin'), runtimeModules = join(home, 'runtime/node_modules')
  const target = { desktopVersion: '8.3.6', dshVersion: '0.2.0-rc.2', dshCommit: 'a'.repeat(40), platform: 'win32', architecture: 'x64' }
  await mkdir(plugin, { recursive: true }); await writeFile(join(plugin, 'index.cjs'), 'module.exports=42')
  let sequence = 0
  async function restore(fields) {
    await writeFile(join(plugin, 'package.json'), JSON.stringify({ name: 'plugin', version: '1.0.0', main: 'index.cjs', ...fields }))
    return restorePackageClosure({ candidate: join(home, 'profiles/candidate-' + sequence++), previousProfile, packageIds: ['plugin'], home, target, runtimeModules, local: true })
  }
  async function runtimePackage(id, version) {
    const root = join(runtimeModules, id)
    await mkdir(root, { recursive: true }); await writeFile(join(root, 'package.json'), JSON.stringify({ name: id, version, main: 'index.cjs' })); await writeFile(join(root, 'index.cjs'), 'module.exports={}')
    return root
  }
  await runtimePackage('@deepseek-ai/dsh-tools', target.dshVersion)
  await runtimePackage('@deepseek-ai/cordis', '4.0.4')
  const optional = '@deepseek-ai/dsh-client-runtime', range = '>=0.1.0-rc.6 <0.3.0-0'
  const fields = { dependencies: { '@deepseek-ai/dsh-tools': '>=0.1.5-alpha.1', '@deepseek-ai/cordis': '^4.0.4' }, peerDependencies: { [optional]: range }, peerDependenciesMeta: { [optional]: { optional: true } } }
  assert.equal((await restore(fields)).get('plugin'), 'link:./node_modules/plugin')
  await runtimePackage(optional, '0.3.0')
  await assert.rejects(restore(fields), /version is incompatible/u)
  const vendor = 'optional-shared-vendor', optionalFields = { optionalDependencies: { [vendor]: '^1.0.0' } }
  assert.equal((await restore(optionalFields)).get('plugin'), 'link:./node_modules/plugin')
  const root = await runtimePackage(vendor, '2.0.0')
  await assert.rejects(restore(optionalFields), /version is incompatible/u)
  await writeFile(join(root, 'package.json'), '{ malformed')
  await assert.rejects(restore(optionalFields), SyntaxError)
  await runtimePackage(vendor, '1.0.0'); await rm(join(root, 'index.cjs'))
  await assert.rejects(restore(optionalFields), /entry is missing/u)
  await assert.rejects(restore({ dependencies: { 'missing-required': '^1.0.0' } }), /dependency is missing/u)
})

test('rollback copies a history package closure into candidate-owned bytes', async t => {
  const home = await mkdtemp(join(tmpdir(), 'zws-restore-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  const history = join(home, 'resources/history/old'), previous = join(history, 'node_modules'), candidate = join(home, 'profiles/zerowall')
  const plugin = join(history, 'physical/plugin'), dependency = join(history, 'physical/dependency')
  await mkdir(join(plugin, 'node_modules'), { recursive: true }); await mkdir(dependency, { recursive: true }); await mkdir(previous, { recursive: true }); await mkdir(join(candidate, 'node_modules'), { recursive: true })
  await writeFile(join(plugin, 'package.json'), JSON.stringify({ name: 'plugin', version: '1.0.0', dependencies: { dependency: '1.0.0' } }))
  await writeFile(join(dependency, 'package.json'), JSON.stringify({ name: 'dependency', version: '1.0.0' }))
  await symlink(plugin, join(previous, 'plugin'), process.platform === 'win32' ? 'junction' : 'dir')
  await symlink(dependency, join(plugin, 'node_modules/dependency'), process.platform === 'win32' ? 'junction' : 'dir')
  const specs = await restorePackageClosure({ candidate, previousProfile: history, packageIds: ['plugin'], home, local: true })
  const restored = join(candidate, 'node_modules/plugin')
  assert.equal(JSON.parse(await readFile(join(restored, 'package.json'))).version, '1.0.0')
  assert(!((await realpath(restored)).includes('resources\\history') || (await realpath(restored)).includes('resources/history')))
  assert.equal(specs.get('plugin'), 'link:./node_modules/plugin')
  assert.equal((await lstat(restored)).isSymbolicLink(), false)
  const dependencyRoot = await realpath(join(restored, 'node_modules/dependency'))
  assert(dependencyRoot.startsWith(join(candidate, 'node_modules/.zerowall-restores')))
  await rm(history, { recursive: true })
  assert.equal(JSON.parse(await readFile(join(restored, 'node_modules/dependency/package.json'))).version, '1.0.0')
})

test('real bundled pnpm sibling dependencies and peer instances survive rollback activation independently of history', async t => {
  const home = await mkdtemp(join(tmpdir(), 'zws-restore-pnpm-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  const previousProfile = join(home, 'resources/history/old'), candidate = join(home, 'profiles/zerowall')
  const input = join(home, 'input'), dependency = join(input, 'dependency'), peer = join(input, 'peer'), plugin = join(input, 'plugin')
  for (const [dir, name] of [[dependency, 'dependency'], [peer, 'peer']]) {
    await mkdir(dir, { recursive: true }); await writeFile(join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0', main: 'index.cjs' })); await writeFile(join(dir, 'index.cjs'), 'module.exports="1.0.0"')
  }
  await mkdir(plugin, { recursive: true }); await writeFile(join(plugin, 'package.json'), JSON.stringify({ name: 'plugin', version: '1.0.0', main: 'index.cjs', dependencies: { dependency: 'file:' + dependency }, peerDependencies: { peer: '1.0.0' } })); await writeFile(join(plugin, 'index.cjs'), 'module.exports={dependency:require("dependency"),peer:require("peer")}')
  await mkdir(previousProfile, { recursive: true }); await writeFile(join(previousProfile, 'package.json'), '{"private":true}')
  const pnpm = resolve('deepseek-harness/apps/desktop/node_modules/pnpm/bin/pnpm.cjs'), executor = resolve('tools/commands/pnpm-executor.mjs')
  await execute(process.execPath, [executor, pnpm, 'add', 'file:' + plugin, 'file:' + peer, '--offline', '--ignore-scripts', '--config.node-linker=isolated', '--config.auto-install-peers=false'], { cwd: previousProfile, env: { ...process.env, DSH_HOME: home }, windowsHide: true })
  assert((await realpath(join(previousProfile, 'node_modules/plugin'))).includes('.pnpm'))
  await mkdir(join(candidate, 'node_modules/dependency'), { recursive: true }); await writeFile(join(candidate, 'node_modules/dependency/package.json'), '{"name":"dependency","version":"2.0.0"}')
  const specs = await restorePackageClosure({ candidate, previousProfile, packageIds: ['plugin'], home, local: true })
  await writeFile(join(candidate, 'package.json'), JSON.stringify({ private: true, dependencies: Object.fromEntries(specs) }))
  const active = join(home, 'profiles/web'); await rename(candidate, active); await repairProfileLayout(active, { from: candidate, home })
  await rm(previousProfile, { recursive: true }); await rm(input, { recursive: true })
  const require = createRequire(join(active, 'package.json'))
  assert.deepEqual(require('plugin'), { dependency: '1.0.0', peer: '1.0.0' })
  assert.equal(JSON.parse(await readFile(join(active, 'node_modules/dependency/package.json'))).version, '2.0.0')
})

test('legacy signed ASAR and imported physical snapshots preserve authenticated rollback closures', async t => {
  const home = await mkdtemp(join(tmpdir(), 'zws-restore-carrier-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  const input = join(home, 'input'), source = join(home, 'source'), previousProfile = join(home, 'resources/history/old'), candidate = join(home, 'profiles/zerowall')
  await mkdir(join(input, 'node_modules/plugin'), { recursive: true }); await mkdir(join(input, 'node_modules/shared'), { recursive: true }); await mkdir(source)
  await writeFile(join(input, 'node_modules/plugin/package.json'), '{"name":"plugin","version":"1.0.0","main":"index.cjs","dependencies":{"shared":"1.0.0"}}')
  await writeFile(join(input, 'node_modules/plugin/index.cjs'), 'module.exports=require("shared")')
  await writeFile(join(input, 'node_modules/shared/package.json'), '{"name":"shared","version":"1.0.0","main":"index.cjs"}')
  await writeFile(join(input, 'node_modules/shared/index.cjs'), 'module.exports=42')
  await createPackageWithOptions(input, join(source, carrierName), { unpackDir: 'node_modules/plugin' })
  const target = { desktopVersion: '8.3.6', dshVersion: '0.2.0-rc.2', dshCommit: 'a'.repeat(40), platform: 'win32', architecture: 'x64' }
  const receipt = { schema: 2, kind: 'offline-profile', profileArchitecture: 7, applicationVersion: '8.3.5', buildId: 'legacy', dshCommit: target.dshCommit, dshRange: { min: target.dshVersion, max: target.dshVersion }, desktopRange: { min: '8.3.5' }, platform: ['win32'], architecture: ['x64'], plugins: [{ id: 'plugin', version: '1.0.0' }], defaultPatch: [], files: await offlineFiles(join(input, 'node_modules'), 'modules/'), payloadFiles: [{ path: carrierName, size: (await stat(join(source, carrierName))).size, sha256: await fileDigest(join(source, carrierName)) }, ...await offlineFiles(join(source, carrierName + '.unpacked'), carrierName + '.unpacked/')] }
  receipt.contentDigest = offlineContentDigest(receipt)
  const pair = generateKeyPairSync('ed25519'), keys = { test: pair.publicKey }
  await writeFile(join(source, 'receipt.json'), JSON.stringify(signCatalog(receipt, pair.privateKey, 'test')))
  const legacyCarrier = join(home, 'resources/offline', receipt.contentDigest); await mkdir(join(home, 'resources/offline'), { recursive: true }); await rename(source, legacyCarrier)
  await mkdir(join(previousProfile, 'node_modules'), { recursive: true }); await symlink(join(legacyCarrier, carrierName + '.unpacked/node_modules/plugin'), join(previousProfile, 'node_modules/plugin'), process.platform === 'win32' ? 'junction' : 'dir')
  const specs = await restorePackageClosure({ candidate, previousProfile, packageIds: ['plugin'], home, keys, target, local: true })
  assert.equal(specs.get('plugin'), 'link:./node_modules/plugin')
  assert.equal(await realpath(join(candidate, 'node_modules/plugin')), join(candidate, 'node_modules/plugin'))
  assert.equal((await lstat(join(candidate, 'node_modules/plugin'))).isSymbolicLink(), false)
  assert.equal(createRequire(join(candidate, 'package.json'))('plugin'), 42)
  assert.equal((await verifyHistoricalPluginImports({ profile: candidate, keys, target })).length, 1)
  await writeFile(join(legacyCarrier, carrierName + '.unpacked/node_modules/plugin/index.cjs'), 'selected corrupt bytes')
  await assert.rejects(restorePackageClosure({ candidate: join(home, 'profiles/corrupt'), previousProfile, packageIds: ['plugin'], home, keys, target, local: true }), /mismatch/)
  const importedSnapshot = join(home, 'resources/history/imported'), fresh = join(home, 'profiles/physical-rollback')
  await rename(candidate, importedSnapshot)
  await repairProfileLayout(importedSnapshot, { from: candidate, home })
  await rename(legacyCarrier, legacyCarrier + '.retained')
  const physicalSpecs = await restorePackageClosure({ candidate: fresh, previousProfile: importedSnapshot, packageIds: ['plugin'], home, keys, target, local: true })
  assert.equal(physicalSpecs.get('plugin'), 'link:./node_modules/plugin')
  assert.equal((await verifyHistoricalPluginImports({ profile: fresh, keys, target })).length, 1)
  await rename(importedSnapshot, importedSnapshot + '.retained')
  assert.equal(createRequire(join(fresh, 'package.json'))('plugin'), 42)
  assert.equal((await verifyHistoricalPluginImports({ profile: fresh, keys, target })).length, 1)
})
