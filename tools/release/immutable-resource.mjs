import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { copyFile, readFile, readdir } from 'node:fs/promises'
import { dirname, basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { list } from 'tar'

async function contents(archive) {
  const files = new Map()
  await list({ file: archive, onReadEntry(entry) {
    if (entry.type === 'Directory') return entry.resume()
    assert.equal(entry.type, 'File', 'Resource archives must contain regular files')
    // Legacy tar used ./ prefixes and different header metadata. Extracted
    // file names and every file byte must still be identical.
    const path = entry.path.replace(/^(?:\.\/)+/u, '')
    assert(path && !path.startsWith('/') && !path.includes('\\') && !path.split('/').includes('..'), 'Unsafe resource entry')
    assert(!files.has(path), 'Duplicate resource entry: ' + path)
    const hash = createHash('sha256')
    files.set(path, undefined)
    entry.on('data', bytes => hash.update(bytes))
    entry.on('end', () => files.set(path, hash.digest('hex')))
  } })
  return files
}

export async function preserveImmutableResource(candidate, baseline, expectedDigest) {
  const digest = createHash('sha256').update(await readFile(baseline)).digest('hex')
  if (expectedDigest) assert.equal(digest, expectedDigest, 'Historical resource archive was modified')
  const [before, after] = await Promise.all([contents(baseline), contents(candidate)])
  assert.deepEqual([...after.keys()].sort(), [...before.keys()].sort(), 'Same-version resource file set changed; bump its version')
  for (const [path, hash] of before) assert.equal(after.get(path), hash, 'Same-version resource content changed: ' + path + '; bump its version')
  await copyFile(baseline, candidate)
  return { baseline, preserved: true, files: before.size, sha256: digest }
}

export async function historicalResources(releaseRoot, kind) {
  const records = new Map()
  for (const version of (await readdir(dirname(releaseRoot))).sort()) {
    if (version === basename(releaseRoot)) continue
    let catalog
    try { catalog = JSON.parse(await readFile(join(dirname(releaseRoot), version, 'catalogs', kind + '-catalog.json'), 'utf8')) }
    catch (error) { if (error.code === 'ENOENT') continue; throw error }
    for (const resource of catalog.resources) {
      const key = resource.id + '@' + resource.version
      if (!records.has(key) && resource.downloadUrl.startsWith('file:')) records.set(key, { path: fileURLToPath(resource.downloadUrl), sha256: resource.sha256 })
    }
  }
  return records
}
