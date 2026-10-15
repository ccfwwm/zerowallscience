import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash, generateKeyPairSync } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { publishedPackageHistory } from '../../tools/plugins/package-history.mjs'
import { signCatalog } from '../../tools/release/resource-catalog.mjs'

test('independent plugin history uses signed archives from the current desktop release and caches them', async t => {
  const cache = await mkdtemp(join(tmpdir(), 'zws-public-plugin-history-'))
  t.after(() => rm(cache, { recursive: true, force: true }))
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const keys = { test: publicKey.export({ type: 'spki', format: 'pem' }) }
  const baseUrl = 'https://resources.example/stable', payload = Buffer.from('original published plugin bytes')
  const digest = bytes => createHash('sha256').update(bytes).digest('hex')
  const sign = value => signCatalog(value, privateKey, 'test')
  const entry = sign({ id: '@example/plugin', version: '0.1.16', kind: 'plugin', applicationVersion: '8.2.1', downloadUrl: baseUrl + '/plugins/plugin/0.1.16/plugin.tgz', size: payload.length, sha256: digest(payload), restartRequired: true, rollbackSupported: true, dshRange: { min: '0.2.0-rc.2' }, desktopRange: { min: '8.0.0' }, platform: ['win32'], architecture: ['x64'] })
  const catalog = Buffer.from(JSON.stringify(sign({ schema: 1, kind: 'plugin', applicationVersion: '8.2.1', localOnly: false, resources: [entry] })))
  const pointer = sign({ kind: 'pointer', resourceKind: 'plugin', localOnly: false, catalog: { downloadUrl: baseUrl + '/catalogs/plugin/8.2.1/build/catalog.json', size: catalog.length, sha256: digest(catalog) } })
  const requests = []
  const fetcher = async url => {
    requests.push(String(url))
    return new Response(String(url).endsWith('plugin-latest.json') ? JSON.stringify(pointer) : String(url).endsWith('catalog.json') ? catalog : payload)
  }
  const history = publishedPackageHistory({ baseUrl, keys, cache, fetcher })
  const first = await history(entry.id, entry.version)
  assert.equal(first.published, true)
  assert.equal(first.sha256, digest(payload))
  assert.equal(first.size, payload.length)
  assert.deepEqual(await readFile(first.path), payload)
  assert.deepEqual(await history(entry.id, entry.version), first)
  assert.equal(await history(entry.id, '0.1.17'), undefined)
  assert.equal(requests.length, 3)
  const tampered = publishedPackageHistory({ baseUrl, keys, cache: join(cache, 'tampered'), fetcher: async url => new Response(String(url).endsWith('plugin-latest.json') ? JSON.stringify(pointer) : String(url).endsWith('catalog.json') ? catalog : Buffer.alloc(payload.length)) })
  await assert.rejects(tampered(entry.id, entry.version), /SHA-256 or size mismatch/u)
})
