import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import sharp from 'sharp'
import type { ResearchStore } from '@zerowallscience/research-store'
import { validateAnnotationPayload } from '@zerowallscience/research-store'
import type { DataAssetRecord, ImageAnnotations, ImageRoi, ProjectRecord, ViewerSessionRecord } from '@zerowallscience/research-store/types'
import type { ImageAnalysis, ImageMaskAnalysis, ImageMaskLabelStatistics, ImageMaskRoiStatistics, ImagePreview, ImageRoiStatistics, ImageViewState, ScienceViewerRequest, ScienceViewerResponse } from '../shared/types.js'
import { containedFile } from './science-viewer.js'
import type { NativeEngineService } from './native-engines.js'
import { omeZarrPagePosition, readOmeZarrMetadata, readOmeZarrPlane } from './ome-zarr.js'

const MAX_IMAGE_BYTES = 128 * 1024 * 1024
const MAX_PIXELS = 100000000
export const IMAGE_ANALYSIS_RUNNER = 'zerowall-image-intensity/7.0.0-1'
export const IMAGE_MASK_ANALYSIS_RUNNER = 'zerowall-image-mask/7.0.0-1'

type RawDepth = 'char' | 'double' | 'float' | 'int' | 'short' | 'uchar' | 'uint' | 'ushort'

function readRawSample(raw: Buffer, offset: number, depth: RawDepth): number {
  switch (depth) {
    case 'uchar': return raw.readUInt8(offset)
    case 'char': return raw.readInt8(offset)
    case 'ushort': return raw.readUInt16LE(offset)
    case 'short': return raw.readInt16LE(offset)
    case 'uint': return raw.readUInt32LE(offset)
    case 'int': return raw.readInt32LE(offset)
    case 'float': return raw.readFloatLE(offset)
    case 'double': return raw.readDoubleLE(offset)
  }
}

function rawDepthBytes(depth: RawDepth): number {
  return depth === 'uchar' || depth === 'char' ? 1 : depth === 'ushort' || depth === 'short' ? 2 : depth === 'uint' || depth === 'int' || depth === 'float' ? 4 : 8
}

function pointOnSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): boolean {
  const cross = (px - ax) * (by - ay) - (py - ay) * (bx - ax)
  if (Math.abs(cross) > 1e-9) return false
  return px >= Math.min(ax, bx) - 1e-9 && px <= Math.max(ax, bx) + 1e-9 && py >= Math.min(ay, by) - 1e-9 && py <= Math.max(ay, by) + 1e-9
}

function polygonContains(x: number, y: number, points: Array<[number, number]>): boolean {
  let inside = false
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index++) {
    const [ax, ay] = points[index]!
    const [bx, by] = points[previous]!
    if (pointOnSegment(x, y, ax, ay, bx, by)) return true
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside
  }
  return inside
}

function roiContains(roi: ImageRoi, x: number, y: number): boolean {
  if (roi.kind === 'rectangle') return x + 0.5 >= roi.x && x + 0.5 < roi.x + roi.width && y + 0.5 >= roi.y && y + 0.5 < roi.y + roi.height
  if (roi.kind === 'point') return Math.floor(roi.x) === x && Math.floor(roi.y) === y
  return polygonContains(x + 0.5, y + 0.5, roi.points)
}
export function omePagePosition(axes: { order: string; sizes: Record<string, number> }, page: number): { page: number; z?: number; c?: number; t?: number } {
  if (!Number.isSafeInteger(page) || page < 0) throw new Error('OME page must be a non-negative integer.')
  const varying = axes.order.slice(2).split('').filter(axis => axis === 'Z' || axis === 'C' || axis === 'T')
  const dimensions = varying.map(axis => {
    const size = Number(axes.sizes[axis] ?? 1)
    if (!Number.isSafeInteger(size) || size < 1) throw new Error(`OME axis ${axis} has an invalid size.`)
    return { axis, size }
  })
  const pageCount = dimensions.reduce((total, dimension) => total * dimension.size, 1)
  if (page >= pageCount) throw new Error(`OME page ${page} is outside the ${pageCount}-page axis range.`)
  let remainder = page
  const position: { page: number; z?: number; c?: number; t?: number } = { page }
  for (const { axis, size } of dimensions) {
    position[axis.toLowerCase() as 'z' | 'c' | 't'] = remainder % size
    remainder = Math.floor(remainder / size)
  }
  return position
}

/** Convert a validated Z/C/T coordinate back to the TIFF page index. */
export function omePageForPosition(axes: { order: string; sizes: Record<string, number> }, position: { z?: number; c?: number; t?: number }): number {
  const varying = axes.order.slice(2).split('').filter(axis => axis === 'Z' || axis === 'C' || axis === 'T')
  let multiplier = 1
  let page = 0
  for (const axis of varying) {
    const size = Number(axes.sizes[axis] ?? 1)
    if (!Number.isSafeInteger(size) || size < 1) throw new Error(`OME axis ${axis} has an invalid size.`)
    const value = position[axis.toLowerCase() as 'z' | 'c' | 't'] ?? 0
    if (!Number.isSafeInteger(value) || value < 0 || value >= size) throw new Error(`OME axis ${axis} position is outside its declared range.`)
    page += value * multiplier
    multiplier *= size
  }
  return page
}

