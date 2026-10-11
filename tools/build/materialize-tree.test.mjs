import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, symlink, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { materializeTree } from './materialize-tree.mjs'

test('materializes regular files as hard links and records hashes', async t => {
  const root = await mkdtemp(join(tmpdir(), 'zws-materialize-')); t.after(() => rm(root, { recursive: true, force: true }))
  const source = join(root, 'source'), destination = join(root, 'destination')
  await mkdir(join(source, 'nested'), { recursive: true }); await writeFile(join(source, 'nested/value.txt'), 'shared bytes')
  const receipt = await materializeTree({ source, destination, sourceKey: 'cache-key' })
  assert.equal(receipt.mode, 'hardlink'); assert.equal(receipt.files[0].sha256.length, 64)
  assert.equal((await stat(join(source, 'nested/value.txt'))).ino, (await stat(join(destination, 'nested/value.txt'))).ino)
  assert.equal(await readFile(join(destination, 'nested/value.txt'), 'utf8'), 'shared bytes')
})

test('falls back to copy for cross-volume or permission link failures', async t => {
  const root = await mkdtemp(join(tmpdir(), 'zws-materialize-fallback-')); t.after(() => rm(root, { recursive: true, force: true }))
  const source = join(root, 'source'), destination = join(root, 'destination')
  await mkdir(source); await writeFile(join(source, 'value.txt'), 'copied bytes')
  const receipt = await materializeTree({ source, destination, linkFile: async () => { const error = new Error('cross device'); error.code = 'EXDEV'; throw error } })
  assert.equal(receipt.mode, 'copy'); assert.equal(receipt.copiedFiles, 1)
  assert.notEqual((await stat(join(source, 'value.txt'))).ino, (await stat(join(destination, 'value.txt'))).ino)
})

test('rejects symbolic links in a formal runtime tree', async t => {
  const root = await mkdtemp(join(tmpdir(), 'zws-materialize-link-')); t.after(() => rm(root, { recursive: true, force: true }))
  const source = join(root, 'source'), outside = join(root, 'outside'), destination = join(root, 'destination')
  await mkdir(source); await writeFile(outside, 'outside'); await symlink(outside, join(source, 'linked'), 'file')
  await assert.rejects(materializeTree({ source, destination }), /symbolic link/u)
})
