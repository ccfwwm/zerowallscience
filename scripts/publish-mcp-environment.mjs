import { createHash, verify } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const qiniu = require('qiniu')
const root = resolve(import.meta.dirname, '..')
const envText = await readFile(resolve(root, 'scripts', '.env.qiniu'), 'utf8')
const env = Object.fromEntries(envText.split(/\r?\n/u).map(line => /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/u.exec(line)).filter(Boolean).map(match => [match[1], match[2].replace(/^['"]|['"]$/gu, '')]))
for (const key of ['QINIU_ACCESS_KEY', 'QINIU_SECRET_KEY', 'QINIU_BUCKET', 'QINIU_REGION', 'QINIU_DOMAIN']) if (!env[key]) throw new Error(`Missing ${key} in scripts/.env.qiniu`)
const version = process.env.ZEROWALL_MCP_ENVIRONMENT_VERSION?.trim()
if (!version) throw new Error('ZEROWALL_MCP_ENVIRONMENT_VERSION is required.')
const dist = resolve(process.env.ZEROWALL_MCP_ENVIRONMENT_OUTPUT ?? resolve(root, 'desktop', 'dist', 'mcp-environment'))
const archive = `zerowall-mcp-windows-x64-${version}.zip`
const overwriteVersionAssets = process.env.ZEROWALL_MCP_OVERWRITE === '1'
const publicKeys = {
  'stable-1': `-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAu8wAGfgRWqQBdIGcbkwPlBq01SjgEMybgNh3xVv0ej4=\n-----END PUBLIC KEY-----`,
  'stable-2': `-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAUvKwSI31zGGut3nRi4kRqZGg8eBJskIrfa8Xmp/7VJw=\n-----END PUBLIC KEY-----`,
}
const manifest = JSON.parse(await readFile(resolve(dist, 'latest.json'), 'utf8'))
const versionManifest = JSON.parse(await readFile(resolve(dist, `${version}.json`), 'utf8'))
if (manifest.version !== version || JSON.stringify(manifest) !== JSON.stringify(versionManifest)) throw new Error('MCP latest and version manifests do not match the requested version.')
if (manifest.signature?.algorithm !== 'ed25519' || !publicKeys[manifest.signature.keyId]) throw new Error('MCP manifest must use a trusted Ed25519 key.')
const { signature, ...unsigned } = manifest
if (!verify(null, Buffer.from(JSON.stringify(unsigned)), publicKeys[signature.keyId], Buffer.from(signature.value, 'base64'))) throw new Error('MCP manifest signature failed local verification.')
const archiveBytes = await readFile(resolve(dist, archive))
if (archiveBytes.byteLength !== manifest.archiveSize || createHash('sha256').update(archiveBytes).digest('hex') !== manifest.archiveSha256) throw new Error('MCP archive does not match its signed manifest.')
const files = [[`stable/mcp-environments/windows-x64/${version}/${archive}`, archive, overwriteVersionAssets], [`stable/mcp-environments/windows-x64/${version}/manifest.json`, `${version}.json`, overwriteVersionAssets], ['stable/mcp-environments/windows-x64/latest.json', 'latest.json', true]]
const mac = new qiniu.auth.digest.Mac(env.QINIU_ACCESS_KEY, env.QINIU_SECRET_KEY)
const config = new qiniu.conf.Config(); config.zone = qiniu.zone[`Zone_${env.QINIU_REGION}`] ?? qiniu.zone.Zone_z2
const uploader = new qiniu.form_up.FormUploader(config)
function upload(key, file, overwrite) { return new Promise((resolvePromise, reject) => { const policy = new qiniu.rs.PutPolicy({ scope: `${env.QINIU_BUCKET}:${key}`, overwrite }); uploader.putFile(policy.uploadToken(mac), key, resolve(dist, file), new qiniu.form_up.PutExtra(), (error, body, info) => info?.statusCode === 200 ? resolvePromise(body) : reject(error ?? new Error(`Qiniu upload failed for ${key}: HTTP ${info?.statusCode}`))) }) }
for (const [key, file, overwrite] of files) { const info = await stat(resolve(dist, file)); await upload(key, file, overwrite); const bytes = await readFile(resolve(dist, file)); console.log(`${key}\t${info.size}\t${createHash('sha256').update(bytes).digest('hex')}`) }

const publicBase = env.QINIU_DOMAIN.replace(/\/$/u, '')
const publicManifestResponse = await fetch(`${publicBase}/stable/mcp-environments/windows-x64/latest.json`, { cache: 'no-store' })
if (!publicManifestResponse.ok) throw new Error(`Public MCP manifest returned HTTP ${publicManifestResponse.status}.`)
const publicManifest = await publicManifestResponse.json()
const { signature: publicSignature, ...publicUnsigned } = publicManifest
if (!publicSignature?.keyId || !publicKeys[publicSignature.keyId] || !verify(null, Buffer.from(JSON.stringify(publicUnsigned)), publicKeys[publicSignature.keyId], Buffer.from(publicSignature?.value ?? '', 'base64'))) throw new Error('Public MCP manifest signature verification failed.')
const publicArchiveResponse = await fetch(publicManifest.archiveUrl, { cache: 'no-store' })
if (!publicArchiveResponse.ok) throw new Error(`Public MCP archive returned HTTP ${publicArchiveResponse.status}.`)
const publicArchive = Buffer.from(await publicArchiveResponse.arrayBuffer())
if (publicArchive.byteLength !== publicManifest.archiveSize || createHash('sha256').update(publicArchive).digest('hex') !== publicManifest.archiveSha256) throw new Error('Public MCP archive does not match its signed manifest.')
console.log(`Public MCP environment ${version} signature, size, and SHA-256 verified.`)
