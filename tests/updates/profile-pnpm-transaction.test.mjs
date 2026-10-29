import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, symlink, rm, realpath, readdir, lstat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'
import { beginDirectProfilePackageChange, beginProfilePackageChange, runProfilePnpmTransaction, recoverPnpmTransactions } from '../../tools/commands/profile-pnpm-transaction.mjs'
import { acquireProfileMutation } from '../../tools/commands/profile-mutation-lock.mjs'
import { createResourceManager } from '../../tools/commands/resource-manager.mjs'
import * as yaml from 'yaml'
import { holdWindowsFile, releaseWindowsFiles } from './plugin-lock-fixture.mjs'

const execute = promisify(execFile)
const pnpm = resolve('deepseek-harness/apps/desktop/node_modules/pnpm/bin/pnpm.cjs')
const executor = resolve('tools/commands/pnpm-executor.mjs')
const transactionModule = pathToFileURL(resolve('tools/commands/profile-pnpm-transaction.mjs')).href
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'zws-pnpm-candidate-'))
  t.after(async () => { await releaseWindowsFiles(t); await rm(root, { recursive: true, force: true, maxRetries: 5 }) })
  const profile = join(root, 'profiles/web')
  const retained = join(profile, 'node_modules/@dingyi222666/dsh-session-notification')
  const leaf = join(profile, 'node_modules/.zerowall-dependencies/node_modules/leaf')
  const addition = join(root, 'addition')
  for (const directory of [retained, leaf, addition, join(retained, 'node_modules')]) await mkdir(directory, { recursive: true })
  await writeFile(join(retained, 'package.json'), JSON.stringify({ name: '@dingyi222666/dsh-session-notification', version: '0.2.6', type: 'module', dependencies: { leaf: '1.0.0' } }))
  await writeFile(join(retained, 'index.js'), 'export { value } from "leaf"\n')
  await writeFile(join(leaf, 'package.json'), JSON.stringify({ name: 'leaf', version: '1.0.0', type: 'module', exports: './index.js' }))
  await writeFile(join(leaf, 'index.js'), 'export const value = "retained closure"\n')
  await symlink(leaf, join(retained, 'node_modules/leaf'), process.platform === 'win32' ? 'junction' : 'dir')
  await writeFile(join(addition, 'package.json'), JSON.stringify({ name: 'third-party', version: '1.0.0' }))
  await writeFile(join(profile, 'package.json'), JSON.stringify({ dependencies: { '@dingyi222666/dsh-session-notification': 'link:./node_modules/@dingyi222666/dsh-session-notification' }, dsh: { profile: { bundles: ['@dingyi222666/dsh-session-notification'] } }, zerowall: { profileLayout: 3 }, preserved: { model: 'user-selected', effort: 'max' } }))
  return { root, profile, addition, retained }
}

test('a nested DSH lifecycle authenticates the desktop transaction without acquiring or releasing its lease', async t => {
  const f = await fixture(t), release = await acquireProfileMutation(f.profile)
  try {
    const transaction = await beginDirectProfilePackageChange(f.profile, release)
    const resourceCandidateId = randomUUID(), file = join(f.profile, '.zerowall/resource-transaction.json')
    await mkdir(resolve(file, '..'), { recursive: true })
    const receipt = { id: resourceCandidateId, profile: f.profile, transactionId: transaction.id, direct: true, pid: release.ownerPid, token: release.ownerToken }
    await writeFile(file, JSON.stringify(receipt))
    assert.equal(await beginProfilePackageChange(f.profile, { resourceCandidateId }), undefined)
    await assert.rejects(acquireProfileMutation(f.profile), /PLUGIN_TRANSACTION_BUSY/)
    await assert.rejects(beginProfilePackageChange(f.profile, { resourceCandidateId: randomUUID() }), /RESOURCE_CANDIDATE_INVALID/)
    for (const change of [{ token: 'wrong-token' }, { pid: process.pid + 1 }, { profile: f.root }, { transactionId: randomUUID() }]) {
      await writeFile(file, JSON.stringify({ ...receipt, ...change }))
      await assert.rejects(beginProfilePackageChange(f.profile, { resourceCandidateId }))
    }
    await transaction.finish(false)
  } finally { await release() }
})

