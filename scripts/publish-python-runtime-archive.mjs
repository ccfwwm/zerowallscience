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
// The science layer travels beside the archive: its own small signed manifest so
// a version bump never re-uploads the ZIP, plus a pointer that lets a rolling
// update be detected without touching the archive at all.
const science = manifest.dependencies?.science
if (science === undefined) throw new Error('MCP manifest does not describe the science layer.')
const scienceFile = new URL(science.manifestUrl).pathname.split('/').at(-1)
const scienceDigest = await hashFile(resolve(dist, scienceFile))
if (scienceDigest.size !== science.manifestSize || scienceDigest.sha256 !== science.manifestSha256) throw new Error('Science manifest does not match its signed reference in the archive manifest.')
const versionRoot = `stable/zerowall-python/windows-x64/${environmentVersion}`
const scienceVersionRoot = 'stable/zerowall-science-python/windows-x64'
const files = [
  [`${versionRoot}/${archive}`, archive, overwriteVersionAssets],
  [`${versionRoot}/manifest.json`, `${environmentVersion}.json`, overwriteVersionAssets],
  [`${scienceVersionRoot}/${scienceFile}`, scienceFile, overwriteVersionAssets],
  ['stable/zerowall-python/windows-x64/latest.json', 'latest.json', true],
  ['stable/zerowall-science-python/windows-x64/latest.json', 'science-latest.json', true],
]
const mac = new qiniu.auth.digest.Mac(env.QINIU_ACCESS_KEY, env.QINIU_SECRET_KEY)
const config = new qiniu.conf.Config(); config.zone = qiniu.zone[`Zone_${env.QINIU_REGION}`] ?? qiniu.zone.Zone_z2
const uploader = new qiniu.form_up.FormUploader(config)
const resumeUploader = new qiniu.resume_up.ResumeUploader(config)
function upload(key, file, overwrite) {
  return new Promise((resolvePromise, reject) => {
    const policy = new qiniu.rs.PutPolicy({ scope: `${env.QINIU_BUCKET}:${key}`, insertOnly: overwrite ? 0 : 1, expires: 86400 })
    const callback = (error, body, info) => info?.statusCode === 200 ? resolvePromise(body) : reject(new Error(`Qiniu upload failed for ${key}: HTTP ${info?.statusCode ?? 'network error'}`))
    if (file.endsWith('.zip')) {
      let lastPercent = -5
      const progress = (bytes, total) => { const percent = Math.floor(bytes / total * 100); if (percent >= lastPercent + 5) { console.log(`Archive upload ${percent}%`); lastPercent = percent } }
      const extra = qiniu.resume_up.PutExtra.create(file, undefined, 'application/zip', resolve(dist, `${file}.upload-progress.json`), progress, 8 * 1024 * 1024, 'v2')
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
async function getScienceBytes(url) {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok || !response.body) throw new Error(`Public science manifest HTTP ${response.status}`)
  return new Uint8Array(await response.arrayBuffer())
}
async function verifyPublicScience() {
  const bytes = await getScienceBytes(`${publicBase}/${files[2][0]}`)
  const digest = createHash('sha256').update(bytes).digest('hex')
  if (bytes.length !== science.manifestSize || digest !== science.manifestSha256) throw new Error('Public science manifest size/hash mismatch; latest was not changed.')
  const document = JSON.parse(new TextDecoder().decode(bytes))
  const { signature: received, ...payload } = document
  if (!received?.keyId || !publicKeys[received.keyId] || !verify(null, Buffer.from(JSON.stringify(payload)), publicKeys[received.keyId], Buffer.from(received.value ?? '', 'base64'))) throw new Error('Public science manifest signature verification failed.')
  if (JSON.stringify(document) !== JSON.stringify(JSON.parse(await readFile(resolve(dist, scienceFile), 'utf8')))) throw new Error('Public science manifest does not match this exact release.')
}
// Immutable assets must be publicly verified before the shared update pointer moves.
await publishVerifiedAssets({
  assets: files.slice(0, 3),
  upload: async ([key, file, overwrite]) => {
    await upload(key, file, overwrite)
    const digest = await hashFile(resolve(dist, file))
    console.log(`${key}\t${digest.size}\t${digest.sha256}`)
  },
  verifyVersion: async () => { await getManifest(`${publicBase}/${files[1][0]}`); await verifyPublicScience() },
  verifyArchive: verifyPublicArchive,
  promote: async () => {
    console.log('Versioned assets verified; promoting latest.json and science-latest.json.')
    await upload(files[3][0], files[3][1], true)
    await upload(files[4][0], files[4][1], true)
    const cdn = new qiniu.cdn.CdnManager(mac)
    await new Promise((resolveRefresh, reject) => cdn.refreshUrls([`${publicBase}/${files[3][0]}`, `${publicBase}/${files[4][0]}`], (_error, body, info) => {
      if (info?.statusCode === 200 && body?.code === 200) resolveRefresh()
      else reject(new Error(`Latest pointer uploaded, but CDN refresh failed: HTTP ${info?.statusCode}`))
    }))
  },
  verifyLatest: async () => {
    await getManifest(`${publicBase}/${files[3][0]}?release=${encodeURIComponent(environmentVersion)}&verify=${Date.now()}`)
    for (let attempt = 0; ; attempt++) {
      try { await getManifest(`${publicBase}/${files[3][0]}`); break }
      catch (error) {
        if (attempt >= 11) throw error
        console.log('Waiting for CDN pointer refresh...')
        await new Promise(resolveWait => setTimeout(resolveWait, 10_000))
      }
    }
    // The science pointer must resolve to the very bytes just published, so a
    // client syncing only the science layer cannot be served a stale document.
    const pointed = await getScienceBytes(`${publicBase}/${files[4][0]}?verify=${Date.now()}`)
    const published = await getScienceBytes(`${publicBase}/${files[2][0]}`)
    if (pointed.length !== published.length || !pointed.every((byte, index) => byte === published[index])) throw new Error('science-latest.json does not point at this exact science manifest.')
  },
})
console.log(`Public ZeroWall Python ${environmentVersion} signature, size, SHA-256, science layer and exact latest pointers verified.`)
