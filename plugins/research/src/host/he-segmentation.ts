import { spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, open, readFile, stat, statfs, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { ResearchStore } from '@zerowallscience/research-store'
import type { CreateArtifactInput, DataAssetRecord, ProjectRecord, RunRecord, ViewerSessionRecord } from '@zerowallscience/research-store/types'
import { validateHeRegion, type HeSlideMetadata } from '../shared/he.js'
import { validateHeSegmentationParameters, type HeSegmentationRequest, type HeSegmentationResponse, type HeSegmentationResult } from '../shared/he-segmentation.js'
import { containedFile } from './science-viewer.js'
import { readProjectAsset } from './image-viewer.js'
import { HE_SEGMENTATION_RUNNER } from './he-segmentation-runner.js'
import { HE_STARDIST_MODEL } from './he-stardist-model.js'

const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
const terminal = new Set(['succeeded', 'failed', 'cancelled', 'timed_out'])
export function heSegmentationRoot(): string { return join(process.env.LOCALAPPDATA || process.env.HOME || '', 'ZeroWallScience', 'science-engines', 'he-stardist-7.0.0') }
export function heSegmentationPython(): string { return process.env.ZEROWALL_HE_STARDIST_PYTHON?.trim() || join(heSegmentationRoot(), 'venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python') }
export function heSegmentationModel(): string { return process.env.ZEROWALL_HE_STARDIST_MODEL?.trim() || join(heSegmentationRoot(), 'payload', 'model', '2D_versatile_he') }
async function hashFile(path: string, algorithm = 'sha256'): Promise<string> { const h = createHash(algorithm); for await (const chunk of createReadStream(path, { highWaterMark: 1024 * 1024 })) h.update(chunk); return h.digest('hex') }
type PreparedInput = { path: string; sha256: string; he: HeSlideMetadata; asset: DataAssetRecord; viewer: ViewerSessionRecord }

export class HeSegmentationService {
  private readonly live = new Map<string, { child: ChildProcess; timer: NodeJS.Timeout }>()
  private readonly finishing = new Map<string, Promise<HeSegmentationResponse>>()
  private disposed = false
  private preparing = false
  constructor(private readonly store: ResearchStore, private readonly options: { pythonPath?: string; modelDirectory?: string; timeoutMs?: number } = {}) {}
  dispose(): void {
    this.disposed = true
    for (const [id, entry] of this.live) {
      this.store.updateRun(id, { status: 'failed', error: 'Host stopped; HE segmentation interrupted. Partial outputs retained; no automatic resumption.' })
      clearTimeout(entry.timer); entry.child.kill()
    }
    this.live.clear()
  }
  async submit(project: ProjectRecord, request: HeSegmentationRequest, input: PreparedInput): Promise<HeSegmentationResponse> {
    if (this.disposed) throw new Error('HE segmentation service stopped.')
    const parameters = validateHeSegmentationParameters(request.segmentation)
    const region = validateHeRegion(request.region ?? input.viewer.state.heRegion, input.he.width, input.he.height, input.he.pages, Number.MAX_SAFE_INTEGER)
    const downsample = input.he.levels[region.page]!.downsample
    const sampleWidth = Math.ceil(region.width / downsample); const sampleHeight = Math.ceil(region.height / downsample)
    if (input.he.engine !== 'openslide') throw new Error('StarDist segmentation requires the OpenSlide engine and a supported tiled slide.')
    if (sampleWidth * sampleHeight > 64_000_000 || sampleWidth < 64 || sampleHeight < 64) throw new Error('HE segmentation requires 64 or more sampled pixels per axis, at most 64 million sampled pixels per ROI.')
    const sourceInfo = await stat(input.path)
    if (await hashFile(input.path) !== input.sha256) throw new Error('HE source changed before segmentation; reopen the viewer.')
    if (input.asset.checksum && await hashFile(input.path, input.asset.checksumAlgorithm ?? 'sha256') !== input.asset.checksum.toLowerCase()) throw new Error('Registered HE source checksum mismatch.')
    const fingerprint = hash(JSON.stringify({ sourceAssetId: input.asset.id, sourceSha256: input.sha256, region, parameters, runnerSha256: hash(HE_SEGMENTATION_RUNNER), model: HE_STARDIST_MODEL.sha256 }))
    const reserved = this.store.reserveScientificRun({ projectId: project.id, name: 'HE StarDist nuclei segmentation', command: 'he.stardist.v1', workingDirectory: project.rootPath, status: 'submitted', leaseOwner: 'he-segmentation', timeoutAt: new Date(Date.now() + (this.options.timeoutMs ?? 30 * 60 * 1000)).toISOString(), inputs: [{ name: 'source_asset', uri: input.asset.id }, { name: 'source_sha256', uri: input.sha256 }, { name: 'viewer_id', uri: input.viewer.id }] }, request.requestId ?? '', fingerprint)
    if (!reserved.created) return this.status(project, reserved.run.id)
    const run = reserved.run
    let ownsPreparation = false
    try {
      if (this.live.size || this.preparing) throw new Error('Another local StarDist task is running; CPU segmentation concurrency is 1.')
      this.preparing = true; ownsPreparation = true
      const python = this.options.pythonPath ?? heSegmentationPython(); const modelDirectory = this.options.modelDirectory ?? heSegmentationModel()
      if (!(await stat(python).catch(() => undefined))?.isFile()) throw new Error('Managed HE StarDist engine is not installed; import the he-stardist engine package.')
      for (const file of HE_STARDIST_MODEL.files) if (await hashFile(join(modelDirectory, file.path)) !== file.sha256) throw new Error('Frozen StarDist model checksum mismatch: ' + file.path)
      let directory = project.rootPath
      for (const name of ['.zerowall', 'he-segmentation', run.id]) { const next = join(directory, name); await mkdir(next, { recursive: true }); directory = await containedFile(project.rootPath, next) }
      const disk = await statfs(directory); if (disk.bavail * disk.bsize < 2 * 1024 ** 3) throw new Error('HE segmentation requires at least 2 GiB of free workspace storage.')
      const requestPath = join(directory, 'request.json'); const scriptPath = join(directory, 'runner.py')
      const payload = { directory, sourcePath: input.path, sourceSha256: input.sha256, sourceSize: sourceInfo.size, sourceAssetId: input.asset.id, region, parameters, runnerSha256: hash(HE_SEGMENTATION_RUNNER), modelDirectory, model: HE_STARDIST_MODEL, calibration: input.he.calibration, fingerprint, runId: run.id }
      await writeFile(requestPath, JSON.stringify(payload, null, 2) + '\n', { flag: 'wx' }); await writeFile(scriptPath, HE_SEGMENTATION_RUNNER, { flag: 'wx' })
      if (this.disposed) throw new Error('Host stopped before the HE process could start.')
      const log = await open(join(directory, 'runner.log'), 'wx')
      const child = spawn(python, ['-I', scriptPath], { windowsHide: true, shell: false, cwd: directory, env: { ...process.env, ZEROWALL_HE_REQUEST: requestPath }, stdio: ['ignore', log.fd, log.fd] })
      const timer = setTimeout(() => {
        if (this.disposed) return
        this.store.updateRun(run.id, { status: 'timed_out', error: 'HE CPU segmentation exceeded the task time budget; partial outputs retained.' }); child.kill()
      }, this.options.timeoutMs ?? 30 * 60 * 1000)
      this.live.set(run.id, { child, timer })
      this.store.updateRun(run.id, { status: 'running', progress: 0.01, ...(child.pid ? { pid: child.pid } : {}) })
      child.once('error', error => { if (!this.disposed) this.store.updateRun(run.id, { status: 'failed', error: error.message }) })
      child.once('close', (code, signal) => {
        clearTimeout(timer); this.live.delete(run.id)
        if (!this.disposed) void this.status(project, run.id).then(result => {
          if (!this.disposed && result.run && !terminal.has(result.run.status)) this.store.updateRun(run.id, { status: 'failed', error: `StarDist process exited (${code ?? signal ?? 'unknown'}) without a valid completion manifest; inspect runner.log. Partial outputs retained.` })
        }).catch(error => { if (!this.disposed && !terminal.has(this.store.getRun(run.id)!.status)) this.store.updateRun(run.id, { status: 'failed', error: String(error) }) })
      })
      await log.close()
      return { run: this.store.getRun(run.id)! }
    } catch (error) {
      return { run: this.store.updateRun(run.id, { status: 'failed', error: error instanceof Error ? error.message : String(error) }) }
    } finally { if (ownsPreparation) this.preparing = false }
  }
  async cancel(project: ProjectRecord, runId: string): Promise<HeSegmentationResponse> {
    const run = this.requireRun(project, runId)
    if (terminal.has(run.status)) return this.status(project, runId)
    const live = this.live.get(runId); if (!live) throw new Error('This Host does not own that HE process; a historical PID cannot be cancelled.')
    this.store.updateRun(runId, { status: 'cancelled', error: 'Cancelled by user; partial files and logs retained.' }); live.child.kill()
    return { run: this.store.getRun(runId)! }
  }
  async status(project: ProjectRecord, runId: string): Promise<HeSegmentationResponse> {
    const run = this.requireRun(project, runId)
    if (run.status === 'succeeded') return this.readResult(project, run)
    if (terminal.has(run.status)) return { run }
    if (this.live.has(runId)) return { run }
    if (this.finishing.has(runId)) return this.finishing.get(runId)!
    const directory = await containedFile(project.rootPath, join(project.rootPath, '.zerowall', 'he-segmentation', runId)).catch(() => undefined)
    if (directory && (await stat(join(directory, 'completion.json')).catch(() => undefined))?.isFile()) {
      const promise = this.finish(project, run, directory); this.finishing.set(runId, promise)
      try { return await promise } finally { this.finishing.delete(runId) }
    }
    if (!this.live.has(runId) && run.timeoutAt && Date.parse(run.timeoutAt) < Date.now()) return { run: this.store.updateRun(runId, { status: 'failed', error: 'HE execution ownership was lost and its deadline expired. Inspect partial files before starting a new request; no automatic rerun.' }) }
    return { run }
  }
  private requireRun(project: ProjectRecord, runId: string): RunRecord { const run = this.store.getRun(runId); if (!run || run.projectId !== project.id || run.leaseOwner !== 'he-segmentation') throw new Error('HE segmentation task is not in the active project.'); return run }
  private async finish(project: ProjectRecord, run: RunRecord, directory: string): Promise<HeSegmentationResponse> {
    try {
      const read = (name: string, limit = 8 * 1024 ** 2) => readProjectAsset(project, { uri: pathToFileURL(join(directory, name)).href }, limit)
      const requestBytes = await read('request.json'); const request = JSON.parse(requestBytes.toString('utf8'))
      const manifest = JSON.parse((await read('completion.json')).toString('utf8'))
      if (manifest.status !== 'succeeded') throw new Error('StarDist runner failed; inspect runner.log in the task directory.')
      if (manifest.requestSha256 !== hash(requestBytes) || request.runId !== run.id || request.fingerprint !== run.inputs.find(item => item.name === 'fingerprint')?.uri) throw new Error('HE completion manifest does not match the reserved request.')
      const runnerSha256 = await hashFile(await containedFile(project.rootPath, join(directory, 'runner.py')))
      const expectedFingerprint = hash(JSON.stringify({ sourceAssetId: request.sourceAssetId, sourceSha256: request.sourceSha256, region: request.region, parameters: request.parameters, runnerSha256, model: request.model?.sha256 }))
      if (expectedFingerprint !== request.fingerprint || (request.runnerSha256 && request.runnerSha256 !== runnerSha256)) throw new Error('HE request or runner changed after reservation.')
      const expected = ['result.json', 'labels.tif', 'nuclei.csv', 'overlay.png', 'polygons.npz']
      if (!Array.isArray(manifest.files) || manifest.files.length !== expected.length) throw new Error('HE output file inventory is invalid.')
      const artifacts: CreateArtifactInput[] = []
      for (const name of expected) {
        const file = manifest.files.find((item: { name: string }) => item.name === name)
        const path = await containedFile(project.rootPath, join(directory, name)); const info = await stat(path)
        if (!file || file.size !== info.size || info.size > 512 * 1024 ** 2 || await hashFile(path) !== file.sha256) throw new Error('HE output checksum or size mismatch: ' + name)
        artifacts.push({ projectId: project.id, runId: run.id, name, uri: pathToFileURL(path).href, mediaType: name.endsWith('.png') ? 'image/png' : name.endsWith('.tif') ? 'image/tiff' : name.endsWith('.json') ? 'application/json' : name.endsWith('.csv') ? 'text/csv' : 'application/octet-stream', checksum: file.sha256, metadata: { sourceAssetId: request.sourceAssetId, sourceSha256: request.sourceSha256, scientificReview: 'pending', modelSha256: request.model.sha256, runnerSha256 } })
      }
      for (const name of ['request.json', 'runner.py', 'runner.log', 'completion.json']) { const path = await containedFile(project.rootPath, join(directory, name)); artifacts.push({ projectId: project.id, runId: run.id, name, uri: pathToFileURL(path).href, mediaType: 'application/octet-stream', checksum: await hashFile(path) }) }
      const current = this.requireRun(project, run.id); if (terminal.has(current.status)) return { run: current }
      return this.readResult(project, this.store.finishScientificRun(project.id, run.id, artifacts))
    } catch (error) { return { run: this.store.updateRun(run.id, { status: 'failed', error: error instanceof Error ? error.message : String(error) }) } }
  }
  private async readResult(project: ProjectRecord, run: RunRecord): Promise<HeSegmentationResponse> {
    const artifacts = this.store.listArtifacts(project.id).filter(item => item.runId === run.id)
    const result = artifacts.find(item => item.name === 'result.json'); const overlay = artifacts.find(item => item.name === 'overlay.png')
    if (!result || !overlay) throw new Error('HE successful task has an incomplete artifact record.')
    const read = (artifact: typeof result) => readProjectAsset(project, { uri: artifact.uri, ...(artifact.checksum ? { checksum: artifact.checksum, checksumAlgorithm: 'sha256' as const } : {}) }, 16 * 1024 ** 2)
    const segmentation = JSON.parse((await read(result)).toString('utf8')) as HeSegmentationResult
    segmentation.preview.pngBase64 = (await read(overlay)).toString('base64')
    return { run, artifacts, segmentation }
  }
}
