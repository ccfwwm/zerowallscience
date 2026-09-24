import { createHash, randomUUID } from 'node:crypto'
import { mkdir, realpath, stat, writeFile } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import type { ResearchStore } from '@zerowallscience/research-store'
import type { DataAssetRecord, JsonObject, ProjectRecord, ViewerSessionRecord } from '@zerowallscience/research-store/types'
import type { CellAnalysis, CellPreview, CellResponse, CellViewerRequest } from '../shared/types.js'
import { containedFile } from './science-viewer.js'
import { validateCellSelection, type CellSelectionResult } from '../shared/cell-selection.js'
import { DEFAULT_CELL_CAMERA, validateCellCamera } from '../shared/cell-camera.js'
import { pythonChildEnvironment } from './python-env.js'

const RUNNER = 'zerowall-cell-viewer/7.0.0-1'
const MAX_BYTES = 20 * 1024 * 1024 * 1024
import { CELL_READER } from './cell-reader.js'

export class CellViewerService {
  private busy = false
  constructor(private readonly store: ResearchStore) {}

  async execute(project: ProjectRecord, request: CellViewerRequest): Promise<CellResponse> {
    if (this.busy) throw new Error('Cell reader is busy; retry after the current operation finishes.')
    this.busy = true
    try { return await this.executeOne(project, request) } finally { this.busy = false }
  }

