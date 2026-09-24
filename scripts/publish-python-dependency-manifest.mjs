/** Publishes JSON only. Does not upload Python archives or wheel files. */
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { verifyDocument } from '../tools/release/python-layer-split.mjs'
const require = createRequire(import.meta.url)
const qiniu = require('qiniu')
const root = resolve(import.meta.dirname, '..')
const output = resolve(process.env.ZEROWALL_PYTHON_DEPENDENCY_OUTPUT ?? join(root, 'desktop', 'dist', 'python-dependencies'))
const bytes = await readFile(join(output, 'latest.json'))
const document = JSON.parse(bytes.toString('utf8'))
const publicKey = `-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA9DJ9yg3F5f67/cEE54AdIDtQshvLP0SF5gVe3F3X+wA=\n-----END PUBLIC KEY-----`
if (document.schema !== 3 || document.runtimeId !== 'zerowall-science-python' || document.signature.keyId !== 'stable-3' || !verifyDocument(document, publicKey)) throw new Error('Refusing to publish an unverified dependency manifest.')
if (!/^[A-Za-z0-9_.-]{1,100}$/u.test(document.revision)) throw new Error('Invalid manifest revision.')
const versionName = `manifest-${document.revision}.json`
if (!(await readFile(join(output, versionName))).equals(bytes)) throw new Error('Latest and immutable dependency manifest differ.')
const env = Object.fromEntries((await readFile(join(root, 'scripts', '.env.qiniu'), 'utf8')).split(/\r?\n/u).map(line => /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/u.exec(line)).filter(Boolean).map(match => [match[1], match[2].replace(/^['"]|['"]$/gu, '')]))
for (const name of ['QINIU_ACCESS_KEY', 'QINIU_SECRET_KEY', 'QINIU_BUCKET', 'QINIU_REGION', 'QINIU_DOMAIN']) if (!env[name]) throw new Error(`Missing ${name}`)
const mac = new qiniu.auth.digest.Mac(env.QINIU_ACCESS_KEY, env.QINIU_SECRET_KEY)
const config = new qiniu.conf.Config(); config.zone = qiniu.zone[`Zone_${env.QINIU_REGION}`] ?? qiniu.zone.Zone_z2
const uploader = new qiniu.form_up.FormUploader(config)
const prefix = 'stable/zerowall-science-python/windows-x64'
const publicBase = env.QINIU_DOMAIN.replace(/\/$/u, '')
const digest = createHash('sha256').update(bytes).digest('hex')
async function upload(name, overwrite) {
  const key = `${prefix}/${name}`
  const policy = new qiniu.rs.PutPolicy({ scope: `${env.QINIU_BUCKET}:${key}`, insertOnly: overwrite ? 0 : 1 })
  await new Promise((accept, reject) => uploader.putFile(policy.uploadToken(mac), key, join(output, name), new qiniu.form_up.PutExtra(), (_error, _body, info) => info?.statusCode === 200 ? accept() : reject(new Error(`Manifest upload failed: HTTP ${info?.statusCode}`))))
}
async function verifyPublic(name) {
  const response = await fetch(`${publicBase}/${prefix}/${name}?verify=${Date.now()}`, { cache: 'no-store' })
  if (!response.ok) throw new Error(`Public manifest HTTP ${response.status}`)
  const received = Buffer.from(await response.arrayBuffer())
  if (createHash('sha256').update(received).digest('hex') !== digest || !received.equals(bytes) || !verifyDocument(JSON.parse(received.toString('utf8')), publicKey)) throw new Error('Public manifest byte/hash/signature verification failed.')
}
await upload(versionName, false)
await verifyPublic(versionName)
await upload('latest.json', true)
await verifyPublic('latest.json')
await writeFile(join(output, 'publish-receipt.json'), JSON.stringify({ publishedAt: new Date().toISOString(), revision: document.revision, sha256: digest, size: bytes.length, manifestUrl: `${publicBase}/${prefix}/${versionName}`, latestUrl: `${publicBase}/${prefix}/latest.json` }, null, 2))
console.log(`Published and verified dependency manifest ${document.revision}; no archives or wheels uploaded.`)
