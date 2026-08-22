import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import JSZip from 'jszip'
import type { PublicationRecord } from '@zerowallscience/research-store/types'

export async function writePublicationBundle(publication: PublicationRecord, uri: string): Promise<void> {
  if (publication.frozenSnapshot === undefined) throw new Error('Publication must have a frozen research snapshot before export.')
  const path = localFilePath(uri, 'Publication export URI')
  const publicationJson = json({
    format: 'zerowall-science-publication', version: 1, exportedAt: new Date().toISOString(),
    id: publication.id, projectId: publication.projectId, title: publication.title,
    manifest: publication.manifest, validation: publication.validation,
    reproductionRunId: publication.reproductionRunId, reproducedAt: publication.reproducedAt,
  })
  const snapshotJson = json(publication.frozenSnapshot)
  const checksums = json({
    algorithm: 'sha256',
    files: {
      'publication.json': sha256(publicationJson),
      'research-snapshot.json': sha256(snapshotJson),
    },
  })
  const zip = new JSZip()
  zip.file('publication.json', publicationJson)
  zip.file('research-snapshot.json', snapshotJson)
  zip.file('checksums.json', checksums)
  zip.file('README.txt', 'ZeroWall Science reproducible publication bundle\n\nVerify checksums.json before using the frozen research snapshot.\n')
  const content = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } })
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content)
}

function json(value: unknown): string { return `${JSON.stringify(value, null, 2)}\n` }
function sha256(value: string): string { return createHash('sha256').update(value).digest('hex') }
function localFilePath(uri: string, label: string): string {
  const parsed = new URL(uri)
  if (parsed.protocol !== 'file:') throw new Error(`${label} must use a file URI.`)
  return decodeURIComponent(parsed.pathname).replace(/^\/([A-Za-z]:)/, '$1')
}
