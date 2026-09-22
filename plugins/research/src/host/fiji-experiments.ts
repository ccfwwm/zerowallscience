import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { CreateArtifactInput, JsonObject, ProjectRecord, ResearchStore, RunRecord } from '@zerowallscience/research-store'
import { analyzeFijiExperiment, type FijiExperimentId, type FijiExperimentResult } from '../shared/fiji-experiments.js'
import type { FijiExperimentRequest, FijiExperimentResponse } from '../shared/types.js'
import { containedFile } from './science-viewer.js'
import { readProjectAsset } from './image-viewer.js'
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
    if (input.action === 'list') return { experiments }
    if (!input.experiment || !experiments.includes(input.experiment)) throw new Error('A supported Fiji experiment is required.')
    if (!input.requestId || !/^[A-Za-z0-9_.:-]{1,128}$/u.test(input.requestId)) throw new Error('A stable requestId is required for Fiji experiment retries.')
    const image = input.image
    if (image && (image.kind ?? 'bacterial-cfu') !== input.experiment) throw new Error('Fiji image config kind must match the selected experiment.')
    if (input.image && !input.sourceAssetId) throw new Error('sourceAssetId is required for image-backed Fiji segmentation.')
    const asset = input.image ? this.store.listDataAssets(project.id).find(item => item.id === input.sourceAssetId) : undefined
    if (input.image && (!asset || asset.location !== 'local' || !asset.uri.startsWith('file:'))) throw new Error('Image must be a local project asset.')
    const source = asset ? await readProjectAsset(project, asset, 128 * 1024 * 1024) : undefined
    const sourceSha256 = source ? sha256(source) : null
    const payload = JSON.stringify({ sourceSha256, runnerSha256: sha256(fijiImageRunner), experiment: input.experiment, measurements: input.measurements ?? [], sourceAssetId: input.sourceAssetId ?? null, image: input.image ?? null })
    const fingerprint = sha256(payload)
    const reserved = this.store.reserveScientificRun({ projectId: project.id, name: `Fiji ${input.experiment}`, command: `fiji.${input.experiment}.v2`, workingDirectory: project.rootPath, status: 'running', leaseOwner: 'fiji-experiment', timeoutAt: new Date(Date.now() + 180000).toISOString() }, input.requestId, fingerprint)
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
            ? { wellId: image.wellId, independentCount: 0 }
            : image?.kind === 'tube-formation'
              ? { sampleId: image.sampleId, unit: image.unit, unitScale: image.unitScale, length: 0, endpoints: 0, junctions: 0, segments: 0, meshes: 0 }
              : undefined
      let result = analyzeFijiExperiment(input.experiment, input.measurements ?? (fallbackMeasurement ? [fallbackMeasurement] : undefined))
      let provenance: JsonObject = {}
      if (input.image && image && asset && source && sourceSha256) {
        {
          const native = await runImageJExperiment(directory, source, input.image, controller.signal)
          result = { ...result, measurements: [native.analysis.measurement], imageAnalysis: native.analysis, notes: ['Actual local ImageJ execution; review masks and overlays before interpreting results.'] }
          provenance = { sourceAssetId: asset.id, sourceSha256, engine: 'imagej', runnerSha256: native.runnerSha256 }
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
      return { run: completed, artifacts: this.store.listArtifacts(project.id).filter(item => item.runId === run.id).sort((a, b) => a.name === 'result.json' ? -1 : b.name === 'result.json' ? 1 : a.name.localeCompare(b.name)), result }
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
    return { run, artifacts: this.store.listArtifacts(project.id).filter(item => item.runId === run.id).sort((a, b) => a.name === 'result.json' ? -1 : b.name === 'result.json' ? 1 : a.name.localeCompare(b.name)), result: parsed }
  }
}
