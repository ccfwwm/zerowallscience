import { createHash, randomUUID } from 'node:crypto'
import { copyFile, link, lstat, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { deterministicArchive } from './deterministic-archive.mjs'
import { preserveImmutableResource } from './immutable-resource.mjs'
import { resourceTreeFiles } from '../build/resource-tree.mjs'
import { digestFile, storeAndLink } from '../build/content-store.mjs'

/** Independent ID/version store. Desktop release paths are only hard links;
 * unchanged inputs never invoke tar again. Published bytes win over new headers. */
export async function reuseResourceArchive({ kind, id, version, source, destination, artifactRoot, baseline, expectedDigest }) {
  if (!['skill', 'mcp'].includes(kind) || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(id) || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(version)) throw new Error('Invalid independent resource identity')
  const input = createHash('sha256').update(JSON.stringify(await resourceTreeFiles(source))).digest('hex')
  const directory = join(artifactRoot, 'release/resource-packages', kind, id, version)
  const archive = join(directory, `${id}.tgz`), receiptPath = join(directory, 'archive-receipt.json')
  const receipt = await readFile(receiptPath, 'utf8').then(JSON.parse, error => error.code === 'ENOENT' ? undefined : Promise.reject(error))
  const existing = await lstat(archive).catch(error => error.code === 'ENOENT' ? undefined : Promise.reject(error))
  const valid = existing?.isFile() && !existing.isSymbolicLink() && receipt?.input === input && receipt.sha256 === await digestFile(archive)
  if (valid && expectedDigest && receipt.sha256 !== expectedDigest) throw new Error(`Immutable ${kind} archive differs from signed public bytes: ${id}@${version}`)
  if (!valid) {
    await mkdir(directory, { recursive: true })
    const candidate = join(directory, `.candidate-${randomUUID()}.tgz`)
    try {
      await deterministicArchive(source, candidate)
      const previous = baseline ?? (existing ? archive : undefined)
      if (previous) await preserveImmutableResource(candidate, previous, expectedDigest ?? receipt?.sha256)
      // Never rewrite an object or a link already consumed by another release.
      if (!existing) await copyFile(candidate, archive, 1)
      else if (await digestFile(archive) !== await digestFile(candidate)) throw new Error(`Immutable ${kind} archive conflict: ${id}@${version}; bump its version`)
      await storeAndLink(archive, { root: artifactRoot })
      await writeFile(receiptPath, JSON.stringify({ schema: 1, kind, id, version, input, sha256: await digestFile(archive), size: (await lstat(archive)).size }, null, 2) + '\n')
    } finally { await rm(candidate, { force: true }) }
  }
  await mkdir(dirname(destination), { recursive: true })
  const target = await lstat(destination).catch(error => error.code === 'ENOENT' ? undefined : Promise.reject(error))
  if (target) {
    if (!target.isFile() || target.isSymbolicLink() || await digestFile(destination) !== await digestFile(archive)) throw new Error('Release resource path contains different immutable bytes: ' + destination)
  } else await link(archive, destination).catch(async error => {
    if (!['EXDEV', 'EPERM', 'EACCES', 'ENOTSUP', 'EMLINK'].includes(error.code)) throw error
    await copyFile(archive, destination, 1)
  })
  return { kind, id, version, preserved: true, cacheHit: Boolean(valid), sha256: await digestFile(archive), path: archive }
}
