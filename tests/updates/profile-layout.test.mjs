import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, readlink, rename, symlink, realpath, cp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { repairProfileLayout } from '../../tools/commands/profile-layout.mjs'

const execute = promisify(execFile)
async function deferredFixture(t, { local = 'replacement/assets', external = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'zws-layout-pending-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const home = join(root, 'home'), active = join(home, 'profiles/web'), candidate = join(home, 'profiles/zerowall')
  const link = join(candidate, 'node_modules/retained/node_modules/dependency')
  const oldTarget = external ? join(root, 'external-missing') : join(active, 'node_modules', local)
  await mkdir(join(active, 'node_modules', local), { recursive: true })
  await mkdir(join(candidate, 'node_modules/retained/node_modules'), { recursive: true })
  await symlink(oldTarget, link, process.platform === 'win32' ? 'junction' : 'dir')
  return { home, active, candidate, link, oldTarget, target: join(candidate, 'node_modules', local), replacement: join(candidate, 'node_modules/replacement') }
}

test('planned missing replacement targets remain pending until strict post-materialization validation', async t => {
  const f = await deferredFixture(t)
  const options = { from: f.active, home: f.home }
  const result = await repairProfileLayout(f.candidate, { ...options, pendingRoots: [f.replacement] })
  assert.deepEqual(result.pendingTargets, [f.target])
  assert.equal(await readlink(f.link), f.oldTarget)
  await assert.rejects(repairProfileLayout(f.candidate, options), { code: 'ENOENT', path: f.target })
  await mkdir(f.target, { recursive: true })
  const strict = await repairProfileLayout(f.candidate, options)
  assert.equal(strict.pendingTargets, undefined)
  assert.equal(await realpath(f.link), f.target)
})

test('a missing internal target outside an exact planned replacement root remains an error', async t => {
  const f = await deferredFixture(t, { local: 'replacement-extra' })
  await assert.rejects(repairProfileLayout(f.candidate, { from: f.active, home: f.home, pendingRoots: [f.replacement] }), { code: 'ENOENT', path: f.target })
  assert.equal(await readlink(f.link), f.oldTarget)
})

test('an external missing target is never deferred during a planned internal replacement', async t => {
  const f = await deferredFixture(t, { external: true })
  const result = await repairProfileLayout(f.candidate, { from: f.active, home: f.home, pendingRoots: [f.replacement] })
  assert.equal(result.pendingTargets, undefined)
  assert.equal(await readlink(f.link), f.oldTarget)
})

test('pending root declarations cannot widen the exception to node_modules or external storage', async t => {
  const f = await deferredFixture(t)
  for (const root of [join(f.candidate, 'node_modules'), f.candidate, f.active]) {
    await assert.rejects(repairProfileLayout(f.candidate, { from: f.active, home: f.home, pendingRoots: [root] }), /Invalid pending profile package root/u)
  }
})

test('real bundled pnpm can install and remove after candidate activation and history restoration', async t => {
  const root = await mkdtemp(join(tmpdir(), 'zws-layout-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const home = join(root, 'home'), candidate = join(home, 'profiles/zerowall-fixture'), active = join(home, 'profiles/web')
  await mkdir(candidate, { recursive: true })
  const fixture = join(root, 'fixture')
  await mkdir(fixture)
  await writeFile(join(fixture, 'package.json'), JSON.stringify({ name: 'zws-layout-fixture', version: '1.0.0', main: 'index.js' }))
  await writeFile(join(fixture, 'index.js'), 'module.exports = 42\n')
  await writeFile(join(candidate, 'package.json'), '{"private":true}')
  const pnpm = resolve('deepseek-harness/apps/desktop/node_modules/pnpm/bin/pnpm.cjs')
  const executor = resolve('tools/commands/pnpm-executor.mjs')
  const run = (cwd, args) => execute(process.execPath, [executor, pnpm, ...args], { cwd, env: { ...process.env, DSH_HOME: home }, windowsHide: true })
  await run(candidate, ['add', 'file:' + fixture, '--config.node-linker=hoisted', '--ignore-scripts'])
  await rename(candidate, active)
  const repaired = await repairProfileLayout(active, { home })
  assert.equal(repaired.needsRelink, undefined)
  assert.equal(JSON.parse(await readFile(join(active, 'node_modules/.modules.yaml'), 'utf8')).virtualStoreDir, '.pnpm')
  await run(active, ['remove', 'zws-layout-fixture'])
  await run(active, ['add', 'file:' + fixture, '--ignore-scripts'])
  const external = join(root, 'external'), copied = join(home, 'profiles/zerowall-copy')
  await mkdir(external)
  await symlink(external, join(active, 'node_modules/external'), process.platform === 'win32' ? 'junction' : 'dir')
  await cp(active, copied, { recursive: true, dereference: false, verbatimSymlinks: true })
  assert.equal((await repairProfileLayout(copied, { from: active, home })).needsRelink, undefined)
  const backup = join(home, 'resources/history/zerowall-backup')
  await mkdir(join(home, 'resources/history'), { recursive: true })
  await rename(active, backup)
  await repairProfileLayout(backup, { from: active, home })
  await rename(copied, active)
  await repairProfileLayout(active, { from: copied, home })
  assert.equal(await realpath(join(active, 'node_modules/external')), await realpath(external))
  await run(active, ['remove', 'zws-layout-fixture'])
  const failed = join(home, 'profiles/failed')
  await rename(active, failed)
  await rename(backup, active)
  await repairProfileLayout(active, { from: backup, home })
  await run(active, ['remove', 'zws-layout-fixture'])
})