for (const accepted of [true, false]) test(`real DSH CLI under the desktop lease ${accepted ? 'installs' : 'rolls back after failed health'} without a nested lock conflict`, async t => {
  const f = await fixture(t), before = await readFile(join(f.profile, 'package.json'))
  const manager = createResourceManager({ home: resolve(f.profile, '../..'), yaml,
    stopHost: async () => {}, startHost: async options => { if (options && !accepted) throw new Error('fixture health failure') },
    runPlugin: async (args, generation, options = {}) => {
      await execute(process.execPath, [resolve('tools/commands/dsh.mjs'), 'plugin', '--profile', generation, ...args, '--offline', '--ignore-scripts'], {
        cwd: f.root, env: { ...process.env, DSH_HOME: resolve(f.profile, '../..'), ZEROWALL_RESOURCE_CANDIDATE_ID: options.resourceCandidateId }, windowsHide: true, timeout: 60_000,
      })
    },
  })
  const result = manager.mutate(['add', 'file:' + f.addition])
  if (accepted) {
    await result
    assert.equal(JSON.parse(await readFile(join(f.profile, 'node_modules/third-party/package.json'))).version, '1.0.0')
  } else {
    await assert.rejects(result, /fixture health failure/)
    assert.deepEqual(await readFile(join(f.profile, 'package.json')), before)
    await assert.rejects(lstat(join(f.profile, 'node_modules/third-party')), { code: 'ENOENT' })
  }
  assert.equal(await readFile(join(f.retained, 'index.js'), 'utf8'), 'export { value } from "leaf"\n')
  await assert.rejects(readFile(resolve(f.profile, '../.zerowall-plugin-mutation.lock')), { code: 'ENOENT' })
})

for (const accepted of [true, false]) test(`direct resource update preserves shared dependencies and ${accepted ? 'commits' : 'rolls back'} new dependency instances`, async t => {
  const f = await fixture(t), before = await readFile(join(f.profile, 'package.json'))
  const dependency = join(f.root, 'new-leaf')
  await mkdir(dependency)
  await writeFile(join(dependency, 'package.json'), JSON.stringify({ name: 'new-leaf', version: '2.0.0', type: 'module', exports: './index.js' }))
  await writeFile(join(dependency, 'index.js'), 'export const value = "new dependency"')
  await writeFile(join(f.addition, 'package.json'), JSON.stringify({ name: 'third-party', version: '1.0.1', type: 'module', dependencies: { 'new-leaf': 'file:' + dependency } }))
  await writeFile(join(f.addition, 'index.js'), 'export { value } from "new-leaf"')
  const release = await acquireProfileMutation(f.profile)
  try {
    const transaction = await beginDirectProfilePackageChange(f.profile, release)
    const resourceCandidateId = randomUUID()
    await mkdir(join(f.profile, '.zerowall'), { recursive: true })
    await writeFile(join(f.profile, '.zerowall/resource-transaction.json'), JSON.stringify({ id: resourceCandidateId, profile: f.profile, transactionId: transaction.id, direct: true, pid: release.ownerPid, token: release.ownerToken }))
    const result = await runProfilePnpmTransaction({ profile: f.profile, resourceCandidateId,
      args: ['add', 'file:' + f.addition, '--offline', '--ignore-scripts'],
      run: async (args, candidate) => {
        const output = await execute(process.execPath, [pnpm, ...args], { cwd: candidate, env: { ...process.env, CI: 'false' }, windowsHide: true })
        return { code: 0, tail: output.stdout }
      },
    })
    assert.equal(result.code, 0)
    const load = relativePath => execute(process.execPath, ['--input-type=module', '-e', `console.log((await import(${JSON.stringify(relativePath)})).value)`], { cwd: f.profile, windowsHide: true })
    assert.equal((await load('./node_modules/third-party/index.js')).stdout.trim(), 'new dependency')
    assert.equal((await load('./node_modules/@dingyi222666/dsh-session-notification/index.js')).stdout.trim(), 'retained closure')
    await transaction.finish(accepted)
    assert.equal((await load('./node_modules/@dingyi222666/dsh-session-notification/index.js')).stdout.trim(), 'retained closure')
    if (accepted) assert.equal((await load('./node_modules/third-party/index.js')).stdout.trim(), 'new dependency')
    else {
      assert.deepEqual(await readFile(join(f.profile, 'package.json')), before)
      await assert.rejects(lstat(join(f.profile, 'node_modules/third-party')), { code: 'ENOENT' })
    }
  } finally { await release() }
})

