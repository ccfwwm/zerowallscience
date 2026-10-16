import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, readFile, writeFile, stat, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { deterministicArchive } from '../../tools/release/deterministic-archive.mjs'
import { preserveImmutablePackage, commitImmutablePackage } from '../../tools/plugins/immutable-package.mjs'

async function archive(directory, label, files) {
  const source = join(directory, label, 'package')
  await mkdir(source, { recursive: true })
  for (const [name, content] of Object.entries(files)) {
    const path = join(source, name)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, content)
  }
  const destination = join(directory, label + '.tgz')
  await deterministicArchive(join(directory, label), destination)
  return destination
}

test('same-version release reuses the first archive across build comments and CSS ordering', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'zws-immutable-'))
  const before = await archive(directory, 'before', {
    'package.json': '{"name":"fixture","version":"0.1.0"}',
    'client.js': '// original path\nvar style_module_css_default = { a: "one", b: "two" }; console.log(style_module_css_default.a);'
  })
  const after = await archive(directory, 'after', {
    'package.json': '{"name":"fixture","version":"0.1.0"}',
    'client.js': '// staging path\nvar style_module_css_default = { b: "two", a: "one" }; console.log(style_module_css_default.a);'
  })
  const receipt = await preserveImmutablePackage(after, before)
  assert.deepEqual(receipt.normalizedFiles, ['package/client.js'])
  assert.deepEqual(await readFile(after), await readFile(before))
})

test('same-version release rejects changed executable behavior and keeps the candidate intact', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'zws-immutable-'))
  const before = await archive(directory, 'before', { 'client.js': 'export const value = 1;' })
  const after = await archive(directory, 'after', { 'client.js': 'export const value = 2;' })
  const original = await readFile(after)
  await assert.rejects(preserveImmutablePackage(after, before), /executable content changed/)
  assert.deepEqual(await readFile(after), original)
})

test('same-version release rejects changed dependencies and missing physical resources', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'zws-immutable-'))
  const before = await archive(directory, 'before', { 'package.json': '{"dependencies":{"fixture":"0.1.0"}}', 'worker.wasm': 'native' })
  const dependency = await archive(directory, 'dependency', { 'package.json': '{"dependencies":{"fixture":"0.2.0"}}', 'worker.wasm': 'native' })
  await assert.rejects(preserveImmutablePackage(dependency, before), /content changed/)
  const missing = await archive(directory, 'missing', { 'package.json': '{"dependencies":{"fixture":"0.1.0"}}' })
  await assert.rejects(preserveImmutablePackage(missing, before), /file set changed/)
})

test('same-version release tolerates generated cache and text line-ending changes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'zws-immutable-'))
  const before = await archive(directory, 'before', {
    'README.md': 'line one\r\nline two\r\n',
    'dist/.tsbuildinfo': '{"fileInfos":{"0":{"version":"before"}}}',
    'dist/client.js': 'export const value = 1;',
    'dist/client.js.map': '{"sourcesContent":["before"]}',
  })
  const after = await archive(directory, 'after', {
    'README.md': 'line one\nline two\n',
    'dist/.tsbuildinfo': '{"fileInfos":{"0":{"version":"after"}}}',
    'dist/client.js': 'export const value = 1;',
    'dist/client.js.map': '{"sourcesContent":["after"]}',
  })
  const receipt = await preserveImmutablePackage(after, before)
  assert.deepEqual(receipt.normalizedFiles, ['package/README.md', 'package/dist/.tsbuildinfo', 'package/dist/client.js.map'])
  assert.deepEqual(await readFile(after), await readFile(before))
})

test('failed validation cannot write or replace an immutable shared archive', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'zws-immutable-'))
  const before = await archive(directory, 'before', { 'client.js': 'export const value = 1;' })
  const after = await archive(directory, 'after', { 'client.js': 'export const value = 2;' })
  const destination = join(directory, 'shared', 'fixture.tgz')
  await assert.rejects(commitImmutablePackage(after, destination, before), /executable content changed/)
  await assert.rejects(stat(destination), { code: 'ENOENT' })
  await commitImmutablePackage(before, destination)
  const original = await readFile(destination)
  await assert.rejects(commitImmutablePackage(after, destination), /already contains different bytes/)
  assert.deepEqual(await readFile(destination), original)
})

test('concurrent archive publication preserves bytes and unchanged consumers preserve mtime', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'zws-immutable-'))
  const before = await archive(directory, 'before', { 'client.js': 'export const value = 1;' })
  const equivalent = await archive(directory, 'equivalent', { 'client.js': '// build comment\nexport const value = 1;' })
  const destination = join(directory, 'shared', 'fixture.tgz')
  const receipts = await Promise.all(Array.from({ length: 4 }, () => commitImmutablePackage(equivalent, destination, before)))
  assert.equal(new Set(receipts.map(receipt => receipt.sha256)).size, 1)
  assert.deepEqual(await readFile(destination), await readFile(before))
  const timestamp = (await stat(destination)).mtimeMs
  await commitImmutablePackage(before, destination)
  assert.equal((await stat(destination)).mtimeMs, timestamp)
  assert.deepEqual(await readdir(dirname(destination)), ['fixture.tgz'])
})
