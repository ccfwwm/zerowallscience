import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { runtimeRecipes } from './runtime-recipes.mjs'

test('uncompiled offline compatibility code invalidates runtime reuse without depending on desktop version', async t => {
  const root = await mkdtemp(join(tmpdir(), 'zws-runtime-recipes-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const put = async (path, value) => {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), typeof value === 'string' ? value : JSON.stringify(value))
  }
  const profile = { version: '8.4.2', offlinePackageDependencies: { '@old/media': 'media-compat' } }
  await put('config/layout/runtime-profile.json', profile)
  await put('config/integrations/upstream-sources.json', {})
  await put('tools/packaging/prepare-runtime.mjs', 'copier')
  await put('tools/build/stamp-desktop-version.mjs', 'stamp')
  await put('plugins/media-compat/package.json', { name: '@old/media', version: '1.0.0', files: ['index.js', 'assets'] })
  await put('plugins/media-compat/index.js', 'export * from "new-media"')
  await put('plugins/media-compat/assets/data.json', '{}')
  const before = await runtimeRecipes(root)
  await put('config/layout/runtime-profile.json', { ...profile, version: '8.4.3' })
  assert.deepEqual(await runtimeRecipes(root), before)
  await put('plugins/media-compat/index.js', 'export * from "fixed-media"')
  assert.notDeepEqual(await runtimeRecipes(root), before)
  await put('plugins/media-compat/index.js', 'export * from "new-media"')
  await put('plugins/media-compat/assets/new.json', '{}')
  assert.notDeepEqual(await runtimeRecipes(root), before)
  await rm(join(root, 'plugins/media-compat/assets/new.json'))
  assert.deepEqual(await runtimeRecipes(root), before)
  const manifest = JSON.parse(await readFile(join(root, 'plugins/media-compat/package.json'), 'utf8'))
  await put('plugins/media-compat/package.json', { ...manifest, name: '@wrong/media' })
  await assert.rejects(runtimeRecipes(root), /Invalid offline package manifest/)
})
