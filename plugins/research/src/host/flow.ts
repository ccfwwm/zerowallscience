import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { ResearchStore } from '@zerowallscience/research-store'
import type { ArtifactRecord, DataAssetRecord, JsonValue, ProjectRecord, RunRecord } from '@zerowallscience/research-store/types'
import { gatingMlSubset, type FlowCompensation } from '../shared/flow.js'
import type { FlowRequest, FlowResponse } from '../shared/types.js'
import { containedFile } from './science-viewer.js'
import { analyzeFlowStream, FcsReader } from './flow-reader.js'
import { importGatingMl } from './gating-ml.js'
import { parseFlowJoWorkspace, validateFlowJoSample, type FlowJoWorkspace, type FlowJoWorkspaceSample } from './flowjo.js'

const RUNNER = 'zerowall-flow/7.0.0-6'
const BATCH_OWNER = 'flow-batch'
const terminal = new Set(['succeeded', 'failed', 'cancelled', 'timed_out'])

export class FlowService {
  private readonly owned = new Map<string, { controller: AbortController; task: Promise<void> }>()
  private readonly queued = new Map<string, { project: ProjectRecord; request: FlowRequest }>()
  private draining: Promise<void> | undefined
  private closed = false
  constructor(private readonly store: ResearchStore) {}

  async dispose(): Promise<void> {
    this.closed = true
    this.queued.clear()
    const tasks = [...this.owned.values()]
    for (const { controller } of tasks) controller.abort()
    await Promise.allSettled(tasks.map(({ task }) => task))
  }

