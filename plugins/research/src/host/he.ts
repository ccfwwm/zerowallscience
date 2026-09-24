import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import sharp from 'sharp'
import type { ResearchStore } from '@zerowallscience/research-store'
import type { DataAssetRecord, ProjectRecord, ViewerSessionRecord } from '@zerowallscience/research-store/types'
import { analyzeHeRgb, validateHeTileRegion, type HeAnalysis, type HeRegion, type HeSlideMetadata, type HeTile } from '../shared/he.js'
import type { HeRequest, HeResponse } from '../shared/types.js'
import { containedFile } from './science-viewer.js'
import { HE_READER } from './he-reader.js'
import { HeSegmentationService } from './he-segmentation.js'
import { pythonChildEnvironment } from './python-env.js'

const RUNNER = 'zerowall-he/7.0.0-2'
const MAX_BYTES = 20 * 1024 ** 3
const FALLBACK_PIXELS = 16_000_000
type Input = { path: string; fingerprint: string; sha256: string; he: HeSlideMetadata }

export function hePythonPath(): string {
  return process.env.ZEROWALL_HE_PYTHON?.trim() || join(process.env.LOCALAPPDATA || process.env.HOME || '', 'ZeroWallScience', 'science-engines', 'he-7.0.0', 'venv', ...(process.platform === 'win32' ? ['Scripts','python.exe'] : ['bin','python']))
}
async function fingerprint(path: string): Promise<{ value: string; size: number }> {
  const info = await stat(path)
  if (!info.isFile() || info.size < 1 || info.size > MAX_BYTES) throw new Error('HE input must be a regular local file no larger than 20 GiB.')
  return { value: JSON.stringify([info.size,info.mtimeMs,info.ctimeMs,info.ino]), size: info.size }
}
async function hashFile(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path,{ highWaterMark:1024*1024 })) hash.update(chunk)
  return hash.digest('hex')
}

export class HeService {
  private readonly metadata = new Map<string, HeSlideMetadata>()
  private activeNative = 0
  private readonly segmentation: HeSegmentationService
  constructor(private readonly store: ResearchStore, private readonly options: { pythonPath?: string; timeoutMs?: number; stardistPythonPath?: string; stardistModelDirectory?: string } = {}) {
    this.segmentation = new HeSegmentationService(store, { ...(options.stardistPythonPath ? { pythonPath: options.stardistPythonPath } : {}), ...(options.stardistModelDirectory ? { modelDirectory: options.stardistModelDirectory } : {}) })
  }
  dispose(): void { this.segmentation.dispose() }

