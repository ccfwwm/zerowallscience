import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

const root = resolve(import.meta.dirname, '../..')
const version = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version
const pin = JSON.parse(await readFile(join(root, 'config/deepseek-harness/upstream.json'), 'utf8'))
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const fixtureDirectories = new Set()

afterEach(async () => {
  await Promise.all([...fixtureDirectories].map(directory => rm(directory, { recursive: true, force: true, maxRetries: 3 })))
  fixtureDirectories.clear()
})

async function fixture() {
  const artifacts = await mkdtemp(join(tmpdir(), 'zws-plugin-consumer-'))
  fixtureDirectories.add(artifacts)
  const store = join(artifacts, 'release/plugins/fixture/1.0.0')
  const stage = join(artifacts, 'stage', version, 'fixture')
  await mkdir(store, { recursive: true })
  await mkdir(stage, { recursive: true })
  const path = join(store, 'fixture.tgz')
  const bytes = Buffer.from('verified component bytes')
  await writeFile(path, bytes)
  const record = { id: '@fixture/fixture', version: '1.0.0', kind: 'plugin', size: bytes.length, sha256: digest(bytes), path }
  const identity = { id: record.id, version: record.version, kind: record.kind, size: record.size, sha256: record.sha256 }
  const snapshotId = digest(JSON.stringify({ schema: 1, dshCommit: pin.commit, plugins: [identity] }))
  await writeFile(join(artifacts, 'release/plugins/plugin-packages.json'), JSON.stringify([record]))
  await writeFile(join(stage, 'build-receipt.json'), JSON.stringify({ status: 'success', applicationVersion: version, buildId: 'fixture', pluginSnapshotId: snapshotId }))
  const run = () => spawnSync(process.execPath, ['tools/plugins/pack.mjs', '--consumer-only'], {
    cwd: root, encoding: 'utf8', env: { ...process.env, ZEROWALL_ARTIFACT_ROOT: artifacts, ZEROWALL_BUILD_ID: 'fixture', npm_execpath: join(artifacts, 'must-never-execute-pnpm.cjs') },
  })
  return { artifacts, stage, path, record, snapshotId, run }
}

test('desktop consumer validates the bound snapshot without running pnpm or changing plugin bytes/mtime', async () => {
  const f = await fixture()
  const before = await stat(f.path)
  const result = f.run()
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /CONSUMER-ONLY plugin snapshot/)
  assert.equal((await stat(f.path)).mtimeMs, before.mtimeMs)
  assert.equal(digest(await readFile(f.path)), f.record.sha256)
  assert.equal(JSON.parse(await readFile(join(f.stage, 'plugin-snapshot.json'))).snapshotId, f.snapshotId)
})

test('desktop consumer rejects a valid but different plugin feed before replacing release references', async () => {
  const f = await fixture()
  assert.equal(f.run().status, 0)
  const releaseSnapshot = join(f.artifacts, 'release', version, 'plugin-snapshot.json')
  const original = await readFile(releaseSnapshot)
  const replacement = Buffer.from('a newer independently packed plugin')
  await writeFile(f.path, replacement)
  await writeFile(join(f.artifacts, 'release/plugins/plugin-packages.json'), JSON.stringify([{ ...f.record, size: replacement.length, sha256: digest(replacement) }]))
  const result = f.run()
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /snapshot differs from the verified component stage/)
  assert.deepEqual(await readFile(releaseSnapshot), original)
})

test('desktop consumer rejects missing or corrupt archives without rebuilding them', async () => {
  const f = await fixture()
  await writeFile(f.path, 'corrupt')
  const result = f.run()
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /missing or changed plugin artifact/)
  assert.equal(await readFile(f.path, 'utf8'), 'corrupt')
})
