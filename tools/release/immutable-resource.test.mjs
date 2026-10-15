import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash, generateKeyPairSync } from 'node:crypto'
import { create } from 'tar'
import { deterministicArchive } from './deterministic-archive.mjs'
import { preserveImmutableResource, publishedResources } from './immutable-resource.mjs'
import { downloadResource, signCatalog } from './resource-catalog.mjs'

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'zws-resource-contract-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const source = join(root, 'source')
  await mkdir(source)
  await writeFile(join(source, 'SKILL.md'), 'An independently versioned skill.\n')
  const original = join(root, 'original.tgz'), candidate = join(root, 'candidate.tgz')
  await create({ cwd: source, file: original, gzip: true }, ['.'])
  await deterministicArchive(source, candidate)
  return { source, original, candidate }
}

test('identical files retain original archive bytes across legacy headers and ./ paths', async t => {
  const { original, candidate } = await fixture(t)
  assert.notDeepEqual(await readFile(candidate), await readFile(original))
  const receipt = await preserveImmutableResource(candidate, original)
  assert.equal(receipt.files, 1)
  assert.deepEqual(await readFile(candidate), await readFile(original))
})

test('changed skill content requires a new resource version', async t => {
  const { source, original, candidate } = await fixture(t)
  await writeFile(join(source, 'SKILL.md'), 'Different instructions.\n')
  await deterministicArchive(source, candidate)
  await assert.rejects(preserveImmutableResource(candidate, original), /content changed.*bump/u)
})

test('historical hash tampering and same-version file additions are rejected', async t => {
  const { source, original, candidate } = await fixture(t)
  await assert.rejects(preserveImmutableResource(candidate, original, '0'.repeat(64)), /archive was modified/u)
  await writeFile(join(source, 'new-script.py'), 'print("new behavior")\n')
  await deterministicArchive(source, candidate)
  await assert.rejects(preserveImmutableResource(candidate, original), /file set changed/u)
})

test('verified public history reuses unchanged legacy archive bytes and rejects catalog tampering', async t => {
  const { original, candidate } = await fixture(t)
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const keys = { test: publicKey.export({ type: 'spki', format: 'pem' }) }
  const baseUrl = 'https://resources.example/stable', payload = await readFile(original)
  const digest = bytes => createHash('sha256').update(bytes).digest('hex')
  const entry = signCatalog({ id: 'example', version: '0.1.0', kind: 'skill', downloadUrl: baseUrl + '/skills/example/0.1.0/example.tgz', size: payload.length, sha256: digest(payload), restartRequired: false, rollbackSupported: true, dshRange: { min: '0.2.0-rc.2' }, desktopRange: { min: '8.0.0' }, platform: ['win32'], architecture: ['x64'] }, privateKey, 'test')
  const catalog = Buffer.from(JSON.stringify(signCatalog({ schema: 1, kind: 'skill', localOnly: false, resources: [entry] }, privateKey, 'test')))
  const pointer = signCatalog({ kind: 'pointer', resourceKind: 'skill', localOnly: false, catalog: { downloadUrl: baseUrl + '/catalogs/skill/8.2.1/build/catalog.json', size: catalog.length, sha256: digest(catalog) } }, privateKey, 'test')
  const cache = join(original, '..', 'cache')
  const fetcher = async url => new Response(String(url).endsWith('skill-latest.json') ? JSON.stringify(pointer) : String(url).endsWith('catalog.json') ? catalog : payload)
  const history = await publishedResources({ baseUrl, kind: 'skill', keys, cache, fetcher })
  const previous = history.get('example@0.1.0')
  const baseline = await downloadResource(previous.entry, cache, { fetcher })
  await preserveImmutableResource(candidate, baseline, previous.sha256)
  assert.deepEqual(await readFile(candidate), payload)
  const badCache = join(original, '..', 'bad-cache')
  const tampered = async url => new Response(String(url).endsWith('skill-latest.json') ? JSON.stringify(pointer) : Buffer.alloc(catalog.length))
  await assert.rejects(publishedResources({ baseUrl, kind: 'skill', keys, cache: badCache, fetcher: tampered }), /SHA-256 or size mismatch/u)
})
