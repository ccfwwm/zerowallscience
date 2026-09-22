import { createHash, randomUUID } from 'node:crypto'
import { mkdir, realpath, rm, writeFile, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import type { ResearchStore } from '@zerowallscience/research-store'
import type { ProjectRecord } from '@zerowallscience/research-store/types'
import { renderCanvas, validateCanvasSpec } from '../shared/canvas.js'
import type { CanvasResolvedImage } from '../shared/canvas.js'
import type { CanvasRequest, CanvasResponse } from '../shared/types.js'
import { containedFile } from './science-viewer.js'
import sharp from 'sharp'

const RUNNER = 'zerowall-science-canvas/7.0.0-3'

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
    const spec = validateCanvasSpec(request.spec)
    const assets = this.store.listDataAssets(project.id); const sources = this.store.listArtifacts(project.id)
    const images = new Map<string, CanvasResolvedImage>()
    for (const panel of [spec, ...(spec.panels ?? [])]) {
      const ref = panel.image; if (!ref || images.has(`${ref.kind}:${ref.id}`)) continue
      const source = ref.kind === 'asset' ? assets.find(a => a.id === ref.id) : sources.find(a => a.id === ref.id)
      if (!source) throw new Error('Canvas image must belong to the active project.')
      if (!source.uri.startsWith('file:')) throw new Error('Canvas image must be a local registered project file.')
      const path = await containedFile(project.rootPath, fileURLToPath(source.uri)); const before = await stat(path)
      if (!before.isFile() || before.size > 32 * 1024 ** 2) throw new Error('Canvas image source must be at most 32 MiB.')
      const bytes = await readFile(path); const after = await stat(path)
      if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error('Canvas image changed while reading.')
      const checksum = createHash('sha256').update(bytes).digest('hex')
      if (ref.sourceSha256 && ref.sourceSha256 !== checksum) throw new Error('Canvas image differs from the saved project; explicitly reselect the image and recalibrate.')
      if (source.checksum && source.checksum !== checksum) throw new Error('Canvas image checksum changed; refresh the registered source.')
      if (!(bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' || bytes.subarray(0, 3).toString('hex') === 'ffd8ff' || (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP'))) throw new Error('Canvas requires a raster PNG, JPEG or WebP file.')
      const decoder = sharp(bytes, { limitInputPixels: 16_000_000, failOn: 'warning' }); const metadata = await decoder.metadata()
      if (!['png', 'jpeg', 'webp'].includes(metadata.format ?? '') || (metadata.pages ?? 1) !== 1) throw new Error('Canvas image panels support single-frame PNG, JPEG and WebP; export a slice first.')
      if (metadata.orientation && metadata.orientation !== 1) throw new Error('Normalize image orientation before calibrated canvas placement.')
      const normalized = await decoder.png().toBuffer({ resolveWithObject: true })
      if (normalized.data.length > 24 * 1024 ** 2) throw new Error('Canvas normalized image exceeds 24 MiB; use a smaller preview.')
      if (ref.sourceWidth !== undefined && (ref.sourceWidth !== normalized.info.width || ref.sourceHeight !== normalized.info.height)) throw new Error('Canvas image dimensions differ from the saved calibration.')
      images.set(`${ref.kind}:${ref.id}`, { dataUri: `data:image/png;base64,${normalized.data.toString('base64')}`, width: normalized.info.width, height: normalized.info.height, checksum })
    }
    if ([...images.values()].reduce((n, image) => n + image.dataUri.length, 0) > 48 * 1024 ** 2) throw new Error('Canvas embedded images exceed 48 MiB; reduce panel previews.')
    for (const panel of [spec, ...(spec.panels ?? [])]) if (panel.image) { const image = images.get(`${panel.image.kind}:${panel.image.id}`)!; if (panel.image.sourceSha256 && (panel.image.sourceSha256 !== image.checksum || panel.image.sourceWidth !== image.width || panel.image.sourceHeight !== image.height)) throw new Error('Canvas image panel binding changed; explicitly reselect and recalibrate.'); panel.image = { ...panel.image, sourceSha256: image.checksum, sourceWidth: image.width, sourceHeight: image.height } }
    const canvas = renderCanvas(spec, images)
    const sourceSnapshots = [
      ...canvas.sourceAssetIds.map(id => { const item = assets.find(a => a.id === id); if (!item) throw new Error('Canvas source asset must belong to the active project.'); return { id, kind: 'asset', version: item.version, checksum: item.checksum ?? null } }),
      ...canvas.sourceArtifactIds.map(id => { const item = sources.find(a => a.id === id); if (!item) throw new Error('Canvas source artifact must belong to the active project.'); return { id, kind: 'artifact', version: item.version, checksum: item.checksum ?? null } }),
    ]
    const imageSnapshots = [...images].map(([reference, image]) => ({ reference, width: image.width, height: image.height, checksum: image.checksum }))
    if (request.action === 'render') return { canvas, spec }
    if (request.action !== 'export') throw new Error('Unsupported canvas action.')
    const root = await realpath(project.rootPath); const basePath = join(root, '.zerowall'); await mkdir(basePath, { recursive: true }); const base = await containedFile(root, basePath); const exportPath = join(base, 'science-exports'); await mkdir(exportPath, { recursive: true }); const directory = join(await containedFile(root, exportPath), randomUUID()); await mkdir(directory); const svgPath = join(directory, 'figure.svg'); const jsonPath = join(directory, 'figure.json'); const svg = canvas.svg; const manifest = JSON.stringify({ format: 'zerowall-science-canvas-project', version: 1, runner: RUNNER, spec, canvas, sourceSnapshots, imageSnapshots }, null, 2) + '\n'
    const pngPath = join(directory, 'figure.png'); const pdfPath = join(directory, 'figure.pdf')
    try {
      if (Buffer.byteLength(manifest) > 32 * 1024 ** 2) throw new Error('Editable canvas project exceeds the 32 MiB import bound; reduce image or plot size.')
      await writeFile(svgPath, svg, { flag: 'wx' }); await writeFile(jsonPath, manifest, { flag: 'wx' })
      const rendered = await sharp(Buffer.from(svg)).png().toBuffer({ resolveWithObject: true })
      const jpeg = await sharp(rendered.data).jpeg({ quality: 95, chromaSubsampling: '4:4:4' }).toBuffer()
      const pdf = makeSingleImagePdf(jpeg, canvas.width, canvas.height)
      await writeFile(pngPath, rendered.data, { flag: 'wx' }); await writeFile(pdfPath, pdf, { flag: 'wx' })
      const currentAssets = this.store.listDataAssets(project.id); const currentArtifacts = this.store.listArtifacts(project.id)
      for (const snapshot of sourceSnapshots) {
        const current = snapshot.kind === 'asset' ? currentAssets.find(a => a.id === snapshot.id) : currentArtifacts.find(a => a.id === snapshot.id)
        if (!current || current.version !== snapshot.version || (current.checksum ?? null) !== snapshot.checksum) throw new Error('Canvas source revision changed during export; refresh sources and review again.')
      }
      const pendingScientificReview = currentArtifacts.some(a => canvas.sourceArtifactIds.includes(a.id) && a.metadata.scientificReview === 'pending')
      const metadata = { runner: RUNNER, manifestUri: pathToFileURL(jsonPath).href, sourceAssetIds: canvas.sourceAssetIds, sourceArtifactIds: canvas.sourceArtifactIds, sourceSnapshots, imageSnapshots, pointCount: canvas.pointCount, needsReview: pendingScientificReview || currentArtifacts.some(a => canvas.sourceArtifactIds.includes(a.id) && a.metadata.needsReview === true), ...(pendingScientificReview ? { scientificReview: 'pending' } : {}) }
      const artifacts = this.store.createArtifacts([
        { projectId: project.id, name: `科研画布：${spec.title} SVG`, uri: pathToFileURL(svgPath).href, mediaType: 'image/svg+xml', checksum: createHash('sha256').update(svg).digest('hex'), metadata },
        { projectId: project.id, name: `科研画布：${spec.title} PNG`, uri: pathToFileURL(pngPath).href, mediaType: 'image/png', checksum: createHash('sha256').update(rendered.data).digest('hex'), metadata },
        { projectId: project.id, name: `科研画布：${spec.title} PDF`, uri: pathToFileURL(pdfPath).href, mediaType: 'application/pdf', checksum: createHash('sha256').update(pdf).digest('hex'), metadata: { ...metadata, rasterized: true } },
        { projectId: project.id, name: `科研画布：${spec.title} 可编辑工程`, uri: pathToFileURL(jsonPath).href, mediaType: 'application/json', checksum: createHash('sha256').update(manifest).digest('hex'), metadata },
      ], { projectId: project.id, sources: sourceSnapshots })
      return { canvas, spec, artifact: artifacts[0]!, artifacts }
    } catch (error) { await rm(directory, { recursive: true, force: true }); throw error }
  }
}
