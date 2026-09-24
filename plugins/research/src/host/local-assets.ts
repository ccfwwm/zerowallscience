import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { copyFile, lstat, mkdir, open, readdir, realpath, rm, stat } from 'node:fs/promises'
import { basename, extname, join, relative, resolve } from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { pathToFileURL } from 'node:url'
import type { ResearchStore } from '@zerowallscience/research-store'
import type { DataAssetRecord, ProjectRecord } from '@zerowallscience/research-store/types'
import { containedFile } from './science-viewer.js'
import { readOmeZarrMetadata } from './ome-zarr.js'

const TYPES: Record<string, string> = { '.h5ad': 'application/x-h5ad', '.tif': 'image/tiff', '.tiff': 'image/tiff', '.svs': 'image/tiff', '.ndpi': 'image/tiff', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.pgm': 'image/x-portable-graymap', '.fcs': 'application/vnd.isac.fcs', '.pdb': 'chemical/x-pdb', '.cif': 'chemical/x-mmcif', '.mmcif': 'chemical/x-mmcif', '.sdf': 'chemical/x-mdl-sdfile', '.fa': 'text/x-fasta', '.fasta': 'text/x-fasta', '.fna': 'text/x-fasta', '.ffn': 'text/x-fasta', '.frn': 'text/x-fasta', '.gb': 'text/x-genbank', '.gbk': 'text/x-genbank', '.ab1': 'application/x-abif', '.scf': 'application/x-scf', '.csv': 'text/csv', '.tsv': 'text/tab-separated-values', '.json': 'application/json', '.pdf': 'application/pdf' }
const MAX_IMPORT_BYTES = 20 * 1024 ** 3
const IMPORTABLE_EXTENSIONS = new Set(Object.keys(TYPES).filter(extension => ['.png', '.jpg', '.jpeg', '.pgm', '.tif', '.tiff', '.svs', '.ndpi', '.fa', '.fasta', '.fna', '.ffn', '.frn', '.gb', '.gbk', '.ab1', '.scf', '.pdb', '.cif', '.mmcif', '.sdf', '.fcs', '.h5ad'].includes(extension)))

function maximumBytes(extension: string): number {
  if (['.png', '.jpg', '.jpeg', '.pgm', '.pdb', '.cif', '.mmcif', '.sdf'].includes(extension)) return 128 * 1024 ** 2
  if (['.fa', '.fasta', '.fna', '.ffn', '.frn', '.gb', '.gbk'].includes(extension)) return 16 * 1024 ** 2
  if (['.ab1', '.scf'].includes(extension)) return 128 * 1024 ** 2
  return MAX_IMPORT_BYTES
}

function safeFilename(value: string): string {
  const cleaned = basename(value).replace(/[<>:"/\\|?*\u0000-\u001f]/gu, '_').replace(/^\.+/u, '').trim()
  return cleaned || `science-file${extname(value).toLowerCase()}`
}

function unchanged(before: Awaited<ReturnType<typeof stat>>, after: Awaited<ReturnType<typeof stat>>): boolean {
  return before.isFile() && after.isFile() && before.size === after.size && before.mtimeMs === after.mtimeMs && before.ctimeMs === after.ctimeMs && before.ino === after.ino && before.dev === after.dev
}

async function digestFile(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path, { highWaterMark: 1024 ** 2 })) hash.update(chunk)
  return hash.digest('hex')
}

async function importDirectory(store: ResearchStore, project: ProjectRecord, sourcePath: string): Promise<DataAssetRecord> {
  const source = await realpath(sourcePath)
  if (!/\.zarr$/iu.test(source) || !(await stat(source)).isDirectory()) throw new Error('目录导入仅支持 .zarr 数据集。')
  const beforeMetadata = await readOmeZarrMetadata(source)
  const rows: Array<{ source: string; relative: string; size: number }> = []
  const pending = [{ path: source, relative: '' }]
  let totalBytes = 0
  while (pending.length) {
    const current = pending.pop()!
    for (const entry of await readdir(current.path, { withFileTypes: true })) {
      const path = join(current.path, entry.name)
      const child = current.relative ? join(current.relative, entry.name) : entry.name
      if (entry.isSymbolicLink()) throw new Error('OME-Zarr imports cannot contain symlinks or junctions.')
      if (entry.isDirectory()) pending.push({ path, relative: child })
      else if (entry.isFile()) {
        const info = await lstat(path)
        totalBytes += info.size
        if (rows.length >= 200_000 || totalBytes > MAX_IMPORT_BYTES) throw new Error('OME-Zarr imports are limited to 200,000 files and 20 GiB.')
        rows.push({ source: path, relative: child, size: info.size })
      } else throw new Error('OME-Zarr contains an unsupported filesystem entry.')
    }
  }
  const projectRoot = await realpath(project.rootPath)
  const importsRoot = join(projectRoot, '.zerowall', 'imports')
  await mkdir(importsRoot, { recursive: true })
  await containedFile(projectRoot, importsRoot)
  const destination = join(importsRoot, `${randomUUID()}-${safeFilename(basename(source))}`)
  try {
    await mkdir(destination)
    for (const row of rows) {
      const target = join(destination, row.relative)
      await mkdir(join(target, '..'), { recursive: true })
      await copyFile(row.source, target, 1)
      if ((await stat(target)).size !== row.size) throw new Error(`OME-Zarr copy size check failed for ${row.relative}.`)
    }
    const afterMetadata = await readOmeZarrMetadata(destination)
    if (afterMetadata.fingerprint !== beforeMetadata.fingerprint) throw new Error('OME-Zarr metadata changed during import.')
    return await registerLocalAsset(store, project, relative(projectRoot, destination), { registration: 'imported-external-ome-zarr', copiedBytes: totalBytes })
  } catch (error) {
    await rm(destination, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
}

/** Copy an external file into the project's owned imports directory before registration. */
export async function importLocalAsset(store: ResearchStore, project: ProjectRecord, sourcePath: string): Promise<DataAssetRecord> {
  if (typeof sourcePath !== 'string' || !sourcePath.trim() || sourcePath.includes('\0')) throw new Error('Choose a local science file first.')
  const source = await realpath(resolve(sourcePath))
  const extension = extname(source).toLowerCase()
  const sourceInfo = await stat(source)
  if (sourceInfo.isDirectory()) return importDirectory(store, project, source)
  if (!sourceInfo.isFile() || !IMPORTABLE_EXTENSIONS.has(extension)) throw new Error(`Unsupported science file type: ${extension || '(no extension)'}.`)
  const limit = maximumBytes(extension)
  if (!sourceInfo.size || sourceInfo.size > limit) throw new Error(`${basename(source)} is ${sourceInfo.size} bytes; this format is limited to ${limit} bytes.`)
  const projectRoot = await realpath(project.rootPath)
  const importsRoot = join(projectRoot, '.zerowall', 'imports')
  await mkdir(importsRoot, { recursive: true })
  await containedFile(projectRoot, importsRoot)
  const folder = join(importsRoot, randomUUID())
  const destination = join(folder, safeFilename(basename(source)))
  await mkdir(folder)
  try {
    const hash = createHash('sha256')
    const meter = new Transform({ transform(chunk: Buffer, _encoding, callback) { hash.update(chunk); callback(null, chunk) } })
    await pipeline(createReadStream(source, { highWaterMark: 1024 ** 2 }), meter, createWriteStream(destination, { flags: 'wx' }))
    const sourceAfter = await stat(source)
    const destinationInfo = await stat(destination)
    const expectedHash = hash.digest('hex')
    if (!unchanged(sourceInfo, sourceAfter) || destinationInfo.size !== sourceInfo.size || await digestFile(destination) !== expectedHash) throw new Error('The source changed or the copied bytes did not match; retry after saving is complete.')
    return await registerLocalAsset(store, project, relative(projectRoot, destination), { registration: 'imported-external-file', sourceName: basename(source), copiedBytes: destinationInfo.size })
  } catch (error) {
    await rm(folder, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
}

/** Registers an existing file in place. Hashing uses a fixed 1 MiB buffer. */
export async function registerLocalAsset(store: ResearchStore, project: ProjectRecord, source: string, provenanceExtra: Record<string, string | number | boolean> = {}): Promise<DataAssetRecord> {
  if (typeof source !== 'string' || !source.trim() || source.includes('\0')) throw new Error('Provide a file path inside the current project.')
  const path = await containedFile(project.rootPath, resolve(project.rootPath, source.trim()))
  if ((await stat(path)).isDirectory() && /\.zarr$/iu.test(path)) {
    const metadata = await readOmeZarrMetadata(path)
    const uri = pathToFileURL(path).href
    const existing = store.listDataAssets(project.id).find(asset => asset.uri === uri && asset.provenance.metadataFingerprint === metadata.fingerprint)
    if (existing) return existing
    const previous = store.listDataAssets(project.id).filter(asset => asset.uri === uri)
    return store.createDataAsset({ projectId: project.id, name: basename(path), uri, location: 'local', mediaType: 'application/vnd.ome.zarr', provenance: { registration: 'existing-project-ome-zarr', metadataFingerprint: metadata.fingerprint, fingerprintScope: metadata.fingerprintScope, pixelContentVerified: false, ...provenanceExtra, ...(previous.length ? { supersedesAssetIds: previous.map(asset => asset.id) } : {}) } })
  }
  const handle = await open(path, 'r')
  try {
    const before = await handle.stat()
    if (!before.isFile() || before.size > 20 * 1024 ** 3) throw new Error('Register a regular file of at most 20 GiB; directory datasets require their dedicated adapter.')
    const digest = createHash('sha256'); const buffer = Buffer.alloc(1024 ** 2); let bytes = 0
    for (;;) {
      const chunk = await handle.read(buffer, 0, buffer.length, bytes)
      if (!chunk.bytesRead) break
      bytes += chunk.bytesRead
      if (bytes > before.size) throw new Error('The source changed during registration.')
      digest.update(buffer.subarray(0, chunk.bytesRead))
    }
    const after = await handle.stat(); const current = await stat(path)
    if (bytes !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs || current.ino !== after.ino || current.dev !== after.dev || current.size !== after.size || current.mtimeMs !== after.mtimeMs || current.ctimeMs !== after.ctimeMs) throw new Error('The source changed during registration; retry after saving is complete.')
    await containedFile(project.rootPath, path)
    const checksum = digest.digest('hex'); const uri = pathToFileURL(path).href
    const existing = store.listDataAssets(project.id).find(asset => asset.uri === uri && asset.checksumAlgorithm === 'sha256' && asset.checksum === checksum)
    if (existing) return existing
    const previous = store.listDataAssets(project.id).filter(asset => asset.uri === uri)
    return store.createDataAsset({ projectId: project.id, name: basename(path), uri, location: 'local', mediaType: TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream', checksumAlgorithm: 'sha256', checksum, provenance: { registration: 'existing-project-file', bytes, ...provenanceExtra, ...(previous.length ? { supersedesAssetIds: previous.map(asset => asset.id) } : {}) } })
  } finally { await handle.close() }
}
