import { randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { materializeTree } from '../build/materialize-tree.mjs'
import { offlineFiles } from '../commands/offline-profile.mjs'
import { carrierName } from '../commands/offline-carrier.mjs'
import { fileDigest } from '../commands/resource-catalog.mjs'
import { commitCache } from '../build/commit-cache.mjs'
import { shareImmutableFiles } from '../build/share-immutable-files.mjs'

export async function carrierPayload(path) {
  const archive = await lstat(join(path, carrierName)), unpacked = await lstat(join(path, carrierName + '.unpacked'))
  if (!archive.isFile() || archive.isSymbolicLink() || !unpacked.isDirectory() || unpacked.isSymbolicLink()) throw new Error('Offline carrier must contain physical files and directories')
  return [{ path: carrierName, size: archive.size, sha256: await fileDigest(join(path, carrierName)) },
    ...await offlineFiles(join(path, carrierName + '.unpacked'), carrierName + '.unpacked/')].sort((a, b) => a.path.localeCompare(b.path))
}

const includePayload = path => path === carrierName || path === carrierName + '.unpacked' || path.startsWith(carrierName + '.unpacked/')
async function materializeCarrier(cached, output, key, files, linkFile) {
  const existing = await lstat(join(output, carrierName)).catch(error => error.code === 'ENOENT' ? undefined : Promise.reject(error))
  if (!existing) return materializeTree({ source: cached, destination: output, sourceKey: key, include: includePayload, expectedFiles: files, linkFile })
  // A signing retry may already own a complete carrier. Reuse only the exact
  // verified payload; never overwrite a conflicting or incomplete stage.
  const actual = await carrierPayload(output)
  if (JSON.stringify(actual) !== JSON.stringify(files)) throw new Error('Existing offline carrier differs from verified cache')
  const materialized = await Promise.all(files.map(async file => {
    const [source, destination] = await Promise.all([lstat(join(cached, file.path)), lstat(join(output, file.path))])
    return { ...file, mode: source.dev === destination.dev && source.ino === destination.ino ? 'hardlink' : 'copy' }
  }))
  const hardlinkedFiles = materialized.filter(file => file.mode === 'hardlink').length
  return { schema: 1, sourceKey: key, reusedExisting: true,
    mode: hardlinkedFiles === files.length ? 'hardlink' : hardlinkedFiles ? 'mixed' : 'copy',
    hardlinkedFiles, copiedFiles: files.length - hardlinkedFiles,
    bytes: files.reduce((sum, file) => sum + file.size, 0), files: materialized }
}
export async function reuseOfflineCarrier({ cache, output, key, prepare, linkFile, objectRoot }) {
  if (!/^[A-Za-z0-9_-]+$/u.test(key)) throw new Error('Invalid offline carrier cache key')
  const cached = join(cache, key)
  const prior = await readFile(join(cached, 'payload.json'), 'utf8').then(JSON.parse, () => undefined)
  const actual = prior && await carrierPayload(cached).catch(() => undefined)
  if (prior?.cacheKey === key && actual && JSON.stringify(actual) === JSON.stringify(prior.files)) {
    const materialization = await materializeCarrier(cached, output, key, actual, linkFile)
    console.log(`CACHE HIT offline-carrier ${key}; verified archive and native output hashes`)
    return { cacheHit: true, files: actual, materialization }
  }
  const pending = cached + '.candidate-' + randomUUID()
  await mkdir(pending, { recursive: true })
  await prepare(pending)
  const files = await carrierPayload(pending)
  if (objectRoot) await shareImmutableFiles(pending, files, objectRoot)
  await writeFile(join(pending, 'payload.json'), JSON.stringify({ cacheKey: key, files, createdAt: new Date().toISOString() }, null, 2))
  await commitCache(pending, cached)
  const materialization = await materializeCarrier(cached, output, key, files, linkFile)
  console.log(`BUILT offline-carrier ${key}; stable component content identity`)
  return { cacheHit: false, files, materialization }
}
