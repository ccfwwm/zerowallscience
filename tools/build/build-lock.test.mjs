import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { acquireBuildLock } from './build-lock.mjs'

test('a live packaging lock rejects another writer and can be acquired after release', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zws-build-lock-'))
  try {
    const release = await acquireBuildLock(root, 'runtime')
    await assert.rejects(acquireBuildLock(root, 'runtime'), /held by process/u)
    await release()
    const secondRelease = await acquireBuildLock(root, 'runtime')
    await secondRelease()
    await assert.rejects(acquireBuildLock(root, '../escape'), /Invalid build lock name/u)
  } finally { await rm(root, { recursive: true, force: true }) }
})