for (const state of ['rolled-back', 'complete', 'preparation-failed', 'preparing']) test(`recovery cleans an abandoned ${state} candidate while preserving the active profile`, async t => {
  const f = await fixture(t), before = await readFile(join(f.profile, 'package.json'))
  const candidate = join(f.root, 'profiles/zerowall-pnpm-11111111-1111-1111-1111-111111111111')
  const directory = join(f.profile, '.plugin-manager/package-transactions/22222222-2222-2222-2222-222222222222')
  await mkdir(candidate, { recursive: true })
  await mkdir(directory, { recursive: true })
  await writeFile(join(candidate, 'package.json'), '{}')
  await writeFile(join(directory, 'journal.json'), JSON.stringify({ state, pid: 2147483647, candidate, created: 1, items: [] }))
  await recoverPnpmTransactions(f.profile)
  await assert.rejects(lstat(candidate), { code: 'ENOENT' })
  assert.deepEqual(await readFile(join(f.profile, 'package.json')), before)
  assert.equal(JSON.parse(await readFile(join(directory, 'journal.json'))).state, state === 'preparing' ? 'preparation-failed' : state)
})

test('recovery preserves a candidate owned by a running preparation', async t => {
  const f = await fixture(t)
  const candidate = join(f.root, 'profiles/zerowall-pnpm-11111111-1111-1111-1111-111111111111')
  const directory = join(f.profile, '.plugin-manager/package-transactions/22222222-2222-2222-2222-222222222222')
  await mkdir(candidate, { recursive: true }); await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'journal.json'), JSON.stringify({ state: 'preparing', pid: process.pid, candidate, created: 1, items: [] }))
  await assert.rejects(recoverPnpmTransactions(f.profile), /still running/)
  assert((await lstat(candidate)).isDirectory())
})

test('tokenized recovery retains only the candidate matching the live mutation lease', async t => {
  const f = await fixture(t)
  const candidate = join(f.root, 'profiles/zerowall-pnpm-11111111-1111-1111-1111-111111111111')
  const directory = join(f.profile, '.plugin-manager/package-transactions/22222222-2222-2222-2222-222222222222')
  const token = 'live-owner-token'
  await mkdir(candidate, { recursive: true }); await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'journal.json'), JSON.stringify({ schema: 2, state: 'preparing', pid: process.pid, ownerToken: token, candidate, created: Date.now(), items: [] }))
  await writeFile(join(f.root, 'profiles/.zerowall-plugin-mutation.lock'), JSON.stringify({ pid: process.pid, token }))
  await assert.rejects(recoverPnpmTransactions(f.profile), /still running/u)
  assert((await lstat(candidate)).isDirectory())
})

test('tokenized recovery cleans a stale PID candidate without touching the active profile', async t => {
  const f = await fixture(t), before = await readFile(join(f.profile, 'package.json'))
  const candidate = join(f.root, 'profiles/zerowall-pnpm-11111111-1111-1111-1111-111111111111')
  const directory = join(f.profile, '.plugin-manager/package-transactions/22222222-2222-2222-2222-222222222222')
  await mkdir(candidate, { recursive: true }); await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'journal.json'), JSON.stringify({ schema: 2, state: 'preparing', pid: 2147483647, ownerToken: 'dead-owner', candidate, created: Date.now(), items: [] }))
  await writeFile(join(f.root, 'profiles/.zerowall-plugin-mutation.lock'), JSON.stringify({ pid: 2147483647, token: 'dead-owner' }))
  await recoverPnpmTransactions(f.profile)
  await assert.rejects(lstat(candidate), { code: 'ENOENT' })
  assert.deepEqual(await readFile(join(f.profile, 'package.json')), before)
  assert.equal(JSON.parse(await readFile(join(directory, 'journal.json'))).state, 'preparation-failed')
})

