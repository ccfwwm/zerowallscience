import { createHash, verify } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { publishVerifiedAssets } from '../tools/release/publish-verified-assets.mjs'

const require = createRequire(import.meta.url)
const qiniu = require('qiniu')
const root = resolve(import.meta.dirname, '..')
const envText = await readFile(resolve(root, 'scripts', '.env.qiniu'), 'utf8')
const env = Object.fromEntries(envText.split(/\r?\n/u).map(line => /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/u.exec(line)).filter(Boolean).map(match => [match[1], match[2].replace(/^['"]|['"]$/gu, '')]))
for (const key of ['QINIU_ACCESS_KEY', 'QINIU_SECRET_KEY', 'QINIU_BUCKET', 'QINIU_REGION', 'QINIU_DOMAIN']) if (!env[key]) throw new Error(`Missing ${key} in scripts/.env.qiniu`)
const environmentVersion = (process.env.ZEROWALL_MCP_ENVIRONMENT_VERSION ?? process.env.ZEROWALL_MCP_ENVIRONMENT_REVISION)?.trim()
if (!environmentVersion) throw new Error('ZEROWALL_MCP_ENVIRONMENT_VERSION is required.')
const dist = resolve(process.env.ZEROWALL_MCP_ENVIRONMENT_OUTPUT ?? resolve(root, 'desktop', 'dist', 'mcp-environment'))
const archive = `zerowall-python-windows-x64-${environmentVersion}.zip`
const overwriteVersionAssets = process.env.ZEROWALL_MCP_OVERWRITE === '1'
const publicKeys = {
  'stable-1': `-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAu8wAGfgRWqQBdIGcbkwPlBq01SjgEMybgNh3xVv0ej4=\n-----END PUBLIC KEY-----`,
  'stable-2': `-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAUvKwSI31zGGut3nRi4kRqZGg8eBJskIrfa8Xmp/7VJw=\n-----END PUBLIC KEY-----`,
  'stable-3': `-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA9DJ9yg3F5f67/cEE54AdIDtQshvLP0SF5gVe3F3X+wA=\n-----END PUBLIC KEY-----`,
}
const manifest = JSON.parse(await readFile(resolve(dist, 'latest.json'), 'utf8'))
const versionManifest = JSON.parse(await readFile(resolve(dist, `${environmentVersion}.json`), 'utf8'))
if ((manifest.environmentVersion ?? manifest.version) !== environmentVersion || JSON.stringify(manifest) !== JSON.stringify(versionManifest)) throw new Error('MCP latest and version manifests do not match the requested environment version.')
if (manifest.signature?.algorithm !== 'ed25519' || !publicKeys[manifest.signature.keyId]) throw new Error('MCP manifest must use a trusted Ed25519 key.')
const { signature, ...unsigned } = manifest
if (!verify(null, Buffer.from(JSON.stringify(unsigned)), publicKeys[signature.keyId], Buffer.from(signature.value, 'base64'))) throw new Error('MCP manifest signature failed local verification.')
async function hashFile(file) {
  const hash = createHash('sha256'); let size = 0
  for await (const chunk of createReadStream(file)) { hash.update(chunk); size += chunk.length }
  return { size, sha256: hash.digest('hex') }
}
const archiveDigest = await hashFile(resolve(dist, archive))
if (archiveDigest.size !== manifest.archiveSize || archiveDigest.sha256 !== manifest.archiveSha256) throw new Error('MCP archive does not match its signed manifest.')
const files = [[`stable/zerowall-python/windows-x64/${environmentVersion}/${archive}`, archive, overwriteVersionAssets], [`stable/zerowall-python/windows-x64/${environmentVersion}/manifest.json`, `${environmentVersion}.json`, overwriteVersionAssets], ['stable/zerowall-python/windows-x64/latest.json', 'latest.json', true]]
const mac = new qiniu.auth.digest.Mac(env.QINIU_ACCESS_KEY, env.QINIU_SECRET_KEY)
const config = new qiniu.conf.Config(); config.zone = qiniu.zone[`Zone_${env.QINIU_REGION}`] ?? qiniu.zone.Zone_z2
const uploader = new qiniu.form_up.FormUploader(config)
const resumeUploader = new qiniu.resume_up.ResumeUploader(config)
function upload(key, file, overwrite) {
  return new Promise((resolvePromise, reject) => {
    const policy = new qiniu.rs.PutPolicy({ scope: `${env.QINIU_BUCKET}:${key}`, insertOnly: overwrite ? 0 : 1, expires: 86400 })
    const callback = (error, body, info) => info?.statusCode === 200 ? resolvePromise(body) : reject(new Error(`Qiniu upload failed for ${key}: HTTP ${info?.statusCode ?? 'network error'}`))
    if (file.endsWith('.zip')) {
      const extra = qiniu.resume_up.PutExtra.create({ resumeRecordFile: resolve(dist, `${file}.upload-progress.json`), version: 'v2' })
      resumeUploader.putFile(policy.uploadToken(mac), key, resolve(dist, file), extra, callback)
    } else uploader.putFile(policy.uploadToken(mac), key, resolve(dist, file), new qiniu.form_up.PutExtra(), callback)
  })
}
const publicBase = env.QINIU_DOMAIN.replace(/\/$/u, '')
function verifyPublicManifest(value) {
  const { signature: receivedSignature, ...payload } = value
  if (!receivedSignature?.keyId || !publicKeys[receivedSignature.keyId] || !verify(null, Buffer.from(JSON.stringify(payload)), publicKeys[receivedSignature.keyId], Buffer.from(receivedSignature.value ?? '', 'base64'))) throw new Error('Public manifest signature verification failed.')
  if (JSON.stringify(value) !== JSON.stringify(manifest)) throw new Error('Public manifest does not match this exact release.')
}
async function getManifest(url) {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error(`Public manifest HTTP ${response.status}`)
  const value = await response.json(); verifyPublicManifest(value); return value
}
async function verifyPublicArchive() {
  const response = await fetch(manifest.archiveUrl, { cache: 'no-store' })
  if (!response.ok || !response.body) throw new Error(`Public archive HTTP ${response.status}`)
  const hash = createHash('sha256'); let size = 0
  for await (const chunk of response.body) { hash.update(chunk); size += chunk.length }
  if (size !== manifest.archiveSize || hash.digest('hex') !== manifest.archiveSha256) throw new Error('Public archive size/hash mismatch; latest was not changed.')
}
// Immutable assets must be publicly verified before the shared update pointer moves.
await publishVerifiedAssets({
  assets: files.slice(0, 2),
  upload: async ([key, file, overwrite]) => {
    await upload(key, file, overwrite)
    const digest = await hashFile(resolve(dist, file))
    console.log(`${key}\t${digest.size}\t${digest.sha256}`)
  },
  verifyVersion: () => getManifest(`${publicBase}/${files[1][0]}`),
  verifyArchive: verifyPublicArchive,
  promote: async () => { console.log('Versioned assets verified; promoting latest.json.'); await upload(files[2][0], files[2][1], true) },
  verifyLatest: async () => {
    await getManifest(`${publicBase}/${files[2][0]}?release=${encodeURIComponent(environmentVersion)}&verify=${Date.now()}`)
    await getManifest(`${publicBase}/${files[2][0]}`)
  },
})
console.log(`Public ZeroWall Python ${environmentVersion} signature, size, SHA-256 and exact latest pointer verified.`)
