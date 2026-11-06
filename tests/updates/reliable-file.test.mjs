import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, chmod, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { physicalFs } from '../../tools/commands/physical-fs.mjs'
import { copyCandidateFile } from '../../tools/commands/reliable-file.mjs'

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'zws-copy-permission-'))
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 3 }))
  const source = join(root, 'source.dll'), destination = join(root, 'destination.dll')
  const bytes = Buffer.alloc(100000, 123)
  await writeFile(source, bytes)
  return { root, source, destination, bytes }
}

test('native CopyFile denial with a read-only partial falls back to independent readable bytes', async t => {
  const f = await fixture(t)
  await writeFile(f.destination, 'previous candidate')
  t.mock.method(physicalFs.promises, 'copyFile', async (_from, path) => {
    await writeFile(path, 'partial'); await chmod(path, 0o400)
    throw Object.assign(new Error('CopyFile denied'), { code: 'EPERM' })
  })
  await copyCandidateFile(f.source, f.destination)
  assert.deepEqual(await readFile(f.source), f.bytes)
  assert.deepEqual(await readFile(f.destination), f.bytes)
  await writeFile(f.destination, 'independent edit')
  assert.deepEqual(await readFile(f.source), f.bytes)
  assert.deepEqual((await readdir(f.root)).sort(), ['destination.dll', 'source.dll'])
})

test('permanent read denial preserves the previous destination and fails with its permission code', async t => {
  const f = await fixture(t), originalOpen = physicalFs.promises.open
  await writeFile(f.destination, 'previous candidate')
  t.mock.method(physicalFs.promises, 'copyFile', async () => { throw Object.assign(new Error('denied'), { code: 'EACCES' }) })
  t.mock.method(physicalFs.promises, 'open', async (path, ...args) => {
    if (path === f.source) throw Object.assign(new Error('permanent read denial: ' + path), { code: 'EACCES' })
    return originalOpen(path, ...args)
  })
  await assert.rejects(copyCandidateFile(f.source, f.destination), { code: 'EACCES' })
  assert.deepEqual(await readFile(f.source), f.bytes)
  assert.equal(await readFile(f.destination, 'utf8'), 'previous candidate')
  assert.deepEqual((await readdir(f.root)).sort(), ['destination.dll', 'source.dll'])
})
