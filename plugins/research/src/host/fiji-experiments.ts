import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { ArtifactRecord, JsonObject, ProjectRecord, ResearchStore, RunRecord } from '@zerowallscience/research-store'
import { analyzeCfuMask, analyzeColonyMask, analyzeScratchMask, analyzeTubeMask, analyzeFijiExperiment, type FijiExperimentId, type FijiExperimentResult, type CfuImageConfig, type ColonyImageConfig, type ScratchImageConfig, type TubeImageConfig } from '../shared/fiji-experiments.js'
import type { FijiExperimentRequest, FijiExperimentResponse } from '../shared/types.js'
import sharp from 'sharp'
import { containedFile } from './science-viewer.js'

const experiments: FijiExperimentId[] = ['scratch-wound', 'colony-formation', 'bacterial-cfu', 'tube-formation']
const sha256 = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex')
const inside = (root: string, candidate: string): string => { const base = resolve(root); const target = resolve(candidate); const rel = relative(base, target); if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error('Fiji experiment path escaped the project.'); return target }

export class FijiExperimentService {
  constructor(private readonly store: ResearchStore) {}
  async execute(project: ProjectRecord, input: FijiExperimentRequest): Promise<FijiExperimentResponse> {
    if (input.action === 'list') return { experiments }
    if (!input.experiment || !experiments.includes(input.experiment)) throw new Error('A supported Fiji experiment is required.')
    if (!input.requestId || !/^[A-Za-z0-9_.:-]{1,128}$/u.test(input.requestId)) throw new Error('A stable requestId is required for Fiji experiment retries.')
    const image = input.image as any
    if (image && (image.kind ?? 'bacterial-cfu') !== input.experiment) throw new Error('Fiji image config kind must match the selected experiment.')
    if (input.image && !input.sourceAssetId) throw new Error('sourceAssetId is required for image-backed Fiji segmentation.')
    const payload = JSON.stringify({ experiment: input.experiment, measurements: input.measurements ?? [], sourceAssetId: input.sourceAssetId ?? null, image: input.image ?? null })
    const fingerprint = sha256(payload)
    const existing = this.store.listRuns(project.id).find(run => run.leaseOwner === 'fiji-experiment' && run.inputs.some(item => item.name === 'request_id' && item.uri === input.requestId))
    if (existing) {
      if (existing.inputs.find(item => item.name === 'fingerprint')?.uri !== fingerprint) throw new Error('IDEMPOTENCY_CONFLICT: requestId was already used for different Fiji measurements.')
      return this.readExisting(project, existing)
    }
    const run = this.store.createRun({ projectId: project.id, name: `Fiji ${input.experiment}`, command: `fiji.${input.experiment}.v1`, workingDirectory: project.rootPath, status: 'running', leaseOwner: 'fiji-experiment', inputs: [{ name: 'request_id', uri: input.requestId }, { name: 'fingerprint', uri: fingerprint }] })
    try {
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
      if (input.image) {
        const asset = this.store.listDataAssets(project.id).find(item => item.id === input.sourceAssetId)
        if (!asset || asset.location !== 'local' || !asset.uri.startsWith('file:')) throw new Error('CFU image asset must be a local project asset.')
        const path = await containedFile(project.rootPath, fileURLToPath(asset.uri))
        const source = await readFile(path); const sourceSha256 = sha256(source)
        const decoded = await sharp(source, { limitInputPixels: 25_000_000 }).greyscale().raw().toBuffer({ resolveWithObject: true })
        const imageAnalysis = (image.kind === 'bacterial-cfu' || image.kind === undefined)
          ? analyzeCfuMask({ data: decoded.data, width: decoded.info.width, height: decoded.info.height, config: image as CfuImageConfig })
          : image.kind === 'scratch-wound'
            ? analyzeScratchMask({ data: decoded.data, width: decoded.info.width, height: decoded.info.height, config: image as ScratchImageConfig })
            : image.kind === 'colony-formation'
              ? analyzeColonyMask({ data: decoded.data, width: decoded.info.width, height: decoded.info.height, config: image as ColonyImageConfig })
              : analyzeTubeMask({ data: decoded.data, width: decoded.info.width, height: decoded.info.height, config: image as TubeImageConfig })
        provenance = { sourceAssetId: asset.id, sourceSha256 }
        result = { ...result, measurements: [imageAnalysis.measurement], imageAnalysis: { ...imageAnalysis, notes: [...imageAnalysis.notes, `sourceAssetId=${asset.id}`, `sourceSha256=${sourceSha256}`] } } as FijiExperimentResult
      }
      const directory = inside(project.rootPath, join(project.rootPath, '.zerowall', 'fiji-experiments', run.id))
      await mkdir(directory, { recursive: true })
      const text = `${JSON.stringify({ runId: run.id, requestId: input.requestId, requestSha256: fingerprint, ...result }, null, 2)}\n`
      const uri = pathToFileURL(join(directory, 'result.json')).href
      await writeFile(join(directory, 'result.json'), text, { flag: 'wx' })
      const artifact = this.store.createArtifact({ projectId: project.id, runId: run.id, name: 'result.json', uri, mediaType: 'application/json', checksum: sha256(text), metadata: { experiment: input.experiment, scientificReview: 'pending', ...provenance } as JsonObject })
      const completed = this.store.updateRun(run.id, { status: 'succeeded', progress: 1, outputs: [{ name: artifact.name, uri: artifact.uri, mediaType: artifact.mediaType }] })
      return { run: completed, artifacts: [artifact], result }
    } catch (error) {
      const failed = this.store.updateRun(run.id, { status: 'failed', error: error instanceof Error ? error.message : String(error) })
      return { run: failed }
    }
  }
  private async readExisting(project: ProjectRecord, run: RunRecord): Promise<FijiExperimentResponse> {
    const artifact = this.store.listArtifacts(project.id).find(item => item.runId === run.id && item.name === 'result.json')
    if (!artifact || run.status !== 'succeeded') return { run }
    const text = await readFile(new URL(artifact.uri), 'utf8')
    const parsed = JSON.parse(text) as FijiExperimentResult
    return { run, artifacts: [artifact], result: parsed }
  }
}