test('tokenized recovery rejects a live PID whose lock token belongs to a different transaction', async t => {
  const f = await fixture(t)
  const candidate = join(f.root, 'profiles/zerowall-pnpm-11111111-1111-1111-1111-111111111111')
  const directory = join(f.profile, '.plugin-manager/package-transactions/22222222-2222-2222-2222-222222222222')
  await mkdir(candidate, { recursive: true }); await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'journal.json'), JSON.stringify({ schema: 2, state: 'preparing', pid: process.pid, ownerToken: 'stale-token', candidate, created: Date.now(), items: [] }))
  await writeFile(join(f.root, 'profiles/.zerowall-plugin-mutation.lock'), JSON.stringify({ pid: process.pid, token: 'current-token' }))
  await recoverPnpmTransactions(f.profile)
  await assert.rejects(lstat(candidate), { code: 'ENOENT' })
  assert.equal(JSON.parse(await readFile(join(directory, 'journal.json'))).state, 'preparation-failed')
})

test('tokenized recovery preserves evidence and never cleans an out-of-profile candidate path', async t => {
  const f = await fixture(t)
  const outside = join(f.root, 'outside-candidate')
  const directory = join(f.profile, '.plugin-manager/package-transactions/22222222-2222-2222-2222-222222222222')
  await mkdir(outside, { recursive: true }); await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'journal.json'), JSON.stringify({ schema: 2, state: 'preparing', pid: 2147483647, ownerToken: 'dead-owner', candidate: outside, created: Date.now(), items: [] }))
  await recoverPnpmTransactions(f.profile)
  assert((await lstat(outside)).isDirectory())
  const state = JSON.parse(await readFile(join(directory, 'journal.json')))
  assert.equal(state.state, 'preparation-failed')
  assert.match(state.error, /Invalid transaction candidate path/u)
})

test('an untrusted lifecycle ID cannot bypass the profile mutation lease', async t => {
  const f = await fixture(t)
  let ran = false
  const run = async () => { ran = true; return { code: 0 } }
  await assert.rejects(runProfilePnpmTransaction({ profile: f.profile, args: ['install'], lifecycleId: '../escape', ownerPid: process.pid, run }), /PLUGIN_LIFECYCLE_INVALID/)
  const lifecycle = await beginProfilePackageChange(f.profile)
  try {
    await assert.rejects(runProfilePnpmTransaction({ profile: f.profile, args: ['install'], lifecycleId: lifecycle.env.ZEROWALL_PROFILE_TRANSACTION_ID, ownerPid: process.pid + 1, run }), /PLUGIN_LIFECYCLE_INVALID/)
    await assert.rejects(runProfilePnpmTransaction({ profile: f.profile, args: ['install'], lifecycleId: lifecycle.env.ZEROWALL_PROFILE_TRANSACTION_ID,
      ownerPid: process.pid, ownerToken: 'unowned-token', run }), /PLUGIN_LIFECYCLE_INVALID/)
    assert.equal(ran, false)
  } finally { await lifecycle.finish(false) }
})

test('real pnpm add preserves a scoped self-linked plugin and its dependency closure', async t => {
  const f = await fixture(t)
  await execute(process.execPath, [executor, pnpm, 'add', 'link:' + f.addition, '--offline'], { cwd: f.profile, env: { ...process.env, CI: 'false' }, windowsHide: true })
  assert.equal(await readFile(join(f.retained, 'index.js'), 'utf8'), 'export { value } from "leaf"\n')
  const leaf = await realpath(join(f.retained, 'node_modules/leaf'))
  assert.equal(leaf, await realpath(join(f.profile, 'node_modules/.zerowall-dependencies/node_modules/leaf')))
  const imported = await execute(process.execPath, ['--input-type=module', '-e', 'const m=await import("./node_modules/@dingyi222666/dsh-session-notification/index.js"); console.log(m.value)'], { cwd: f.profile, windowsHide: true })
  assert.equal(imported.stdout.trim(), 'retained closure')
  const manifest = JSON.parse(await readFile(join(f.profile, 'package.json')))
  assert.deepEqual(manifest.preserved, { model: 'user-selected', effort: 'max' })
  assert.deepEqual(manifest.dsh.profile.bundles, ['@dingyi222666/dsh-session-notification'])
  assert.equal(JSON.parse(await readFile(join(f.profile, 'node_modules/third-party/package.json'))).version, '1.0.0')
})

