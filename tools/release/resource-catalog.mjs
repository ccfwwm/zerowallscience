import { createHash, randomUUID, sign, verify } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, open, rename, readFile, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'

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
  verifySignedDocument(document, publicKeys)
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
export function verifySignedDocument(document, publicKeys) {
  const signature = document?.signature
  const key = publicKeys[signature?.keyId]
  if (!key || signature?.algorithm !== 'ed25519' || !verify(null, signingBytes(document), key, Buffer.from(signature.value, 'base64'))) throw new Error('Resource catalog signature is invalid or untrusted')
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
  for (const [range, installed] of [[entry.dshRange, target.dshVersion], [entry.desktopRange, target.desktopVersion]]) {
    if (range.min === range.max && installed !== range.min) throw new Error('Resource requires a different exact runtime')
    if (compareVersions(installed, range.min) < 0 || (range.max && compareVersions(installed, range.max) > 0)) throw new Error('Resource runtime is incompatible')
  }
}
export async function fileDigest(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}
/** Download into a new content-addressed generation; never overwrite a live package. */
export async function downloadResource(entry, directory, { local = false, fetcher = fetch } = {}) {
  await mkdir(directory, { recursive: true })
  const destination = join(directory, entry.sha256 + '.package')
  if ((await stat(destination).catch(() => undefined))?.size === entry.size && await fileDigest(destination) === entry.sha256) return destination
  const temporary = destination + `.${randomUUID()}.part`
  const url = new URL(entry.downloadUrl)
  const output = await open(temporary, 'wx', 0o600)
  let size = 0
  const hash = createHash('sha256')
  try {
    let body
    if (url.protocol === 'file:' && local) body = [await readFile(url)]
    else {
      if (url.protocol !== 'https:') throw new Error('Resource download must use HTTPS')
      const response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(120_000) })
      if (!response.ok || !response.body) throw new Error('Resource download failed')
      body = response.body
    }
    for await (const chunk of body) {
      size += chunk.length
      if (size > entry.size) throw new Error('Resource exceeded signed size')
      hash.update(chunk)
      for (let offset = 0; offset < chunk.length;) offset += (await output.write(chunk, offset, chunk.length - offset)).bytesWritten
    }
    if (size !== entry.size || hash.digest('hex') !== entry.sha256) throw new Error('Resource SHA-256 or size mismatch')
    await output.sync()
    await output.close()
    await rename(temporary, destination)
    return destination
  } catch (error) {
    await output.close().catch(() => undefined)
    await rm(temporary, { force: true })
    throw error
  }
}
