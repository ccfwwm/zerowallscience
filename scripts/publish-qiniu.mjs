import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const qiniu = require('qiniu')
const root = resolve(import.meta.dirname, '..')
const dist = resolve(root, 'desktop', 'dist')
const envText = await readFile(resolve(root, 'scripts', '.env.qiniu'), 'utf8')
const env = Object.fromEntries(envText.split(/\r?\n/u).map(line => /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/u.exec(line)).filter(Boolean).map(match => [match[1], match[2].replace(/^['"]|['"]$/gu, '')]))
for (const key of ['QINIU_ACCESS_KEY', 'QINIU_SECRET_KEY', 'QINIU_BUCKET', 'QINIU_REGION', 'QINIU_DOMAIN']) if (!env[key]) throw new Error(`Missing ${key} in scripts/.env.qiniu`)
const version = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')).version
const installer = `zerowall-science-${version}-win-x64.exe`
const blockmap = `${installer}.blockmap`
const latest = `zerowall-science-${version}-latest.json`
for (const name of [installer, blockmap, latest, 'latest.yml', 'releases-latest.json', 'releases-zerowallsciencedev-latest.json']) await stat(resolve(dist, name))
const mac = new qiniu.auth.digest.Mac(env.QINIU_ACCESS_KEY, env.QINIU_SECRET_KEY)
const config = new qiniu.conf.Config(); config.zone = qiniu.zone[`Zone_${env.QINIU_REGION}`] ?? qiniu.zone.Zone_z2
const uploader = new qiniu.form_up.FormUploader(config)
function upload(key, file, overwrite) {
  return new Promise((resolvePromise, reject) => {
    const policy = new qiniu.rs.PutPolicy({ scope: `${env.QINIU_BUCKET}:${key}`, overwrite })
    const mimeType = file.endsWith('.yml') ? 'text/yaml; charset=utf-8'
      : file.endsWith('.json') ? 'application/json; charset=utf-8'
        : 'application/octet-stream'
    const extra = new qiniu.form_up.PutExtra('', {}, mimeType)
    uploader.putFile(policy.uploadToken(mac), key, resolve(dist, file), extra, (error, body, info) => info?.statusCode === 200
      ? resolvePromise(body)
      : reject(error ?? new Error(`Qiniu upload failed for ${key}: HTTP ${info?.statusCode}`)))
  })
}
function refresh(urls) {
  const manager = new qiniu.cdn.CdnManager(mac)
  return new Promise((resolvePromise, reject) => manager.refreshUrls(urls, (error, body, info) => info?.statusCode >= 200 && info.statusCode < 300
    ? resolvePromise(body)
    : reject(error ?? new Error(`Qiniu CDN refresh failed: HTTP ${info?.statusCode}`))))
}
const metadataOnly = process.env.ZEROWALL_QINIU_METADATA_ONLY === '1'
const objects = metadataOnly
  ? [['stable/latest.yml', 'latest.yml', true], [`stable/releases/${version}/${latest}`, latest, true], ['stable/releases/latest.json', 'releases-latest.json', true], ['stable/releases-zerowallsciencedev/latest.json', 'releases-zerowallsciencedev-latest.json', true]]
  : [['stable/latest.yml', 'latest.yml', true], [`stable/releases/${version}/${installer}`, installer, false], [`stable/releases/${version}/${blockmap}`, blockmap, false], [`stable/releases/${version}/${latest}`, latest, false], ['stable/releases/latest.json', 'releases-latest.json', true], ['stable/releases-zerowallsciencedev/latest.json', 'releases-zerowallsciencedev-latest.json', true]]
if (process.env.ZEROWALL_QINIU_REFRESH_ONLY !== '1') {
  for (const [key, file, overwrite] of objects) {
    await upload(key, file, overwrite)
    const bytes = await readFile(resolve(dist, file))
    console.log(`${key}\t${bytes.byteLength}\t${createHash('sha256').update(bytes).digest('hex')}`)
  }
}
const base = env.QINIU_DOMAIN.replace(/\/$/u, '')
const refreshUrls = [
  `${base}/stable/latest.yml`,
  `${base}/stable/releases/latest.json`,
  `${base}/stable/releases-zerowallsciencedev/latest.json`,
]
await refresh(refreshUrls)
console.log(`Refreshed ${refreshUrls.length} Qiniu CDN update pointers.`)
console.log(process.env.ZEROWALL_QINIU_REFRESH_ONLY === '1'
  ? `Refreshed Stable ${version} update pointers without uploading objects.`
  : metadataOnly
    ? `Uploaded Stable ${version} metadata only.`
    : `Uploaded immutable Stable ${version} objects and latest pointers.`)
