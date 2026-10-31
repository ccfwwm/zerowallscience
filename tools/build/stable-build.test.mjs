import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { reuseAssembly } from './assembly-cache.mjs'
import { stampDesktopVersion } from './stamp-desktop-version.mjs'
import { syncDesktopRelease } from './sync-desktop-release.mjs'
import { readStableConfig, stableEnvironment } from './stable-config.mjs'
import { createCleanupPlan, removeCandidate } from './artifacts-gc-lib.mjs'

test('desktop versions reuse one template and stamping never changes cache or prior stages', async t => {
  const root = await mkdtemp(join(tmpdir(), 'zws-version-template-')); t.after(() => rm(root, { recursive: true, force: true }))
  let built = 0
  const prepare = async directory => {
    built++
    await mkdir(join(directory, '@deepseek-ai/brand'), { recursive: true })
    await writeFile(join(directory, '@deepseek-ai/brand/index.js'), 'version="__ZEROWALL_DESKTOP_VERSION__"')
    await writeFile(join(directory, 'shared.js'), 'unchanged runtime')
  }
  for (const version of ['8.3.6', '8.3.7']) {
    const output = join(root, version)
    await reuseAssembly({ cache: join(root, 'cache'), output, key: 'same-template', prepare })
    await stampDesktopVersion(output, version)
    assert.equal(await readFile(join(output, '@deepseek-ai/brand/index.js'), 'utf8'), `version="${version}"`)
  }
  assert.equal(built, 1)
  assert.equal(await readFile(join(root, '8.3.6/@deepseek-ai/brand/index.js'), 'utf8'), 'version="8.3.6"')
  assert.match(await readFile(join(root, 'cache/same-template/modules/@deepseek-ai/brand/index.js'), 'utf8'), /__ZEROWALL_DESKTOP_VERSION__/u)
  assert.equal((await stat(join(root, '8.3.6/shared.js'))).ino, (await stat(join(root, '8.3.7/shared.js'))).ino)
})

test('changed assemblies share unchanged files by content and isolate changed bytes', async t => {
  const root = await mkdtemp(join(tmpdir(), 'zws-file-sharing-')); t.after(() => rm(root, { recursive: true, force: true }))
  for (const key of ['first', 'second']) await reuseAssembly({ cache: join(root, 'cache'), output: join(root, key), objectRoot: join(root, 'artifacts'), key, prepare: async directory => {
    await mkdir(directory)
    await writeFile(join(directory, 'shared.js'), 'same')
    await writeFile(join(directory, 'changed.js'), key)
  } })
  assert.equal((await stat(join(root, 'first/shared.js'))).ino, (await stat(join(root, 'second/shared.js'))).ino)
  assert.notEqual((await stat(join(root, 'first/changed.js'))).ino, (await stat(join(root, 'second/changed.js'))).ino)
  assert.equal(await readFile(join(root, 'first/changed.js'), 'utf8'), 'first')
})

test('desktop release configuration synchronizes manifests while retaining independent versions', async t => {
  const root = await mkdtemp(join(tmpdir(), 'zws-release-config-')); t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, 'config/build'), { recursive: true })
  await writeFile(join(root, 'config/build/desktop-release.json'), JSON.stringify({ schema: 1, version: '8.3.7', description: 'configured' }))
  for (const file of ['package.json', 'desktop/package.json', 'config/layout/package-layout.json', 'config/layout/runtime-profile.json', 'config/integrations/upstream-sources.json']) {
    await mkdir(join(root, file, '..'), { recursive: true })
    await writeFile(join(root, file), JSON.stringify({ version: '8.3.6', plugins: { example: '0.1.2' } }))
  }
  await assert.rejects(syncDesktopRelease(root, { check: true }), /not synchronized/u)
  await syncDesktopRelease(root)
  await syncDesktopRelease(root, { check: true })
  const manifest = JSON.parse(await readFile(join(root, 'desktop/package.json')))
  assert.equal(manifest.description, 'configured')
  assert.equal(manifest.plugins.example, '0.1.2')
})

test('stable policy retires old versions including their current pointers while preserving current and shared resources', async t => {
  const root = await mkdtemp(join(tmpdir(), 'zws-stable-retention-')); t.after(() => rm(root, { recursive: true, force: true }))
  await writeFile(join(root, 'package.json'), JSON.stringify({ version: '8.3.6' }))
  for (const family of ['stage', 'packages', 'release', 'verification', 'logs']) for (const version of ['8.3.5', '8.3.6']) {
    const directory = join(root, 'artifacts', family, version)
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, 'payload'), version)
  }
  await mkdir(join(root, 'artifacts/release/plugins/example/0.1.0'), { recursive: true })
  await writeFile(join(root, 'artifacts/release/plugins/example/0.1.0/plugin.tgz'), 'independent')
  const policy = { defaults: { keepDesktopVersions: 1, keepStagesPerVersion: 1 }, protectedRoots: ['artifacts/release'] }
  const plan = await createCleanupPlan({ root, policy })
  assert.equal(plan.candidates.length, 5)
  for (const item of plan.candidates) await removeCandidate(item, item)
  for (const family of ['stage', 'packages', 'release', 'verification', 'logs']) {
    await assert.rejects(stat(join(root, 'artifacts', family, '8.3.5')))
    assert.equal(await readFile(join(root, 'artifacts', family, '8.3.6/payload'), 'utf8'), '8.3.6')
  }
  assert.equal(await readFile(join(root, 'artifacts/release/plugins/example/0.1.0/plugin.tgz'), 'utf8'), 'independent')
})

