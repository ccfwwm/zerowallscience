import { constants } from 'node:fs'
import { copyFile, link, lstat, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { downloadResource, fileDigest } from './resource-catalog.mjs'
import { verifyDocument } from './python-layer-split.mjs'

/** Reuse signed wheel bytes across desktop versions; never rebuild an existing wheel. */
export async function prepareFallbackWheel(wheel, { manifest, keys, cache, output, fetcher }) {
  const key = keys[manifest.signature?.keyId]
  if (!key || !verifyDocument(manifest, key)) throw new Error('Python dependency manifest signature is invalid or untrusted')
  const signed = manifest.fallbackWheels?.find(item => item.name === wheel.name && item.version === wheel.version)
  for (const field of ['filename', 'size', 'sha256', 'url', 'sourceArchiveSha256']) {
    if (!signed || signed[field] !== wheel[field]) throw new Error(`Fallback wheel differs from signed manifest: ${wheel.name}`)
  }
  const url = new URL(wheel.url)
  if (!/^[A-Za-z0-9_.+-]+\.whl$/u.test(wheel.filename) || url.protocol !== 'https:' || url.username || url.password
    || decodeURIComponent(url.pathname.split('/').at(-1) ?? '') !== wheel.filename
    || !Number.isSafeInteger(wheel.size) || wheel.size <= 0 || !/^[a-f0-9]{64}$/u.test(wheel.sha256)) throw new Error('Invalid signed fallback wheel identity')
  await mkdir(output, { recursive: true })
  const destination = join(output, wheel.filename)
  const existing = await lstat(destination).catch(error => { if (error.code !== 'ENOENT') throw error })
  if (existing) {
    if (!existing.isFile() || existing.size !== wheel.size || await fileDigest(destination) !== wheel.sha256) throw new Error(`Immutable fallback wheel conflict: ${wheel.filename}`)
    return destination
  }
  const cached = await downloadResource({ ...wheel, downloadUrl: wheel.url }, cache, { fetcher })
  try { await link(cached, destination) }
  catch (error) {
    if (!['EXDEV', 'EPERM', 'EACCES', 'ENOTSUP', 'EMLINK'].includes(error.code)) throw error
    await copyFile(cached, destination, constants.COPYFILE_EXCL)
  }
  return destination
}
