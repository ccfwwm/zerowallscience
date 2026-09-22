import { createHash } from 'node:crypto'
import { open, stat } from 'node:fs/promises'
import { basename, extname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { ResearchStore } from '@zerowallscience/research-store'
import type { DataAssetRecord, ProjectRecord } from '@zerowallscience/research-store/types'
import { containedFile } from './science-viewer.js'
import { readOmeZarrMetadata } from './ome-zarr.js'

const TYPES: Record<string, string> = { '.h5ad': 'application/x-h5ad', '.tif': 'image/tiff', '.tiff': 'image/tiff', '.svs': 'image/tiff', '.ndpi': 'image/tiff', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.fcs': 'application/vnd.isac.fcs', '.pdb': 'chemical/x-pdb', '.cif': 'chemical/x-mmcif', '.mmcif': 'chemical/x-mmcif', '.sdf': 'chemical/x-mdl-sdfile', '.fa': 'text/x-fasta', '.fasta': 'text/x-fasta', '.fna': 'text/x-fasta', '.ffn': 'text/x-fasta', '.frn': 'text/x-fasta', '.gb': 'text/x-genbank', '.gbk': 'text/x-genbank', '.ab1': 'application/x-abif', '.scf': 'application/x-scf', '.csv': 'text/csv', '.tsv': 'text/tab-separated-values', '.json': 'application/json', '.pdf': 'application/pdf' }

/** Registers an existing file in place. Hashing uses a fixed 1 MiB buffer. */
export async function registerLocalAsset(store: ResearchStore, project: ProjectRecord, source: string): Promise<DataAssetRecord> {
  if (typeof source !== 'string' || !source.trim() || source.includes('\0')) throw new Error('Provide a file path inside the current project.')
  const path = await containedFile(project.rootPath, resolve(project.rootPath, source.trim()))
  if ((await stat(path)).isDirectory() && /\.zarr$/iu.test(path)) {
    const metadata = await readOmeZarrMetadata(path)
    const uri = pathToFileURL(path).href
    const existing = store.listDataAssets(project.id).find(asset => asset.uri === uri && asset.provenance.metadataFingerprint === metadata.fingerprint)
    if (existing) return existing
    const previous = store.listDataAssets(project.id).filter(asset => asset.uri === uri)
    return store.createDataAsset({ projectId: project.id, name: basename(path), uri, location: 'local', mediaType: 'application/vnd.ome.zarr', provenance: { registration: 'existing-project-ome-zarr', metadataFingerprint: metadata.fingerprint, fingerprintScope: metadata.fingerprintScope, pixelContentVerified: false, ...(previous.length ? { supersedesAssetIds: previous.map(asset => asset.id) } : {}) } })
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
    return store.createDataAsset({ projectId: project.id, name: basename(path), uri, location: 'local', mediaType: TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream', checksumAlgorithm: 'sha256', checksum, provenance: { registration: 'existing-project-file', bytes, ...(previous.length ? { supersedesAssetIds: previous.map(asset => asset.id) } : {}) } })
  } finally { await handle.close() }
}