test('real pnpm add and remove succeed with an unrelated native file held open and a broken plugin', { skip: process.platform !== 'win32' }, async t => {
  const f = await fixture(t)
  const manifestPath = join(f.profile, 'package.json'), manifest = JSON.parse(await readFile(manifestPath))
  manifest.dependencies['broken-plugin'] = 'link:./node_modules/broken-plugin'
  await writeFile(manifestPath, JSON.stringify(manifest))
  await symlink(join(f.profile, 'missing-source'), join(f.profile, 'node_modules/broken-plugin'), 'junction')
  const paths = ['node_modules', 'node_modules/@dingyi222666', 'node_modules/.zerowall-dependencies'].map(name => join(f.profile, name))
  const identities = await Promise.all(paths.map(path => lstat(path).then(info => info.ino)))
  const release = await holdWindowsFile(t, join(f.retained, 'index.js'))
  for (const args of [['add', 'file:' + f.addition], ['remove', 'third-party']]) {
    await execute(process.execPath, [executor, pnpm, ...args], { cwd: f.profile, env: { ...process.env, npm_config_offline: 'true', npm_config_ignore_scripts: 'true' }, windowsHide: true })
    assert.deepEqual(await Promise.all(paths.map(path => lstat(path).then(info => info.ino))), identities)
    assert.equal(JSON.parse(await readFile(manifestPath)).dependencies['broken-plugin'], manifest.dependencies['broken-plugin'])
  }
  await release()
})

test('fresh pnpm resolution cannot prune plugins claimed by stale hoisted metadata', async t => {
  const f = await fixture(t)
  await writeFile(join(f.profile, 'node_modules/.modules.yaml'), JSON.stringify({ nodeLinker: 'hoisted', virtualStoreDir: '.pnpm', packageManager: 'pnpm@11.7.0', hoistedLocations: { 'file:old-plugin.tgz': ['node_modules/@dingyi222666/dsh-session-notification'] } }))
  await writeFile(join(f.profile, 'pnpm-workspace.yaml'), JSON.stringify({ nodeLinker: 'hoisted', overrides: { '@dingyi222666/dsh-session-notification': 'file:C:/missing-old-plugin.tgz' } }))
  await execute(process.execPath, [executor, pnpm, 'add', 'link:' + f.addition, '--offline', '--ignore-scripts'], { cwd: f.profile, env: { ...process.env, CI: 'false' }, windowsHide: true })
  assert.equal(await readFile(join(f.retained, 'index.js'), 'utf8'), 'export { value } from "leaf"\n')
  const loaded = await execute(process.execPath, ['-e', 'import("./node_modules/@dingyi222666/dsh-session-notification/index.js").then(m=>console.log(m.value))'], { cwd: f.profile, windowsHide: true })
  assert.equal(loaded.stdout.trim(), 'retained closure')
})

test('failed candidate pnpm cannot prune the active plugin tree or rewrite its manifest', async t => {
  const f = await fixture(t), before = await readFile(join(f.profile, 'package.json'), 'utf8')
  const result = await runProfilePnpmTransaction({ profile: f.profile, args: ['add', 'broken'], run: async (_args, candidate) => {
    await rm(join(candidate, 'node_modules'), { recursive: true, force: true })
    await writeFile(join(candidate, 'package.json'), '{}')
    return { code: 1, tail: 'installation failed' }
  } })
  assert.equal(result.code, 1)
  assert.equal(await readFile(join(f.profile, 'package.json'), 'utf8'), before)
  assert.equal(JSON.parse(await readFile(join(f.retained, 'package.json'))).version, '0.2.6')
})

