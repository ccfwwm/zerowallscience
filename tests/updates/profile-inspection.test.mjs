import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { initializeProfile, inspectProfile } from '../../tools/commands/profile.mjs'

test('reports shadowed old plugins without restoring removed bundles or rewriting pins', async () => {
  const home = await mkdtemp(join(tmpdir(), 'zws-profile-doctor-'))
  const id = '@zerowallscience/plugin-files'
  const bundled = [{ id, version: '0.2.0', desktop: { min: '8.0.1' }, dsh: { min: '0.2.0-rc.2', max: '0.2.0-rc.2' } }]
  try {
    await initializeProfile(home, [id])
    const dir = join(home, 'profiles/web')
    const pinned = { private: true, zerowall: { pluginArchitecture: 1 }, dependencies: { [id]: '0.1.0' }, dsh: { profile: { bundles: [id] } } }
    await writeFile(join(dir, 'package.json'), JSON.stringify(pinned))
    await mkdir(join(dir, 'node_modules', id), { recursive: true })
    await writeFile(join(dir, 'node_modules', id, 'package.json'), JSON.stringify({ name: id, version: '0.1.0', zerowall: { desktop: { min: '8.0.0' } } }))
    await initializeProfile(home, [id, '@zerowallscience/plugin-images'])
    const result = await inspectProfile(home, bundled, { desktopVersion: '8.0.1', dshVersion: '0.2.0-rc.2' })
    assert.deepEqual(result.updates, [id])
    assert.equal(result.plugins[0].source, 'profile')
    assert.equal(result.plugins[0].declaredDependency, '0.1.0')
    assert.equal(result.plugins.length, 1)
    assert.equal(result.plugins[0].compatibility, 'compatible')
  } finally { await rm(home, { recursive: true, force: true }) }
})

test('migrates an existing profile to the extension center without restoring removed plugins', async () => {
  const home = await mkdtemp(join(tmpdir(), 'zws-profile-migration-'))
  const extension = '@zerowallscience/plugin-extension-center'
  try {
    await initializeProfile(home, [extension])
    const file = join(home, 'profiles/web/package.json')
    const manifest = JSON.parse(await readFile(file, 'utf8'))
    manifest.dsh.profile.bundles = manifest.dsh.profile.bundles.filter(id => id !== extension)
    manifest.zerowall.pluginArchitecture = 1
    await writeFile(file, JSON.stringify(manifest))
    await initializeProfile(home, [extension])
    const migrated = JSON.parse(await readFile(file, 'utf8'))
    assert.equal(migrated.zerowall.pluginArchitecture, 4)
    assert(migrated.dsh.profile.bundles.includes(extension))

    migrated.dsh.profile.bundles = migrated.dsh.profile.bundles.filter(id => id !== extension)
    await mkdir(join(home, 'resources/plugins'), { recursive: true })
    await writeFile(join(home, 'resources/plugins/selection.json'), JSON.stringify({ removed: [extension] }))
    migrated.zerowall.pluginArchitecture = 1
    await writeFile(file, JSON.stringify(migrated))
    await initializeProfile(home, [extension])
    const preserved = JSON.parse(await readFile(file, 'utf8'))
    assert.equal(preserved.dsh.profile.bundles.includes(extension), false)
  } finally { await rm(home, { recursive: true, force: true }) }
})

test('migrates a legacy 7.5 profile without an architecture marker', async () => {
  const home = await mkdtemp(join(tmpdir(), 'zws-profile-legacy-'))
  const extension = '@zerowallscience/plugin-extension-center'
  const legacy = '@zerowallscience/plugin-files'
  try {
    await initializeProfile(home, [extension])
    const file = join(home, 'profiles/web/package.json')
    await writeFile(file, JSON.stringify({ private: true, dsh: { profile: { bundles: [legacy] } } }))
    await initializeProfile(home, [extension])
    const migrated = JSON.parse(await readFile(file, 'utf8'))
    assert.equal(migrated.zerowall.pluginArchitecture, 4)
    assert.deepEqual(migrated.dsh.profile.bundles, [legacy, extension])
  } finally { await rm(home, { recursive: true, force: true }) }
})

test('7.5 overlay migration and broken 8.0.2 migration restore domain services while retaining explicit choices', async () => {
  const home = await mkdtemp(join(tmpdir(), 'zws-overlay-migration-'))
  const extension = '@zerowallscience/plugin-extension-center'
  const defaults = ['base', 'desktop-compat', 'environment', 'skills', 'mcp', 'files', 'images', 'research'].map(name => '@zerowallscience/plugin-' + name).concat(extension, 'dsh-wechat', '@dingyi222666/dsh-session-notification')
  try {
    await mkdir(join(home, 'profiles/web'), { recursive: true })
    await mkdir(join(home, 'resources/plugins'), { recursive: true })
    const file = join(home, 'profiles/web/package.json')
    const thirdParty = 'third-party-plugin'
    const disabled = '@zerowallscience/plugin-images'
    const removed = '@zerowallscience/plugin-research'
    await writeFile(join(home, 'resources/plugins/selection.json'), JSON.stringify({ disabled: [disabled], removed: [removed] }))
    for (const architecture of [undefined, 2]) {
      const legacy = { private: true, dependencies: { [thirdParty]: '1.2.3' }, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', thirdParty, ...(architecture ? [extension] : [])] } }, zerowall: { pluginArchitecture: architecture } }
      await writeFile(file, JSON.stringify(legacy))
      await writeFile(join(home, 'profiles/web/cordis.patch.yml'), '- id: custom\n  disabled: true\n')
      await initializeProfile(home, defaults)
      const migrated = JSON.parse(await readFile(file, 'utf8'))
      for (const id of defaults.filter(id => ![disabled, removed].includes(id))) assert(migrated.dsh.profile.bundles.includes(id), id)
      assert(!migrated.dsh.profile.bundles.includes(disabled))
      assert(!migrated.dsh.profile.bundles.includes(removed))
      assert.equal(migrated.dependencies[thirdParty], '1.2.3')
      assert.equal(await readFile(join(home, 'profiles/web/cordis.patch.yml'), 'utf8'), '- id: custom\n  disabled: true\n')
      const before = await readFile(file, 'utf8')
      await initializeProfile(home, defaults)
      assert.equal(await readFile(file, 'utf8'), before)
    }
  } finally { await rm(home, { recursive: true, force: true }) }
})

test('early modular profiles shed duplicate desktop overlays while preserving package pins and plugin choices', async () => {
  const home = await mkdtemp(join(tmpdir(), 'zws-overlay-duplicates-'))
  try {
    const id = '@zerowallscience/plugin-files'
    await mkdir(join(home, 'profiles/web'), { recursive: true })
    const file = join(home, 'profiles/web/package.json')
    const manifest = { private: true, zerowall: { pluginArchitecture: 3 }, dependencies: { 'dsh-univer-office': '0.3.5' }, dsh: { profile: { bundles: [id, 'dsh-univer-office', 'dsh-better-sidebar', 'third-party-plugin'] } } }
    await writeFile(file, JSON.stringify(manifest))
    await initializeProfile(home, [id, '@zerowallscience/plugin-images'], [{ id: 'dsh-univer-office', managed: false }, { id: 'dsh-better-sidebar', managed: false }])
    const result = JSON.parse(await readFile(file, 'utf8'))
    assert.deepEqual(result.dsh.profile.bundles, [id, 'third-party-plugin'])
    assert.deepEqual(result.dependencies, manifest.dependencies)
    assert.equal(result.zerowall.pluginArchitecture, 4)
  } finally { await rm(home, { recursive: true, force: true }) }
})
