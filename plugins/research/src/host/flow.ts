import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, realpath, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { ResearchStore } from '@zerowallscience/research-store'
import type { DataAssetRecord, JsonValue, ProjectRecord, ViewerSessionRecord } from '@zerowallscience/research-store/types'
import { analyzeFlow, gatingMlSubset, parseFcs, type FlowDataset } from '../shared/flow.js'
import type { FlowRequest, FlowResponse } from '../shared/types.js'
import { containedFile } from './science-viewer.js'

const MAX_BYTES = 512 * 1024 * 1024
const RUNNER = 'zerowall-flow/7.0.0-1'

export class FlowService {
  constructor(private readonly store: ResearchStore) {}

  async execute(project: ProjectRecord, request: FlowRequest): Promise<FlowResponse> {
    if (request.action === 'open') {
      const asset = this.asset(project.id, request.assetId); const input = await this.read(project, asset)
      const viewer = this.store.createViewerSession({ projectId: project.id, assetId: asset.id, tool: 'flow', state: { sourceSha256: input.sha256, transform: 'none', cofactor: 5, applyCompensation: false } })
      return { dataset: input.dataset, viewer }
    }
    const viewer = this.store.listViewerSessions(project.id).find(item => item.id === request.viewerId && item.tool === 'flow')
    if (!viewer) throw new Error('Flow viewer is not in the active project.')
    const asset = this.asset(project.id, viewer.assetId); const input = await this.read(project, asset)
    if (input.sha256 !== viewer.state.sourceSha256) throw new Error('FCS source changed; reopen the flow view.')
    if (request.expectedVersion !== viewer.version) throw new Error(`Flow viewer revision conflict: current ${viewer.version}.`)
    const transform = request.transform ?? (viewer.state.transform as 'none' | 'arcsinh' | undefined) ?? 'none'
    const cofactor = request.cofactor ?? Number(viewer.state.cofactor ?? 5)
    const applyCompensation = request.applyCompensation ?? Boolean(viewer.state.applyCompensation)
    const gates = request.gates ?? (Array.isArray(viewer.state.gates) ? viewer.state.gates as unknown as FlowRequest['gates'] : undefined)
    const analysis = analyzeFlow(input.dataset, { transform, cofactor, applyCompensation, ...(gates === undefined ? {} : { gates }), ...(request.previewLimit === undefined ? {} : { previewLimit: request.previewLimit }) })
    const persistedGates = gates === undefined ? undefined : JSON.parse(JSON.stringify(gates)) as JsonValue
    const updated = this.store.updateViewerSession(project.id, viewer.id, { expectedVersion: viewer.version, state: { sourceSha256: input.sha256, transform, cofactor, applyCompensation, ...(persistedGates === undefined ? {} : { gates: persistedGates }) } })
    if (request.action === 'analyze') return { dataset: input.dataset, analysis, viewer: updated }
    if (request.action !== 'export') throw new Error('Unsupported flow action.')
    const root = await realpath(project.rootPath); const parentPath = join(root, '.zerowall'); await mkdir(parentPath, { recursive: true }); const parent = await containedFile(root, parentPath); const directoryPath = join(parent, 'science-exports'); await mkdir(directoryPath, { recursive: true }); const directory = await containedFile(root, directoryPath); const destination = join(directory, randomUUID()); await mkdir(destination)
    const manifest = JSON.stringify({ format: 'zerowall-flow-result', version: 1, runner: RUNNER, sourceAssetId: asset.id, sourceSha256: input.sha256, viewerId: viewer.id, viewerVersion: updated.version, parameters: { transform, cofactor, applyCompensation, gates: gates ?? [] }, analysis }, null, 2) + '\n'
    const resultPath = join(destination, 'result.json'); const gatingPath = join(destination, 'gating-ml.xml')
    try {
      await writeFile(resultPath, manifest, { flag: 'wx' }); await writeFile(gatingPath, gatingMlSubset(analysis, request.gates ?? []), { flag: 'wx' })
      const artifact = this.store.createArtifact({ projectId: project.id, name: 'Flow cytometry analysis', uri: pathToFileURL(resultPath).href, mediaType: 'application/json', checksum: createHash('sha256').update(manifest).digest('hex'), metadata: { sourceAssetId: asset.id, sourceSha256: input.sha256, viewerId: viewer.id, viewerVersion: updated.version, runner: RUNNER, gatingMlUri: pathToFileURL(gatingPath).href, needsReview: false } })
      return { dataset: input.dataset, analysis, viewer: updated, artifact }
    } catch (error) { await rm(destination, { recursive: true, force: true }); throw error }
  }

  private asset(projectId: string, id?: string): DataAssetRecord { const asset = this.store.listDataAssets(projectId).find(item => item.id === id); if (!asset) throw new Error('FCS asset is not in the active project.'); return asset }
  private async read(project: ProjectRecord, asset: DataAssetRecord): Promise<{ dataset: FlowDataset; sha256: string }> {
    if (asset.location !== 'local' || !asset.uri.startsWith('file:')) throw new Error('Materialize remote FCS files before viewing.')
    const path = await containedFile(project.rootPath, fileURLToPath(asset.uri)); if (!/\.fcs$/iu.test(path)) throw new Error('Flow viewer currently accepts FCS files.')
    const handle = await open(path, 'r')
    try {
      const info = await handle.stat(); if (!info.isFile() || info.size > MAX_BYTES) throw new Error('FCS must be a regular file no larger than 512 MiB.')
      const bytes = Buffer.alloc(info.size); let offset = 0
      while (offset < bytes.length) { const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset); if (!bytesRead) throw new Error('FCS ended during reading.'); offset += bytesRead }
      const after = await handle.stat(); if (offset !== info.size || after.size !== info.size || after.mtimeMs !== info.mtimeMs || after.ctimeMs !== info.ctimeMs) throw new Error('FCS changed during reading.')
      const sha256 = createHash('sha256').update(bytes).digest('hex'); if (asset.checksum && (!asset.checksumAlgorithm || createHash(asset.checksumAlgorithm).update(bytes).digest('hex') !== asset.checksum.toLowerCase())) throw new Error('FCS checksum does not match the registered asset.')
      return { dataset: parseFcs(bytes, sha256), sha256 }
    } finally { await handle.close() }
  }
}
