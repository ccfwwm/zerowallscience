import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, realpath, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { ResearchStore } from '@zerowallscience/research-store'
import type { DataAssetRecord, ProjectRecord } from '@zerowallscience/research-store/types'
import { analyzeSanger, parseAb1, parseScf, reviewBidirectionalSanger, type SangerTrace } from '../shared/sanger.js'
import type { SangerRequest, SangerResponse } from '../shared/types.js'
import { containedFile } from './science-viewer.js'

const MAX_BYTES = 128 * 1024 * 1024
export class SangerService {
  constructor(private readonly store: ResearchStore) {}
  async execute(project: ProjectRecord, request: SangerRequest): Promise<SangerResponse> {
    if (request.action === 'open') { const asset = this.asset(project.id, request.assetId); const input = await this.read(project, asset); const viewer = this.store.createViewerSession({ projectId: project.id, assetId: asset.id, tool: 'sequence', state: { sourceSha256: input.sha256, traceTool: 'sanger', threshold: .8, window: 5 } }); return { trace: input.trace, viewer } }
    const viewer = this.store.listViewerSessions(project.id).find(item => item.id === request.viewerId && item.state.traceTool === 'sanger'); if (!viewer) throw new Error('Sanger viewer is not in the active project.')
    if (request.action === 'review') {
      const reverse = this.store.listViewerSessions(project.id).find(item => item.id === request.reverseViewerId && item.state.traceTool === 'sanger'); if (!reverse) throw new Error('Reverse Sanger viewer is not in the active project.')
      if (reverse.id === viewer.id) throw new Error('Bidirectional review requires two distinct trace views.')
      if (request.expectedVersion !== viewer.version || request.expectedReverseVersion !== reverse.version) throw new Error('Sanger review revision conflict; refresh both trace views.')
      const forwardInput = await this.read(project, this.asset(project.id, viewer.assetId)); const reverseInput = await this.read(project, this.asset(project.id, reverse.assetId))
      if (forwardInput.sha256 !== viewer.state.sourceSha256 || reverseInput.sha256 !== reverse.state.sourceSha256) throw new Error('Sanger source changed; reopen both traces before review.')
      const forward = analyzeSanger(forwardInput.trace, request.threshold ?? Number(viewer.state.threshold), request.window ?? Number(viewer.state.window), request.reference)
      const reverseAnalysis = analyzeSanger(reverseInput.trace, request.threshold ?? Number(reverse.state.threshold), request.window ?? Number(reverse.state.window))
      return { trace: forwardInput.trace, analysis: forward, review: reviewBidirectionalSanger(forward, reverseAnalysis), viewer }
    }
    const asset = this.asset(project.id, viewer.assetId); const input = await this.read(project, asset); if (input.sha256 !== viewer.state.sourceSha256) throw new Error('Sanger source changed; reopen the trace.'); if (request.expectedVersion !== viewer.version) throw new Error(`Sanger viewer revision conflict: current ${viewer.version}.`)
    const threshold = request.threshold ?? Number(viewer.state.threshold); const window = request.window ?? Number(viewer.state.window); const analysis = analyzeSanger(input.trace, threshold, window, request.reference); const updated = this.store.updateViewerSession(project.id, viewer.id, { expectedVersion: viewer.version, state: { sourceSha256: input.sha256, traceTool: 'sanger', threshold, window, ...(request.reference === undefined ? {} : { reference: request.reference }) } }); if (request.action === 'analyze') return { trace: input.trace, analysis, viewer: updated }; if (request.action !== 'export') throw new Error('Unsupported Sanger action.')
    const root = await realpath(project.rootPath); const parentPath = join(root, '.zerowall'); await mkdir(parentPath, { recursive: true }); const parent = await containedFile(root, parentPath); const directoryPath = join(parent, 'science-exports'); await mkdir(directoryPath, { recursive: true }); const directory = await containedFile(root, directoryPath); const destinationPath = join(directory, randomUUID()); await mkdir(destinationPath); const destination = await containedFile(root, destinationPath); const manifest = JSON.stringify({ format: 'zerowall-sanger-result', version: 1, runner: 'zerowall-sanger/7.0.0-1', sourceAssetId: asset.id, sourceSha256: input.sha256, viewerId: viewer.id, viewerVersion: updated.version, parameters: { threshold, window, referenceProvided: request.reference !== undefined }, analysis }, null, 2) + '\n'; const path = join(destination, 'result.json')
    try { await writeFile(path, manifest, { flag: 'wx' }); await writeFile(join(destination, 'trimmed.fasta'), `>trimmed source=${input.sha256}\n${analysis.trim.sequence}\n`, { flag: 'wx' }); const artifact = this.store.createArtifact({ projectId: project.id, name: 'Sanger trace analysis', uri: pathToFileURL(path).href, mediaType: 'application/json', checksum: createHash('sha256').update(manifest).digest('hex'), metadata: { sourceAssetId: asset.id, sourceSha256: input.sha256, viewerId: viewer.id, viewerVersion: updated.version, runner: 'zerowall-sanger/7.0.0-1', fastaUri: pathToFileURL(join(destination, 'trimmed.fasta')).href, needsReview: false } }); return { trace: input.trace, analysis, viewer: updated, artifact } } catch (error) { await rm(destination, { recursive: true, force: true }); throw error }
  }
  private asset(projectId: string, id?: string): DataAssetRecord { const asset = this.store.listDataAssets(projectId).find(item => item.id === id); if (!asset) throw new Error('Sanger asset is not in the active project.'); return asset }
  private async read(project: ProjectRecord, asset: DataAssetRecord): Promise<{ trace: SangerTrace; sha256: string }> {
    if (asset.location !== 'local' || !asset.uri.startsWith('file:')) throw new Error('Materialize remote Sanger files before viewing.')
    const path = await containedFile(project.rootPath, fileURLToPath(asset.uri))
    if (!/\.(scf|ab1)$/iu.test(path)) throw new Error('Sanger viewer accepts SCF and AB1 chromatograms.')
    const handle = await open(path, 'r')
    try {
      const info = await handle.stat()
      if (!info.isFile() || info.size > MAX_BYTES) throw new Error('Sanger trace must be a regular file no larger than 128 MiB.')
      const bytes = Buffer.alloc(info.size); let offset = 0
      while (offset < bytes.length) { const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset); if (!bytesRead) throw new Error('Sanger trace ended during reading.'); offset += bytesRead }
      const after = await handle.stat()
      if (offset !== info.size || after.size !== info.size || after.mtimeMs !== info.mtimeMs || after.ctimeMs !== info.ctimeMs) throw new Error('Sanger trace changed during reading.')
      const sha256 = createHash('sha256').update(bytes).digest('hex')
      if (asset.checksum && (!asset.checksumAlgorithm || createHash(asset.checksumAlgorithm).update(bytes).digest('hex') !== asset.checksum.toLowerCase())) throw new Error('Sanger trace checksum does not match the registered asset.')
      return { trace: /\.ab1$/iu.test(path) ? parseAb1(bytes, sha256) : parseScf(bytes, sha256), sha256 }
    } finally { await handle.close() }
  }
}
