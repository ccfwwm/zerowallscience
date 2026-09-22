import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { existsSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import sharp from 'sharp'
import { afterEach, expect, it } from 'vitest'
import { ResearchStore } from '../../../store/src/index.js'
import { HeService, hePythonPath } from '../src/host/he.js'
import { analyzeHeRgb, validateHeRegion, validateHeTileRegion } from '../src/shared/he.js'

const cleanup: Array<() => Promise<void>> = []
afterEach(async () => { for (const dispose of cleanup.splice(0).reverse()) await dispose() })

it('validates bounded regions and reports deterministic RGB/nuclei-like metrics', () => {
  expect(() => validateHeRegion({ x: 0, y: 0, width: 11, height: 5 }, 10, 10, 1)).toThrow('outside')
  const region = validateHeRegion({ x: 0, y: 0, width: 2, height: 1 }, 2, 1, 1)
  const result = analyzeHeRgb(new Uint8Array([20, 20, 100, 240, 220, 220]), 2, 1, region)
  expect(result.meanRgb).toEqual({ r: 130, g: 120, b: 160 }); expect(result.nucleiLikePixels).toBe(1); expect(result.nucleiCount).toBe(1); expect(result.nucleiAreas).toEqual([1])
})

it('retains explicit small single-TIFF compatibility and exports ROI provenance', async () => {
  const root = await mkdtemp(join(tmpdir(), 'he-service-')); const projectRoot = join(root, 'project'); await mkdir(projectRoot); const store = new ResearchStore(join(root, 'store.sqlite')); const service = new HeService(store, { pythonPath: join(root, 'missing-python.exe') }); cleanup.push(async () => { store.close(); await rm(root, { recursive: true, force: true }) })
  const project = store.createProject({ name: 'HE', rootPath: projectRoot }); const path = join(projectRoot, 'slide.tif'); await sharp({ create: { width: 32, height: 24, channels: 3, background: { r: 80, g: 60, b: 120 } } }).tiff().toFile(path); const asset = store.createDataAsset({ projectId: project.id, name: 'slide.tif', uri: pathToFileURL(path).href, location: 'local', mediaType: 'image/tiff' })
  const opened = await service.execute(project, { sessionId: 's', action: 'open', assetId: asset.id }); expect(opened.he).toMatchObject({ width: 32, height: 24, format: 'tiff' }); const viewer = opened.viewer!
  const exported = await service.execute(project, { sessionId: 's', action: 'export', viewerId: viewer.id, expectedVersion: viewer.version, region: { x: 2, y: 3, width: 10, height: 8, page: 0 } }); expect(exported.analysis?.region).toMatchObject({ x: 2, y: 3, width: 10, height: 8 }); expect(JSON.parse(await readFile(fileURLToPath(exported.artifact!.uri), 'utf8'))).toMatchObject({ format: 'zerowall-he-analysis', runner: 'zerowall-he/7.0.0-2' })
  expect(opened.he?.engine).toBe('sharp-single-tiff'); expect(opened.he?.calibration).toBeNull()
  await writeFile(path, Buffer.concat([await readFile(path), Buffer.from([1])]))
  await expect(service.execute(project, { sessionId: 's', action: 'analyze', viewerId: viewer.id, expectedVersion: exported.viewer!.version, region: { x: 0, y: 0, width: 2, height: 2 } })).rejects.toThrow('changed')
})

it.runIf(existsSync(hePythonPath()))('reads actual OpenSlide pyramid tiles, calibration, restored view and exported PNG/ROI', async () => {
  const root = await mkdtemp(join(tmpdir(), 'he-pyramid-')); const store = new ResearchStore(join(root, 'store.sqlite')); const service = new HeService(store)
  cleanup.push(async () => { store.close(); await rm(root, { recursive:true, force:true }) })
  const project = store.createProject({ name:'pyramid', rootPath:root }); const path = join(root,'pyramid.tif')
  await promisify(execFile)(hePythonPath(),[fileURLToPath(new URL('../../../tools/science/create-he-reference.py',import.meta.url)),path])
  const asset = store.createDataAsset({ projectId:project.id,name:'pyramid',uri:pathToFileURL(path).href,location:'local',mediaType:'image/tiff' })
  const opened = await service.execute(project,{ sessionId:'s',action:'open',assetId:asset.id })
  expect(opened.he).toMatchObject({ engine:'openslide',width:512,height:384,pages:3,calibration:{ x:.25,y:.5,unit:'um' },bounds:{ x:0,y:0,width:512,height:384 } })
  expect(opened.he!.levels.map(level => level.downsample)).toEqual([1,2,4])
  expect(opened.tile).toMatchObject({ width:128,height:96,region:{ page:2 } })
  const viewer = opened.viewer!
  const region = { x:128,y:64,width:128,height:64,page:1 }
  const read = await service.execute(project,{ sessionId:'s',action:'read',viewerId:viewer.id,expectedVersion:viewer.version,region })
  expect(read.tile).toMatchObject({ width:64,height:32,region,downsample:2 })
  const rgb = await sharp(Buffer.from(read.tile!.pngBase64,'base64')).raw().toBuffer()
  expect([...rgb.subarray(0,3)]).toEqual([80,60,120])
  const resumed = await new HeService(store).execute(project,{ sessionId:'s',action:'read',viewerId:viewer.id,expectedVersion:read.viewer!.version })
  expect(resumed.tile?.region).toEqual(region)
  await expect(service.execute(project,{ sessionId:'s',action:'read',viewerId:viewer.id,expectedVersion:viewer.version,region })).rejects.toThrow('revision conflict')
  expect(() => validateHeTileRegion({ ...region,x:500 },opened.he!)).toThrow('outside')
  expect(() => validateHeTileRegion({ ...region,page:3 },opened.he!)).toThrow('outside')
  const exported = await service.execute(project,{ sessionId:'s',action:'export',viewerId:viewer.id,expectedVersion:resumed.viewer!.version,region })
  expect(exported.analysis).toMatchObject({ meanRgb:{ r:80,g:60,b:120 },pixels:2048,pyramidLevel:1,downsample:2,physical:{ roiWidthUm:32,roiHeightUm:32,roiAreaUm2:1024,samplePixelSizeUm:{ x:.5,y:1 } } })
  const record = JSON.parse(await readFile(fileURLToPath(exported.artifact!.uri),'utf8'))
  expect(record.sourceSha256).toMatch(/^[a-f0-9]{64}$/u)
  expect(record.tile.sha256).toMatch(/^[a-f0-9]{64}$/u)
  expect(record.tile.pngBase64).toBeUndefined()
  expect(exported.artifact?.metadata.needsReview).toBe(true)
  const missing = new HeService(store,{ pythonPath:join(root,'missing.exe') })
  await expect(missing.execute(project,{ sessionId:'s',action:'open',assetId:asset.id })).rejects.toThrow('requires OpenSlide')
},30000)
