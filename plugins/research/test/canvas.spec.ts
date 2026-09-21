import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import { ResearchStore } from '../../../store/src/index.js'
import { CanvasService } from '../src/host/canvas.js'
import { renderCanvas, validateCanvasSpec } from '../src/shared/canvas.js'

const cleanup: Array<() => Promise<void>> = []
afterEach(async () => { for (const dispose of cleanup.splice(0).reverse()) await dispose() })
const spec = { title: 'Dose response', width: 640, height: 400, xLabel: 'Dose', yLabel: 'Response', series: [{ id: 'control', name: 'Control', color: '#2f6fbd', points: [{ x: 0, y: 1 }, { x: 1, y: 2 }] }], annotations: [{ text: 'peak', x: 1, y: 2 }], sourceAssetIds: ['asset-1'], sourceArtifactIds: [] }

it('validates bounded series and renders deterministic escaped SVG', () => {
  expect(() => validateCanvasSpec({ ...spec, width: 10 })).toThrow('dimensions')
  const render = renderCanvas(validateCanvasSpec({ ...spec, title: '<unsafe>' })); expect(render.svg).toContain('&lt;unsafe&gt;'); expect(render.svg).toContain('Control')
  expect(render.pointCount).toBe(2); expect(render.sourceAssetIds).toEqual(['asset-1'])
})

it('exports an SVG and manifest with source references', async () => {
  const root = await mkdtemp(join(tmpdir(), 'canvas-service-')); const projectRoot = join(root, 'project'); await mkdir(projectRoot); const store = new ResearchStore(join(root, 'store.sqlite')); const service = new CanvasService(store); cleanup.push(async () => { store.close(); await rm(root, { recursive: true, force: true }) }); const project = store.createProject({ name: 'Canvas', rootPath: projectRoot })
  const result = await service.execute(project, { sessionId: 's', action: 'export', spec }); expect(result.artifact?.mediaType).toBe('image/svg+xml'); expect(result.artifact?.metadata.pointCount).toBe(2); const manifest = JSON.parse(await readFile(fileURLToPath(String(result.artifact?.metadata.manifestUri)), 'utf8')); expect(manifest.spec.sourceAssetIds).toEqual(['asset-1'])
})
