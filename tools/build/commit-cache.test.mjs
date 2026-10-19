import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { commitCache } from './commit-cache.mjs'

test('failed cache publication restores the prior cache directory', async t => {
  const root = await mkdtemp(join(tmpdir(), 'zws-cache-commit-')); t.after(() => rm(root, { recursive: true, force: true }))
  const cached = join(root, 'cached')
  await mkdir(cached); await writeFile(join(cached, 'payload'), 'previous verified bytes')
  await assert.rejects(commitCache(join(root, 'missing-candidate'), cached), { code: 'ENOENT' })
  assert.equal(await readFile(join(cached, 'payload'), 'utf8'), 'previous verified bytes')
})

test('Windows cache publication retries temporary directory locks without rebuilding bytes', { skip: process.platform !== 'win32' }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'zws-cache-lock-')); t.after(() => rm(root, { recursive: true, force: true }))
  const candidate = join(root, 'candidate'), cached = join(root, 'cached')
  await mkdir(candidate); await writeFile(join(candidate, 'payload'), 'verified candidate bytes')
  let attempts = 0, waits = 0
  await commitCache(candidate, cached, {
    renameDirectory: async (from, to) => {
      if (++attempts < 3) throw Object.assign(new Error('Temporary Windows file handle'), { code: 'EPERM' })
      await rename(from, to)
    },
    wait: async () => { waits++ },
  })
  assert.equal(attempts, 3); assert.equal(waits, 2)
  assert.equal(await readFile(join(cached, 'payload'), 'utf8'), 'verified candidate bytes')
})
