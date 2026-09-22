import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { CreateArtifactInput, JsonObject, ProjectRecord, ResearchStore, RunRecord } from '@zerowallscience/research-store'
import { analyzeFijiExperiment, scratchWoundMeasurement, type FijiExperimentId, type FijiExperimentResult } from '../shared/fiji-experiments.js'
import type { FijiExperimentRequest, FijiExperimentResponse } from '../shared/types.js'
import { containedFile } from './science-viewer.js'
import { readProjectAsset } from './image-viewer.js'
import { acceptedFijiReview, validateScratchTimeline, matchScratchBaseline } from './fiji-review.js'
import { fijiImageRunner, runImageJExperiment } from './fiji-image-runner.js'

const experiments: FijiExperimentId[] = ['scratch-wound', 'colony-formation', 'bacterial-cfu', 'tube-formation']
const sha256 = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex')
const inside = (root: string, candidate: string): string => { const base = resolve(root); const target = resolve(candidate); const rel = relative(base, target); if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error('Fiji experiment path escaped the project.'); return target }

export class FijiExperimentService {
  private readonly owned = new Map<string, AbortController>()
  private disposed = false
  constructor(private readonly store: ResearchStore) {}
  dispose(): void {
    this.disposed = true
    for (const [runId, controller] of this.owned) {
      this.store.updateRun(runId, { status: 'failed', error: 'Host stopped; owned computation interrupted. Partial files retained; no automatic restart.' })
      controller.abort()
    }
  }
  async status(project: ProjectRecord, runId: string): Promise<FijiExperimentResponse> {
    let run = this.store.getRun(runId)
    if (!run || run.projectId !== project.id || run.leaseOwner !== 'fiji-experiment') throw new Error('Fiji experiment run does not belong to this project.')
    if (['submitted', 'running'].includes(run.status) && !this.owned.has(runId) && (run.timeoutAt ? Date.parse(run.timeoutAt) : Date.parse(run.createdAt) + 180000) < Date.now()) {
      run = this.store.updateRun(runId, { status: 'failed', error: 'Expired after Host interruption or lost execution ownership; partial files retained. Inspect artifacts before a new request. No automatic rerun.' })
    }
    return this.readExisting(project, run)
  }
  async cancel(project: ProjectRecord, runId: string): Promise<FijiExperimentResponse> {
    const state = await this.status(project, runId); const run = state.run!
    if (!['submitted', 'running'].includes(run.status)) return state
    const controller = this.owned.get(runId)
    if (!controller) throw new Error('This Host does not own the running process; a historical PID cannot be cancelled. Inspect status after its timeout.')
    const cancelled = this.store.updateRun(runId, { status: 'cancelled', error: 'Cancelled by user; partial files and logs retained.' }); controller.abort()
    return { run: cancelled }
  }
  async execute(project: ProjectRecord, input: FijiExperimentRequest): Promise<FijiExperimentResponse> {
    if (this.disposed) throw new Error('Fiji experiment service stopped.')
    if (input.action === 'list') return { experiments, runs: this.store.listRuns(project.id).filter(run => run.leaseOwner === 'fiji-experiment'), ...(input.sourceAssetId ? { annotations: this.store.listAnnotationRevisions(project.id, input.sourceAssetId) } : {}) }
    if (input.action === 'status' || input.action === 'cancel') { if (!input.runId) throw new Error('runId is required.'); return input.action === 'status' ? this.status(project, input.runId) : this.cancel(project, input.runId) }
    if (!input.experiment || !experiments.includes(input.experiment)) throw new Error('A supported Fiji experiment is required.')
    if (!input.requestId || !/^[A-Za-z0-9_.:-]{1,128}$/u.test(input.requestId)) throw new Error('A stable requestId is required for Fiji experiment retries.')
    let image = input.image ? structuredClone(input.image) : undefined
    if (image && (image.kind ?? 'bacterial-cfu') !== input.experiment) throw new Error('Fiji image config kind must match the selected experiment.')
    if (input.image && !input.sourceAssetId) throw new Error('sourceAssetId is required for image-backed Fiji segmentation.')
    const asset = input.image ? this.store.listDataAssets(project.id).find(item => item.id === input.sourceAssetId) : undefined
    if (input.image && (!asset || asset.location !== 'local' || !asset.uri.startsWith('file:'))) throw new Error('Image must be a local project asset.')
    const source = asset ? await readProjectAsset(project, asset, 128 * 1024 * 1024) : undefined
    const sourceSha256 = source ? sha256(source) : null
    const review = image && asset && sourceSha256 ? acceptedFijiReview(this.store, project, asset.id, sourceSha256, image) : undefined
    let baselineResultSha256: string | undefined
    if (image?.kind === 'scratch-wound' && image.timeline) {
      validateScratchTimeline(image)
      if (image.timeline.baselineRunId) {
        const baseline = await this.status(project, image.timeline.baselineRunId)
        if (baseline.run?.status !== 'succeeded' || !baseline.result) throw new Error('Scratch baseline must be a successful persisted run.')
        image.initialArea = matchScratchBaseline(image, baseline.result)
        baselineResultSha256 = baseline.artifacts?.find(item => item.name === 'result.json')?.checksum
        if (!baselineResultSha256) throw new Error('Scratch baseline result requires a registered checksum.')
      } else image.initialArea = 1 // Valid placeholder; the actual baseline area replaces it after native execution.
      image.time = `${image.timeline.timeHours}h`
    }
    const payload = JSON.stringify({ sourceSha256, runnerSha256: sha256(fijiImageRunner), experiment: input.experiment, measurements: input.measurements ?? [], sourceAssetId: input.sourceAssetId ?? null, image: image ?? null, review: review ?? null, baselineResultSha256: baselineResultSha256 ?? null })
    const fingerprint = sha256(payload)
    const reservationId = image?.kind === 'scratch-wound' && image.timeline?.baselineRunId ? 'scratch-time:' + sha256(JSON.stringify([image.timeline.baselineRunId, image.timeline.timeHours])) : input.requestId
    const reserved = this.store.reserveScientificRun({ projectId: project.id, name: `Fiji ${input.experiment}`, command: `fiji.${input.experiment}.v3`, workingDirectory: project.rootPath, status: 'running', leaseOwner: 'fiji-experiment', timeoutAt: new Date(Date.now() + 180000).toISOString() }, reservationId, fingerprint)
    if (!reserved.created) return this.status(project, reserved.run.id)
    const run = reserved.run; const controller = new AbortController(); this.owned.set(run.id, controller)
    try {
      let directory = project.rootPath
      for (const segment of ['.zerowall', 'fiji-experiments', run.id]) {
        directory = inside(project.rootPath, join(directory, segment))
        await mkdir(directory, { recursive: true })
        directory = await containedFile(project.rootPath, directory)
      }
      const nativeArtifacts: CreateArtifactInput[] = []
      const fallbackMeasurement = image?.kind === 'bacterial-cfu' || (image && image.kind === undefined)
        ? { plateId: image.plateId, colonyCount: 0, dilutionFactor: image.dilutionFactor, platedVolumeMl: image.platedVolumeMl }
        : image?.kind === 'scratch-wound'
          ? { sampleId: image.sampleId, time: image.time, initialArea: image.initialArea, remainingArea: image.initialArea }
          : image?.kind === 'colony-formation'
            ? { wellId: image.wellId, independentCount: 0, ...(image.seededCells===undefined?{}:{seededCells:image.seededCells}) }
            : image?.kind === 'tube-formation'
              ? { sampleId: image.sampleId, unit: image.unit, unitScale: image.unitScale, length: 0, endpoints: 0, junctions: 0, segments: 0, meshes: 0 }
              : undefined
      let result = analyzeFijiExperiment(input.experiment, input.measurements ?? (fallbackMeasurement ? [fallbackMeasurement] : undefined))
      let provenance: JsonObject = {}
      if (input.image && image && asset && source && sourceSha256) {
        {
          const native = await runImageJExperiment(directory, source, image, controller.signal, review)
          if (image.kind === 'scratch-wound' && image.timeline?.timeHours === 0) {
            const area = native.analysis.foregroundPixels
            native.analysis.measurement = scratchWoundMeasurement({ sampleId: image.sampleId, time: '0h', initialArea: area, remainingArea: area })
            image.initialArea = area
          }
          result = { ...result, context: { sourceAssetId: asset.id, sourceSha256, image, width: native.analysis.width, height: native.analysis.height, annotationRevisionId: review?.annotationRevisionId ?? null, ...(baselineResultSha256 ? { baselineResultSha256 } : {}) }, measurements: [native.analysis.measurement], imageAnalysis: native.analysis, notes: ['Actual local ImageJ execution; review masks and overlays before interpreting results.'] }
          provenance = { sourceAssetId: asset.id, sourceSha256, annotationRevisionId: review?.annotationRevisionId ?? null, engine: 'imagej', runnerSha256: native.runnerSha256 }
          for (const file of native.files) {
            const mediaType = file.name.endsWith('.png') ? 'image/png' : file.name.endsWith('.json') ? 'application/json' : file.name.endsWith('.csv') ? 'text/csv' : 'application/octet-stream'
            nativeArtifacts.push({ projectId: project.id, runId: run.id, name: file.name, uri: pathToFileURL(join(directory, file.name)).href, mediaType, checksum: file.checksum, metadata: provenance })
          }
        }
      }
      const text = `${JSON.stringify({ runId: run.id, requestId: input.requestId, requestSha256: fingerprint, ...result }, null, 2)}\n`
      const uri = pathToFileURL(join(directory, 'result.json')).href
      await writeFile(join(directory, 'result.json'), text, { flag: 'wx' })
      controller.signal.throwIfAborted()
      const artifact: CreateArtifactInput = { projectId: project.id, runId: run.id, name: 'result.json', uri, mediaType: 'application/json', checksum: sha256(text), metadata: { experiment: input.experiment, scientificReview: 'pending', ...provenance } as JsonObject }
      const completed = this.store.finishScientificRun(project.id, run.id, [artifact, ...nativeArtifacts])
      return this.readExisting(project, completed)
    } catch (error) {
      if (this.disposed) return { run: { ...run, status: 'failed', error: 'Host stopped; partial files retained.' } }
      const current = this.store.getRun(run.id)!
      if (current.status === 'cancelled') return { run: current }
      const failed = this.store.updateRun(run.id, { status: 'failed', error: error instanceof Error ? error.message : String(error) })
      return { run: failed }
    } finally { this.owned.delete(run.id) }
  }
  private async readExisting(project: ProjectRecord, run: RunRecord): Promise<FijiExperimentResponse> {
    const artifact = this.store.listArtifacts(project.id).find(item => item.runId === run.id && item.name === 'result.json')
    if (!artifact || run.status !== 'succeeded') return { run }
    const text = (await readProjectAsset(project, { uri: artifact.uri, ...(artifact.checksum ? { checksum: artifact.checksum, checksumAlgorithm: 'sha256' as const } : {}) }, 8 * 1024 * 1024)).toString('utf8')
    const parsed = JSON.parse(text) as FijiExperimentResult
    const reasons: string[] = []
    const context = parsed.context
    if (context) {
      const asset = this.store.listDataAssets(project.id).find(item => item.id === context.sourceAssetId)
      try { if (!asset || sha256(await readProjectAsset(project, asset, 128 * 1024 * 1024)) !== context.sourceSha256) reasons.push('source_changed') } catch { reasons.push('source_unavailable') }
      if (context.annotationRevisionId && this.store.listAnnotationRevisions(project.id, context.sourceAssetId).filter(item => item.status === 'accepted' && item.sourceSha256 === context.sourceSha256).at(-1)?.id !== context.annotationRevisionId) reasons.push('annotation_revision_changed')
      const image = context.image
      if (image.kind === 'scratch-wound' && image.timeline) {
        const t = image.timeline
        if (t.baselineRunId) {
          const base = await this.status(project, t.baselineRunId)
          if (base.result?.reviewState === 'needs_recheck' || base.run?.status !== 'succeeded' || base.artifacts?.find(item => item.name === 'result.json')?.checksum !== context.baselineResultSha256) reasons.push('baseline_changed_or_stale')
        }
        const observed: number[] = []
        for (const a of this.store.listArtifacts(project.id).filter(item => item.name === 'result.json' && item.metadata?.experiment === 'scratch-wound')) {
          try { const other = JSON.parse((await readProjectAsset(project, { uri: a.uri, ...(a.checksum ? { checksum: a.checksum, checksumAlgorithm: 'sha256' as const } : {}) }, 8 * 1024 * 1024)).toString('utf8')) as FijiExperimentResult; const previous = other.context?.image
            if (previous?.kind === 'scratch-wound' && previous.timeline && previous.sampleId === image.sampleId && previous.timeline.fieldId === t.fieldId && (previous.timeline.baselineRunId ?? (other as FijiExperimentResult & {runId?: string}).runId) === (t.baselineRunId ?? run.id)) observed.push(previous.timeline.timeHours)
          } catch { /* Unreadable results do not become observations. */ }
        }
        parsed.timeline = { observedHours: [...new Set(observed)].sort((a,b)=>a-b), missingHours: t.expectedHours.filter(value => !observed.includes(value)), duplicateHours: [...new Set(observed.filter((value,index) => observed.indexOf(value) !== index))] }
      }
    }
    parsed.reviewState = reasons.length ? 'needs_recheck' : 'current'; parsed.reviewReasons = reasons
    return { run, artifacts: this.store.listArtifacts(project.id).filter(item => item.runId === run.id).sort((a, b) => a.name === 'result.json' ? -1 : b.name === 'result.json' ? 1 : a.name.localeCompare(b.name)), result: parsed }
  }
}
