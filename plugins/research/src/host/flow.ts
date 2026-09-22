import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, realpath, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { ResearchStore } from '@zerowallscience/research-store'
import type { DataAssetRecord, JsonValue, ProjectRecord } from '@zerowallscience/research-store/types'
import { gatingMlSubset, type FlowCompensation } from '../shared/flow.js'
import type { FlowRequest, FlowResponse } from '../shared/types.js'
import { containedFile } from './science-viewer.js'
import { analyzeFlowStream, FcsReader } from './flow-reader.js'
import { importGatingMl } from './gating-ml.js'

const RUNNER = 'zerowall-flow/7.0.0-4'

export class FlowService {
  constructor(private readonly store: ResearchStore) {}

  async execute(project: ProjectRecord, request: FlowRequest): Promise<FlowResponse> {
    if (request.action === 'open') {
      const asset = this.asset(project.id, request.assetId); const input = await this.read(project, asset)
      try {
        const dataset = await input.preview()
        const viewer = this.store.createViewerSession({ projectId: project.id, assetId: asset.id, tool: 'flow', state: { sourceSha256: input.sha256, transform: 'none', cofactor: 5, applyCompensation: false } })
        return { dataset, viewer }
      } finally { await input.close() }
    }
    const viewer = this.store.listViewerSessions(project.id).find(item => item.id === request.viewerId && item.tool === 'flow')
    if (!viewer) throw new Error('Flow viewer is not in the active project.')
    const asset = this.asset(project.id, viewer.assetId); const input = await this.read(project, asset)
    try {
    if (input.sha256 !== viewer.state.sourceSha256) throw new Error('FCS source changed; reopen the flow view.')
    if (request.expectedVersion !== viewer.version) throw new Error(`Flow viewer revision conflict: current ${viewer.version}.`)
    let imported: ReturnType<typeof importGatingMl> | undefined; let importedSource: JsonValue | undefined
    if (request.action === 'import') {
      const gateAsset = this.asset(project.id, request.importAssetId)
      if (gateAsset.location !== 'local' || !gateAsset.uri.startsWith('file:')) throw new Error('Materialize the GatingML asset in the active project first.')
      const xmlPath = await containedFile(project.rootPath, fileURLToPath(gateAsset.uri)); const xmlHandle = await open(xmlPath, 'r')
      try {
        const before = await xmlHandle.stat(); if (!before.isFile() || before.size > 1024 * 1024) throw new Error('GatingML import requires a regular XML file no larger than 1 MiB.')
        const bytes = Buffer.alloc(before.size); let offset = 0
        while (offset < bytes.length) { const result = await xmlHandle.read(bytes, offset, bytes.length - offset, offset); if (!result.bytesRead) throw new Error('GatingML ended during reading.'); offset += result.bytesRead }
        const after = await xmlHandle.stat(); if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw new Error('GatingML changed during import.')
        const checksum = createHash('sha256').update(bytes).digest('hex')
        if (gateAsset.checksum && (!gateAsset.checksumAlgorithm || createHash(gateAsset.checksumAlgorithm).update(bytes).digest('hex') !== gateAsset.checksum.toLowerCase())) throw new Error('GatingML checksum does not match the registered asset.')
        imported = importGatingMl(new TextDecoder('utf-8', { fatal: true }).decode(bytes), input.dataset)
        importedSource = { assetId: gateAsset.id, sha256: checksum }
      } finally { await xmlHandle.close() }
    }
    const transform = imported?.transform ?? request.transform ?? (viewer.state.transform as 'none' | 'arcsinh' | undefined) ?? 'none'
    const cofactor = imported?.cofactor ?? request.cofactor ?? Number(viewer.state.cofactor ?? 5)
    const applyCompensation = imported?.applyCompensation ?? request.applyCompensation ?? Boolean(viewer.state.applyCompensation)
    const gates = imported?.gates ?? request.gates ?? (Array.isArray(viewer.state.gates) ? viewer.state.gates as unknown as FlowRequest['gates'] : undefined)
    const importedCompensation = imported ? imported.compensation : viewer.state.importedCompensation as unknown as FlowCompensation | undefined
    if (importedCompensation) input.dataset.compensation = importedCompensation
    if (!['analyze', 'export', 'import'].includes(request.action)) throw new Error('Unsupported flow action.')
    const root = await realpath(project.rootPath); const parentPath = join(root, '.zerowall'); await mkdir(parentPath, { recursive: true }); const parent = await containedFile(root, parentPath)
    const scratchPath = join(parent, 'flow-tmp'); await mkdir(scratchPath, { recursive: true }); const scratch = await containedFile(root, scratchPath)
    const analysis = await analyzeFlowStream(input, { transform, cofactor, applyCompensation, ...(gates === undefined ? {} : { gates }), ...(request.previewLimit === undefined ? {} : { previewLimit: request.previewLimit }) }, scratch)
    const dataset = await input.preview()
    const gatingXml = request.action === 'export' ? gatingMlSubset(analysis, gates ?? [], importedCompensation) : undefined
    const persistedGates = gates === undefined ? undefined : JSON.parse(JSON.stringify(gates)) as JsonValue
    const updated = this.store.updateViewerSession(project.id, viewer.id, { expectedVersion: viewer.version, state: { sourceSha256: input.sha256, transform, cofactor, applyCompensation, ...(persistedGates === undefined ? {} : { gates: persistedGates }), ...(importedCompensation ? { importedCompensation: JSON.parse(JSON.stringify(importedCompensation)) as JsonValue } : {}), ...(importedSource ?? viewer.state.gatingMlSource ? { gatingMlSource: importedSource ?? viewer.state.gatingMlSource! } : {}) } })
    if (request.action === 'analyze' || request.action === 'import') return { dataset, analysis, viewer: updated }
    if (request.action !== 'export') throw new Error('Unsupported flow action.')
    const directoryPath = join(parent, 'science-exports'); await mkdir(directoryPath, { recursive: true }); const directory = await containedFile(root, directoryPath); const destination = join(directory, randomUUID()); await mkdir(destination)
    const manifest = JSON.stringify({ format: 'zerowall-flow-result', version: 1, runner: RUNNER, sourceAssetId: asset.id, sourceSha256: input.sha256, viewerId: viewer.id, viewerVersion: updated.version, parameters: { transform, cofactor, applyCompensation, gates: gates ?? [], ...(importedCompensation ? { compensation: importedCompensation } : {}) }, gatingMlSource: updated.state.gatingMlSource ?? null, analysis }, null, 2) + '\n'
    const resultPath = join(destination, 'result.json'); const gatingPath = join(destination, 'gating-ml.xml')
    try {
      await writeFile(resultPath, manifest, { flag: 'wx' }); await writeFile(gatingPath, gatingXml!, { flag: 'wx' })
      const artifact = this.store.createArtifact({ projectId: project.id, name: 'Flow cytometry analysis', uri: pathToFileURL(resultPath).href, mediaType: 'application/json', checksum: createHash('sha256').update(manifest).digest('hex'), metadata: { sourceAssetId: asset.id, sourceSha256: input.sha256, viewerId: viewer.id, viewerVersion: updated.version, runner: RUNNER, gatingMlUri: pathToFileURL(gatingPath).href, gatingMlSha256: createHash('sha256').update(gatingXml!).digest('hex'), needsReview: false } })
      return { dataset, analysis, viewer: updated, artifact }
    } catch (error) { await rm(destination, { recursive: true, force: true }); throw error }
    } finally { await input.close() }
  }

  private asset(projectId: string, id?: string): DataAssetRecord { const asset = this.store.listDataAssets(projectId).find(item => item.id === id); if (!asset) throw new Error('FCS asset is not in the active project.'); return asset }
  private async read(project: ProjectRecord, asset: DataAssetRecord): Promise<FcsReader> {
    if (asset.location !== 'local' || !asset.uri.startsWith('file:')) throw new Error('Materialize remote FCS files before viewing.')
    const path = await containedFile(project.rootPath, fileURLToPath(asset.uri)); if (!/\.fcs$/iu.test(path)) throw new Error('Flow viewer currently accepts FCS files.')
    return FcsReader.open(path, asset.checksum, asset.checksumAlgorithm)
  }
}