test('stable environment pins the configured signer and rejects overrides', async () => {
  const root = fileURLToPath(new URL('../..', import.meta.url))
  const config = await readStableConfig(root)
  const env = stableEnvironment(root, config, { ZEROWALL_RESOURCE_KEY_ID: 'stable-4' })
  assert.equal(env.ZEROWALL_RESOURCE_KEY_ID, 'stable-4')
  assert.equal(env.ZEROWALL_BUNDLE_PYTHON, '1')
  assert.equal(env.ZEROWALL_CHANNEL, 'stable')
  assert.throws(() => stableEnvironment(root, config, { ZEROWALL_RESOURCE_KEY_ID: 'stable-3' }), /does not accept an override/u)
})

test('a saved strict cleanup plan cannot remove caches after the desktop version changes', async t => {
  const root = await mkdtemp(join(tmpdir(), 'zws-retention-version-')); t.after(() => rm(root, { recursive: true, force: true }))
  await writeFile(join(root, 'package.json'), JSON.stringify({ version: '8.3.6' }))
  const cache = join(root, 'artifacts/cache/runtime-assemblies/core')
  for (const name of ['first', 'second']) {
    await mkdir(join(cache, name), { recursive: true })
    await writeFile(join(cache, name, 'receipt.json'), '{}')
    await writeFile(join(cache, name, 'payload'), name)
  }
  const plan = await createCleanupPlan({ root, policy: { defaults: { keepDesktopVersions: 1, keepRuntimeAssembliesPerKind: 1 } } })
  assert.equal(plan.candidates.length, 1)
  await writeFile(join(root, 'package.json'), JSON.stringify({ version: '8.3.7' }))
  await assert.rejects(removeCandidate(plan.candidates[0], plan.candidates[0]), /Desktop version changed/u)
  assert.equal(await readFile(join(plan.candidates[0].path, 'payload'), 'utf8'), plan.candidates[0].path.split(/[\\/]/u).at(-1))
})

test('historical cleanup plans do not pin orphan objects while active stage references remain protected', async t => {
  const root = await mkdtemp(join(tmpdir(), 'zws-orphan-retention-')); t.after(() => rm(root, { recursive: true, force: true }))
  await writeFile(join(root, 'package.json'), JSON.stringify({ version: '8.3.6' }))
  const objects = ['a'.repeat(64), 'b'.repeat(64)].map(hash => join(root, 'artifacts/objects/sha256', hash.slice(0, 2), hash))
  for (const path of objects) {
    await mkdir(join(path, '..'), { recursive: true }); await writeFile(path, 'content')
    await utimes(path, new Date('2000-01-01'), new Date('2000-01-01'))
  }
  const current = join(root, 'artifacts/stage/8.3.6/current')
  await mkdir(current, { recursive: true })
  await writeFile(join(current, 'object-reference.json'), JSON.stringify({ object: objects[1] }))
  await writeFile(join(current, '../current.json'), JSON.stringify({ buildId: 'current' }))
  await mkdir(join(root, 'artifacts/verification/8.3.6'), { recursive: true })
  await writeFile(join(root, 'artifacts/verification/8.3.6/cleanup-plan.json'), JSON.stringify({ path: objects[0] }))
  const plan = await createCleanupPlan({ root, policy: { defaults: { keepDesktopVersions: 1, objectDays: 1 } } })
  assert.deepEqual(plan.candidates.map(item => item.path), [objects[0]])
  await removeCandidate(plan.candidates[0], plan.candidates[0])
  assert.equal(await readFile(objects[1], 'utf8'), 'content')
})

test('complete clones retain source provenance without pinning source stages and explicit pruning removes failed builds', async t => {
  const root = await mkdtemp(join(tmpdir(), 'zws-clone-retention-')); t.after(() => rm(root, { recursive: true, force: true }))
  await writeFile(join(root, 'package.json'), JSON.stringify({ version: '8.3.6' }))
  const stages = join(root, 'artifacts/stage/8.3.6')
  for (const name of ['source', 'active', 'failed']) {
    await mkdir(join(stages, name), { recursive: true })
    await writeFile(join(stages, name, 'payload'), name)
    await writeFile(join(stages, name, 'build-receipt.json'), JSON.stringify({ status: name === 'failed' ? 'failed' : 'success', ...(name === 'active' ? { sourceBuildId: 'source' } : {}) }))
  }
  await writeFile(join(stages, 'current.json'), JSON.stringify({ buildId: 'active' }))
  const plan = await createCleanupPlan({ root, policy: { defaults: { keepDesktopVersions: 1, keepStagesPerVersion: 1, failedBuildDays: 7 } }, pruneIncomplete: true })
  assert.equal(plan.candidates.length, 2)
  for (const item of plan.candidates) await removeCandidate(item, item)
  assert.equal(await readFile(join(stages, 'active/payload'), 'utf8'), 'active')
})
