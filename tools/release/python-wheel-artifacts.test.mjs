import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash, generateKeyPairSync } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { signDocument } from './python-layer-split.mjs'
import { prepareFallbackWheel } from './python-wheel-artifacts.mjs'

test('desktop versions reuse signed wheel bytes and URL without rebuilding or downloading twice', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zws-wheel-reuse-'))
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const keys = { test: publicKey }
  const bytes = Buffer.from('verified wheel fixture')
  const wheel = { name: 'fixture', version: '1.0.0', filename: 'fixture-1.0.0-py3-none-any.whl', size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), sourceArchiveSha256: 'a'.repeat(64), url: 'https://example.com/python/r18/fixture-1.0.0-py3-none-any.whl' }
  const manifest = signDocument({ fallbackWheels: [wheel], signature: { algorithm: 'ed25519', keyId: 'test', value: '' } }, privateKey, publicKey)
  let downloads = 0
  const options = { manifest, keys, cache: join(root, 'cache'), fetcher: async () => { downloads++; return new Response(bytes) } }
  try {
    const first = await prepareFallbackWheel(wheel, { ...options, output: join(root, '8.2.1') })
    const next = await prepareFallbackWheel(wheel, { ...options, output: join(root, '8.3.0') })
    assert.deepEqual(await readFile(first), await readFile(next))
    assert.equal(downloads, 1)
    assert.equal(await prepareFallbackWheel(wheel, { ...options, output: join(root, '8.3.0') }), next)
    await assert.rejects(prepareFallbackWheel({ ...wheel, sha256: 'b'.repeat(64) }, { ...options, output: join(root, 'other') }), /signed manifest/u)
    await assert.rejects(prepareFallbackWheel(wheel, { ...options, manifest: { ...manifest, fallbackWheels: [] }, output: join(root, 'other') }), /signature/u)
    await writeFile(next, 'corrupted test-owned wheel')
    await assert.rejects(prepareFallbackWheel(wheel, { ...options, output: join(root, '8.3.0') }), /Immutable fallback wheel conflict/u)
  } finally { await rm(root, { recursive: true, force: true }) }
})
