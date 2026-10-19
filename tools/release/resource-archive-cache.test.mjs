import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { reuseResourceArchive } from './resource-archive-cache.mjs'

test('Skill archives are shared across Desktop releases and same-version source changes fail', async t => {
  const root = await mkdtemp(join(tmpdir(), 'zws-skill-archive-')); t.after(() => rm(root, { recursive: true, force: true }))
  const source = join(root, 'source'), artifacts = join(root, 'artifacts')
  await mkdir(source)
  await writeFile(join(source, 'SKILL.md'), '# original skill')
  const options = { kind: 'skill', id: 'example', version: '0.1.0', source, artifactRoot: artifacts }
  const first = join(artifacts, 'release/8.3.6/skills/example.tgz'), second = join(artifacts, 'release/8.3.7/skills/example.tgz')
  assert.equal((await reuseResourceArchive({ ...options, destination: first })).cacheHit, false)
  const original = await readFile(first)
  assert.equal((await reuseResourceArchive({ ...options, destination: second })).cacheHit, true)
  assert.equal((await stat(first)).ino, (await stat(second)).ino)
  await writeFile(join(source, 'SKILL.md'), '# different skill')
  await assert.rejects(reuseResourceArchive({ ...options, destination: second }), /Same-version resource content changed/u)
  assert.deepEqual(await readFile(first), original)
  assert.deepEqual(await readFile(second), original)
})