  async execute(project: ProjectRecord, request: FlowRequest): Promise<FlowResponse> {
    if (request.action === 'batch_list') return { runs: this.store.listRuns(project.id).filter(run => run.leaseOwner === BATCH_OWNER) }
    if (request.action === 'batch_status') { if (!request.runId) throw new Error('Flow batch status requires runId.'); return this.batchStatus(project, request.runId) }
    if (request.action === 'batch_cancel') { if (!request.runId) throw new Error('Flow batch cancellation requires runId.'); return this.batchCancel(project, request.runId) }
    if (request.action === 'batch_submit') return this.batchSubmit(project, request)
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
  private batchRun(project: ProjectRecord, id: string): RunRecord {
    const run = this.store.getRun(id)
    if (!run || run.projectId !== project.id || run.leaseOwner !== BATCH_OWNER) throw new Error('Flow batch run is not in the active project.')
    return run
  }
  private async batchRequest(project: ProjectRecord, run: RunRecord): Promise<FlowRequest> {
    const entry = run.inputs.find(item => item.name === 'batch_request')
    if (!entry?.uri.startsWith('file:')) throw new Error('Flow batch request snapshot is unavailable.')
    const request = this.normalizedBatchRequest(JSON.parse(await readFile(await containedFile(project.rootPath, fileURLToPath(entry.uri)), 'utf8')))
    const requestId = run.inputs.find(item => item.name === 'request_id')?.uri
    const fingerprint = run.inputs.find(item => item.name === 'fingerprint')?.uri
    if (!requestId || request.requestId !== requestId || !fingerprint || fingerprint !== this.batchFingerprint(request)) throw new Error('Flow batch request snapshot does not match its immutable Run fingerprint.')
    return request
  }
  private async batchSubmit(project: ProjectRecord, request: FlowRequest): Promise<FlowResponse> {
    if (this.closed) throw new Error('Flow batch service is stopping; submit after the Host has restarted.')
    const snapshot = this.normalizedBatchRequest(request)
    const fingerprint = this.batchFingerprint(snapshot)
    const existing = this.store.listRuns(project.id).find(run => run.leaseOwner === BATCH_OWNER && run.inputs.some(item => item.name === 'request_id' && item.uri === snapshot.requestId))
    if (existing) {
      if (!existing.inputs.some(item => item.name === 'fingerprint' && item.uri === fingerprint)) throw new Error('IDEMPOTENCY_CONFLICT: this Flow batch requestId belongs to different inputs or parameters.')
      return this.batchStatus(project, existing.id)
    }
    const run = this.store.createRun({ projectId: project.id, name: 'Flow cytometry batch analysis', command: 'flow.batch.v1', workingDirectory: project.rootPath, status: 'submitted', progress: 0, leaseOwner: BATCH_OWNER, timeoutAt: new Date(Date.now() + 30 * 60_000).toISOString(), inputs: [{ name: 'request_id', uri: snapshot.requestId! }, { name: 'fingerprint', uri: fingerprint }] })
    let updated: RunRecord
    try {
      const root = await realpath(project.rootPath); const directory = await this.batchDirectory(root, run.id); const requestPath = join(directory, 'request.json'); const text = JSON.stringify(snapshot, null, 2) + '\n'; await writeFile(requestPath, text, { flag: 'wx' })
      updated = this.store.updateRun(run.id, { inputs: [...run.inputs, { name: 'batch_request', uri: pathToFileURL(requestPath).href, mediaType: 'application/json' }] })
    } catch (error) {
      this.store.updateRun(run.id, { status: 'failed', error: error instanceof Error ? error.message : String(error) })
      throw error
    }
    this.enqueue(project, updated, snapshot)
    return { run: updated }
  }
  private async batchStatus(project: ProjectRecord, id: string): Promise<FlowResponse> {
    let run = this.batchRun(project, id)
    if (run.status === 'submitted' && !this.owned.has(run.id)) {
      try { this.enqueue(project, run, await this.batchRequest(project, run)) } catch (error) { run = this.store.updateRun(run.id, { status: 'failed', error: error instanceof Error ? error.message : String(error) }) }
    } else if (run.status === 'running' && !this.owned.has(run.id)) run = this.store.updateRun(run.id, { status: 'failed', error: 'Host execution ownership was lost; partial files are retained and this batch was not resumed automatically.' })
    run = this.batchRun(project, id)
    const artifact = this.store.listArtifacts(project.id).find(item => item.runId === run.id && item.name === 'batch-result.json')
    if (!artifact || run.status !== 'succeeded') return { run }
    if (!artifact.uri.startsWith('file:')) throw new Error('Flow batch result artifact must remain a local active-project file.')
    const bytes = await readFile(await containedFile(project.rootPath, fileURLToPath(artifact.uri)))
    if (!artifact.checksum || createHash('sha256').update(bytes).digest('hex') !== artifact.checksum.toLowerCase()) throw new Error('Flow batch result artifact checksum does not match the registered Run output.')
    const parsed = JSON.parse(bytes.toString('utf8')) as { items: NonNullable<FlowResponse['batch']>['items']; parameters: { workspaceSha256?: string } }
    return { run, artifact, batch: { items: parsed.items, ...(parsed.parameters.workspaceSha256 ? { workspaceSha256: parsed.parameters.workspaceSha256 } : {}), notes: ['Each FCS source was opened, hashed, analyzed, and closed independently.', 'Per-sample failures are retained; unsupported FlowJo semantics were not approximated.'] } }
  }
  private async batchCancel(project: ProjectRecord, id: string): Promise<FlowResponse> {
    const run = this.batchRun(project, id); if (terminal.has(run.status)) return this.batchStatus(project, id)
    this.queued.delete(run.id)
    const cancelled = this.store.updateRun(run.id, { status: 'cancelled', error: 'Cancelled by user; partial files and request snapshot retained.' }); this.owned.get(run.id)?.controller.abort()
    return { run: cancelled }
  }
  private enqueue(project: ProjectRecord, run: RunRecord, request: FlowRequest): void {
    if (this.closed) throw new Error('Flow batch service is stopping; queued work was not resumed.')
    if (run.status !== 'submitted') return
    this.queued.set(run.id, { project, request })
    this.schedule()
  }
  private schedule(): void {
    if (this.closed || this.draining) return
    this.draining = this.drainQueue().catch(() => undefined).finally(() => { this.draining = undefined; if (!this.closed && this.owned.size === 0 && this.queued.size > 0) this.schedule() })
  }
  private async drainQueue(): Promise<void> {
    if (this.closed || this.owned.size > 0) return
    for (const [runId, entry] of this.queued) {
      this.queued.delete(runId)
      const run = this.batchRun(entry.project, runId)
      if (run.status !== 'submitted') continue
      await this.startBatch(entry.project, runId, entry.request)
      return
    }
  }
  private async startBatch(project: ProjectRecord, runId: string, request: FlowRequest): Promise<void> {
    if (this.closed || this.owned.has(runId)) return
    const current = this.batchRun(project, runId); if (current.status !== 'submitted') return
    if (current.timeoutAt && Date.parse(current.timeoutAt) <= Date.now()) { this.store.updateRun(runId, { status: 'timed_out', error: 'Flow batch exceeded its queue or execution time budget before it could start.' }); return }
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const task = (async () => {
      try {
        if (current.timeoutAt) timer = setTimeout(() => { if (this.closed) return; const run = this.store.getRun(runId); if (run && !terminal.has(run.status)) this.store.updateRun(runId, { status: 'timed_out', error: 'Flow batch exceeded its 30 minute execution time budget; partial files retained.' }); controller.abort() }, Math.max(0, Date.parse(current.timeoutAt) - Date.now()))
        await this.batch(project, current, request, controller.signal)
      } catch (error) {
        const run = this.batchRun(project, runId)
        if (!terminal.has(run.status)) this.store.updateRun(runId, { status: 'failed', error: this.closed ? 'Host stopped; owned Flow batch interrupted. Partial files retained; no automatic restart.' : error instanceof Error ? error.message : String(error) })
      } finally {
        if (timer) clearTimeout(timer)
        this.owned.delete(runId)
        this.schedule()
      }
    })()
    this.owned.set(runId, { controller, task })
    await task
  }
  private async batch(project: ProjectRecord, run: RunRecord, request: FlowRequest, signal: AbortSignal): Promise<void> {
    const root = await realpath(project.rootPath)
    const directory = await this.batchDirectory(root, run.id)
    const partialPath = join(directory, 'partial-result.json')
    this.store.updateRun(run.id, { status: 'running', progress: .01, logUri: pathToFileURL(partialPath).href })
    const ids = request.assetIds ?? []
    let workspace: { workspace: FlowJoWorkspace; sha256: string; assetId: string } | undefined
    if (request.importAssetId) { const asset = this.workspaceAsset(project.id, request.importAssetId); const loaded = await this.workspace(project, asset); workspace = { ...loaded, assetId: asset.id } }
    const scratchPath = join(root, '.zerowall', 'flow-tmp'); await mkdir(scratchPath, { recursive: true }); const scratch = await containedFile(root, scratchPath)
    const items: NonNullable<FlowResponse['batch']>['items'] = []
    for (const id of ids) {
      let asset: DataAssetRecord | undefined
      try {
        signal.throwIfAborted()
        asset = this.asset(project.id, id); const input = await this.read(project, asset)
        try {
          const sample = workspace ? this.workspaceSample(project, asset, workspace.workspace) : undefined
          if (sample) validateFlowJoSample(sample, input.dataset)
          const gates = sample?.gates ?? request.gates
          const analysis = await analyzeFlowStream(input, { transform: request.transform ?? 'none', cofactor: request.cofactor ?? 5, applyCompensation: request.applyCompensation ?? false, ...(gates ? { gates } : {}), ...(request.previewLimit === undefined ? {} : { previewLimit: request.previewLimit }) }, scratch); signal.throwIfAborted()
          items.push({ assetId: asset.id, sourceSha256: input.sha256, ...(sample ? { sampleId: sample.sampleId, groups: sample.groups } : {}), analysis })
        } finally { await input.close() }
      } catch (error) { if (signal.aborted) throw error; items.push({ assetId: id, error: error instanceof Error ? error.message : String(error) }) }
      await writeFile(partialPath, JSON.stringify({ format: 'zerowall-flow-batch-partial', version: 1, runner: RUNNER, runId: run.id, completed: items.length, total: ids.length, items }, null, 2) + '\n')
      this.store.updateRun(run.id, { progress: Math.min(.95, .05 + .9 * items.length / ids.length) })
    }
    const output = { format: 'zerowall-flow-batch-result', version: 1, runner: RUNNER, parameters: { transform: request.transform ?? 'none', cofactor: request.cofactor ?? 5, applyCompensation: request.applyCompensation ?? false, ...(workspace ? { workspaceAssetId: workspace.assetId, workspaceSha256: workspace.sha256 } : {}) }, items }
    const path = join(directory, 'batch-result.json'); const manifest = JSON.stringify(output, null, 2) + '\n'
    signal.throwIfAborted()
    await writeFile(path, manifest, { flag: 'wx' })
    signal.throwIfAborted()
    const artifact = this.store.createArtifact({ projectId: project.id, runId: run.id, name: 'batch-result.json', uri: pathToFileURL(path).href, mediaType: 'application/json', checksum: createHash('sha256').update(manifest).digest('hex'), metadata: { runner: RUNNER, itemCount: items.length, succeeded: items.filter(item => item.analysis).length, failed: items.filter(item => item.error).length, ...(workspace ? { workspaceAssetId: workspace.assetId, workspaceSha256: workspace.sha256 } : {}), needsReview: true } })
    this.store.updateRun(run.id, { status: 'succeeded', progress: 1, outputs: [{ name: artifact.name, uri: artifact.uri, mediaType: artifact.mediaType }] })
  }
  private async batchDirectory(root: string, runId: string): Promise<string> {
    const science = join(root, '.zerowall'); await mkdir(science, { recursive: true }); const containedScience = await containedFile(root, science)
    const batches = join(containedScience, 'flow-batches'); await mkdir(batches, { recursive: true }); const containedBatches = await containedFile(root, batches)
    const directory = join(containedBatches, runId); await mkdir(directory, { recursive: true }); return containedFile(root, directory)
  }
  private normalizedBatchRequest(value: unknown): FlowRequest {
    if (!value || typeof value !== 'object') throw new Error('Flow batch request snapshot is invalid.')
    const request = value as Partial<FlowRequest>; const ids = request.assetIds
    if (request.action !== 'batch_submit' || typeof request.sessionId !== 'string' || !request.sessionId || !request.requestId || !/^[A-Za-z0-9_.:-]{1,128}$/u.test(request.requestId) || !Array.isArray(ids) || ids.length < 1 || ids.length > 64 || new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string' || !id)) throw new Error('Flow batch requires a stable requestId and 1–64 distinct FCS asset IDs.')
    if (request.transform !== undefined && request.transform !== 'none' && request.transform !== 'arcsinh') throw new Error('Flow batch transform is invalid.')
    if (request.cofactor !== undefined && (!Number.isFinite(request.cofactor) || request.cofactor <= 0 || request.cofactor > 10_000)) throw new Error('Flow batch cofactor is invalid.')
    if (request.applyCompensation !== undefined && typeof request.applyCompensation !== 'boolean') throw new Error('Flow batch compensation setting is invalid.')
    if (request.previewLimit !== undefined && (!Number.isInteger(request.previewLimit) || request.previewLimit < 0 || request.previewLimit > 10_000)) throw new Error('Flow batch preview limit is invalid.')
    if (request.importAssetId !== undefined && (typeof request.importAssetId !== 'string' || !request.importAssetId)) throw new Error('Flow batch workspace asset is invalid.')
    if (request.gates !== undefined && !Array.isArray(request.gates)) throw new Error('Flow batch gates are invalid.')
    return { sessionId: request.sessionId, action: 'batch_submit', requestId: request.requestId, assetIds: [...ids], ...(request.importAssetId === undefined ? {} : { importAssetId: request.importAssetId }), ...(request.transform === undefined ? {} : { transform: request.transform }), ...(request.cofactor === undefined ? {} : { cofactor: request.cofactor }), ...(request.applyCompensation === undefined ? {} : { applyCompensation: request.applyCompensation }), ...(request.gates === undefined ? {} : { gates: structuredClone(request.gates) }), ...(request.previewLimit === undefined ? {} : { previewLimit: request.previewLimit }) }
  }
  private batchFingerprint(request: FlowRequest): string { return createHash('sha256').update(this.canonicalJson(request)).digest('hex') }
  private canonicalJson(value: unknown): string {
    if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
    if (typeof value === 'number') { if (!Number.isFinite(value)) throw new Error('Flow batch snapshot contains a non-finite number.'); return JSON.stringify(value) }
    if (Array.isArray(value)) return `[${value.map(item => this.canonicalJson(item)).join(',')}]`
    if (typeof value === 'object') { const object = value as Record<string, unknown>; return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${this.canonicalJson(object[key])}`).join(',')}}` }
    throw new Error('Flow batch snapshot contains an unsupported value.')
  }
}