test('retained dependency tampering in a successful resolver is rejected before activation', async t => {
  const f = await fixture(t)
  await assert.rejects(runProfilePnpmTransaction({ profile: f.profile, args: ['add', 'link:' + f.addition], run: async (_args, resolver) => {
    const manifest = JSON.parse(await readFile(join(resolver, 'package.json')))
    const retainedRoot = manifest.dependencies['@dingyi222666/dsh-session-notification'].slice(5)
    const leaf = await realpath(join(retainedRoot, 'node_modules/leaf'))
    await writeFile(join(leaf, 'index.js'), 'export const value = "tampered"')
    return { code: 0 }
  } }), /PLUGIN_RETAINED_CLOSURE_CHANGED/u)
  assert.equal(await readFile(join(f.profile, 'node_modules/.zerowall-dependencies/node_modules/leaf/index.js'), 'utf8'), 'export const value = "retained closure"\n')
})

test('cancelled successful resolution leaves the active generation unchanged', async t => {
  const f = await fixture(t), before = await readFile(join(f.profile, 'package.json'))
  const controller = new AbortController()
  const result = await runProfilePnpmTransaction({ profile: f.profile, args: ['install'], signal: controller.signal, run: async () => { controller.abort(); return { code: 0 } } })
  assert.equal(result.code, 1)
  assert.deepEqual(await readFile(join(f.profile, 'package.json')), before)
})

test('real pnpm explicit update preserves unrelated dependency instances', async t => {
  const f = await fixture(t)
  await execute(process.execPath, [executor, pnpm, 'add', 'file:' + f.addition, '--offline', '--ignore-scripts'], { cwd: f.profile, env: { ...process.env, CI: 'false' }, windowsHide: true })
  await writeFile(join(f.addition, 'package.json'), JSON.stringify({ name: 'third-party', version: '1.0.1' }))
  await execute(process.execPath, [executor, pnpm, 'update', 'third-party', '--offline', '--ignore-scripts'], { cwd: f.profile, env: { ...process.env, CI: 'false' }, windowsHide: true })
  assert.equal(JSON.parse(await readFile(join(f.profile, 'node_modules/third-party/package.json'))).version, '1.0.1')
  assert.equal(await readFile(join(f.retained, 'index.js'), 'utf8'), 'export { value } from "leaf"\n')
})

test('updating an existing physical self-linked package does not move its own resolver target', async t => {
  const f = await fixture(t)
  await execute(process.execPath, [executor, pnpm, 'update', '@dingyi222666/dsh-session-notification', '--offline', '--ignore-scripts'], { cwd: f.profile, env: { ...process.env, CI: 'false' }, windowsHide: true })
  assert.equal(JSON.parse(await readFile(join(f.retained, 'package.json'))).version, '0.2.6')
  assert.equal((await lstat(f.retained)).isSymbolicLink(), false)
  const imported = await execute(process.execPath, ['--input-type=module', '-e', 'console.log((await import("./node_modules/@dingyi222666/dsh-session-notification/index.js")).value)'], { cwd: f.profile, windowsHide: true })
  assert.equal(imported.stdout.trim(), 'retained closure')
})

for (const accepted of [true, false]) test(`real pnpm lifecycle ${accepted ? 'commits' : 'rolls back'} after runtime validation`, async t => {
  const f = await fixture(t), before = await readFile(join(f.profile, 'package.json'))
  await writeFile(join(f.profile, 'cordis.patch.yml'), 'original selection')
  const lifecycle = await beginProfilePackageChange(f.profile)
  await assert.rejects(beginProfilePackageChange(f.profile), /PLUGIN_TRANSACTION_BUSY/)
  const result = await runProfilePnpmTransaction({ profile: f.profile,
    args: ['add', 'link:' + f.addition, '--offline'],
    lifecycleId: lifecycle.env.ZEROWALL_PROFILE_TRANSACTION_ID, ownerPid: process.pid,
    ownerToken: lifecycle.env.ZEROWALL_PROFILE_TRANSACTION_OWNER_TOKEN,
    run: async (args, candidate) => {
      const output = await execute(process.execPath, [pnpm, ...args], { cwd: candidate, env: { ...process.env, CI: 'false' }, windowsHide: true })
      return { code: 0, tail: output.stdout }
    },
  })
  assert.equal(result.code, 0)
  await writeFile(join(f.profile, 'cordis.patch.yml'), 'new selection before failed HMR')
  await lifecycle.finish(accepted)
  assert.equal(await readFile(join(f.profile, 'cordis.patch.yml'), 'utf8'), accepted ? 'new selection before failed HMR' : 'original selection')
  if (!accepted) {
    assert.deepEqual(await readFile(join(f.profile, 'package.json')), before)
    await assert.rejects(readFile(join(f.profile, 'node_modules/third-party/package.json')), /ENOENT/)
  }
  assert.equal(JSON.parse(await readFile(join(f.retained, 'package.json'))).version, '0.2.6')
  const imported = await execute(process.execPath, ['--input-type=module', '-e', 'console.log((await import("./node_modules/@dingyi222666/dsh-session-notification/index.js")).value)'], { cwd: f.profile, windowsHide: true })
  assert.equal(imported.stdout.trim(), 'retained closure')
})

