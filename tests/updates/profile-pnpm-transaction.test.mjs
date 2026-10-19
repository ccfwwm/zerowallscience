import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, symlink, rm, realpath, readdir, lstat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { beginProfilePackageChange, runProfilePnpmTransaction, recoverPnpmTransactions } from '../../tools/commands/profile-pnpm-transaction.mjs'

const execute = promisify(execFile)
const pnpm = resolve('deepseek-harness/apps/desktop/node_modules/pnpm/bin/pnpm.cjs')
const executor = resolve('tools/commands/pnpm-executor.mjs')
const transactionModule = pathToFileURL(resolve('tools/commands/profile-pnpm-transaction.mjs')).href
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'zws-pnpm-candidate-'))
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 5 }))
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

test('an untrusted lifecycle ID cannot bypass the profile mutation lease', async t => {
  const f = await fixture(t)
  let ran = false
  const run = async () => { ran = true; return { code: 0 } }
  await assert.rejects(runProfilePnpmTransaction({ profile: f.profile, args: ['install'], lifecycleId: '../escape', ownerPid: process.pid, run }), /PLUGIN_LIFECYCLE_INVALID/)
  const lifecycle = await beginProfilePackageChange(f.profile)
  try {
    await assert.rejects(runProfilePnpmTransaction({ profile: f.profile, args: ['install'], lifecycleId: lifecycle.env.ZEROWALL_PROFILE_TRANSACTION_ID, ownerPid: process.pid + 1, run }), /PLUGIN_LIFECYCLE_INVALID/)
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
        lifecycleId: lifecycle.env.ZEROWALL_PROFILE_TRANSACTION_ID, ownerPid: process.pid,
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
