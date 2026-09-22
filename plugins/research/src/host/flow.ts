import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { ResearchStore } from '@zerowallscience/research-store'
import type { DataAssetRecord, JsonValue, ProjectRecord } from '@zerowallscience/research-store/types'
import { gatingMlSubset, type FlowCompensation } from '../shared/flow.js'
import type { FlowRequest, FlowResponse } from '../shared/types.js'
import { containedFile } from './science-viewer.js'
import { analyzeFlowStream, FcsReader } from './flow-reader.js'
import { importGatingMl } from './gating-ml.js'
import { parseFlowJoWorkspace, validateFlowJoSample, type FlowJoWorkspace, type FlowJoWorkspaceSample } from './flowjo.js'

const RUNNER = 'zerowall-flow/7.0.0-5'

export class FlowService {
  constructor(private readonly store: ResearchStore) {}

  async execute(project: ProjectRecord, request: FlowRequest): Promise<FlowResponse> {
    if (request.action === 'batch') return this.batch(project, request)
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
    if (request.action === 'workspace_import') {
      const workspaceAsset = this.workspaceAsset(project.id, request.importAssetId); const loaded = await this.workspace(project, workspaceAsset)
      const source = this.workspaceSample(project, asset, loaded.workspace)
      validateFlowJoSample(source, input.dataset)
      imported = { gates: source.gates, transform: 'none', cofactor: 5, applyCompensation: false }
      importedSource = { assetId: workspaceAsset.id, sha256: loaded.sha256, format: 'flowjo-wsp', sampleId: source.sampleId, groups: source.groups }
    }
    const transform = imported?.transform ?? request.transform ?? (viewer.state.transform as 'none' | 'arcsinh' | undefined) ?? 'none'
    const cofactor = imported?.cofactor ?? request.cofactor ?? Number(viewer.state.cofactor ?? 5)
    const applyCompensation = imported?.applyCompensation ?? request.applyCompensation ?? Boolean(viewer.state.applyCompensation)
    const gates = imported?.gates ?? request.gates ?? (Array.isArray(viewer.state.gates) ? viewer.state.gates as unknown as FlowRequest['gates'] : undefined)
    const importedCompensation = imported ? imported.compensation : viewer.state.importedCompensation as unknown as FlowCompensation | undefined
    if (importedCompensation) input.dataset.compensation = importedCompensation
    if (!['analyze', 'export', 'import', 'workspace_import'].includes(request.action)) throw new Error('Unsupported flow action.')
    const root = await realpath(project.rootPath); const parentPath = join(root, '.zerowall'); await mkdir(parentPath, { recursive: true }); const parent = await containedFile(root, parentPath)
    const scratchPath = join(parent, 'flow-tmp'); await mkdir(scratchPath, { recursive: true }); const scratch = await containedFile(root, scratchPath)
    const analysis = await analyzeFlowStream(input, { transform, cofactor, applyCompensation, ...(gates === undefined ? {} : { gates }), ...(request.previewLimit === undefined ? {} : { previewLimit: request.previewLimit }) }, scratch)
    const dataset = await input.preview()
    const gatingXml = request.action === 'export' ? gatingMlSubset(analysis, gates ?? [], importedCompensation) : undefined
    const persistedGates = gates === undefined ? undefined : JSON.parse(JSON.stringify(gates)) as JsonValue
    const updated = this.store.updateViewerSession(project.id, viewer.id, { expectedVersion: viewer.version, state: { sourceSha256: input.sha256, transform, cofactor, applyCompensation, ...(persistedGates === undefined ? {} : { gates: persistedGates }), ...(importedCompensation ? { importedCompensation: JSON.parse(JSON.stringify(importedCompensation)) as JsonValue } : {}), ...(importedSource ?? viewer.state.gatingMlSource ? { gatingMlSource: importedSource ?? viewer.state.gatingMlSource! } : {}) } })
    if (request.action === 'analyze' || request.action === 'import' || request.action === 'workspace_import') return { dataset, analysis, viewer: updated }
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
  private workspaceAsset(projectId: string, id?: string): DataAssetRecord { const asset = this.store.listDataAssets(projectId).find(item => item.id === id); if (!asset) throw new Error('FlowJo workspace is not in the active project.'); if (asset.location !== 'local' || !asset.uri.startsWith('file:') || !/\.wsp$/iu.test(asset.uri)) throw new Error('FlowJo import requires a registered local .wsp asset.'); return asset }
  private async read(project: ProjectRecord, asset: DataAssetRecord): Promise<FcsReader> {
    if (asset.location !== 'local' || !asset.uri.startsWith('file:')) throw new Error('Materialize remote FCS files before viewing.')
    const path = await containedFile(project.rootPath, fileURLToPath(asset.uri)); if (!/\.fcs$/iu.test(path)) throw new Error('Flow viewer currently accepts FCS files.')
    return FcsReader.open(path, asset.checksum, asset.checksumAlgorithm)
  }
  private async workspace(project: ProjectRecord, asset: DataAssetRecord): Promise<{ workspace: FlowJoWorkspace; sha256: string }> {
    const path = await containedFile(project.rootPath, fileURLToPath(asset.uri)); const bytes = await readFile(path)
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    if (asset.checksum && (!asset.checksumAlgorithm || createHash(asset.checksumAlgorithm).update(bytes).digest('hex') !== asset.checksum.toLowerCase())) throw new Error('FlowJo workspace checksum does not match the registered asset.')
    return { workspace: parseFlowJoWorkspace(new TextDecoder('utf-8', { fatal: true }).decode(bytes)), sha256 }
  }
  private workspaceSample(project: ProjectRecord, asset: DataAssetRecord, workspace: FlowJoWorkspace): FlowJoWorkspaceSample {
    const names = [asset.name, basename(fileURLToPath(asset.uri))]
    const candidates = new Set(names.flatMap(name => [name, name.slice(0, name.length - extname(name).length)]))
    const matched = workspace.samples.filter(sample => { const name = basename(sample.sourceUri.replaceAll('\\', '/')); return candidates.has(sample.sourceUri) || candidates.has(name) || candidates.has(name.slice(0, name.length - extname(name).length)) })
    if (matched.length !== 1) throw new Error(`FlowJo workspace must map exactly one sample to registered FCS asset ${asset.name}; external workspace paths are not opened.`)
    return matched[0]!
  }
  private async batch(project: ProjectRecord, request: FlowRequest): Promise<FlowResponse> {
    const ids = request.assetIds ?? []
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > 64 || new Set(ids).size !== ids.length) throw new Error('Flow batch requires 1–64 distinct FCS asset IDs.')
    let workspace: { workspace: FlowJoWorkspace; sha256: string; assetId: string } | undefined
    if (request.importAssetId) { const asset = this.workspaceAsset(project.id, request.importAssetId); const loaded = await this.workspace(project, asset); workspace = { ...loaded, assetId: asset.id } }
    const root = await realpath(project.rootPath); const scratchPath = join(root, '.zerowall', 'flow-tmp'); await mkdir(scratchPath, { recursive: true }); const scratch = await containedFile(root, scratchPath)
    const items: NonNullable<FlowResponse['batch']>['items'] = []
    for (const id of ids) {
      let asset: DataAssetRecord | undefined
      try {
        asset = this.asset(project.id, id); const input = await this.read(project, asset)
        try {
          const sample = workspace ? this.workspaceSample(project, asset, workspace.workspace) : undefined
          if (sample) validateFlowJoSample(sample, input.dataset)
          const gates = sample?.gates ?? request.gates
          const analysis = await analyzeFlowStream(input, { transform: request.transform ?? 'none', cofactor: request.cofactor ?? 5, applyCompensation: request.applyCompensation ?? false, ...(gates ? { gates } : {}), ...(request.previewLimit === undefined ? {} : { previewLimit: request.previewLimit }) }, scratch)
          items.push({ assetId: asset.id, sourceSha256: input.sha256, ...(sample ? { sampleId: sample.sampleId, groups: sample.groups } : {}), analysis })
        } finally { await input.close() }
      } catch (error) { items.push({ assetId: id, error: error instanceof Error ? error.message : String(error) }) }
    }
    const output = { format: 'zerowall-flow-batch-result', version: 1, runner: RUNNER, parameters: { transform: request.transform ?? 'none', cofactor: request.cofactor ?? 5, applyCompensation: request.applyCompensation ?? false, ...(workspace ? { workspaceAssetId: workspace.assetId, workspaceSha256: workspace.sha256 } : {}) }, items }
    const directory = join(root, '.zerowall', 'science-exports', randomUUID()); await mkdir(directory, { recursive: true }); const path = join(directory, 'batch-result.json'); const manifest = JSON.stringify(output, null, 2) + '\n'
    try {
      await writeFile(path, manifest, { flag: 'wx' })
      const artifact = this.store.createArtifact({ projectId: project.id, name: 'Flow cytometry batch analysis', uri: pathToFileURL(path).href, mediaType: 'application/json', checksum: createHash('sha256').update(manifest).digest('hex'), metadata: { runner: RUNNER, itemCount: items.length, succeeded: items.filter(item => item.analysis).length, failed: items.filter(item => item.error).length, ...(workspace ? { workspaceAssetId: workspace.assetId, workspaceSha256: workspace.sha256 } : {}), needsReview: false } })
      return { artifact, batch: { items, ...(workspace ? { workspaceSha256: workspace.sha256 } : {}), notes: ['Each FCS source is opened, hashed, analyzed, and closed independently.', 'Per-sample failures are recorded in this artifact; no unsupported FlowJo semantics are approximated.'] } }
    } catch (error) { await rm(directory, { recursive: true, force: true }); throw error }
  }
}
