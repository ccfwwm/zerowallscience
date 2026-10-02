import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, utimes, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { deterministicArchive } from './deterministic-archive.mjs'

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
