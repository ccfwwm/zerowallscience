import { test } from 'node:test'
import assert from 'node:assert/strict'
import { link, mkdtemp, mkdir, writeFile, readFile, utimes, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { deterministicArchive } from './deterministic-archive.mjs'
import { list } from 'tar'
import { preserveImmutableResource } from './immutable-resource.mjs'

test('resource archive bytes remain identical across filesystem timestamp changes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'zws-deterministic-'))
  const source = join(dir, 'skill')
  try {
    await mkdir(source)
    await writeFile(join(source, 'SKILL.md'), 'test content')
    await deterministicArchive(source, join(dir, 'first.tgz'))
    await utimes(join(source, 'SKILL.md'), new Date('2020-01-01'), new Date('2030-01-01'))
    await deterministicArchive(source, join(dir, 'second.tgz'))
    assert.deepEqual(await readFile(join(dir, 'first.tgz')), await readFile(join(dir, 'second.tgz')))
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('deduplicated source files retain ordinary file entries and published archive bytes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'zws-archive-hardlinks-'))
  const physical = join(dir, 'physical'), shared = join(dir, 'shared')
  try {
    await mkdir(physical)
    await mkdir(shared)
    for (const name of ['SKILL.md', 'reference.md']) await writeFile(join(physical, name), 'same file bytes')
    await writeFile(join(shared, 'SKILL.md'), 'same file bytes')
    await link(join(shared, 'SKILL.md'), join(shared, 'reference.md'))
    const baseline = join(dir, 'published.tgz'), candidate = join(dir, 'candidate.tgz')
    await deterministicArchive(physical, baseline)
    await deterministicArchive(shared, candidate)
    const entries = []
    await list({ file: candidate, onReadEntry(entry) { entries.push([entry.path, entry.type]); entry.resume() } })
    assert.deepEqual(entries, [['SKILL.md', 'File'], ['reference.md', 'File']])
    assert.deepEqual(await readFile(candidate), await readFile(baseline))
    assert.equal((await preserveImmutableResource(candidate, baseline)).preserved, true)
  } finally { await rm(dir, { recursive: true, force: true }) }
})