  private async executeOne(project: ProjectRecord, request: CellViewerRequest): Promise<CellResponse> {
    if (!['open', 'read', 'analyze', 'export', 'select', 'export_selection', 'view'].includes(request.action)) throw new Error('Unsupported cell action.')
    if (request.action === 'view') {
      const viewer = this.store.listViewerSessions(project.id).find(v => v.id === request.viewerId && v.tool === 'cells')
      if (!viewer) throw new Error('Cell viewer is not in the active project.')
      if (request.expectedVersion !== viewer.version) throw new Error('Cell viewer revision conflict.')
      const camera = validateCellCamera(request.camera)
      return { viewer: this.store.updateViewerSession(project.id, viewer.id, { expectedVersion: viewer.version, state: { ...viewer.state, camera: { ...camera } } }) }
    }
    if (request.selection != null) request = { ...request, selection: validateCellSelection(request.selection) }
    if (request.camera !== undefined) request = { ...request, camera: validateCellCamera(request.camera) }
    for (const key of ['cellLimit', 'embeddingLimit'] as const) {
      const value = request[key]
      const maximum = key === 'embeddingLimit' ? 200000 : 10000
      if (value !== undefined && (!Number.isSafeInteger(value) || value < 1 || value > maximum)) throw new Error(`${key} must be an integer between 1 and ${maximum}.`)
    }
    for (const key of ['gene', 'groupBy', 'embedding'] as const) {
      if (request[key] !== undefined && (typeof request[key] !== 'string' || request[key]!.length > 1000)) throw new Error(`Invalid ${key}.`)
    }
    let viewer: ViewerSessionRecord | undefined
    if (request.action === 'open') {
      if (request.selection != null) throw new Error('Open the source before selecting cells.')
      const asset = this.asset(project.id, request.assetId); const source = await this.source(project, asset)
      const result = await this.run(source.path, request)
      await this.assertSource(project, asset, source)
      viewer = this.store.createViewerSession({ projectId: project.id, assetId: asset.id, tool: 'cells', state: { sourceSha256: source.sha256, embedding: result.preview.embedding?.key ?? '', groupBy: request.groupBy ?? '', gene: request.gene ?? '', cellLimit: request.cellLimit ?? 2000, embeddingLimit: request.embeddingLimit ?? 2000 } })
      return { preview: result.preview, ...(result.analysis ? { analysis: result.analysis } : {}), viewer }
    }
    viewer = this.store.listViewerSessions(project.id).find(item => item.id === request.viewerId && item.tool === 'cells')
    if (!viewer) throw new Error('Cell viewer is not in the active project.')
    const asset = this.asset(project.id, viewer.assetId); const source = await this.source(project, asset)
    if (source.sha256 !== viewer.state.sourceSha256) throw new Error('H5AD source changed; reopen the cell view.')
    if (request.expectedVersion !== viewer.version) throw new Error(`Cell viewer revision conflict: current ${viewer.version}.`)
    const params: CellViewerRequest = { ...request, embedding: request.embedding ?? String(viewer.state.embedding ?? ''), groupBy: request.groupBy ?? String(viewer.state.groupBy ?? ''), ...(request.gene !== undefined ? { gene: request.gene } : viewer.state.gene ? { gene: String(viewer.state.gene) } : {}), cellLimit: request.cellLimit ?? Number(viewer.state.cellLimit ?? 2000), embeddingLimit: request.embeddingLimit ?? Number(viewer.state.embeddingLimit ?? 2000) }
    for (const key of ['cellLimit', 'embeddingLimit'] as const) if (!Number.isSafeInteger(params[key]) || params[key]! < 1 || params[key]! > (key === 'embeddingLimit' ? 200000 : 10000)) throw new Error(`Persisted ${key} is invalid; reopen the cell view.`)
    const selection = request.selection === undefined ? viewer.state.selection ? validateCellSelection(viewer.state.selection) : null : request.selection
    // Switching the coordinate system clears the prior selection, never reinterprets it.
    params.selection = selection && (params.embedding === selection.embedding) ? selection : null
    if (request.selection && params.selection === null) throw new Error('Selection embedding must match the current view.')
    if (request.action === 'export_selection' && !params.selection) throw new Error('Save a cell selection before exporting.')
    const selectionDirectory = request.action === 'export_selection' ? await this.exportDirectory(project) : undefined
    const selectionPath = selectionDirectory ? join(selectionDirectory, 'cells.csv') : undefined
    const result = await this.run(source.path, params, selectionPath)
    if (request.action === 'export_selection' && !result.selection) throw new Error('Cell runner did not return a selection result.')
    await this.assertSource(project, asset, source)
    const camera = result.preview.embedding?.key === viewer.state.embedding ? request.camera ?? (viewer.state.camera ? validateCellCamera(viewer.state.camera) : DEFAULT_CELL_CAMERA) : DEFAULT_CELL_CAMERA
    const updated = this.store.updateViewerSession(project.id, viewer.id, { expectedVersion: viewer.version, state: { sourceSha256: source.sha256, embedding: result.preview.embedding?.key ?? '', groupBy: params.groupBy ?? '', gene: params.gene ?? '', cellLimit: params.cellLimit ?? 2000, embeddingLimit: params.embeddingLimit ?? 2000, selection: params.selection ? JSON.parse(JSON.stringify(params.selection)) as JsonObject : null, camera: { ...camera } } })
    const response: CellResponse = { preview: result.preview, ...(result.analysis ? { analysis: result.analysis } : {}), ...(result.selection ? { selection: result.selection } : {}), viewer: updated }
    if (selectionPath && selectionDirectory && result.selection) {
      const hash = createHash('sha256')
      for await (const bytes of createReadStream(selectionPath)) hash.update(bytes)
      const checksum = hash.digest('hex')
      const manifest = JSON.stringify({ format: 'zerowall-cell-selection', version: 1, runner: RUNNER, readerSha256: createHash('sha256').update(CELL_READER).digest('hex'), runtime: result.runtime, sourceAssetId: asset.id, sourceSha256: source.sha256, viewerId: updated.id, viewerVersion: updated.version, selection: result.selection, csv: { file: 'cells.csv', sha256: checksum, rowIdentity: 'observation-index-0based-plus-cell-id' }, scientificReview: 'pending' }, null, 2) + '\n'
      const manifestPath = join(selectionDirectory, 'selection.json')
      await writeFile(manifestPath, manifest, { flag: 'wx' }); await this.assertSource(project, asset, source)
      if (this.store.listViewerSessions(project.id).find(v => v.id === updated.id)?.version !== updated.version) throw new Error('Cell viewer revision conflict; reload the view.')
      const artifact = this.store.createArtifact({ projectId: project.id, name: 'Selected cell collection', uri: pathToFileURL(selectionPath).href, mediaType: 'text/csv', checksum, metadata: { sourceAssetId: asset.id, sourceSha256: source.sha256, viewerId: updated.id, viewerVersion: updated.version, manifestUri: pathToFileURL(manifestPath).href, manifestSha256: createHash('sha256').update(manifest).digest('hex'), selectedCells: result.selection.count, scientificReview: 'pending' } })
      return { ...response, artifact }
    }
    if (request.action !== 'export') return response
    const destination = await this.exportDirectory(project)
    const manifest = JSON.stringify({ format: 'zerowall-cell-analysis', version: 1, runner: RUNNER, readerSha256: createHash('sha256').update(CELL_READER).digest('hex'), runtime: result.runtime, sourceAssetId: asset.id, sourceSha256: source.sha256, viewerId: updated.id, viewerVersion: updated.version, parameters: updated.state, preview: result.preview, analysis: result.analysis, scientificReview: 'pending' }, null, 2) + '\n'
    const path = join(destination, 'result.json'); await writeFile(path, manifest, { flag: 'wx' })
    await this.assertSource(project, asset, source)
    if (this.store.listViewerSessions(project.id).find(v => v.id === updated.id)?.version !== updated.version) throw new Error('Cell viewer revision conflict; reload the view.')
    const artifact = this.store.createArtifact({ projectId: project.id, name: 'AnnData cell analysis', uri: pathToFileURL(path).href, mediaType: 'application/json', checksum: createHash('sha256').update(manifest).digest('hex'), metadata: { runner: RUNNER, sourceAssetId: asset.id, sourceSha256: source.sha256, viewerId: updated.id, viewerVersion: updated.version, scientificReview: 'pending' } })
    return { ...response, artifact }
  }