  async execute(project: ProjectRecord, request: HeRequest): Promise<HeResponse> {
    if (request.action === 'status') return this.segmentation.status(project, request.runId ?? '')
    if (request.action === 'cancel') return this.segmentation.cancel(project, request.runId ?? '')
    if (request.action === 'segment') {
      const viewer = this.store.listViewerSessions(project.id).find(item => item.id === request.viewerId && item.tool === 'image' && item.state.heTool === 'he')
      if (!viewer || viewer.version !== request.expectedVersion) throw new Error('HE segmentation viewer or revision mismatch; reload the view.')
      const asset = this.asset(project.id, viewer.assetId); const input = await this.input(project, asset, viewer)
      const response = await this.segmentation.submit(project, { ...request, action: 'segment' }, { ...input, asset, viewer })
      if (response.run && this.store.listViewerSessions(project.id).find(item => item.id === viewer.id)?.version === viewer.version) {
        const updated = this.store.updateViewerSession(project.id, viewer.id, { expectedVersion: viewer.version, state: { ...viewer.state, heSegmentationRunId: response.run.id } })
        return { ...response, viewer: updated }
      }
      return response
    }
    if (!['open','read','analyze','export'].includes(request.action)) throw new Error('Unsupported HE action.')
    if (request.action === 'open') {
      const asset = this.asset(project.id,request.assetId); const input = await this.input(project,asset)
      const level = input.he.levels.at(-1)!
      const region = validateHeTileRegion(request.region ?? { x:0,y:0,width:Math.min(input.he.width,Math.floor(1024*level.downsample)),height:Math.min(input.he.height,Math.floor(1024*level.downsample)),page:level.level },input.he)
      const tile = await this.tile(input,region)
      const viewer = this.store.createViewerSession({ projectId:project.id,assetId:asset.id,tool:'image',state:{ heTool:'he',sourceSha256:input.sha256,sourceFingerprint:input.fingerprint,heRegion:region,page:region.page } })
      return { viewer,he:input.he,tile }
    }
    const viewer = this.store.listViewerSessions(project.id).find(item => item.id === request.viewerId && item.tool === 'image' && item.state.heTool === 'he')
    if (!viewer) throw new Error('HE viewer is not in the active project.')
    if (request.expectedVersion !== viewer.version) throw new Error('HE viewer revision conflict: current '+viewer.version+'.')
    const asset = this.asset(project.id,viewer.assetId); const input = await this.input(project,asset,viewer)
    const region = validateHeTileRegion(request.region ?? viewer.state.heRegion ?? { x:0,y:0,width:Math.min(input.he.width,1024),height:Math.min(input.he.height,1024),page:0 },input.he)
    const tile = await this.tile(input,region)
    let analysis: HeAnalysis | undefined
    if (request.action !== 'read') {
      const decoded = await sharp(Buffer.from(tile.pngBase64,'base64'),{ limitInputPixels:4_194_304 }).removeAlpha().raw().toBuffer({ resolveWithObject:true })
      analysis = { ...analyzeHeRgb(decoded.data,decoded.info.width,decoded.info.height,region),pyramidLevel:region.page,downsample:tile.downsample,calibration:input.he.calibration }
      analysis.notes.push('Statistics use pyramid level '+region.page+' at downsample '+tile.downsample+'; component counts depend on resolution.')
      analysis.notes.push('ROI dimensions use level-0 coordinates; decoded coverage rounds up by less than one level pixel at right/bottom edges.')
      if (input.he.calibration) {
        const { x,y } = input.he.calibration
        analysis.physical = { roiWidthUm:region.width*x,roiHeightUm:region.height*y,roiAreaUm2:region.width*x*region.height*y,samplePixelSizeUm:{ x:x*tile.downsample,y:y*tile.downsample } }
      }
    }
    const updated = this.store.updateViewerSession(project.id,viewer.id,{ expectedVersion:viewer.version,state:{ ...viewer.state,sourceFingerprint:input.fingerprint,heRegion:region,page:region.page } })
    if (request.action !== 'export') return { viewer:updated,he:input.he,tile,...(analysis ? { analysis } : {}) }
    const root = await realpath(project.rootPath)
    const basePath = join(root,'.zerowall'); await mkdir(basePath,{ recursive:true })
    const base = await containedFile(root,basePath)
    const exportPath = join(base,'science-exports'); await mkdir(exportPath,{ recursive:true })
    const directory = join(await containedFile(root,exportPath),randomUUID()); await mkdir(directory)
    const png = Buffer.from(tile.pngBase64,'base64')
    const result = JSON.stringify({ ...analysis,runner:RUNNER,sourceAssetId:asset.id,sourceSha256:input.sha256,viewerId:viewer.id,viewerVersion:updated.version,slide:input.he,
      tile:{ ...tile,pngBase64:undefined,path:'roi.png',sha256:createHash('sha256').update(png).digest('hex') } },null,2)+'\n'
    const resultPath = join(directory,'result.json')
    try {
      await writeFile(join(directory,'roi.png'),png,{ flag:'wx' }); await writeFile(resultPath,result,{ flag:'wx' })
      const artifact = this.store.createArtifact({ projectId:project.id,name:'HE ROI analysis',uri:pathToFileURL(resultPath).href,mediaType:'application/json',checksum:createHash('sha256').update(result).digest('hex'),metadata:{ runner:RUNNER,sourceAssetId:asset.id,sourceSha256:input.sha256,viewerId:viewer.id,viewerVersion:updated.version,region,engine:input.he.engine,tileUri:pathToFileURL(join(directory,'roi.png')).href,needsReview:true } })
      return { viewer:updated,he:input.he,tile,analysis:analysis!,artifact }
    } catch (error) { await rm(directory,{ recursive:true,force:true }); throw error }
  }
  private asset(projectId: string, id?: string): DataAssetRecord {
    const asset = this.store.listDataAssets(projectId).find(item => item.id === id)
    if (!asset) throw new Error('HE asset is not in the active project.')
    return asset
  }
  private async input(project: ProjectRecord, asset: DataAssetRecord, viewer?: ViewerSessionRecord): Promise<Input> {
    if (asset.location !== 'local' || !asset.uri.startsWith('file:')) throw new Error('Materialize remote HE slides before viewing.')
    const path = await containedFile(project.rootPath,fileURLToPath(asset.uri))
    if (!/\.(svs|ndpi|tif|tiff)$/iu.test(path)) throw new Error('HE viewer accepts SVS, NDPI and TIFF files.')
    const info = await fingerprint(path)
    if (viewer?.state.sourceFingerprint && viewer.state.sourceFingerprint !== info.value) throw new Error('HE source changed; reopen the slide.')
    const sha256 = viewer?.state.sourceFingerprint && typeof viewer.state.sourceSha256 === 'string' ? viewer.state.sourceSha256 : await hashFile(path)
    if (viewer && sha256 !== viewer.state.sourceSha256) throw new Error('HE source changed; reopen the slide.')
    const key = path+'\0'+info.value
    let he = this.metadata.get(key)
    if (!he) {
      try { he = (await this.native({ operation:'inspect',path })).he }
      catch (error) { he = await this.fallback(path,info.size,error instanceof Error ? error.message : String(error)) }
      if (this.metadata.size >= 32) this.metadata.delete(this.metadata.keys().next().value!)
      this.metadata.set(key,he)
    }
    if ((await fingerprint(path)).value !== info.value) throw new Error('HE source changed during inspection; reopen the slide.')
    return { path,fingerprint:info.value,sha256,he }
  }
  private async fallback(path: string, size: number, reason: string): Promise<HeSlideMetadata> {
    if (!/\.tiff?$/iu.test(path) || size > 64*1024**2) throw new Error('HE OpenSlide engine unavailable or cannot open this slide: '+reason+'. Configure ZEROWALL_HE_PYTHON or install the managed HE engine.')
    const metadata = await sharp(path,{ page:0,pages:1,limitInputPixels:FALLBACK_PIXELS,failOn:'error' }).metadata()
    const width = metadata.width ?? 0; const height = metadata.pageHeight ?? metadata.height ?? 0
    if (!width || !height || (metadata.pages ?? 1) !== 1 || width*height > FALLBACK_PIXELS) throw new Error('Pyramidal/large HE TIFF requires OpenSlide; the small single-TIFF fallback cannot read it.')
    return { width,height,pages:1,format:metadata.format ?? 'tiff',engine:'sharp-single-tiff',levels:[{ level:0,width,height,downsample:1 }],calibration:null,bounds:{ x:0,y:0,width,height,source:'full-slide' },notes:['OpenSlide unavailable: '+reason+'.','Bounded compatibility mode: single-page TIFF up to 64 MiB / 16 million pixels; physical calibration is unknown.','This fallback does not claim SVS/NDPI or pyramid support.'] }
  }
  private async tile(input: Input, region: Required<HeRegion>): Promise<HeTile> {
    let tile: HeTile
    if (input.he.engine === 'openslide') {
      const response = await this.native({ operation:'tile',path:input.path,region })
      if (!response.tile) throw new Error('OpenSlide returned no tile.')
      tile = response.tile
    } else {
      const png = await sharp(input.path,{ limitInputPixels:FALLBACK_PIXELS,failOn:'error' }).extract({ left:region.x,top:region.y,width:region.width,height:region.height }).png().toBuffer()
      tile = { region,width:region.width,height:region.height,downsample:1,coverageLevel0:{ width:region.width,height:region.height },pngBase64:png.toString('base64') }
    }
    if ((await fingerprint(input.path)).value !== input.fingerprint) throw new Error('HE source changed during tile reading; reopen the slide.')
    return tile
  }
  private async native(request: object): Promise<{ he: HeSlideMetadata; tile?: HeTile }> {
    const executable = this.options.pythonPath ?? hePythonPath()
    if (!(await stat(executable).catch(() => undefined))?.isFile()) throw new Error('Managed OpenSlide Python is not installed')
    if (this.activeNative >= 2) throw new Error('OpenSlide is busy: at most two tile readers can run concurrently.')
    this.activeNative++
    try { return await new Promise<{ he: HeSlideMetadata; tile?: HeTile }>((resolve,reject) => {
      const child = spawn(executable,['-E','-P','-c',HE_READER],{ stdio:['pipe','pipe','pipe'],windowsHide:true,env:pythonChildEnvironment() })
      let stdout = ''; let stderr = ''; let stopped = false
      const fail = (error: Error) => { if (stopped) return; stopped = true; clearTimeout(timer); child.kill(); reject(error) }
      const timer = setTimeout(() => fail(new Error('OpenSlide tile process timed out.')),this.options.timeoutMs ?? 30000)
      child.on('error',fail)
      child.stdout.on('data',(chunk: Buffer) => { stdout += chunk.toString('utf8'); if (Buffer.byteLength(stdout)>24*1024**2) fail(new Error('OpenSlide tile response exceeded transport bound.')) })
      child.stderr.on('data',(chunk: Buffer) => { stderr = (stderr+chunk.toString('utf8')).slice(-16000) })
      child.stdin.on('error',fail)
      child.on('close',code => {
        if (stopped) return; stopped = true; clearTimeout(timer)
        try {
          const result = JSON.parse(stdout) as { he:HeSlideMetadata;tile?:HeTile;error?:string }
          if (code !== 0 || result.error || !result.he) throw new Error(result.error || stderr || 'OpenSlide exited '+code)
          resolve(result)
        } catch (error) { reject(new Error('OpenSlide: '+(error instanceof Error ? error.message : String(error))+(stderr ? '\n'+stderr : ''))) }
      })
      child.stdin.end(JSON.stringify(request))
    }) } finally { this.activeNative-- }
  }
}
