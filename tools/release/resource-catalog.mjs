import { createHash, randomUUID, sign, verify } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, mkdir, open, rename, readFile, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { physicalFs } from '../commands/physical-fs.mjs'
import { retryTransientTransfer } from '../commands/network-retry.mjs'

// Consumers may share a transfer only when their integrity, source, and
// cancellation contracts agree. Independent transfers use their own parts.
const inFlightDownloads = new Map()

export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
  return value
}
export function signingBytes(document) {
  const { signature: _signature, ...payload } = document
  return Buffer.from(JSON.stringify(canonical(payload)))
}
export function signCatalog(document, privateKey, keyId) {
  return { ...document, signature: { algorithm: 'ed25519', keyId, value: sign(null, signingBytes(document), privateKey).toString('base64') } }
}
export function verifyCatalog(document, publicKeys, target) {
  verifySignedDocument(document, publicKeys, { mode: target?.signatureMode })
  if (document.schema !== 1 || !Array.isArray(document.resources)) throw new Error('Invalid resource catalog')
  const identities = new Set()
  for (const entry of document.resources) {
    const identity = `${entry.id}@${entry.version}`
    if (identities.has(identity) || !/^[a-zA-Z0-9@/._-]{1,200}$/.test(entry.id) || entry.id.split('/').some(part => !part || part === '.' || part === '..') || !/^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][a-zA-Z0-9.-]+)?$/.test(entry.version)) throw new Error('Invalid resource identity')
    identities.add(identity)
    if (!/^[a-f0-9]{64}$/.test(entry.sha256) || !Number.isSafeInteger(entry.size) || entry.size <= 0 || typeof entry.restartRequired !== 'boolean' || typeof entry.rollbackSupported !== 'boolean') throw new Error('Invalid resource integrity fields')
    const url = new URL(entry.downloadUrl)
    if (url.protocol !== 'https:' && !(target?.local && document.localOnly && url.protocol === 'file:')) throw new Error('Resource download must use HTTPS')
    if (!entry.dshRange || !entry.desktopRange || !Array.isArray(entry.platform) || !Array.isArray(entry.architecture)) throw new Error('Missing resource compatibility range')
  }
  return document
}
export function verifySignedDocument(document, publicKeys, { mode = 'strict' } = {}) {
  const signature = document?.signature
  const key = publicKeys[signature?.keyId]
  let valid = false
  try { valid = Boolean(key && signature?.algorithm === 'ed25519' && verify(null, signingBytes(document), key, Buffer.from(signature.value, 'base64'))) } catch { /* Malformed signatures use the same policy as untrusted keys. */ }
  if (!valid) {
    if (mode !== 'warn') throw new Error('Resource catalog signature is invalid or untrusted')
    console.warn('[PLUGIN_VERIFICATION_WARNING] Resource catalog signature is invalid or untrusted; continuing under the configured plugin policy')
  }
  return document
}
export function compareVersions(left, right) {
  const parse = value => {
    const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(value)
    if (!match) throw new Error('Invalid semantic version')
    return { core: match.slice(1, 4).map(Number), pre: match[4]?.split('.') }
  }
  const a = parse(left), b = parse(right)
  for (let i = 0; i < 3; i++) if (a.core[i] !== b.core[i]) return a.core[i] - b.core[i]
  if (!a.pre || !b.pre) return a.pre ? -1 : b.pre ? 1 : 0
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const aa = a.pre[i], bb = b.pre[i]
    if (aa === bb) continue
    if (aa === undefined || bb === undefined) return aa === undefined ? -1 : 1
    const an = /^\d+$/.test(aa), bn = /^\d+$/.test(bb)
    return an && bn ? Number(aa) - Number(bb) : an !== bn ? an ? -1 : 1 : aa < bb ? -1 : 1
  }
  return 0
}
export function assertCompatible(entry, target) {
  if (!entry.platform.includes(target.platform) || !entry.architecture.includes(target.architecture)) throw new Error('Resource target is incompatible')
  for (const [runtime, range, installed] of [['DSH', entry.dshRange, target.dshVersion], ['Desktop', entry.desktopRange, target.desktopVersion]]) {
    if (range.min === range.max && installed !== range.min) throw new Error(`Resource requires a different exact runtime: ${entry.id ?? entry.kind ?? 'resource'}; ${runtime} requires ${range.min}, installed ${installed}`)
    if (compareVersions(installed, range.min) < 0 || (range.max && compareVersions(installed, range.max) > 0)) throw new Error('Resource runtime is incompatible')
  }
}
export async function fileDigest(path) {
  const hash = createHash('sha256')
  const stream = String(path).endsWith('.asar')
    ? physicalFs.createReadStream(path, { highWaterMark: 4 * 1024 * 1024 })
    : createReadStream(path, { highWaterMark: 1024 * 1024 })
  for await (const chunk of stream) hash.update(chunk)
  return hash.digest('hex')
}
/** Download into a new content-addressed generation; never overwrite a live package. */
export function downloadResource(entry, directory, { local = false, fetcher = fetch, signal, timeoutMs = 120_000 } = {}) {
  const { sha256, size: expectedSize, downloadUrl } = entry
  const destination = join(directory, sha256 + '.package')
  const records = inFlightDownloads.get(destination) ?? new Set()
  const existing = [...records].find(record => record.expectedSize === expectedSize && record.downloadUrl === downloadUrl
    && record.local === local && record.fetcher === fetcher && record.signal === signal && record.timeoutMs === timeoutMs)
  if (existing) return existing.promise
  const record = { expectedSize, downloadUrl, local, fetcher, signal, timeoutMs }
  const operation = (async () => {
    // A caller's cancellation signal must not disable the transfer deadline.
    // Plugin batches always pass one so a failed sibling can abort the group.
    const deadline = AbortSignal.timeout(timeoutMs)
    const transferSignal = signal ? AbortSignal.any([signal, deadline]) : deadline
    transferSignal.throwIfAborted()
    const url = new URL(downloadUrl)
    if (url.protocol !== 'https:' && !(url.protocol === 'file:' && local)) throw new Error('Resource download must use HTTPS')
    await mkdir(directory, { recursive: true })
    if ((await stat(destination).catch(() => undefined))?.size === expectedSize && await fileDigest(destination) === sha256) {
      transferSignal.throwIfAborted()
      return destination
    }
    return retryTransientTransfer(async () => {
      const temporary = destination + `.${randomUUID()}.part`
      const output = await open(temporary, 'wx', 0o600)
      let size = 0
      const hash = createHash('sha256')
      try {
        let body
        if (url.protocol === 'file:' && local) body = [await readFile(url)]
        else {
          const response = await fetcher(url, { redirect: 'error', signal: transferSignal })
          if (!response.ok || !response.body) throw new Error('Resource download failed')
          body = response.body
        }
        for await (const chunk of body) {
          transferSignal.throwIfAborted()
          size += chunk.length
          if (size > expectedSize) throw new Error('Resource exceeded signed size')
          hash.update(chunk)
          for (let offset = 0; offset < chunk.length;) offset += (await output.write(chunk, offset, chunk.length - offset)).bytesWritten
        }
        transferSignal.throwIfAborted()
        if (size !== expectedSize || hash.digest('hex') !== sha256) throw new Error('Resource SHA-256 or size mismatch')
        await output.sync()
        await output.close()
        transferSignal.throwIfAborted()
        try {
          await rename(temporary, destination)
        } catch (error) {
          // Windows can reject replacement when another independently verified
          // transfer has just committed the same content-addressed file.
          const installed = await lstat(destination).catch(() => undefined)
          if (!['EEXIST', 'EPERM', 'EACCES'].includes(error.code) || !installed?.isFile() || installed.size !== expectedSize
            || await fileDigest(destination).catch(() => undefined) !== sha256) throw error
          await rm(temporary, { force: true })
        }
        return destination
      } catch (error) {
        await output.close().catch(() => undefined)
        await rm(temporary, { force: true })
        throw error
      }
    }, { signal: transferSignal })
  })()
  record.promise = operation.finally(() => {
    records.delete(record)
    if (!records.size && inFlightDownloads.get(destination) === records) inFlightDownloads.delete(destination)
  })
  records.add(record)
  inFlightDownloads.set(destination, records)
  return record.promise
}
