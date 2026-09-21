import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readdir, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import type { ResearchStore } from '@zerowallscience/research-store'
import type { DataAssetRecord, JsonObject, ProjectRecord, ViewerSessionRecord } from '@zerowallscience/research-store/types'
import type { BrainAtlasRequest, BrainAtlasResponse, BrainAtlasSummary, BrainCellAnalysis, BrainRegionResult, BrainSlice } from '../shared/types.js'
import { containedFile } from './science-viewer.js'
import { BRAIN_GLOBE_RUNNER } from './brainglobe-runner.js'

const RUNNER = 'zerowall-brainglobe/7.0.0-1'
const ATLAS = 'allen_mouse_25um'

export function validateBrainregOutputs(names: string[]): { valid: boolean; missing: string[] } {
  const lower = new Set(names.map(name => name.toLowerCase()))
  const missing: string[] = []
  if (!lower.has('brainreg.json')) missing.push('brainreg.json')
  if (!lower.has('registered_atlas.tiff') && !lower.has('registered_atlas.nii')) missing.push('registered_atlas.tiff|registered_atlas.nii')
  return { valid: missing.length === 0, missing }
}

export function parseBrainregMetadata(text: string): { valid: boolean; metadata?: JsonObject; error?: string } {
  try {
    const value = JSON.parse(text) as unknown
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return { valid: false, error: 'brainreg.json must contain a JSON object.' }
    return { valid: true, metadata: value as JsonObject }
  } catch (error) {
    return { valid: false, error: `brainreg.json is not valid JSON: ${String(error)}` }
  }
}

export interface BrainregOutputAudit {
  valid: boolean
  missing: string[]
  empty: string[]
  files: Array<{ name: string; bytes: number; sha256: string }>
  metadata?: JsonObject
  metadataError?: string
}

/**
 * Audit a completed brainreg directory before it is registered as a scientific
 * artifact.  A successful process exit alone is insufficient: required files
 * must be present, non-empty and the metadata must be parseable.  Hashes are
 * recorded so a later reviewer can prove which registration output was used.
 */
export async function auditBrainregOutputDirectory(directory: string): Promise<BrainregOutputAudit> {
  const entries = (await readdir(directory, { withFileTypes: true })).filter(entry => entry.isFile()).map(entry => entry.name).sort()
  const required = validateBrainregOutputs(entries)
  const files: BrainregOutputAudit['files'] = []
  const empty: string[] = []
  for (const name of entries) {
    const path = join(directory, name)
    const info = await stat(path)
    if (info.size === 0) empty.push(name)
    const hash = createHash('sha256')
    await new Promise<void>((resolve, reject) => {
      const stream = createReadStream(path)
      stream.on('data', chunk => hash.update(chunk))
      stream.on('error', reject)
      stream.on('end', () => resolve())
    })
    files.push({ name, bytes: info.size, sha256: hash.digest('hex') })
  }
  let metadata: JsonObject | undefined
  let metadataError: string | undefined
  const metadataPath = join(directory, 'brainreg.json')
  if (entries.some(name => name.toLowerCase() === 'brainreg.json')) {
    const parsed = parseBrainregMetadata(await readFile(metadataPath, 'utf8'))
    if (parsed.valid) metadata = parsed.metadata
    else metadataError = parsed.error ?? 'brainreg.json could not be parsed.'
  }
  return {
    valid: required.valid && empty.length === 0 && metadataError === undefined,
    missing: required.missing,
    empty,
    files,
    ...(metadata === undefined ? {} : { metadata }),
    ...(metadataError === undefined ? {} : { metadataError }),
  }
}

export class BrainAtlasService {
  private busy = false
  constructor(private readonly store: ResearchStore) {}

  async execute(project: ProjectRecord, request: BrainAtlasRequest): Promise<BrainAtlasResponse> {
    if (this.busy) throw new Error('BrainGlobe runner is busy; retry after the current operation finishes.')
    this.busy = true
    try { return await this.executeOne(project, request) } finally { this.busy = false }
  }

