import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { buildResourceCatalogItem } from './build-resource-catalog-item.mjs'
import { verifyCatalog } from './resource-catalog.mjs'

test('a single resource build produces a signed local catalog bound to exact payload bytes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'zws-resource-item-'))
  try {
    const payload = join(directory, 'r-platform.json')
    const outputCatalog = join(directory, 'mcp-catalog.json')
    await writeFile(payload, JSON.stringify({ serverName: 'r-platform', enabled: false }))
    const pair = generateKeyPairSync('ed25519')
    const keys = { test: pair.publicKey.export({ type: 'spki', format: 'pem' }) }
    const result = await buildResourceCatalogItem({
      kind: 'mcp', id: 'r-platform', version: '0.1.1', payload, outputCatalog,
      signing: { privateKey: pair.privateKey, keys, keyId: 'test', localOnly: true },
    })
    const persisted = JSON.parse(await readFile(outputCatalog, 'utf8'))
    verifyCatalog(persisted, keys, { local: true })
    assert.equal(result.document.resources[0].sha256, persisted.resources[0].sha256)
    assert.equal(persisted.resources[0].size, Buffer.byteLength(await readFile(payload)))
    assert.equal(persisted.resources[0].restartRequired, true)
    assert.equal(persisted.resources[0].rollbackSupported, true)
  } finally { await rm(directory, { recursive: true, force: true }) }
})
