import { createHash, randomUUID } from 'node:crypto'
import { mkdir, realpath, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { ResearchStore } from '@zerowallscience/research-store'
import type { ProjectRecord } from '@zerowallscience/research-store/types'
import { renderCanvas, validateCanvasSpec } from '../shared/canvas.js'
import type { CanvasRequest, CanvasResponse } from '../shared/types.js'
import { containedFile } from './science-viewer.js'

const RUNNER = 'zerowall-science-canvas/7.0.0-1'
export class CanvasService {
  constructor(private readonly store: ResearchStore) {}
  async execute(project: ProjectRecord, request: CanvasRequest): Promise<CanvasResponse> {
    const spec = validateCanvasSpec(request.spec); const canvas = renderCanvas(spec); if (request.action === 'render') return { canvas }
    if (request.action !== 'export') throw new Error('Unsupported canvas action.')
    const root = await realpath(project.rootPath); const basePath = join(root, '.zerowall'); await mkdir(basePath, { recursive: true }); const base = await containedFile(root, basePath); const exportPath = join(base, 'science-exports'); await mkdir(exportPath, { recursive: true }); const directory = join(await containedFile(root, exportPath), randomUUID()); await mkdir(directory); const svgPath = join(directory, 'figure.svg'); const jsonPath = join(directory, 'figure.json'); const svg = canvas.svg; const manifest = JSON.stringify({ format: 'zerowall-science-canvas-project', version: 1, runner: RUNNER, spec, canvas }, null, 2) + '\n'
    try { await writeFile(svgPath, svg, { flag: 'wx' }); await writeFile(jsonPath, manifest, { flag: 'wx' }); const artifact = this.store.createArtifact({ projectId: project.id, name: `科研画布：${spec.title}`, uri: pathToFileURL(svgPath).href, mediaType: 'image/svg+xml', checksum: createHash('sha256').update(svg).digest('hex'), metadata: { runner: RUNNER, manifestUri: pathToFileURL(jsonPath).href, sourceAssetIds: spec.sourceAssetIds ?? [], sourceArtifactIds: spec.sourceArtifactIds ?? [], pointCount: canvas.pointCount, needsReview: false } }); return { canvas, artifact } } catch (error) { await rm(directory, { recursive: true, force: true }); throw error }
  }
}