  private async executeOne(project: ProjectRecord, request: BrainAtlasRequest): Promise<BrainAtlasResponse> {
    if (!['open', 'read', 'analyze', 'export', 'cells', 'trajectory', 'register'].includes(request.action)) throw new Error('Unsupported BrainGlobe action.')
    if (request.atlas !== undefined && request.atlas !== ATLAS) throw new Error('Only allen_mouse_25um is enabled in the first BrainGlobe runner.')
    if (request.action === 'register') return await this.register(project, request)
    const asset = this.atlasAsset(project)
    if (request.action === 'open') {
      const result = await this.run({ operation: 'summary', maxRegions: 256 })
      const summary = this.expectSummary(result.summary)
      const viewer = this.store.createViewerSession({ projectId: project.id, assetId: asset.id, tool: 'brain', state: { atlas: ATLAS, atlasVersion: summary.version, axis: 0, index: 0, downsample: 8, runner: RUNNER } })
      return { summary, viewer }
    }
    const viewer = this.viewer(project, request.viewerId)
    if (request.expectedVersion !== viewer.version) throw new Error(`Brain viewer revision conflict: current ${viewer.version}.`)
    const state = viewer.state
    if (request.action === 'read') {
      const result = await this.run({ operation: 'summary', maxRegions: 256 })
      return { summary: this.expectSummary(result.summary), viewer }
    }
    const params = { atlas: ATLAS, ...this.persistedParams(state, request) }
    const operation = request.action === 'cells' ? 'coordinates' : request.action === 'trajectory' ? 'trajectory' : request.region ? 'region' : request.coordinates ? 'coordinates' : 'slice'
    const result = await this.run({ ...params, operation, ...(request.action === 'analyze' && request.region ? { includeVoxelCount: true } : {}) })
    const updatedState: JsonObject = { ...state, ...(operation === 'slice' ? { axis: params.axis, index: params.index, downsample: params.downsample } : {}), ...(request.region ? { region: request.region } : {}) }
    const updated = this.store.updateViewerSession(project.id, viewer.id, { expectedVersion: viewer.version, state: updatedState })
    const response: BrainAtlasResponse = { viewer: updated, ...(result.slice ? { slice: result.slice as unknown as BrainSlice } : {}), ...(result.region ? { region: result.region as unknown as BrainRegionResult } : {}), ...(result.analysis ? { analysis: result.analysis as unknown as BrainCellAnalysis } : {}) }
    if (request.action !== 'export') return response
    const directory = await this.exportDirectory(project); const manifest = JSON.stringify({ format: 'zerowall-brain-analysis', version: 1, runner: RUNNER, atlas: ATLAS, atlasVersion: state.atlasVersion ?? null, sourceAssetId: asset.id, viewerId: updated.id, viewerVersion: updated.version, parameters: { operation, ...params }, result: { ...(result.slice ? { slice: result.slice } : {}), ...(result.region ? { region: result.region } : {}), ...(result.analysis ? { analysis: result.analysis } : {}) }, scientificReview: 'pending' }, null, 2) + '\n'; const path = join(directory, 'result.json'); await writeFile(path, manifest, { flag: 'wx' }); const artifact = this.store.createArtifact({ projectId: project.id, name: 'BrainGlobe atlas analysis', uri: pathToFileURL(path).href, mediaType: 'application/json', checksum: createHash('sha256').update(manifest).digest('hex'), metadata: { runner: RUNNER, atlas: ATLAS, atlasVersion: state.atlasVersion ?? null, viewerId: updated.id, viewerVersion: updated.version, scientificReview: 'pending' } })
    return { ...response, artifact }
  }

  private atlasAsset(project: ProjectRecord): DataAssetRecord {
    const existing = this.store.listDataAssets(project.id).find(item => item.uri === `brainatlas://${ATLAS}`)
    if (existing) return existing
    return this.store.createDataAsset({ projectId: project.id, name: 'Allen mouse CCF 25 um atlas', uri: `brainatlas://${ATLAS}`, location: 'web', mediaType: 'application/x-brainglobe-atlas', provenance: { atlas: ATLAS, runner: RUNNER, source: 'BrainGlobe atlasapi' } })
  }

  private viewer(project: ProjectRecord, id?: string): ViewerSessionRecord {
    const viewer = this.store.listViewerSessions(project.id).find(item => item.id === id && item.tool === 'brain')
    if (!viewer) throw new Error('BrainGlobe viewer is not in the active project.')
    return viewer
  }

