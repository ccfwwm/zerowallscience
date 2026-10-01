import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { create } from 'tar'
import { deterministicArchive } from './deterministic-archive.mjs'
import { preserveImmutableResource } from './immutable-resource.mjs'

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'zws-resource-contract-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const source = join(root, 'source')
  await mkdir(source)
  await writeFile(join(source, 'SKILL.md'), 'An independently versioned skill.\n')
  const original = join(root, 'original.tgz'), candidate = join(root, 'candidate.tgz')
  await create({ cwd: source, file: original, gzip: true }, ['.'])
  await deterministicArchive(source, candidate)
  return { source, original, candidate }
}

test('identical files retain original archive bytes across legacy headers and ./ paths', async t => {
  const { original, candidate } = await fixture(t)
  assert.notDeepEqual(await readFile(candidate), await readFile(original))
  const receipt = await preserveImmutableResource(candidate, original)
  assert.equal(receipt.files, 1)
  assert.deepEqual(await readFile(candidate), await readFile(original))
})

test('changed skill content requires a new resource version', async t => {
  const { source, original, candidate } = await fixture(t)
  await writeFile(join(source, 'SKILL.md'), 'Different instructions.\n')
  await deterministicArchive(source, candidate)
  await assert.rejects(preserveImmutableResource(candidate, original), /content changed.*bump/u)
})

test('historical hash tampering and same-version file additions are rejected', async t => {
  const { source, original, candidate } = await fixture(t)
  await assert.rejects(preserveImmutableResource(candidate, original, '0'.repeat(64)), /archive was modified/u)
  await writeFile(join(source, 'new-script.py'), 'print("new behavior")\n')
  await deterministicArchive(source, candidate)
  await assert.rejects(preserveImmutableResource(candidate, original), /file set changed/u)
})
