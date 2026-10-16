import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { assertFeedNotRegressed, mergePluginFeed, pluginSnapshotId, readVerifiedPluginFeed, verifyStagePluginFeed } from './snapshot.mjs'

test('a single-plugin pack merges the shared latest feed rather than an old desktop release', () => {
  const latest = [{ id: 'images', version: '1.2.0', sha256: 'images' }, { id: 'python', version: '2.0.0', sha256: 'python' }]
  assert.deepEqual(mergePluginFeed(latest, [{ id: 'images', version: '1.3.0', sha256: 'new' }]),
    [latest[1], { id: 'images', version: '1.3.0', sha256: 'new' }])
  assert.throws(() => mergePluginFeed(latest, [{ id: 'images', version: '1.1.0' }]), /regressed/u)
})

test('feed guards refuse missing entries, semver downgrades and same-version changed bytes', () => {
  const prior = [{ id: 'images', version: '1.0.0', sha256: 'a' }]
  assert.throws(() => assertFeedNotRegressed(prior, []), /disappeared/u)
  assert.throws(() => assertFeedNotRegressed(prior, [{ ...prior[0], sha256: 'b' }]), /immutable/u)
  for (const version of ['0.9.9', '1.0.0-rc.9']) assert.throws(() => assertFeedNotRegressed(prior, [{ ...prior[0], version }]), /regressed/u)
  assert.doesNotThrow(() => assertFeedNotRegressed([{ ...prior[0], version: '1.0.0-rc.9' }], [{ ...prior[0], version: '1.0.0-rc.10' }]))
})

test('verified archives are reused unchanged and bound to actual installed plugin versions', async t => {
  const root = await mkdtemp(join(tmpdir(), 'zws-latest-plugin-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const store = join(root, 'plugins'), stage = join(root, 'stage')
  await mkdir(join(store, 'fixture/1.0.0'), { recursive: true })
  await mkdir(join(stage, 'offline-profile/modules/@fixture/fixture'), { recursive: true })
  const bytes = Buffer.from('original immutable archive'), path = join(store, 'fixture/1.0.0/fixture.tgz')
  await writeFile(path, bytes)
  const record = { id: '@fixture/fixture', version: '1.0.0', kind: 'plugin', size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), path }
  const composition = { ...record, id: '@fixture/composition', manifest: { composition: [record.id] } }
  // Composition has its own immutable archive but no Host module.
  await mkdir(join(store, 'composition/1.0.0'), { recursive: true })
  composition.path = join(store, 'composition/1.0.0/composition.tgz')
  await writeFile(composition.path, bytes)
  const feed = [record, composition]
  await writeFile(join(store, 'plugin-packages.json'), JSON.stringify(feed))
  const snapshotId = pluginSnapshotId(feed, 'dsh')
  await writeFile(join(stage, 'plugin-snapshot.json'), JSON.stringify({ snapshotId, plugins: feed }))
  const installed = join(stage, 'offline-profile/modules/@fixture/fixture/package.json')
  await writeFile(installed, JSON.stringify({ name: record.id, version: record.version }))
  const signedFiles = [{ path: `modules/${record.id}/package.json`, sha256: createHash('sha256').update(await readFile(installed)).digest('hex') }]
  await writeFile(join(stage, 'offline-profile/receipt.json'), JSON.stringify({ schema: 2, files: signedFiles }))
  assert.equal(await verifyStagePluginFeed(stage, await readVerifiedPluginFeed(store), 'dsh'), snapshotId)
  assert.deepEqual(await readFile(path), bytes)
  await writeFile(join(stage, 'offline-profile/receipt.json'), JSON.stringify({ schema: 2, files: [] }))
  await assert.rejects(verifyStagePluginFeed(stage, feed, 'dsh'), /Offline carrier/u)
  await writeFile(installed, JSON.stringify({ name: record.id, version: '0.9.0' }))
  await assert.rejects(verifyStagePluginFeed(stage, feed, 'dsh'), /missing or stale/u)
  await writeFile(join(store, 'plugin-packages.json'), JSON.stringify([record, record]))
  await assert.rejects(readVerifiedPluginFeed(store), /duplicate/u)
  await writeFile(join(store, 'plugin-packages.json'), JSON.stringify([{ ...record, path: join(root, 'outside.tgz') }]))
  await writeFile(join(root, 'outside.tgz'), bytes)
  await assert.rejects(readVerifiedPluginFeed(store), /unsafe/u)
})