  private persistedParams(state: JsonObject, request: BrainAtlasRequest): { axis: 0 | 1 | 2; index: number; downsample: number; region?: string; coordinates?: Array<[number, number, number]>; coordinateUnits?: 'voxel' | 'micron'; maxCells?: number } {
    const axis = request.axis ?? (Number.isInteger(state.axis) ? Number(state.axis) : 0); if (![0, 1, 2].includes(axis)) throw new Error('Brain atlas axis must be 0, 1 or 2.')
    const index = request.index ?? (Number.isInteger(state.index) ? Number(state.index) : 0); if (!Number.isSafeInteger(index) || index < 0) throw new Error('Brain atlas slice index must be a non-negative integer.')
    const downsample = request.downsample ?? (Number.isInteger(state.downsample) ? Number(state.downsample) : 8); if (!Number.isSafeInteger(downsample) || downsample < 1 || downsample > 64) throw new Error('Brain atlas downsample must be between 1 and 64.')
    const coordinates = request.coordinates
    if (coordinates !== undefined && coordinates.length > (request.maxCells ?? 100000)) throw new Error('Brain coordinate count exceeds maxCells.')
    return { axis: axis as 0 | 1 | 2, index, downsample, ...(request.region === undefined ? {} : { region: request.region }), ...(coordinates === undefined ? {} : { coordinates }), ...(request.coordinateUnits === undefined ? {} : { coordinateUnits: request.coordinateUnits }), ...(request.maxCells === undefined ? {} : { maxCells: request.maxCells }) }
  }

  private expectSummary(value: unknown): BrainAtlasSummary { if (!value || typeof value !== 'object' || !Array.isArray((value as BrainAtlasSummary).regions)) throw new Error('BrainGlobe runner returned an invalid atlas summary.'); return value as BrainAtlasSummary }

  private async exportDirectory(project: ProjectRecord): Promise<string> { const root = await realpath(project.rootPath); const raw = join(root, '.zerowall', 'science-exports', randomUUID()); await mkdir(raw, { recursive: true }); return containedFile(root, raw) }

