import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { statSync } from 'node:fs'
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
// Use HTTPS for uploads. Large Windows installers are sent through the
// resumable API below so transient resets do not discard completed chunks.
const config = new qiniu.conf.Config({ useHttpsDomain: true }); config.zone = qiniu.zone[`Zone_${env.QINIU_REGION}`] ?? qiniu.zone.Zone_z2
const uploader = new qiniu.form_up.FormUploader(config)
const resumeUploader = new qiniu.resume_up.ResumeUploader(config)
const wait = milliseconds => new Promise(resolvePromise => setTimeout(resolvePromise, milliseconds))
async function uploadResumable(token, key, file, localPath, progressFile, mimeType) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await new Promise((resolvePromise, reject) => {
        let settled = false
        let lastPercent = -5
        const progress = (uploaded, total) => {
          const percent = Math.floor(uploaded / total * 100)
          if (percent >= lastPercent + 5) {
            console.log(`Qiniu upload ${file}: ${percent}%`)
            lastPercent = percent
          }
        }
        const extra = qiniu.resume_up.PutExtra.create(file, {}, mimeType, progressFile, progress, 8 * 1024 * 1024, 'v2')
        resumeUploader.putFile(token, key, localPath, extra, (error, body, info) => {
          if (settled) return
          settled = true
          if (info?.statusCode === 200) resolvePromise(body)
          else reject(error ?? new Error(`Qiniu resumable upload failed for ${key}: HTTP ${info?.statusCode ?? 'network error'}`))
        })
      })
    } catch (error) {
      if (attempt >= 8) throw error
      const delay = Math.min(30_000, 2_000 * 2 ** (attempt - 1))
      console.warn(`Qiniu resumable upload interrupted at attempt ${attempt}; retrying completed chunks in ${delay / 1000}s.`)
      await wait(delay)
    }
  }
}
function upload(key, file, overwrite) {
  return new Promise((resolvePromise, reject) => {
    const policy = new qiniu.rs.PutPolicy({ scope: `${env.QINIU_BUCKET}:${key}`, overwrite })
    const mimeType = file.endsWith('.yml') ? 'text/yaml; charset=utf-8'
      : file.endsWith('.json') ? 'application/json; charset=utf-8'
        : 'application/octet-stream'
    const localPath = resolve(dist, file)
    const callback = (error, body, info) => info?.statusCode === 200
      ? resolvePromise(body)
      : reject(error ?? new Error(`Qiniu upload failed for ${key}: HTTP ${info?.statusCode}`))
    // The installer is large enough that a single multipart request can be
    // reset by the upload edge. Keep the recorder beside the ignored dist
    // artifact so retries continue from completed 8 MiB chunks.
    if (file.endsWith('.exe') && statSync(localPath).size >= 16 * 1024 * 1024) {
      const progressFile = `${localPath}.upload-progress.json`
      uploadResumable(policy.uploadToken(mac), key, file, localPath, progressFile, mimeType).then(resolvePromise, reject)
      return
    }
    uploader.putFile(policy.uploadToken(mac), key, localPath, new qiniu.form_up.PutExtra('', {}, mimeType), callback)
  })
}
function refresh(urls) {
  const manager = new qiniu.cdn.CdnManager(mac)
  return new Promise((resolvePromise, reject) => manager.refreshUrls(urls, (error, body, info) => info?.statusCode >= 200 && info.statusCode < 300
    ? resolvePromise(body)
    : reject(error ?? new Error(`Qiniu CDN refresh failed: HTTP ${info?.statusCode}`))))
}
const metadataOnly = process.env.ZEROWALL_QINIU_METADATA_ONLY === '1'
const overwriteVersionAssets = process.env.ZEROWALL_QINIU_OVERWRITE === '1'
const objects = metadataOnly
  ? [['stable/latest.yml', 'latest.yml', true], [`stable/releases/${version}/${latest}`, latest, true], ['stable/releases/latest.json', 'releases-latest.json', true], ['stable/releases-zerowallsciencedev/latest.json', 'releases-zerowallsciencedev-latest.json', true]]
  : [[`stable/releases/${version}/${installer}`, installer, overwriteVersionAssets], [`stable/releases/${version}/${blockmap}`, blockmap, overwriteVersionAssets], [`stable/releases/${version}/${latest}`, latest, overwriteVersionAssets], ['stable/latest.yml', 'latest.yml', true], ['stable/releases/latest.json', 'releases-latest.json', true], ['stable/releases-zerowallsciencedev/latest.json', 'releases-zerowallsciencedev-latest.json', true]]
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
