import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { deterministicArchive } from '../../tools/release/deterministic-archive.mjs'
import { preserveImmutablePackage } from '../../tools/plugins/immutable-package.mjs'

async function archive(directory, label, files) {
  const source = join(directory, label, 'package')
  await mkdir(source, { recursive: true })
  for (const [name, content] of Object.entries(files)) await writeFile(join(source, name), content)
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