test('an interrupted caller restores its exact selection before the next mutation', async t => {
  const f = await fixture(t), before = await readFile(join(f.profile, 'package.json'))
  const directory = join(f.profile, '.plugin-manager/lifecycle-transactions/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'journal.json'), JSON.stringify({ pid: 2147483647, state: 'pending', files: [{ name: 'package.json', content: before.toString('base64') }] }))
  await writeFile(join(f.profile, 'package.json'), '{}')
  await recoverPnpmTransactions(f.profile)
  assert.deepEqual(await readFile(join(f.profile, 'package.json')), before)
})

for (const accepted of [false, true]) test(`crash recovery ${accepted ? 'keeps the accepted' : 'unwinds both pending'} pnpm runs`, async t => {
  const f = await fixture(t), before = await readFile(join(f.profile, 'package.json'))
  const second = join(f.root, 'second')
  await mkdir(second)
  await writeFile(join(second, 'package.json'), JSON.stringify({ name: 'second-party', version: '1.0.0' }))
  await execute(process.execPath, ['--input-type=module', '-e', `
    import { beginProfilePackageChange, runProfilePnpmTransaction } from ${JSON.stringify(transactionModule)};
    import { execFile } from 'node:child_process';
    import { promisify } from 'node:util';
    import { readFile, writeFile } from 'node:fs/promises';
    import { join } from 'node:path';
    const [profile, pnpm, first, second, accepted] = process.argv.slice(1);
    const lifecycle = await beginProfilePackageChange(profile);
    for (const addition of [first, second]) {
      await runProfilePnpmTransaction({ profile, args: ['add', 'link:' + addition, '--offline'],
        lifecycleId: lifecycle.env.ZEROWALL_PROFILE_TRANSACTION_ID, ownerPid: process.pid, ownerToken: lifecycle.env.ZEROWALL_PROFILE_TRANSACTION_OWNER_TOKEN,
        run: async (args, candidate) => {
          await promisify(execFile)(process.execPath, [pnpm, ...args], { cwd: candidate, env: { ...process.env, CI: 'false' }, windowsHide: true });
          return { code: 0 };
        } });
    }
    if (accepted === 'true') {
      const path = join(profile, '.plugin-manager/lifecycle-transactions', lifecycle.env.ZEROWALL_PROFILE_TRANSACTION_ID, 'journal.json');
      const state = JSON.parse(await readFile(path));
      await writeFile(path, JSON.stringify({ ...state, state: 'complete' }));
    }
    process.exit(0);
  `, f.profile, pnpm, f.addition, second, String(accepted)], { windowsHide: true })
  await recoverPnpmTransactions(f.profile)
  if (accepted) {
    for (const id of ['third-party', 'second-party']) assert.equal(JSON.parse(await readFile(join(f.profile, 'node_modules', id, 'package.json'))).version, '1.0.0')
  } else {
    assert.deepEqual(await readFile(join(f.profile, 'package.json')), before)
    for (const id of ['third-party', 'second-party']) await assert.rejects(readFile(join(f.profile, 'node_modules', id, 'package.json')), /ENOENT/)
  }
  assert.equal(JSON.parse(await readFile(join(f.retained, 'package.json'))).version, '0.2.6')
  assert.equal((await readdir(join(f.root, 'profiles'))).some(name => name.startsWith('zerowall-pnpm-')), false)
})
