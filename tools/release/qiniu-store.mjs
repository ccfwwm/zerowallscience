import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileDigest } from './resource-catalog.mjs'

export async function openQiniuStore(root) {
  const qiniu = createRequire(import.meta.url)('qiniu')
  const text = await readFile(process.env.ZEROWALL_QINIU_ENV_FILE || resolve(root, 'scripts/env/.env.qiniu'), 'utf8')
  const env = Object.fromEntries(text.split(/\r?\n/u).map(line => /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/u.exec(line)).filter(Boolean).map(match => [match[1], match[2].replace(/^['"]|['"]$/gu, '')]))
  for (const name of ['QINIU_ACCESS_KEY', 'QINIU_SECRET_KEY', 'QINIU_BUCKET', 'QINIU_REGION', 'QINIU_DOMAIN']) if (!env[name]) throw new Error(`Missing Qiniu setting: ${name}`)
  const base = (/^https?:\/\//u.test(env.QINIU_DOMAIN) ? env.QINIU_DOMAIN : `https://${env.QINIU_DOMAIN}`).replace(/\/$/u, '')
  if (new URL(base).protocol !== 'https:') throw new Error('Public release requires HTTPS')
  const mac = new qiniu.auth.digest.Mac(env.QINIU_ACCESS_KEY, env.QINIU_SECRET_KEY)
  const config = new qiniu.conf.Config({ useHttpsDomain: true })
  config.zone = qiniu.zone[`Zone_${env.QINIU_REGION}`] ?? qiniu.zone.Zone_z2
  const manager = new qiniu.rs.BucketManager(mac, config)
  const uploader = new qiniu.form_up.FormUploader(config)
  const resumable = new qiniu.resume_up.ResumeUploader(config)
  const sleep = ms => new Promise(accept => setTimeout(accept, ms))
  async function exists(key) {
    return new Promise((accept, reject) => manager.stat(env.QINIU_BUCKET, key, (_error, _body, info) => {
      if (info?.statusCode === 200) accept(true)
      else if (info?.statusCode === 612) accept(false)
      else reject(new Error(`Qiniu stat ${key}: HTTP ${info?.statusCode ?? 'network error'}`))
    }))
  }
  async function verify(asset) {
    const expected = { bytes: (await stat(asset.path)).size, sha256: await fileDigest(asset.path) }
    const url = `${base}/${asset.key}`
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        const response = await fetch(`${url}?zws_verify=${Date.now()}`, { redirect: 'error', signal: AbortSignal.timeout(900_000), cache: 'no-store' })
        if (!response.ok || !response.body) throw new Error(`Public object HTTP ${response.status}`)
        const hash = createHash('sha256'); let bytes = 0
        for await (const chunk of response.body) { bytes += chunk.length; hash.update(chunk) }
        const sha256 = hash.digest('hex')
        if (bytes !== expected.bytes || sha256 !== expected.sha256) throw new Error('Public size or SHA-256 differs from local artifact')
        return { key: asset.key, url, ...expected, verifiedAt: new Date().toISOString() }
      } catch (error) {
        if (attempt === 5) throw new Error(`${asset.key}: ${error.message}`)
        await sleep(Math.min(10_000, 1000 * attempt))
      }
    }
  }
  async function upload(asset, mutable = false) {
    if (!mutable && await exists(asset.key)) {
      const receipt = await verify(asset)
      console.log(`Reuse immutable object: ${asset.key}`)
      return receipt
    }
    const size = (await stat(asset.path)).size
    const mime = asset.key.endsWith('.json') ? 'application/json; charset=utf-8' : asset.key.endsWith('.yml') ? 'text/yaml; charset=utf-8' : 'application/octet-stream'
    for (let attempt = 1; attempt <= 8; attempt++) {
      try {
        const policy = new qiniu.rs.PutPolicy({ scope: `${env.QINIU_BUCKET}:${asset.key}`, insertOnly: mutable ? 0 : 1, expires: 86400 })
        await new Promise((accept, reject) => {
          const done = (_error, _body, info) => info?.statusCode === 200 ? accept() : reject(new Error(`Upload HTTP ${info?.statusCode ?? 'network error'}`))
          if (size >= 16 * 1024 * 1024) {
            let last = -10
            const progress = (sent, total) => { const n = Math.floor(sent / total * 100); if (n >= last + 10) { console.log(`${asset.key}: ${n}%`); last = n } }
            const extra = qiniu.resume_up.PutExtra.create(asset.key.split('/').at(-1), {}, mime, asset.path + '.upload-progress.json', progress, 8 * 1024 * 1024, 'v2')
            resumable.putFile(policy.uploadToken(mac), asset.key, asset.path, extra, done)
          } else uploader.putFile(policy.uploadToken(mac), asset.key, asset.path, new qiniu.form_up.PutExtra('', {}, mime), done)
        })
        console.log(`Uploaded: ${asset.key} (${size} bytes)`)
        return
      } catch (error) {
        // A completed upload can lose its response. Do not overwrite it.
        if (!mutable && await exists(asset.key)) return verify(asset)
        if (attempt === 8) throw new Error(`${asset.key}: ${error.message}`)
        console.log(`Retry ${asset.key}, attempt ${attempt + 1}`)
        await sleep(Math.min(30_000, 2000 * 2 ** (attempt - 1)))
      }
    }
  }
  async function refresh(keys) {
    const cdn = new qiniu.cdn.CdnManager(mac)
    return new Promise((accept, reject) => cdn.refreshUrls(keys.map(key => `${base}/${key}`), (_error, _body, info) => info?.statusCode >= 200 && info.statusCode < 300 ? accept() : reject(new Error(`CDN refresh HTTP ${info?.statusCode ?? 'network error'}`))))
  }
  return { base, exists, upload, verify, refresh }
}