function omeAxes(bytes: Buffer, page = 0): ImagePreview['axes'] {
  const text = bytes.toString('utf8')
  const pixels = /<Pixels\b([^>]+)>/iu.exec(text)?.[1]
  if (!pixels) return undefined
  const read = (name: string): number | undefined => { const value = new RegExp(`\\b${name}="(\\d+)"`, 'iu').exec(pixels)?.[1]; return value ? Number(value) : undefined }
  const order = /\bDimensionOrder="([A-Z]+)"/iu.exec(pixels)?.[1]?.toUpperCase() ?? 'XY'
  const sizes = Object.fromEntries(['X','Y','Z','C','T'].flatMap(axis => { const value = read(`Size${axis}`); return value === undefined ? [] : [[axis, value]] }))
  const x = /\bPhysicalSizeX="([0-9.e+-]+)"/iu.exec(pixels)?.[1]; const y = /\bPhysicalSizeY="([0-9.e+-]+)"/iu.exec(pixels)?.[1]; const unit = /\bPhysicalSizeXUnit="([^"]+)"/iu.exec(pixels)?.[1]
  const physicalSize = { ...(x === undefined ? {} : { x: Number(x) }), ...(y === undefined ? {} : { y: Number(y) }), ...(unit === undefined ? {} : { unit }) }
  return { order, sizes, ...(Object.keys(physicalSize).length ? { physicalSize } : {}), position: omePagePosition({ order, sizes }, page) }
}

export class ImageViewerService {
  constructor(private readonly store: ResearchStore, private readonly nativeEngines?: NativeEngineService) {}

