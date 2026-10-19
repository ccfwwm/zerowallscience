import assert from 'node:assert/strict'
import { link, mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { resolveObject, storeAndLink } from './content-store.mjs'
import { materializeTree } from './materialize-tree.mjs'
import { tryHardlink } from './hardlink.mjs'

test('NTFS link exhaustion preserves verified bytes and allows stage materialization', { skip: process.platform !== 'win32' }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'zws-link-limit-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const source = join(root, 'source'), links = join(root, 'links'), artifacts = join(root, 'artifacts')
  await mkdir(source); await mkdir(links)
  const first = join(links, 'first'), second = join(source, 'second')
  await writeFile(first, 'same bytes'); await writeFile(second, 'same bytes')
  const object = await storeAndLink(first, { root: artifacts })
  for (let i = 0; i < 1022; i++) await link(object.objectPath, join(links, String(i)))
  assert.equal((await stat(object.objectPath)).nlink, 1024)
  const retained = await storeAndLink(second, { root: artifacts })
  assert.equal(retained.fallback, 'EMLINK')
  assert.equal(await readFile(second, 'utf8'), 'same bytes')
  assert.notEqual((await stat(second)).ino, (await stat(object.objectPath)).ino)
  const result = await materializeTree({ source: links, destination: join(root, 'stage'), include: path => path === 'first' })
  assert.equal(result.copiedFiles, 1)
  assert.equal(result.files[0].fallback, 'EMLINK')
  assert.equal(await readFile(join(root, 'stage/first'), 'utf8'), 'same bytes')
})

test('unrelated UNKNOWN link errors still fail', async t => {
  const root = await mkdtemp(join(tmpdir(), 'zws-link-error-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const source = join(root, 'source'); await writeFile(source, 'bytes')
  await assert.rejects(tryHardlink(source, join(root, 'link'), async () => { throw Object.assign(new Error('unrelated'), { code: 'UNKNOWN' }) }), /unrelated/u)
})

test('identical payloads share a verified object and immutable reference', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zws-content-store-'))
  try {
    const first = join(root, 'artifacts/release/first/plugin.tgz')
    const second = join(root, 'artifacts/release/second/plugin.tgz')
    const firstRefPath = join(root, 'artifacts/release/refs/first.json')
    const secondRefPath = join(root, 'artifacts/release/refs/second.json')
    await mkdir(join(root, 'artifacts/release/first'), { recursive: true })
    await mkdir(join(root, 'artifacts/release/second'), { recursive: true })
    await writeFile(first, 'same package bytes')
    await writeFile(second, 'same package bytes')

    const a = await storeAndLink(first, { root: join(root, 'artifacts'), referencePath: firstRefPath })
    const b = await storeAndLink(second, { root: join(root, 'artifacts'), referencePath: secondRefPath })
    assert.equal(a.digest, b.digest)
    assert.equal(a.objectPath, b.objectPath)
    assert.equal(await resolveObject(JSON.parse(await readFile(firstRefPath, 'utf8')), { root: join(root, 'artifacts') }), a.objectPath)
    const firstStat = await stat(first)
    const secondStat = await stat(second)
    const objectStat = await stat(a.objectPath)
    assert.equal(firstStat.ino, objectStat.ino)
    assert.equal(secondStat.ino, objectStat.ino)
    assert.equal(await readFile(first, 'utf8'), 'same package bytes')
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('a content reference cannot be repointed to different bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zws-content-ref-'))
  try {
    const artifacts = join(root, 'artifacts')
    const source = join(root, 'payload.tgz')
    const referencePath = join(root, 'artifacts/release/refs/item.json')
    await mkdir(join(root, 'artifacts/release/refs'), { recursive: true })
    await writeFile(source, 'first')
    const first = await storeAndLink(source, { root: artifacts, referencePath })
    const replacement = join(root, 'replacement.tgz')
    await writeFile(replacement, 'different')
    await assert.rejects(storeAndLink(replacement, { root: artifacts, referencePath }), /immutable/u)
    assert.equal(await readFile(source, 'utf8'), 'first')
    assert.equal(await resolveObject(first, { root: artifacts }), first.objectPath)
  } finally { await rm(root, { recursive: true, force: true }) }
})
