import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, realpath, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import sharp from 'sharp'
import type { ResearchStore } from '@zerowallscience/research-store'
import { validateAnnotationPayload } from '@zerowallscience/research-store'
import type { DataAssetRecord, ImageAnnotations, ProjectRecord, ViewerSessionRecord } from '@zerowallscience/research-store/types'
import type { ImagePreview, ImageViewState, ScienceViewerRequest, ScienceViewerResponse } from '../shared/types.js'
import { containedFile } from './science-viewer.js'
import type { NativeEngineService } from './native-engines.js'

const MAX_IMAGE_BYTES = 128 * 1024 * 1024
const MAX_PIXELS = 100000000
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
