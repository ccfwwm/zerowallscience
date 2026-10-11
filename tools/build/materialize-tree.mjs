import { createHash } from 'node:crypto'
import { constants, createReadStream } from 'node:fs'
import { copyFile, link, lstat, mkdir, readdir } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

const contains = (parent, path) => {
  const rel = relative(parent, path)
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + sep))
}

// Provenance/signatures remain private to each generation. Adaptation runs
// before immutable runtime snapshots are cached, never against linked bytes.
export const mutableReceipt = path => /(?:^|\/)(?:[^/]*receipt[^/]*\.json|payload\.json|[^/]*\.sig|[^/]*\.signature)$/iu.test(path)

/** Materialize a physical snapshot, refusing links/special files and overwrites.
 * linkFile is injectable so fallback behavior can be tested on any filesystem. */
export async function materializeTree({ source, destination, sourceKey, mode = 'hardlink', shouldCopy = mutableReceipt, include = () => true, linkFile = link, expectedFiles }) {
  source = resolve(source)
  destination = resolve(destination)
  if (contains(source, destination) || contains(destination, source)) throw new Error('Materialization source and destination overlap')
  if (!['hardlink', 'copy'].includes(mode)) throw new Error('Invalid materialization mode')
  const entries = []
  const directories = []
  async function visit(path, prefix = '') {
    const info = await lstat(path)
    if (info.isSymbolicLink()) throw new Error(`Refusing to materialize a symbolic link: ${path}`)
    if (!info.isDirectory() && !info.isFile()) throw new Error(`Refusing to materialize a special file: ${path}`)
    if (prefix && !include(prefix, info)) return
    if (info.isDirectory()) {
      directories.push(prefix)
      for (const name of (await readdir(path)).sort()) await visit(join(path, name), prefix ? `${prefix}/${name}` : name)
    } else entries.push({ path: prefix, size: info.size })
  }
  if (!(await lstat(source)).isDirectory()) throw new Error('Materialization source must be a physical directory')
  await visit(source)
  // Reject existing links at every destination ancestor, including junctions.
  const safeDirectories = new Set()
  async function safeDirectory(path) {
    if (safeDirectories.has(path)) return
    const info = await lstat(path).catch(error => error.code === 'ENOENT' ? undefined : Promise.reject(error))
    if (info && (!info.isDirectory() || info.isSymbolicLink())) throw new Error(`Unsafe materialization destination: ${path}`)
    const parent = dirname(path)
    if (parent !== path) await safeDirectory(parent)
    if (!info) await mkdir(path).catch(error => error.code === 'EEXIST' ? undefined : Promise.reject(error))
    safeDirectories.add(path)
  }
  for (const directory of directories) await safeDirectory(join(destination, directory))
  const expected = expectedFiles && new Map(expectedFiles.map(file => [file.path, file]))
  if (expected && (expected.size !== entries.length || entries.some(file => !expected.has(file.path)))) throw new Error('Materialization file set differs from verified snapshot')
  let next = 0
  const files = []
  const operations = await Promise.allSettled(Array.from({ length: Math.min(16, entries.length) }, async () => {
    while (next < entries.length) {
      const entry = entries[next++]
      const input = join(source, entry.path), output = join(destination, entry.path)
      let fileMode = mode === 'copy' || shouldCopy(entry.path) ? 'copy' : 'hardlink'
      let fallback
      if (fileMode === 'hardlink') {
        try { await linkFile(input, output) }
        catch (error) {
          if (!['EXDEV', 'EPERM', 'EACCES', 'ENOTSUP', 'EMLINK'].includes(error.code)) throw error
          fileMode = 'copy'
          fallback = error.code
        }
      }
      if (fileMode === 'copy') await copyFile(input, output, constants.COPYFILE_EXCL)
      const digest = createHash('sha256')
      for await (const chunk of createReadStream(output)) digest.update(chunk)
      const sha256 = digest.digest('hex')
      if (expected && (expected.get(entry.path).size !== entry.size || expected.get(entry.path).sha256 !== sha256)) throw new Error(`Materialization hash differs from verified snapshot: ${entry.path}`)
      files.push({ ...entry, sha256, mode: fileMode, ...(fallback ? { fallback } : {}) })
    }
  }))
  const failed = operations.find(result => result.status === 'rejected')
  if (failed) throw failed.reason
  files.sort((a, b) => a.path.localeCompare(b.path))
  const hardlinkedFiles = files.filter(file => file.mode === 'hardlink').length
  return { schema: 1, sourceKey, mode: hardlinkedFiles === files.length ? 'hardlink' : hardlinkedFiles ? 'mixed' : 'copy', hardlinkedFiles, copiedFiles: files.length - hardlinkedFiles, bytes: files.reduce((sum, file) => sum + file.size, 0), files }
}
