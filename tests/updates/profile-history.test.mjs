import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { profileHistoryCopyOptions } from '../../tools/commands/profile-history.mjs'
import { copyProfileTree } from '../../tools/commands/profile-copy.mjs'
import { repairProfileLayout } from '../../tools/commands/profile-layout.mjs'

test('rollback copies preserve link, manifest, workspace and pinned materialization sources without recopying unused generations', async t => {
  const root = await mkdtemp(join(tmpdir(), 'zws-history-plan-'))
  t.after(async () => { assert(resolve(root).startsWith(resolve(tmpdir()) + sep)); await rm(root, { recursive: true, force: true }) })
  const profile = join(root, 'web'), backup = join(root, 'backup')
  const names = ['linked', 'manifest', 'workspace', 'unused']
  const sources = Object.fromEntries(names.map((name, i) => [name, '.zerowall/install-sources/resolution-' + String(i + 1).repeat(8) + '-1111-4111-8111-111111111111']))
  async function file(local, data) { await mkdir(dirname(join(profile, local)), { recursive: true }); await writeFile(join(profile, local), data) }
  for (const name of names) await file(sources[name] + '/node_modules/' + name + '/index.cjs', name)
  for (const name of ['pinned', 'unused']) await file('.zerowall/dependency-history/' + name + '/node_modules/shared/index.cjs', name)
  await file('package.json', JSON.stringify({ dependencies: { thirdParty: 'link:./' + sources.manifest + '/node_modules/manifest' } }))
  await file('pnpm-workspace.yaml', JSON.stringify({ overrides: { thirdParty: 'file:' + join(profile, sources.workspace, 'node_modules/workspace') } }))
  await file('.zerowall/materialized-profile.json', JSON.stringify({ preserved: [{ dependencyRoot: '.zerowall/dependency-history/pinned/node_modules' }] }))
  await mkdir(join(profile, 'node_modules/third-party/node_modules'), { recursive: true })
  await symlink(join(profile, sources.linked, 'node_modules/linked'), join(profile, 'node_modules/third-party/node_modules/linked'), process.platform === 'win32' ? 'junction' : 'dir')
  await copyProfileTree(profile, backup, await profileHistoryCopyOptions(profile))
  await repairProfileLayout(backup, { from: profile })
  for (const name of names.slice(0, 3)) assert.equal(await readFile(join(backup, sources[name], 'node_modules', name, 'index.cjs'), 'utf8'), name)
  assert.equal(await readFile(join(backup, '.zerowall/dependency-history/pinned/node_modules/shared/index.cjs'), 'utf8'), 'pinned')
  assert.equal(await realpath(join(backup, 'node_modules/third-party/node_modules/linked')), await realpath(join(backup, sources.linked, 'node_modules/linked')))
  for (const local of [sources.unused + '/node_modules/unused/index.cjs', '.zerowall/dependency-history/unused/node_modules/shared/index.cjs']) {
    await assert.rejects(readFile(join(backup, local)), { code: 'ENOENT' })
    assert.equal(await readFile(join(profile, local), 'utf8'), 'unused')
  }
})

test('a malformed materialization marker preserves all dependency history and invalid workspace cannot silently drop declarations', async t => {
  const root = await mkdtemp(join(tmpdir(), 'zws-history-invalid-'))
  t.after(async () => { assert(resolve(root).startsWith(resolve(tmpdir()) + sep)); await rm(root, { recursive: true, force: true }) })
  await mkdir(join(root, '.zerowall'), { recursive: true })
  await writeFile(join(root, '.zerowall/materialized-profile.json'), '{invalid')
  assert.equal((await profileHistoryCopyOptions(root)).pruneDependencyHistory, false)
  await writeFile(join(root, '.zerowall/materialized-profile.json'), '{"preserved":{}}')
  assert.equal((await profileHistoryCopyOptions(root)).pruneDependencyHistory, false)
  await writeFile(join(root, 'pnpm-workspace.yaml'), '{invalid')
  await assert.rejects(profileHistoryCopyOptions(root), SyntaxError)
})
