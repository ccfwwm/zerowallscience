import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createResourceManager } from '../../tools/commands/resource-manager.mjs'
import { initializeProfile } from '../../tools/commands/profile.mjs'

for (const [range, current, historical, allowed] of [
  ['workspace:^', '1.2.2', '1.2.1', false],
  ['workspace:^', '1.2.1', '1.2.2', true],
  ['workspace:^', '2.0.0', '1.9.9', false],
  ['workspace:^', '0.2.0', '0.1.9', false],
  ['workspace:~', '1.2.0', '1.2.9', true],
  ['workspace:~', '1.2.0', '1.3.0', false],
  ['workspace:*', '2.0.0', '1.0.0', true],
  ['workspace:^1.0.0', '1.2.0', '1.0.0', true],
  ['workspace:^2.0.0', '2.1.0', '1.9.9', false],
  ['^2.0.0', '2.1.0', '1.9.9', false],
  ['^1.0.0', '1.2.1', '1.2.0', true],
]) test(`single-plugin rollback ${allowed ? 'accepts' : 'rejects'} ${range}: ${current} -> ${historical}`, async t => {
  const home = await mkdtemp(join(tmpdir(), 'zws-workspace-rollback-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  const active = join(home, 'profiles/web'), previous = join(home, 'resources/history/old')
  const dependency = 'workspace-dependency', consumer = 'workspace-consumer'
  await initializeProfile(home, [dependency, consumer])
  const file = join(active, 'package.json'), manifest = JSON.parse(await readFile(file))
  const shared = 'unchanged-adapted-package'
  manifest.dependencies = { [dependency]: current, [consumer]: '1.0.0', [shared]: '1.0.1-zws.1' }
  manifest.zerowall = { ...manifest.zerowall, profileLayout: 2, disabledPlugins: ['kept-disabled'] }
  manifest.customSettings = { model: 'user-model', reasoningEffort: 'max' }
  await writeFile(file, JSON.stringify(manifest))
  await mkdir(previous, { recursive: true })
  await writeFile(join(previous, 'package.json'), JSON.stringify({ ...manifest, dependencies: { [dependency]: historical, [shared]: '1.0.1-zws.1' }, dsh: { profile: { bundles: [dependency] } } }))
  for (const [profile, id, version, dependencies] of [[active, dependency, current], [active, consumer, '1.0.0', { [dependency]: range, [shared]: '1.0.0' }], [previous, dependency, historical], [active, shared, '1.0.1-zws.1'], [previous, shared, '1.0.1-zws.1']]) {
    const directory = join(profile, 'node_modules', id)
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, 'package.json'), JSON.stringify({ name: id, version, dependencies }))
  }
  const state = join(home, 'resources/plugins')
  await mkdir(join(state, dependency), { recursive: true })
  await writeFile(join(state, dependency, 'history.json'), JSON.stringify({ records: [{ id: dependency, version: historical, profile: previous, packageIds: [dependency, shared] }] }))
  const selection = JSON.stringify({ disabled: ['kept-disabled'], removed: ['kept-removed'], pinned: { untouched: '9.0.0' } })
  await writeFile(join(state, 'selection.json'), selection)
  let starts = 0
  const manager = createResourceManager({ home, local: true, yaml: JSON, runPlugin: async () => assert.fail('Rollback must not install dependencies'), stopHost: async () => {}, startHost: async () => { starts++ } })
  const before = await readFile(file, 'utf8')
  if (allowed) {
    await manager.rollbackPlugin(dependency)
    assert.equal(JSON.parse(await readFile(join(active, 'node_modules', dependency, 'package.json'))).version, historical)
    assert.equal(starts, 1)
    assert.deepEqual(JSON.parse(await readFile(file)).customSettings, manifest.customSettings)
  } else {
    await assert.rejects(manager.rollbackPlugin(dependency), /PLUGIN_ROLLBACK_CONFLICT/)
    assert.equal(await readFile(file, 'utf8'), before)
    assert.equal(JSON.parse(await readFile(join(active, 'node_modules', dependency, 'package.json'))).version, current)
    assert.equal(starts, 0)
  }
  assert.equal(await readFile(join(state, 'selection.json'), 'utf8'), selection)
})
