import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import { ResearchStore } from '../../../store/src/index.js'
import { CanvasService, makeSingleImagePdf } from '../src/host/canvas.js'
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
  const result = await service.execute(project, { sessionId: 's', action: 'export', spec: { ...spec, sourceAssetIds: [] } }); expect(result.artifact?.mediaType).toBe('image/svg+xml'); expect(result.artifact?.metadata.pointCount).toBe(2); expect(result.artifacts).toHaveLength(4); expect(result.artifacts?.map(item => item.mediaType)).toEqual(['image/svg+xml', 'image/png', 'application/pdf', 'application/json']); const manifest = JSON.parse(await readFile(fileURLToPath(String(result.artifact?.metadata.manifestUri)), 'utf8')); expect(manifest.spec.sourceAssetIds).toEqual([]); expect((await readFile(fileURLToPath(result.artifacts![1].uri))).subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a'); expect((await readFile(fileURLToPath(result.artifacts![2].uri))).subarray(0, 8).toString('ascii')).toBe('%PDF-1.4')
})

it('writes a structurally valid single-image PDF wrapper', () => {
  const pdf = makeSingleImagePdf(Buffer.from('jpeg-data'), 640, 400)
  expect(pdf.subarray(0, 8).toString('ascii')).toBe('%PDF-1.4')
  expect(pdf.toString('ascii')).toContain('xref')
})

it('renders independent panel ranges and escapes labels without changing data', () => {
  const render = renderCanvas(validateCanvasSpec({ ...spec, width: 1000, columns: 2, xRange: [0, 10], panels: [{ ...spec, title: 'Second', xRange: [-1, 1], showLegend: false, annotations: [{ text: '<script>bad</script>', x: 0, y: 1 }] }] }))
  expect(render.pointCount).toBe(4)
  expect(render.svg).toContain('clip-path="url(#plot-0)"')
  expect(render.svg).toContain('clip-path="url(#plot-1)"')
  expect(render.svg).toContain('&lt;script&gt;bad&lt;/script&gt;')
  expect(render.svg).not.toContain('<script>')
  expect(render.sourceAssetIds).toEqual(['asset-1'])
  expect(spec.series[0]!.points).toEqual([{ x: 0, y: 1 }, { x: 1, y: 2 }])
  expect(() => validateCanvasSpec({ ...spec, xRange: [2, 1] })).toThrow('increasing')
  expect(() => validateCanvasSpec({ ...spec, panels: [{ ...spec, panels: [spec] }] })).toThrow('non-nested')
})

it('handles empty and 100,000-point datasets without spread-stack overflow', () => {
  const base = { ...spec, annotations: [], sourceAssetIds: [] }
  const empty = renderCanvas({ ...base, series: [{ ...spec.series[0]!, points: [] }] })
  expect(empty.svg).not.toMatch(/NaN|Infinity/)
  const points = Array.from({ length: 100000 }, (_, x) => ({ x, y: x % 7 }))
  expect(renderCanvas({ ...base, series: [{ ...spec.series[0]!, points, mode: 'scatter' }] }).pointCount).toBe(100000)
})

it('rejects foreign source IDs, preserves source revisions and rolls back partial export registration', async () => {
  const root = await mkdtemp(join(tmpdir(), 'canvas-provenance-')); const store = new ResearchStore(join(root, 'store.sqlite')); cleanup.push(async () => { store.close(); await rm(root, { recursive: true, force: true }) })
  const project = store.createProject({ name: 'Canvas', rootPath: root }); const other = store.createProject({ name: 'Other', rootPath: join(root, 'other') })
  const foreign = store.createDataAsset({ projectId: other.id, name: 'Foreign', uri: 'file:///foreign.csv', location: 'local', mediaType: 'text/csv' })
  const service = new CanvasService(store)
  await expect(service.execute(project, { sessionId: 's', action: 'render', spec: { ...spec, sourceAssetIds: [foreign.id] } })).rejects.toThrow('active project')
  const asset = store.createDataAsset({ projectId: project.id, name: 'Actual', uri: 'file:///actual.csv', location: 'local', mediaType: 'text/csv', checksum: 'a'.repeat(64), checksumAlgorithm: 'sha256' })
  const result = await service.execute(project, { sessionId: 's', action: 'export', spec: { ...spec, sourceAssetIds: [asset.id] } })
  expect(result.artifact!.metadata.sourceSnapshots).toEqual([{ id: asset.id, kind: 'asset', version: 1, checksum: 'a'.repeat(64) }])
  const prior = store.listArtifacts(project.id).length
  expect(() => store.createArtifacts([{ projectId: project.id, name: 'first', uri: 'file:///first.svg', mediaType: 'image/svg+xml' }, { projectId: project.id, name: '', uri: 'file:///bad.svg', mediaType: 'image/svg+xml' }])).toThrow()
  expect(store.listArtifacts(project.id)).toHaveLength(prior)
})
