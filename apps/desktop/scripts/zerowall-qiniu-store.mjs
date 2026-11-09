import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
async function fileDigest(path) { const hash = createHash('sha256'); for await (const chunk of createReadStream(path)) hash.update(chunk); return hash.digest('hex') }

/** Open the release store from explicit credentials; errors never contain secret values. */
export async function openQiniuStore(env) {
  const qiniu = createRequire(import.meta.url)('qiniu')
  for (const name of ['QINIU_ACCESS_KEY', 'QINIU_SECRET_KEY', 'QINIU_BUCKET', 'QINIU_REGION', 'QINIU_DOMAIN']) if (!env[name]) throw new Error('Missing Qiniu setting: ' + name)
  const base = (/^https?:\/\//u.test(env.QINIU_DOMAIN) ? env.QINIU_DOMAIN : `https://${env.QINIU_DOMAIN}`).replace(/\/$/u, '')
  if (new URL(base).protocol !== 'https:') throw new Error('Public release requires HTTPS')
  const mac = new qiniu.auth.digest.Mac(env.QINIU_ACCESS_KEY, env.QINIU_SECRET_KEY)
  const config = new qiniu.conf.Config({ useHttpsDomain: true })
  const regions = { 'cn-east-1': 'z0', 'cn-east-2': 'cnEast2', 'cn-north-1': 'z1', 'cn-south-1': 'z2', 'na0': 'na0', 'as0': 'as0', 'ap-southeast-1': 'as0' }
  const region = env.QINIU_REGION.replace(/^Zone_/u, '')
  config.zone = qiniu.zone['Zone_' + (regions[region] ?? region)]
  if (!config.zone) throw new Error('Unsupported Qiniu region')
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
  async function listPrefix(prefix, timeoutMs) {
    manager._httpClient.timeout = timeoutMs
    const keys = []
    let marker
    do {
      const page = await new Promise((accept, reject) => manager.listPrefix(env.QINIU_BUCKET,
        { prefix, limit: 1000, ...(marker === undefined ? {} : { marker }) }, (error, body, info) => {
          if (error) reject(new Error('Qiniu list request failed'))
          else if (info?.statusCode !== 200) reject(new Error(`Qiniu list HTTP ${info?.statusCode ?? 'network error'}`))
          else accept(body ?? { items: [], marker: '' })
        }))
      keys.push(...(page.items ?? []).map(item => item.key).filter(key => typeof key === 'string'))
      const next = page.marker || undefined
      if (next !== undefined && next === marker) throw new Error('Qiniu list did not advance its marker')
      marker = next
    } while (marker !== undefined)
    return keys
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
  return { base, exists, listPrefix, upload, verify, refresh }
}