  async execute(project: ProjectRecord, input: ScienceViewerRequest): Promise<ScienceViewerResponse> {
    let viewer: ViewerSessionRecord | undefined
    if (input.action !== 'image_open') {
      viewer = this.store.listViewerSessions(project.id).find(item => item.id === input.viewerId && item.tool === 'image')
      if (!viewer) throw new Error('Image viewer is not in the active project.')
    }
    const asset = this.asset(project.id, viewer?.assetId ?? input.assetId)
    const path = fileURLToPath(asset.uri)
    if ((await stat(path)).isDirectory()) return this.executeOmeZarr(project, asset, viewer, input)
    if (!/\.(png|jpe?g|tiff?|pgm)$/iu.test(path)) throw new Error('Image preview currently accepts PNG, JPEG, TIFF and PGM. Large tiled images require a tiled adapter.')
    const bytes = await readProjectAsset(project, asset, MAX_IMAGE_BYTES)
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    if (viewer && viewer.state.sourceSha256 !== sha256) throw new Error('Source file changed. Open a new image view; the old annotation revisions are retained.')
    const metadata = await sharp(bytes, { page: 0, pages: 1, limitInputPixels: MAX_PIXELS, failOn: 'error' }).metadata()
    if (!['png', 'jpeg', 'tiff'].includes(metadata.format ?? '')) throw new Error('The decoded image format is unsupported.')
    const width = metadata.width!; const height = metadata.pageHeight ?? metadata.height!; const pages = metadata.pages ?? 1
    if (!width || !height || width * height > MAX_PIXELS) throw new Error('This image requires a tiled viewer; bounded preview limit is 100 million pixels per page.')
    const state = this.state(input.action === 'image_save' ? input.imageState : viewer?.state ?? { page: 0, zoom: 1, panX: 0, panY: 0 }, pages)
    const history = () => this.store.listAnnotationRevisions(project.id, asset.id).filter(item => item.sourceSha256 === sha256)
    const response = (): ScienceViewerResponse => {
      const annotations = history(); const head = annotations.filter(item => item.status === 'accepted').at(-1)
      return { viewer: viewer!, annotations, ...(head ? { annotationHead: head } : {}) }
    }
    const assertCurrent = () => {
      if (viewer && this.store.listViewerSessions(project.id).find(item => item.id === viewer!.id)?.version !== viewer.version) throw new Error('Viewer revision changed during image reading. Reload the view.')
      if (viewer && input.action !== 'image_read' && input.expectedVersion !== viewer.version) throw new Error(`Viewer revision conflict: current ${viewer.version}.`)
    }
    assertCurrent()
    if (input.action === 'annotation_launch') {
      if (!this.nativeEngines || !input.engine) throw new Error('A configured native engine is required.')
      if (pages !== 1) throw new Error('Native ROI bridge currently accepts single-page images only; multi-dimensional axes need an explicit adapter.')
      const exported = await this.execute(project, { ...input, action: 'annotation_export' })
      const selected = exported.annotations!.find(item => item.id === exported.artifact!.metadata.annotationRevisionId)!
      const exportPath = fileURLToPath(exported.artifact!.uri)
      // Pass validated data, not a Python expression or a user-supplied script.
      const document = { format: 'zerowall-image-annotations', version: 1, projectId: project.id, assetId: asset.id, sourceSha256: sha256, baseRevisionId: selected.id, origin: selected.origin, payload: selected.payload }
      assertCurrent()
      const launch = await this.nativeEngines.launch(project, input.sessionId, input.engine, asset.id, { viewerId: viewer!.id, baseRevisionId: selected.id, sourceSha256: sha256, directory: dirname(exportPath), document })
      return { ...response(), launch, artifact: exported.artifact! }
    }
    if (input.action === 'annotation_collect') {
      const launch = this.nativeEngines?.list(project.id).find(item => item.launchId === input.launchId)
      const bridge = launch?.annotationBridge
      if (!launch || !bridge || bridge.viewerId !== viewer!.id || bridge.sourceSha256 !== sha256 || launch.assetId !== asset.id) throw new Error('Native return is not associated with this image view.')
      const uri = pathToFileURL(bridge.returnPath).href
      const returned = await readProjectAsset(project, { uri } as DataAssetRecord, 8 * 1024 * 1024)
      const document = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(returned))
      if (document.bridgeId !== launch.launchId || document.baseRevisionId !== bridge.baseRevisionId || document.origin !== launch.id || document.format !== 'zerowall-image-annotations' || document.version !== 1 || document.projectId !== project.id || document.assetId !== asset.id || document.sourceSha256 !== sha256) throw new Error('Native return does not match its immutable exchange request.')
      const payload = validateAnnotationPayload(document.payload)
      if (payload.coordinates.width !== width || payload.coordinates.height !== height || payload.coordinates.pages !== pages) throw new Error('Native return changed image geometry.')
      assertCurrent()
      const result = this.store.collectNativeAnnotation({ projectId: project.id, assetId: asset.id, sourceSha256: sha256, expectedRevisionId: bridge.baseRevisionId, payload, origin: launch.id }, launch.launchId, { projectId: project.id, name: `${launch.id} ROI return`, uri, mediaType: 'application/json', checksum: createHash('sha256').update(returned).digest('hex'), metadata: { viewerId: viewer!.id } })
      return { ...response(), ...result }
    }
    if (input.action === 'annotation_save' || input.action === 'annotation_import') {
      let payload: ImageAnnotations; let expectedRevisionId: string | null; let origin: 'workbench' | 'fiji' | 'napari' = 'workbench'
      if (input.action === 'annotation_import') {
        const imported = this.asset(project.id, input.importAssetId)
        if (!/\.json$/iu.test(fileURLToPath(imported.uri))) throw new Error('Annotation import requires a registered JSON asset.')
        const document = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readProjectAsset(project, imported, 8 * 1024 * 1024)))
        if (document.format !== 'zerowall-image-annotations' || document.version !== 1 || document.assetId !== asset.id || document.sourceSha256 !== sha256 || document.projectId !== project.id) throw new Error('Annotation exchange does not match the project, asset or source hash.')
        if (!['workbench', 'fiji', 'napari'].includes(document.origin)) throw new Error('Unknown annotation exchange origin.')
        payload = validateAnnotationPayload(document.payload); expectedRevisionId = document.baseRevisionId; origin = document.origin
      } else {
        if (!input.annotation) throw new Error('Annotation payload and expected revision are required.')
        payload = validateAnnotationPayload(input.annotation.payload); expectedRevisionId = input.annotation.expectedRevisionId
      }
      if (payload.coordinates.width !== width || payload.coordinates.height !== height || payload.coordinates.pages !== pages) throw new Error('Annotation dimensions do not match the original image.')
      assertCurrent()
      const annotationSave = this.store.createAnnotationRevision({ projectId: project.id, assetId: asset.id, sourceSha256: sha256, expectedRevisionId, payload, origin })
      return { ...response(), annotationSave }
    }
    if (input.action === 'annotation_export') {
      const annotations = history()
      const selected = input.annotationRevisionId ? annotations.find(item => item.id === input.annotationRevisionId) : annotations.filter(item => item.status === 'accepted').at(-1)
      if (!selected) throw new Error('Save or select an annotation revision before exporting.')
      const document = { format: 'zerowall-image-annotations', version: 1, projectId: project.id, assetId: asset.id, sourceSha256: sha256, baseRevisionId: selected.id, origin: selected.origin, exportedRevisionStatus: selected.status, payload: selected.payload }
      const root = await realpath(project.rootPath); let directory = root
      for (const component of ['.zerowall', 'science-exports']) {
        const next = join(directory, component)
        try { await mkdir(next) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error }
        directory = await containedFile(root, next)
      }
      const destination = join(directory, randomUUID()); await mkdir(destination)
      const exportedPath = join(destination, 'annotations.json'); const json = JSON.stringify(document, null, 2) + '\n'
      try {
        await writeFile(exportedPath, json, { flag: 'wx' }); assertCurrent()
        const head = history().filter(item => item.status === 'accepted').at(-1)
        const artifact = this.store.createArtifact({ projectId: project.id, name: `Image ROI revision ${selected.revision}`, uri: pathToFileURL(exportedPath).href, mediaType: 'application/json', checksum: createHash('sha256').update(json).digest('hex'), metadata: { sourceAssetId: asset.id, sourceSha256: sha256, annotationRevisionId: selected.id, viewerId: viewer!.id, needsReview: selected.id !== head?.id, kind: 'image-annotations' } })
        return { ...response(), artifact }
      } catch (error) { await rm(destination, { recursive: true, force: true }); throw error }
    }
    if (input.action === 'image_analyze') {
      if (!viewer) throw new Error('An opened image viewer is required for intensity analysis.')
      if (input.expectedVersion !== viewer.version) throw new Error(`Viewer revision conflict: current ${viewer.version}.`)
      const annotations = history()
      const selected = input.annotationRevisionId
        ? annotations.find(item => item.id === input.annotationRevisionId)
        : annotations.filter(item => item.status === 'accepted').at(-1)
      if (!selected) throw new Error('Save or select an accepted annotation revision before image analysis.')
      if (selected.status !== 'accepted') throw new Error('Image analysis requires an accepted annotation revision; conflict branches need explicit adoption first.')
      const payload = validateAnnotationPayload(selected.payload)
      if (payload.coordinates.width !== width || payload.coordinates.height !== height || payload.coordinates.pages !== pages) throw new Error('Annotation dimensions do not match the decoded image.')
      if (payload.rois.length === 0) throw new Error('Image analysis requires at least one accepted ROI.')

      const depth = metadata.depth as RawDepth
      if (!['char', 'double', 'float', 'int', 'short', 'uchar', 'uint', 'ushort'].includes(depth)) throw new Error(`Image depth ${metadata.depth} is not supported by the bounded intensity Runner.`)
      const pageBuffers = new Map<number, { raw: Buffer; width: number; height: number; channels: number }>()
      const loadPage = async (page: number) => {
        const existing = pageBuffers.get(page)
        if (existing) return existing
        const pageImage = sharp(bytes, { page, pages: 1, limitInputPixels: MAX_PIXELS, failOn: 'error' })
        const pageMetadata = await pageImage.metadata()
        const pageWidth = pageMetadata.width ?? 0
        const pageHeight = pageMetadata.pageHeight ?? pageMetadata.height ?? 0
        const pageChannels = pageMetadata.channels ?? 0
        if (pageWidth !== width || pageHeight !== height) throw new Error('TIFF pages have different geometry; a series-aware adapter is required.')
        if (!pageChannels || pageChannels !== (metadata.channels ?? pageChannels)) throw new Error('Image pages have different channel geometry.')
        const decoded = await pageImage.raw({ depth }).toBuffer({ resolveWithObject: true })
        const decodedInfo = decoded.info as typeof decoded.info & { depth?: string }
        if (decodedInfo.width !== width || decodedInfo.height !== height || decodedInfo.channels !== pageChannels || decodedInfo.depth !== depth) throw new Error('Raw image decoder changed the declared pixel depth or geometry.')
        const expectedBytes = width * height * pageChannels * rawDepthBytes(depth)
        if (decoded.data.byteLength !== expectedBytes) throw new Error('Raw image decoder returned an unexpected buffer length.')
        const value = { raw: decoded.data, width, height, channels: pageChannels }
        pageBuffers.set(page, value)
        return value
      }

      const rois: ImageRoiStatistics[] = []
      for (const roi of payload.rois) {
        if (roi.page < 0 || roi.page >= pages) throw new Error(`ROI ${roi.name} refers to an invalid image page.`)
        if (roi.kind === 'point' && (Math.floor(roi.x) >= width || Math.floor(roi.y) >= height)) throw new Error(`Point ROI ${roi.name} lies on the image boundary and does not contain a pixel.`)
        const page = await loadPage(roi.page)
        const sums = Array.from({ length: page.channels }, () => 0)
        const sumsSquared = Array.from({ length: page.channels }, () => 0)
        const minimums = Array.from({ length: page.channels }, () => Number.POSITIVE_INFINITY)
        const maximums = Array.from({ length: page.channels }, () => Number.NEGATIVE_INFINITY)
        let pixelCount = 0
        const bytesPerSample = rawDepthBytes(depth)
        for (let y = 0; y < page.height; y++) {
          for (let x = 0; x < page.width; x++) {
            if (!roiContains(roi, x, y)) continue
            pixelCount++
            const pixelOffset = (y * page.width + x) * page.channels * bytesPerSample
            for (let channel = 0; channel < page.channels; channel++) {
              const value = readRawSample(page.raw, pixelOffset + channel * bytesPerSample, depth)
              if (!Number.isFinite(value)) throw new Error(`ROI ${roi.name} contains a non-finite pixel value.`)
              sums[channel]! += value
              sumsSquared[channel]! += value * value
              minimums[channel] = Math.min(minimums[channel]!, value)
              maximums[channel] = Math.max(maximums[channel]!, value)
            }
          }
        }
        if (!pixelCount) throw new Error(`ROI ${roi.name} contains no pixel centers.`)
        const means = sums.map(sum => sum / pixelCount)
        const standardDeviation = sums.map((sum, channel) => Math.sqrt(Math.max(0, sumsSquared[channel]! / pixelCount - means[channel]! * means[channel]!)))
        rois.push({ roiId: roi.id, name: roi.name, kind: roi.kind, page: roi.page, pixelCount, channels: page.channels, sum: sums, mean: means, min: minimums, max: maximums, standardDeviation })
      }
      const imageAnalysis: ImageAnalysis = {
        runner: IMAGE_ANALYSIS_RUNNER,
        sourceAssetId: asset.id,
        sourceSha256: sha256,
        viewerId: viewer.id,
        viewerVersion: viewer.version,
        annotationRevisionId: selected.id,
        sourceWidth: width,
        sourceHeight: height,
        sourcePages: pages,
        calibration: payload.coordinates.calibration,
        rois,
        notes: ['统计来自原始解码像素，不来自预览 PNG。', '结果是可追踪的强度描述，不构成诊断、治疗效果或生物学结论。', `位深保持为 ${depth}；未执行静默 8-bit 归一化。`],
      }
      const manifest = JSON.stringify({ format: 'zerowall-image-intensity-analysis', version: 1, ...imageAnalysis, scientificReview: 'pending' }, null, 2) + '\n'
      const root = await realpath(project.rootPath)
      const parentPath = join(root, '.zerowall')
      await mkdir(parentPath, { recursive: true })
      const parent = await containedFile(root, parentPath)
      const exportsPath = join(parent, 'science-exports')
      await mkdir(exportsPath, { recursive: true })
      const destination = join(await containedFile(root, exportsPath), randomUUID())
      await mkdir(destination)
      const manifestPath = join(destination, 'image-intensity-analysis.json')
      try {
        await writeFile(manifestPath, manifest, { flag: 'wx' })
        assertCurrent()
        const artifact = this.store.createArtifact({ projectId: project.id, name: 'Image ROI intensity analysis', uri: pathToFileURL(manifestPath).href, mediaType: 'application/json', checksum: createHash('sha256').update(manifest).digest('hex'), metadata: { runner: IMAGE_ANALYSIS_RUNNER, sourceAssetId: asset.id, sourceSha256: sha256, viewerId: viewer.id, viewerVersion: viewer.version, annotationRevisionId: selected.id, scientificReview: 'pending', kind: 'image-intensity-analysis' } })
        return { ...response(), imageAnalysis, artifact }
      } catch (error) { await rm(destination, { recursive: true, force: true }); throw error }
    }
    if (input.action === 'image_mask_analyze') {
      if (!viewer) throw new Error('An opened image viewer is required for label mask analysis.')
      if (input.expectedVersion !== viewer.version) throw new Error(`Viewer revision conflict: current ${viewer.version}.`)
      if (!input.maskAssetId) throw new Error('A registered label mask asset is required.')
      const maskAsset = this.asset(project.id, input.maskAssetId)
      if (maskAsset.id === asset.id) throw new Error('The source image and label mask must be different assets.')
      const maskBytes = await readProjectAsset(project, maskAsset, MAX_IMAGE_BYTES)
      const maskSha256 = createHash('sha256').update(maskBytes).digest('hex')
      const maskMetadata = await sharp(maskBytes, { page: 0, pages: 1, limitInputPixels: MAX_PIXELS, failOn: 'error' }).metadata()
      if (!['png', 'jpeg', 'tiff'].includes(maskMetadata.format ?? '')) throw new Error('The decoded label mask format is unsupported.')
      const maskWidth = maskMetadata.width ?? 0; const maskHeight = maskMetadata.pageHeight ?? maskMetadata.height ?? 0; const maskPages = maskMetadata.pages ?? 1
      if (maskWidth !== width || maskHeight !== height || maskPages !== pages) throw new Error('Label mask geometry or page count does not match the source image.')
      const maskChannels = maskMetadata.channels ?? 0
      if (maskChannels !== 1 && maskChannels !== 3) throw new Error('Label masks must decode to one channel or a grayscale RGB encoding; alpha and other multichannel masks are ambiguous.')
      const maskDepth = maskMetadata.depth as RawDepth
      if (!['uchar', 'ushort', 'uint'].includes(maskDepth)) throw new Error(`Label mask depth ${maskMetadata.depth} is not supported; use an unsigned integer mask.`)
      const requested = input.maskLabels === undefined ? null : [...new Set(input.maskLabels)]
      if (requested && (!requested.length || requested.length > 256 || requested.some(value => !Number.isSafeInteger(value) || value < 0 || value > 0xffffffff))) throw new Error('maskLabels must contain 1–256 unique non-negative integer labels.')
      const annotations = history()
      const selected = input.annotationRevisionId
        ? annotations.find(item => item.id === input.annotationRevisionId)
        : annotations.filter(item => item.status === 'accepted').at(-1)
      if (!selected) throw new Error('Save or select an accepted annotation revision before label mask analysis.')
      if (selected.status !== 'accepted') throw new Error('Label mask analysis requires an accepted annotation revision; conflict branches need explicit adoption first.')
      const payload = validateAnnotationPayload(selected.payload)
      if (payload.coordinates.width !== width || payload.coordinates.height !== height || payload.coordinates.pages !== pages) throw new Error('Annotation dimensions do not match the decoded image.')
      if (!payload.rois.length) throw new Error('Label mask analysis requires at least one accepted ROI.')
      const sourceDepth = metadata.depth as RawDepth
      if (!['char', 'double', 'float', 'int', 'short', 'uchar', 'uint', 'ushort'].includes(sourceDepth)) throw new Error(`Image depth ${metadata.depth} is not supported by the label mask Runner.`)
      const sourcePages = new Map<number, { raw: Buffer; width: number; height: number; channels: number }>()
      const maskPagesRaw = new Map<number, Buffer>()
      const loadSource = async (page: number) => {
        const existing = sourcePages.get(page); if (existing) return existing
        const decoded = await sharp(bytes, { page, pages: 1, limitInputPixels: MAX_PIXELS, failOn: 'error' }).raw({ depth: sourceDepth }).toBuffer({ resolveWithObject: true })
        const info = decoded.info as typeof decoded.info & { depth?: string }
        if (info.width !== width || info.height !== height || info.channels !== (metadata.channels ?? info.channels) || info.depth !== sourceDepth) throw new Error('Source decoder changed pixel geometry or depth.')
        const value = { raw: decoded.data, width, height, channels: info.channels }
        sourcePages.set(page, value); return value
      }
      const loadMask = async (page: number) => {
        const existing = maskPagesRaw.get(page); if (existing) return existing
        const decoded = await sharp(maskBytes, { page, pages: 1, limitInputPixels: MAX_PIXELS, failOn: 'error' }).raw({ depth: maskDepth }).toBuffer({ resolveWithObject: true })
        const info = decoded.info as typeof decoded.info & { depth?: string }
        if (info.width !== width || info.height !== height || info.channels !== maskChannels || info.depth !== maskDepth) throw new Error('Label mask decoder changed pixel geometry or depth.')
        const sampleBytes = rawDepthBytes(maskDepth); const expectedBytes = width * height * maskChannels * sampleBytes
        if (decoded.data.byteLength !== expectedBytes) throw new Error('Label mask decoder returned an unexpected buffer length.')
        if (maskChannels === 3) {
          const mono = Buffer.alloc(width * height * sampleBytes)
          for (let pixel = 0; pixel < width * height; pixel++) {
            const first = readRawSample(decoded.data, pixel * 3 * sampleBytes, maskDepth)
            for (let channel = 1; channel < 3; channel++) if (readRawSample(decoded.data, pixel * 3 * sampleBytes + channel * sampleBytes, maskDepth) !== first) throw new Error('RGB label mask channels disagree; provide a single-channel or grayscale RGB mask.')
            decoded.data.copy(mono, pixel * sampleBytes, pixel * 3 * sampleBytes, pixel * 3 * sampleBytes + sampleBytes)
          }
          maskPagesRaw.set(page, mono); return mono
        }
        maskPagesRaw.set(page, decoded.data); return decoded.data
      }
      const perRoi: ImageMaskRoiStatistics[] = []
      for (const roi of payload.rois) {
        const sourcePage = await loadSource(roi.page); const maskRaw = await loadMask(roi.page)
        const bytesPerSource = rawDepthBytes(sourceDepth); const bytesPerMask = rawDepthBytes(maskDepth)
        const stats = new Map<number, { count: number; sum: number[]; sumSquared: number[]; min: number[]; max: number[] }>()
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
          if (!roiContains(roi, x, y)) continue
          const maskValue = readRawSample(maskRaw, (y * width + x) * bytesPerMask, maskDepth)
          if (!Number.isInteger(maskValue) || maskValue < 0) throw new Error(`Label mask contains an invalid value in ROI ${roi.name}.`)
          if (requested && !requested.includes(maskValue)) continue
          let item = stats.get(maskValue)
          if (!item) {
            if (!requested && stats.size >= 256) throw new Error('Label mask contains more than 256 labels in one ROI; provide an explicit maskLabels subset.')
            item = { count: 0, sum: Array.from({ length: sourcePage.channels }, () => 0), sumSquared: Array.from({ length: sourcePage.channels }, () => 0), min: Array.from({ length: sourcePage.channels }, () => Number.POSITIVE_INFINITY), max: Array.from({ length: sourcePage.channels }, () => Number.NEGATIVE_INFINITY) }
            stats.set(maskValue, item)
          }
          item.count++
          const pixelOffset = (y * width + x) * sourcePage.channels * bytesPerSource
          for (let channel = 0; channel < sourcePage.channels; channel++) {
            const value = readRawSample(sourcePage.raw, pixelOffset + channel * bytesPerSource, sourceDepth)
            if (!Number.isFinite(value)) throw new Error(`ROI ${roi.name} contains a non-finite source pixel value.`)
            item.sum[channel]! += value; item.sumSquared[channel]! += value * value
            item.min[channel] = Math.min(item.min[channel]!, value); item.max[channel] = Math.max(item.max[channel]!, value)
          }
        }
        const labels: ImageMaskLabelStatistics[] = [...stats.entries()].sort(([a], [b]) => a - b).map(([label, item]) => {
          const mean = item.sum.map(value => value / item.count)
          return { label, pixelCount: item.count, channels: sourcePage.channels, sum: item.sum, mean, min: item.min, max: item.max, standardDeviation: item.sum.map((value, channel) => Math.sqrt(Math.max(0, item.sumSquared[channel]! / item.count - mean[channel]! * mean[channel]!))) }
        })
        perRoi.push({ roiId: roi.id, name: roi.name, kind: roi.kind, page: roi.page, labels })
      }
      const imageMaskAnalysis: ImageMaskAnalysis = { runner: IMAGE_MASK_ANALYSIS_RUNNER, sourceAssetId: asset.id, sourceSha256: sha256, maskAssetId: maskAsset.id, maskSha256, viewerId: viewer.id, viewerVersion: viewer.version, annotationRevisionId: selected.id, sourceWidth: width, sourceHeight: height, sourcePages: pages, maskDepth, requestedLabels: requested, rois: perRoi, notes: ['标签来自独立的单通道无符号整数掩膜；0 标签也会保留，除非通过 maskLabels 排除。', '强度来自源图像原始解码像素，不来自预览 PNG。', '结果是带 ROI 和标签的描述性统计，必须经过科学复核，不构成诊断、治疗效果或生物学结论。'] }
      const manifest = JSON.stringify({ format: 'zerowall-image-mask-analysis', version: 1, ...imageMaskAnalysis, scientificReview: 'pending' }, null, 2) + '\n'
      const root = await realpath(project.rootPath); const parentPath = join(root, '.zerowall'); await mkdir(parentPath, { recursive: true }); const parent = await containedFile(root, parentPath); const exportsPath = join(parent, 'science-exports'); await mkdir(exportsPath, { recursive: true }); const destination = join(await containedFile(root, exportsPath), randomUUID()); await mkdir(destination)
      const manifestPath = join(destination, 'image-mask-analysis.json')
      try {
        await writeFile(manifestPath, manifest, { flag: 'wx' }); assertCurrent()
        const artifact = this.store.createArtifact({ projectId: project.id, name: 'Image label mask analysis', uri: pathToFileURL(manifestPath).href, mediaType: 'application/json', checksum: createHash('sha256').update(manifest).digest('hex'), metadata: { runner: IMAGE_MASK_ANALYSIS_RUNNER, sourceAssetId: asset.id, sourceSha256: sha256, maskAssetId: maskAsset.id, maskSha256, viewerId: viewer.id, viewerVersion: viewer.version, annotationRevisionId: selected.id, scientificReview: 'pending', kind: 'image-mask-analysis' } })
        return { ...response(), imageMaskAnalysis, artifact }
      } catch (error) { await rm(destination, { recursive: true, force: true }); throw error }
    }
    if (!['image_open', 'image_read', 'image_save'].includes(input.action)) throw new Error('Unsupported image viewer action.')
    const selectedPage = sharp(bytes, { page: state.page, pages: 1, limitInputPixels: MAX_PIXELS, failOn: 'error' })
    const selectedMetadata = await selectedPage.metadata()
    if (selectedMetadata.width !== width || (selectedMetadata.pageHeight ?? selectedMetadata.height) !== height) throw new Error('TIFF pages have different geometry; a series-aware adapter is required.')
    const thumbnail = await selectedPage.resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true })
    assertCurrent()
    if (!viewer) viewer = this.store.createViewerSession({ projectId: project.id, assetId: asset.id, tool: 'image', state: { ...state, sourceSha256: sha256 } })
    else if (input.action === 'image_save') viewer = this.store.updateViewerSession(project.id, viewer.id, { expectedVersion: viewer.version, state: { ...state, sourceSha256: sha256 } })
    const axes = metadata.format === 'tiff' ? omeAxes(bytes, state.page) : undefined
    const image: ImagePreview = { sourceSha256: sha256, coordinates: { convention: 'pixel-edge-top-left', width, height, pages, calibration: null }, format: metadata.format!, channels: metadata.channels ?? 1, depth: metadata.depth ?? 'unknown', page: state.page, previewWidth: thumbnail.info.width, previewHeight: thumbnail.info.height, pngBase64: thumbnail.data.toString('base64'), ...(axes ? { axes } : {}), notes: ['预览为显示用 PNG，不用于从屏幕像素测量原始强度。', '坐标以未旋转原图像素边界为准，左上角 (0,0)。', ...(axes ? [`已读取 OME 轴元数据：${axes.order}。页码仍按 0 开始，轴索引映射由专用适配器负责。`] : pages > 1 ? ['TIFF 页码从 0 开始；未核验 OME 轴序，不能将页码直接解释为 Z、T 或通道。'] : [])] }
    return { ...response(), image }
  }

  private asset(projectId: string, id?: string): DataAssetRecord {
    const asset = this.store.listDataAssets(projectId).find(item => item.id === id)
    if (!asset) throw new Error('Asset is not in the active project.')
    if (asset.location !== 'local' || !asset.uri.startsWith('file:')) throw new Error('Materialize remote assets through r_files before local viewing.')
    return asset
  }

  private async executeOmeZarr(project: ProjectRecord, asset: DataAssetRecord, viewer: ViewerSessionRecord | undefined, input: ScienceViewerRequest): Promise<ScienceViewerResponse> {
    if (!['image_open', 'image_read', 'image_save'].includes(input.action)) throw new Error('OME-Zarr currently supports bounded viewing and saved view state only; ROI analysis requires a chunk-aware analysis Runner.')
    const metadata = await readOmeZarrMetadata(fileURLToPath(asset.uri))
    const sourceSha256 = asset.checksum ?? metadata.fingerprint
    if (viewer && viewer.state.sourceSha256 !== sourceSha256) throw new Error('OME-Zarr metadata or asset checksum changed. Open a new image view; old annotations remain linked to the previous fingerprint.')
    const state = this.state(input.action === 'image_save' ? input.imageState : viewer?.state ?? { page: 0, zoom: 1, panX: 0, panY: 0 }, metadata.pages)
    if (viewer && input.action !== 'image_read' && input.expectedVersion !== viewer.version) throw new Error(`Viewer revision conflict: current ${viewer.version}.`)
    const plane = await readOmeZarrPlane(fileURLToPath(asset.uri), metadata, state.page)
    if (metadata.width * metadata.height > MAX_PIXELS) throw new Error('This OME-Zarr plane exceeds the bounded preview limit; use a remote tiled viewer.')
    const thumbnail = await sharp(plane.raw, { raw: { width: plane.width, height: plane.height, channels: 1, depth: plane.depth } as any }).resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true })
    if (!viewer) viewer = this.store.createViewerSession({ projectId: project.id, assetId: asset.id, tool: 'image', state: { ...state, sourceSha256 } })
    else if (input.action === 'image_save') viewer = this.store.updateViewerSession(project.id, viewer.id, { expectedVersion: viewer.version, state: { ...state, sourceSha256 } })
    const axes: ImagePreview['axes'] = { order: metadata.order, sizes: metadata.sizes, storage: 'ome-zarr', ...(metadata.physicalSize ? { physicalSize: metadata.physicalSize } : {}), position: omeZarrPagePosition(metadata, state.page) }
    const image: ImagePreview = { sourceSha256, coordinates: { convention: 'pixel-edge-top-left', width: metadata.width, height: metadata.height, pages: metadata.pages, calibration: null }, format: 'ome-zarr', channels: metadata.channels, depth: metadata.depth, page: state.page, previewWidth: thumbnail.info.width, previewHeight: thumbnail.info.height, pngBase64: thumbnail.data.toString('base64'), axes, notes: ['OME-Zarr 元数据和当前分块平面已读取；预览来自受限 chunk 解码。', '当前支持无压缩和 gzip/zlib chunk；其他压缩格式交给受管理 Python/远程适配器。', 'sourceSha256 未提供时使用元数据与 chunk 布局指纹，不等同于全量像素内容哈希。', '当前仅支持查看和保存视角；ROI、标签掩膜和强度分析需要独立的 chunk-aware Runner。'] }
    return { viewer, image, viewers: this.store.listViewerSessions(project.id) }
  }
  private state(value: unknown, pages: number): ImageViewState {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Image view state is required.')
    const state = value as ImageViewState
    if (!Number.isSafeInteger(state.page) || state.page < 0 || state.page >= pages || !Number.isFinite(state.zoom) || state.zoom < 0.1 || state.zoom > 20 || !Number.isFinite(state.panX) || !Number.isFinite(state.panY) || Math.abs(state.panX) > 1000000 || Math.abs(state.panY) > 1000000) throw new Error('Invalid image page, zoom or pan.')
    return { page: state.page, zoom: state.zoom, panX: state.panX, panY: state.panY }
  }
}

export async function readProjectAsset(project: ProjectRecord, asset: Pick<DataAssetRecord, 'uri' | 'checksum' | 'checksumAlgorithm'>, maximum: number): Promise<Buffer> {
  const path = await containedFile(project.rootPath, fileURLToPath(asset.uri))
  const file = await open(path, 'r')
  try {
    const before = await file.stat()
    if (!before.isFile() || before.size > maximum) throw new Error(`Asset exceeds bounded preview/import limit (${maximum} bytes); use a tiled or indexed adapter.`)
    const buffer = Buffer.alloc(before.size + 1); let length = 0
    while (length < buffer.length) { const { bytesRead } = await file.read(buffer, length, buffer.length-length, length); if (!bytesRead) break; length += bytesRead }
    const after = await file.stat()
    if (length !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) throw new Error('Asset changed during reading.')
    const bytes = buffer.subarray(0, length)
    if (asset.checksum && (!asset.checksumAlgorithm || createHash(asset.checksumAlgorithm).update(bytes).digest('hex') !== asset.checksum.toLowerCase())) throw new Error('Asset checksum mismatch.')
    return bytes
  } finally { await file.close() }
}
