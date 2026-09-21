import { createHash, randomUUID } from 'node:crypto'
import { mkdir, realpath, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { ResearchStore } from '@zerowallscience/research-store'
import type { ProjectRecord } from '@zerowallscience/research-store/types'
import { renderCanvas, validateCanvasSpec } from '../shared/canvas.js'
import type { CanvasRequest, CanvasResponse } from '../shared/types.js'
import { containedFile } from './science-viewer.js'
import sharp from 'sharp'

const RUNNER = 'zerowall-science-canvas/7.0.0-1'

/** Build a single-page PDF containing the rendered JPEG as an image XObject. */
export function makeSingleImagePdf(jpeg: Buffer, width: number, height: number): Buffer {
  const objects: Buffer[] = []
  const add = (value: string | Buffer): number => { objects.push(Buffer.isBuffer(value) ? value : Buffer.from(value, 'binary')); return objects.length }
  add('<< /Type /Catalog /Pages 2 0 R >>')
  add('<< /Type /Pages /Kids [3 0 R] /Count 1 >>')
  add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`)
  add(Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`, 'binary'), jpeg, Buffer.from('\nendstream', 'binary')]))
  const content = Buffer.from(`q\n${width} 0 0 ${height} 0 0 cm\n/Im0 Do\nQ\n`, 'binary')
  add(Buffer.concat([Buffer.from(`<< /Length ${content.length} >>\nstream\n`, 'binary'), content, Buffer.from('endstream', 'binary')]))
  const header = Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'binary')
  const chunks: Buffer[] = [header]
  const offsets: number[] = [0]; let offset = header.length
  objects.forEach((object, index) => { offsets.push(offset); const chunk = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`, 'binary'), object, Buffer.from('\nendobj\n', 'binary')]); chunks.push(chunk); offset += chunk.length })
  const xrefOffset = offset
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (let index = 1; index <= objects.length; index += 1) xref += `${String(offsets[index] ?? 0).padStart(10, '0')} 00000 n \n`
  chunks.push(Buffer.from(`${xref}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`, 'binary'))
  return Buffer.concat(chunks)
}

export class CanvasService {
  constructor(private readonly store: ResearchStore) {}
  async execute(project: ProjectRecord, request: CanvasRequest): Promise<CanvasResponse> {
    const spec = validateCanvasSpec(request.spec); const canvas = renderCanvas(spec); if (request.action === 'render') return { canvas }
    if (request.action !== 'export') throw new Error('Unsupported canvas action.')
    const root = await realpath(project.rootPath); const basePath = join(root, '.zerowall'); await mkdir(basePath, { recursive: true }); const base = await containedFile(root, basePath); const exportPath = join(base, 'science-exports'); await mkdir(exportPath, { recursive: true }); const directory = join(await containedFile(root, exportPath), randomUUID()); await mkdir(directory); const svgPath = join(directory, 'figure.svg'); const jsonPath = join(directory, 'figure.json'); const svg = canvas.svg; const manifest = JSON.stringify({ format: 'zerowall-science-canvas-project', version: 1, runner: RUNNER, spec, canvas }, null, 2) + '\n'
    const pngPath = join(directory, 'figure.png'); const pdfPath = join(directory, 'figure.pdf')
    try {
      await writeFile(svgPath, svg, { flag: 'wx' }); await writeFile(jsonPath, manifest, { flag: 'wx' })
      const rendered = await sharp(Buffer.from(svg)).png().toBuffer({ resolveWithObject: true })
      const jpeg = await sharp(rendered.data).jpeg({ quality: 95, chromaSubsampling: '4:4:4' }).toBuffer()
      const pdf = makeSingleImagePdf(jpeg, canvas.width, canvas.height)
      await writeFile(pngPath, rendered.data, { flag: 'wx' }); await writeFile(pdfPath, pdf, { flag: 'wx' })
      const metadata = { runner: RUNNER, manifestUri: pathToFileURL(jsonPath).href, sourceAssetIds: spec.sourceAssetIds ?? [], sourceArtifactIds: spec.sourceArtifactIds ?? [], pointCount: canvas.pointCount, needsReview: false }
      const svgArtifact = this.store.createArtifact({ projectId: project.id, name: `科研画布：${spec.title} SVG`, uri: pathToFileURL(svgPath).href, mediaType: 'image/svg+xml', checksum: createHash('sha256').update(svg).digest('hex'), metadata })
      const pngArtifact = this.store.createArtifact({ projectId: project.id, name: `科研画布：${spec.title} PNG`, uri: pathToFileURL(pngPath).href, mediaType: 'image/png', checksum: createHash('sha256').update(rendered.data).digest('hex'), metadata: { ...metadata, sourceSvgArtifactId: svgArtifact.id } })
      const pdfArtifact = this.store.createArtifact({ projectId: project.id, name: `科研画布：${spec.title} PDF`, uri: pathToFileURL(pdfPath).href, mediaType: 'application/pdf', checksum: createHash('sha256').update(pdf).digest('hex'), metadata: { ...metadata, sourceSvgArtifactId: svgArtifact.id, rasterized: true } })
      return { canvas, artifact: svgArtifact, artifacts: [svgArtifact, pngArtifact, pdfArtifact] }
    } catch (error) { await rm(directory, { recursive: true, force: true }); throw error }
  }
}
