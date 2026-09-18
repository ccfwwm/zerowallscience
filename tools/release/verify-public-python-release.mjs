import assert from 'node:assert/strict'
import { createHash, verify } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const work = resolve(process.argv[2] ?? '.build/python-1.4.0')
const local = JSON.parse(await readFile(join(work, 'dist/latest.json'), 'utf8'))
const key = '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA9DJ9yg3F5f67/cEE54AdIDtQshvLP0SF5gVe3F3X+wA=\n-----END PUBLIC KEY-----'
const base = local.archiveUrl.slice(0, local.archiveUrl.lastIndexOf('/'))
const latestUrl = base.slice(0, base.lastIndexOf('/')) + '/latest.json'
const links = [latestUrl, `${base}/manifest.json`]
for (const url of links) {
  const response = await fetch(url, { cache: 'no-store' })
  assert.equal(response.status, 200)
  const manifest = await response.json()
  assert.deepEqual(manifest, local)
  const { signature, ...payload } = manifest
  assert.equal(signature.keyId, 'stable-3')
  assert.ok(verify(null, Buffer.from(JSON.stringify(payload)), key, Buffer.from(signature.value, 'base64')))
}
const response = await fetch(local.archiveUrl, { cache: 'no-store' })
assert.equal(response.status, 200)
let size = 0
const hash = createHash('sha256')
for await (const chunk of response.body) { size += chunk.length; hash.update(chunk) }
const sha256 = hash.digest('hex')
assert.equal(size, local.archiveSize)
assert.equal(sha256, local.archiveSha256)
const result = { ok: true, checkedAt: new Date().toISOString(), environmentVersion: local.environmentVersion, python: local.python.version, keyId: 'stable-3', archiveUrl: local.archiveUrl, latestUrl, manifestUrl: links[1], size, sha256 }
await writeFile(join(work, 'public-verification.json'), JSON.stringify(result, null, 2))
console.log(JSON.stringify(result, null, 2))
