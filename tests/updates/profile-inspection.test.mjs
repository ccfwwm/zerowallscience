import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
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
