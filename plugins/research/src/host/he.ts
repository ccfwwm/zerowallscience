import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, realpath, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import sharp from 'sharp'
import type { ResearchStore } from '@zerowallscience/research-store'
import type { DataAssetRecord, ProjectRecord } from '@zerowallscience/research-store/types'
import { analyzeHeRgb, validateHeRegion, type HeAnalysis } from '../shared/he.js'
import type { HeRequest, HeResponse } from '../shared/types.js'
import { containedFile } from './science-viewer.js'

const MAX_BYTES = 512 * 1024 * 1024
const MAX_PIXELS = 100_000_000
const RUNNER = 'zerowall-he/7.0.0-1'

export class HeService {
  constructor(private readonly store: ResearchStore) {}
  async execute(project: ProjectRecord, request: HeRequest): Promise<HeResponse> {
    if (request.action === 'open') {
      const asset = this.asset(project.id, request.assetId); const input = await this.read(project, asset); const viewer = this.store.createViewerSession({ projectId: project.id, assetId: asset.id, tool: 'image', state: { sourceSha256: input.sha256, heTool: 'he', page: 0, zoom: 1, panX: 0, panY: 0 } })
      return { viewer, he: { width: input.width, height: input.height, pages: input.pages, format: input.format, notes: ['HE opens the first decoded pyramid/page level through the bounded native decoder.', 'Full OpenSlide tile streaming and StarDist are separate engines and are not silently substituted.'] } }
    }
    const viewer = this.store.listViewerSessions(project.id).find(item => item.id === request.viewerId && item.tool === 'image' && item.state.heTool === 'he'); if (!viewer) throw new Error('HE viewer is not in the active project.')
    const asset = this.asset(project.id, viewer.assetId); const input = await this.read(project, asset); if (input.sha256 !== viewer.state.sourceSha256) throw new Error('HE source changed; reopen the slide.')
    if (request.expectedVersion !== viewer.version) throw new Error(`HE viewer revision conflict: current ${viewer.version}.`)
    const region = validateHeRegion(request.region ?? { x: 0, y: 0, width: Math.min(input.width, 2000), height: Math.min(input.height, 2000), page: 0 }, input.width, input.height, input.pages)
    const analysis = await this.analyze(input.bytes, input.width, input.height, region)
    const updated = this.store.updateViewerSession(project.id, viewer.id, { expectedVersion: viewer.version, state: { ...viewer.state, sourceSha256: input.sha256, heRegion: region } })
    if (request.action === 'analyze') return { viewer: updated, analysis }
    if (request.action !== 'export') throw new Error('Unsupported HE action.')
    const root = await realpath(project.rootPath); const basePath = join(root, '.zerowall'); await mkdir(basePath, { recursive: true }); const base = await containedFile(root, basePath); const exportPath = join(base, 'science-exports'); await mkdir(exportPath, { recursive: true }); const directory = join(await containedFile(root, exportPath), randomUUID()); await mkdir(directory); const result = JSON.stringify({ ...analysis, runner: RUNNER, sourceAssetId: asset.id, sourceSha256: input.sha256, viewerId: viewer.id, viewerVersion: updated.version }, null, 2) + '\n'; const resultPath = join(directory, 'result.json')
    try { await writeFile(resultPath, result, { flag: 'wx' }); const artifact = this.store.createArtifact({ projectId: project.id, name: 'HE ROI analysis', uri: pathToFileURL(resultPath).href, mediaType: 'application/json', checksum: createHash('sha256').update(result).digest('hex'), metadata: { runner: RUNNER, sourceAssetId: asset.id, sourceSha256: input.sha256, viewerId: viewer.id, viewerVersion: updated.version, region, needsReview: false } }); return { viewer: updated, analysis, artifact } } catch (error) { await rm(directory, { recursive: true, force: true }); throw error }
  }
  private asset(projectId: string, id?: string): DataAssetRecord { const asset = this.store.listDataAssets(projectId).find(item => item.id === id); if (!asset) throw new Error('HE asset is not in the active project.'); return asset }
  private async read(project: ProjectRecord, asset: DataAssetRecord): Promise<{ bytes: Buffer; sha256: string; width: number; height: number; pages: number; format: string }> {
    if (asset.location !== 'local' || !asset.uri.startsWith('file:')) throw new Error('Materialize remote HE slides before viewing.'); const path = await containedFile(project.rootPath, fileURLToPath(asset.uri)); if (!/\.(svs|ndpi|tif|tiff)$/iu.test(path)) throw new Error('HE viewer accepts SVS, NDPI and TIFF files.')
    const handle = await open(path, 'r'); try { const info = await handle.stat(); if (!info.isFile() || info.size > MAX_BYTES) throw new Error('HE input must be a regular file no larger than 512 MiB.'); const bytes = Buffer.alloc(info.size); let offset = 0; while (offset < bytes.length) { const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset); if (!bytesRead) throw new Error('HE slide ended during reading.'); offset += bytesRead } const after = await handle.stat(); if (after.size !== info.size || after.mtimeMs !== info.mtimeMs || after.ctimeMs !== info.ctimeMs) throw new Error('HE slide changed during reading.'); const sha256 = createHash('sha256').update(bytes).digest('hex'); const metadata = await sharp(bytes, { page: 0, pages: 1, limitInputPixels: MAX_PIXELS, failOn: 'error' }).metadata(); const width = metadata.width ?? 0; const height = metadata.pageHeight ?? metadata.height ?? 0; const pages = metadata.pages ?? 1; if (!width || !height || width * height > MAX_PIXELS) throw new Error('HE decoded page exceeds the bounded 100-million-pixel limit; use the OpenSlide tile engine.'); return { bytes, sha256, width, height, pages, format: metadata.format ?? 'unknown' } } finally { await handle.close() }
  }
  private async analyze(bytes: Buffer, width: number, height: number, region: { x: number; y: number; width: number; height: number; page: number }): Promise<HeAnalysis> { const tile = await sharp(bytes, { page: region.page, pages: 1, limitInputPixels: MAX_PIXELS, failOn: 'error' }).extract({ left: region.x, top: region.y, width: region.width, height: region.height }).removeAlpha().raw().toBuffer({ resolveWithObject: true }); return analyzeHeRgb(tile.data, tile.info.width, tile.info.height, region) }
}
