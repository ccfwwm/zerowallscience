import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import sharp from 'sharp'
import { afterEach, expect, it } from 'vitest'
import { ResearchStore } from '../../../store/src/index.js'
import { HeService } from '../src/host/he.js'
import { analyzeHeRgb, validateHeRegion } from '../src/shared/he.js'

const cleanup: Array<() => Promise<void>> = []
afterEach(async () => { for (const dispose of cleanup.splice(0).reverse()) await dispose() })

it('validates bounded regions and reports deterministic RGB/nuclei-like metrics', () => {
  expect(() => validateHeRegion({ x: 0, y: 0, width: 11, height: 5 }, 10, 10, 1)).toThrow('outside')
  const region = validateHeRegion({ x: 0, y: 0, width: 2, height: 1 }, 2, 1, 1)
  const result = analyzeHeRgb(new Uint8Array([20, 20, 100, 240, 220, 220]), 2, 1, region)
  expect(result.meanRgb).toEqual({ r: 130, g: 120, b: 160 }); expect(result.nucleiLikePixels).toBe(1); expect(result.nucleiCount).toBe(1); expect(result.nucleiAreas).toEqual([1])
})

it('opens a TIFF payload with an SVS extension and exports ROI provenance', async () => {
  const root = await mkdtemp(join(tmpdir(), 'he-service-')); const projectRoot = join(root, 'project'); await mkdir(projectRoot); const store = new ResearchStore(join(root, 'store.sqlite')); const service = new HeService(store); cleanup.push(async () => { store.close(); await rm(root, { recursive: true, force: true }) })
  const project = store.createProject({ name: 'HE', rootPath: projectRoot }); const path = join(projectRoot, 'slide.svs'); await sharp({ create: { width: 32, height: 24, channels: 3, background: { r: 80, g: 60, b: 120 } } }).tiff().toFile(path); const asset = store.createDataAsset({ projectId: project.id, name: 'slide.svs', uri: pathToFileURL(path).href, location: 'local', mediaType: 'image/tiff' })
  const opened = await service.execute(project, { sessionId: 's', action: 'open', assetId: asset.id }); expect(opened.he).toMatchObject({ width: 32, height: 24, format: 'tiff' }); const viewer = opened.viewer!
  const exported = await service.execute(project, { sessionId: 's', action: 'export', viewerId: viewer.id, expectedVersion: viewer.version, region: { x: 2, y: 3, width: 10, height: 8, page: 0 } }); expect(exported.analysis?.region).toMatchObject({ x: 2, y: 3, width: 10, height: 8 }); expect(JSON.parse(await readFile(fileURLToPath(exported.artifact!.uri), 'utf8'))).toMatchObject({ format: 'zerowall-he-analysis', runner: 'zerowall-he/7.0.0-1' })
  await writeFile(path, Buffer.concat([await readFile(path), Buffer.from([1])]))
  await expect(service.execute(project, { sessionId: 's', action: 'analyze', viewerId: viewer.id, expectedVersion: exported.viewer!.version, region: { x: 0, y: 0, width: 2, height: 2 } })).rejects.toThrow('changed')
})