  private async exportDirectory(project: ProjectRecord): Promise<string> {
    let directory = await realpath(project.rootPath)
    for (const component of ['.zerowall', 'science-exports', randomUUID()]) {
      const next = join(directory, component)
      try { await mkdir(next) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error }
      directory = await containedFile(project.rootPath, next)
    }
    return directory
  }

  private asset(projectId: string, id?: string): DataAssetRecord { const asset = this.store.listDataAssets(projectId).find(item => item.id === id); if (!asset) throw new Error('H5AD asset is not in the active project.'); return asset }
  private async assertSource(project: ProjectRecord, asset: DataAssetRecord, source: { path: string; signature: string }): Promise<void> {
    if (await containedFile(project.rootPath, fileURLToPath(asset.uri)) !== source.path || fileSignature(await stat(source.path)) !== source.signature) throw new Error('H5AD source changed during analysis.')
  }
  private async source(project: ProjectRecord, asset: DataAssetRecord): Promise<{ path: string; sha256: string; signature: string }> {
    if (asset.location !== 'local' || !asset.uri.startsWith('file:')) throw new Error('Materialize remote H5AD files before viewing.')
    const path = await containedFile(project.rootPath, fileURLToPath(asset.uri)); if (!/\.(h5ad|h5)$/iu.test(path)) throw new Error('Cell viewer accepts H5AD or HDF5 AnnData files.')
    const before = await stat(path); if (!before.isFile() || before.size > MAX_BYTES) throw new Error('H5AD must be a regular file no larger than 20 GiB.')
    if (asset.checksum && !asset.checksumAlgorithm) throw new Error('Registered checksum algorithm is required.')
    const hash = createHash('sha256'); const registered = asset.checksum ? createHash(asset.checksumAlgorithm!) : undefined
    for await (const bytes of createReadStream(path)) { hash.update(bytes); registered?.update(bytes) }
    if (fileSignature(await stat(path)) !== fileSignature(before)) throw new Error('H5AD changed during reading.')
    if (registered && registered.digest('hex') !== asset.checksum!.toLowerCase()) throw new Error('H5AD checksum does not match the registered asset.')
    return { path, sha256: hash.digest('hex'), signature: fileSignature(before) }
  }
  private async run(path: string, request: CellViewerRequest, selectionOutput?: string): Promise<{ preview: CellPreview; analysis?: CellAnalysis; runtime: JsonObject; selection?: CellSelectionResult }> {
    const python = process.env.ZEROWALL_CELL_PYTHON?.trim() || process.env.ZEROWALL_PYTHON?.trim() || 'python'
    const stdout = await new Promise<string>((resolve, reject) => {
      // Ignore PYTHONPATH/current directory imports; retain configured user-site packages.
      const child = spawn(python, ['-E', '-P', '-c', CELL_READER], { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: pythonChildEnvironment(undefined, { OMP_NUM_THREADS: '1', OPENBLAS_NUM_THREADS: '1', MKL_NUM_THREADS: '1' }) })
      const chunks: Buffer[] = []; let size = 0; let stderr = ''; let failure: Error | undefined
      const timer = setTimeout(() => { failure = new Error('Cell reader exceeded the 120-second limit.'); child.kill() }, 120000)
      child.stdout.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > 32 * 1024 * 1024) { failure = new Error('Cell preview exceeds 32 MiB; reduce cell_limit or metadata columns.'); child.kill() }
        else chunks.push(chunk)
      })
      child.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-8000) })
      child.on('error', error => { clearTimeout(timer); reject(error) })
      child.stdin.on('error', error => { failure ??= error; child.kill() })
      child.on('close', code => {
        clearTimeout(timer)
        const output = Buffer.concat(chunks).toString('utf8')
        if (failure) reject(failure)
        else if (code !== 0) reject(new Error(stderr.trim() || output.slice(0, 8000) || `H5AD reader exited with ${code}`))
        else resolve(output)
      })
      child.stdin.end(JSON.stringify({ ...request, path, selectionOutput, cellLimit: request.cellLimit ?? 2000, embeddingLimit: request.embeddingLimit ?? 2000 }))
    })
    const parsed = JSON.parse(stdout) as CellPreview & { analysis?: CellAnalysis; runtime: JsonObject; error?: string; selection?: CellSelectionResult }
    if (parsed.error) throw new Error(parsed.error)
    if (!parsed.summary || !Array.isArray(parsed.cells) || !parsed.runtime) throw new Error('Invalid cell reader response.')
    const { analysis, runtime, selection, ...preview } = parsed
    return { preview, ...(analysis ? { analysis } : {}), ...(selection ? { selection } : {}), runtime }
  }
}

function fileSignature(value: Awaited<ReturnType<typeof stat>>): string {
  return [value.dev, value.ino, value.size, value.mtimeMs, value.ctimeMs].join(':')
}