  private async run(request: JsonObject): Promise<JsonObject> {
    const python = process.env.ZEROWALL_BRAINGLOBE_PYTHON?.trim() || process.env.ZEROWALL_PYTHON?.trim() || 'python'
    const atlasDir = process.env.ZEROWALL_BRAINGLOBE_DIR?.trim(); if (!atlasDir) throw new Error('ZEROWALL_BRAINGLOBE_DIR is required for BrainGlobe analysis; install the managed atlas first.')
    return await new Promise((resolve, reject) => {
      const child = spawn(python, ['-E', '-P', '-c', BRAIN_GLOBE_RUNNER], { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, OMP_NUM_THREADS: '1', OPENBLAS_NUM_THREADS: '1', MKL_NUM_THREADS: '1' } })
      const chunks: Buffer[] = []; let stderr = ''; let size = 0; let failure: Error | undefined
      const timer = setTimeout(() => { failure = new Error('BrainGlobe runner exceeded the 180-second limit.'); child.kill() }, 180000)
      child.stdout.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 64 * 1024 * 1024) { failure = new Error('BrainGlobe output exceeds 64 MiB.'); child.kill() } else chunks.push(chunk) })
      child.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-8000) })
      child.on('error', error => { clearTimeout(timer); reject(error) })
      child.on('close', code => { clearTimeout(timer); const output = Buffer.concat(chunks).toString('utf8'); if (failure) reject(failure); else if (code !== 0) reject(new Error(stderr.trim() || output.slice(0, 8000) || `BrainGlobe runner exited with ${code}`)); else { try { const parsed = JSON.parse(output) as JsonObject; if (parsed.error) reject(new Error(String(parsed.error))); else resolve(parsed) } catch { reject(new Error('BrainGlobe runner returned invalid JSON.')) } } })
      child.stdin.end(JSON.stringify({ ...request, brainglobeDir: atlasDir }))
    })
  }

  private async register(project: ProjectRecord, request: BrainAtlasRequest): Promise<BrainAtlasResponse> {
    if (!request.assetId) throw new Error('brainreg requires a registered image-stack assetId.')
    const source = this.store.listDataAssets(project.id).find(item => item.id === request.assetId)
    if (!source) throw new Error('brainreg input asset is not in the active project.')
    if (source.location !== 'local' || !source.uri.startsWith('file:')) throw new Error('brainreg requires a materialized local image stack.')
    const inputPath = await containedFile(project.rootPath, fileURLToPath(source.uri))
    const inputInfo = await stat(inputPath)
    const voxelSizes = request.voxelSizes ?? [25, 25, 25]
    if (voxelSizes.length !== 3 || voxelSizes.some(value => !Number.isFinite(value) || value <= 0 || value > 10000)) throw new Error('brainreg voxelSizes must contain three positive micron values.')
    const orientation = request.orientation?.trim()
    if (!orientation || !/^[a-z]{3}$/iu.test(orientation)) throw new Error('brainreg orientation must be a three-letter axis code such as asr.')
    const nFreeCpus = request.nFreeCpus ?? 2
    if (!Number.isSafeInteger(nFreeCpus) || nFreeCpus < 0 || nFreeCpus > 64) throw new Error('brainreg nFreeCpus must be an integer between 0 and 64.')
    const root = await realpath(project.rootPath)
    const outputDirectoryRaw = join(root, '.zerowall', 'science-exports', randomUUID(), 'brainreg')
    await mkdir(outputDirectoryRaw, { recursive: true })
    const outputDirectory = await containedFile(root, outputDirectoryRaw)
    // brainreg accepts a directory of image slices or a text file listing
    // those slices.  Passing a single TIFF directly is ambiguous and can
    // make the CLI treat it as a directory, so materialise an input manifest
    // for file assets while retaining directories as-is.
    let inputArgument = inputPath
    if (inputInfo.isFile()) {
      inputArgument = join(outputDirectory, 'brainreg-inputs.txt')
      await writeFile(inputArgument, `${inputPath}\n`, { flag: 'wx' })
    }
    const args = ['-E', '-P', '-m', 'brainreg.core.cli', inputArgument, outputDirectory, '--atlas', ATLAS, '--voxel-sizes', ...voxelSizes.map(String), '--orientation', orientation, '--n-free-cpus', String(nFreeCpus)]
    const python = process.env.ZEROWALL_BRAINGLOBE_PYTHON?.trim() || process.env.ZEROWALL_PYTHON?.trim() || 'python'
    const startedAt = Date.now()
    await new Promise<void>((resolve, reject) => {
      const child = spawn(python, args, { shell: false, windowsHide: true, cwd: dirname(inputPath), stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, OMP_NUM_THREADS: '1', OPENBLAS_NUM_THREADS: '1', MKL_NUM_THREADS: '1' } })
      let stderr = ''; let stdout = ''; let timedOut = false
      const timer = setTimeout(() => { timedOut = true; child.kill(); reject(new Error('brainreg exceeded the 30-minute bounded runner limit.')) }, 30 * 60 * 1000)
      child.stdout.on('data', chunk => { stdout = (stdout + chunk.toString()).slice(-12000) })
      child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-12000) })
      child.on('error', error => { clearTimeout(timer); reject(error) })
      child.on('close', code => { clearTimeout(timer); if (timedOut) return; if (code !== 0) reject(new Error(`brainreg exited with ${code}: ${(stderr || stdout).trim().slice(-8000)}`)); else resolve() })
    })
    const outputAudit = await auditBrainregOutputDirectory(outputDirectory)
    if (!outputAudit.valid) {
      const reasons = [...outputAudit.missing.map(item => `missing ${item}`), ...outputAudit.empty.map(item => `empty ${item}`), ...(outputAudit.metadataError ? [outputAudit.metadataError] : [])]
      throw new Error(`brainreg exited successfully but output audit failed: ${reasons.join('; ')}`)
    }
    const result = { format: 'zerowall-brainreg-registration', version: 1, runner: `${RUNNER}+brainreg`, atlas: ATLAS, sourceAssetId: source.id, sourceUri: source.uri, sourceSize: inputInfo.size, parameters: { voxelSizes, orientation, nFreeCpus }, outputDirectory, outputFiles: outputAudit.files, brainregMetadata: outputAudit.metadata ?? {}, outputAudit: { status: 'ready-for-review', requiredOutputs: ['brainreg.json', 'registered_atlas.tiff|registered_atlas.nii'], emptyFiles: outputAudit.empty }, durationMs: Date.now() - startedAt, scientificReview: 'pending', notes: ['Registration was executed by the managed brainreg CLI.', 'Required output files were present, non-empty and hashed; brainreg.json was parsed.', 'Registration quality, anatomical alignment and downstream cell detection require scientific review.', 'The output directory is retained for brainreg metadata and registered volumes.'] }
    const manifest = JSON.stringify(result, null, 2) + '\n'
    const manifestPath = join(outputDirectory, 'zerowall-registration.json')
    await writeFile(manifestPath, manifest, { flag: 'wx' })
    const artifact = this.store.createArtifact({ projectId: project.id, name: 'BrainGlobe brainreg registration', uri: pathToFileURL(manifestPath).href, mediaType: 'application/json', checksum: createHash('sha256').update(manifest).digest('hex'), metadata: { runner: `${RUNNER}+brainreg`, atlas: ATLAS, sourceAssetId: source.id, outputDirectory, scientificReview: 'pending' } })
    return { registration: { status: 'succeeded', outputDirectory, command: [python, ...args], notes: result.notes }, artifact }
  }
}
