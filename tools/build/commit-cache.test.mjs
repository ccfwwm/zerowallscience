import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
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
