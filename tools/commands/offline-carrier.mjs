import { createHash } from 'node:crypto'
import { physicalFs } from './physical-fs.mjs'
import { join } from 'node:path'
import { canonical } from './resource-catalog.mjs'

export const carrierName = 'profile-runtime.asar'
const { open } = physicalFs.promises

// Build provenance is an envelope. Only runtime content and compatibility
// identify a generation, so rebuilding Desktop does not reinstall plugins.
export function offlineContentDigest(receipt) {
  const content = Object.fromEntries(['schema', 'kind', 'profileArchitecture', 'dshCommit',
    'dshRange', 'desktopRange', 'platform', 'architecture', 'plugins', 'files',
    'payloadFiles', 'defaultPatch'].map(key => [key, receipt[key]]))
  return createHash('sha256').update(JSON.stringify(canonical(content))).digest('hex')
}

// A small, read-only ASAR reader also works in management commands without
// shipping the build-time archiver or unpacking thousands of files.
export async function carrierIndex(directory) {
  const handle = await open(join(directory, carrierName), 'r')
  try {
    const prefix = Buffer.alloc(16)
    if ((await handle.read(prefix, 0, 16, 0)).bytesRead !== 16) throw new Error('Invalid offline archive header')
    const headerSize = prefix.readUInt32LE(4), jsonSize = prefix.readUInt32LE(12)
    if (prefix.readUInt32LE(0) !== 4 || headerSize < 8 || headerSize > 64 * 1024 ** 2 || jsonSize > headerSize - 8) throw new Error('Invalid offline archive header')
    const bytes = Buffer.alloc(jsonSize)
    if ((await handle.read(bytes, 0, jsonSize, 16)).bytesRead !== jsonSize) throw new Error('Truncated offline archive header')
    const rows = []
    function walk(node, prefix = '') {
      if (!node.files || typeof node.files !== 'object') throw new Error('Invalid offline archive directory')
      for (const [name, entry] of Object.entries(node.files)) {
        if (!name || /[\\/]/u.test(name) || name === '.' || name === '..') throw new Error('Unsafe offline archive entry')
        const path = prefix + name
        if (entry.link) throw new Error('Offline archive contains a link')
        if (entry.files) walk(entry, path + '/')
        else {
          if (!Number.isSafeInteger(entry.size) || entry.size < 0 || entry.integrity?.algorithm !== 'SHA256' || !/^[a-f0-9]{64}$/u.test(entry.integrity.hash)) throw new Error('Invalid offline archive integrity')
          rows.push({ path, size: entry.size, sha256: entry.integrity.hash, unpacked: entry.unpacked === true, offset: Number(entry.offset) })
        }
      }
    }
    walk(JSON.parse(bytes.toString('utf8')))
    return { rows, dataOffset: 8 + headerSize }
  } finally { await handle.close() }
}

export async function readCarrierFile(directory, logicalPath) {
  const path = logicalPath.replace(/^modules\//u, 'node_modules/')
  const index = await carrierIndex(directory), row = index.rows.find(entry => entry.path === path)
  if (!row) throw Object.assign(new Error('Offline archive entry is missing: ' + logicalPath), { code: 'ENOENT' })
  if (row.unpacked) return import('node:fs/promises').then(({ readFile }) => readFile(join(directory, carrierName + '.unpacked', path)))
  if (!Number.isSafeInteger(row.offset) || row.offset < 0) throw new Error('Invalid offline archive offset')
  const handle = await open(join(directory, carrierName), 'r')
  try {
    const bytes = Buffer.alloc(row.size)
    if ((await handle.read(bytes, 0, row.size, index.dataOffset + row.offset)).bytesRead !== row.size) throw new Error('Truncated offline archive entry')
    return bytes
  } finally { await handle.close() }
}
