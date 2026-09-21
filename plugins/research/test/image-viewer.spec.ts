import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import sharp from 'sharp'
import { afterEach, expect, it } from 'vitest'
import { ResearchStore } from '../../../store/src/index.js'
import { ImageViewerService, omePageForPosition, omePagePosition } from '../src/host/image-viewer.js'
import { NativeEngineService } from '../src/host/native-engines.js'

const cleanup: Array<() => Promise<void>> = []
afterEach(async () => { for (const dispose of cleanup.splice(0).reverse()) await dispose() })
it('maps OME pages according to the declared fastest-to-slowest axis order', () => {
  expect(omePagePosition({ order: 'XYZCT', sizes: { Z: 2, C: 3, T: 4 } }, 0)).toEqual({ page: 0, z: 0, c: 0, t: 0 })
  expect(omePagePosition({ order: 'XYZCT', sizes: { Z: 2, C: 3, T: 4 } }, 11)).toEqual({ page: 11, z: 1, c: 2, t: 1 })
  expect(omePagePosition({ order: 'XYCZT', sizes: { C: 2, Z: 3, T: 2 } }, 5)).toEqual({ page: 5, c: 1, z: 2, t: 0 })
  expect(omePageForPosition({ order: 'XYZCT', sizes: { Z: 2, C: 3, T: 4 } }, { z: 1, c: 2, t: 1 })).toBe(11)
  expect(omePageForPosition({ order: 'XYCZT', sizes: { C: 2, Z: 3, T: 2 } }, { c: 1, z: 2, t: 0 })).toBe(5)
  expect(() => omePageForPosition({ order: 'XYZCT', sizes: { Z: 2, C: 3, T: 4 } }, { z: 2 })).toThrow('outside its declared range')
})
it('handles single-page OME images and rejects invalid pages or dimensions', () => {
  expect(omePagePosition({ order: 'XY', sizes: { X: 32, Y: 16 } }, 0)).toEqual({ page: 0 })
  expect(() => omePagePosition({ order: 'XY', sizes: { X: 32, Y: 16 } }, 1)).toThrow('outside the 1-page axis range')
  expect(() => omePagePosition({ order: 'XYZCT', sizes: { Z: 0, C: 1, T: 1 } }, 0)).toThrow('axis Z has an invalid size')
  expect(() => omePagePosition({ order: 'XYZCT', sizes: { Z: 2, C: 1, T: 1 } }, -1)).toThrow('non-negative integer')
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'image-viewer-')); const projectRoot = join(root,'project'); await mkdir(projectRoot)
  const store = new ResearchStore(join(root,'store.sqlite')); const service = new ImageViewerService(store)
  cleanup.push(async () => { store.close(); await rm(root,{recursive:true,force:true}) })
  const project = store.createProject({name:'Images',rootPath:projectRoot})
  const path = join(projectRoot,'image.png')
  await sharp({create:{width:2000,height:1000,channels:3,background:'#555'}}).greyscale().png().toFile(path)
  const asset = store.createDataAsset({projectId:project.id,name:'Image',uri:pathToFileURL(path).href,location:'local',mediaType:'image/png'})
  const execute = (input: any) => service.execute(project,{sessionId:'s1',...input})
  const opened = await execute({action:'image_open',assetId:asset.id})
  const viewerId = opened.viewer!.id
  const annotation = {expectedRevisionId:null,payload:{coordinates:opened.image!.coordinates,rois:[{id:'r1',name:'8x8 region',kind:'rectangle',page:0,x:10,y:20,width:8,height:8}]}}
  return {root,store,project,path,asset,execute,opened,viewerId,annotation,service}
}
it('previews without changing original coordinates and persists page/zoom/pan separately from ROIs',async()=>{
  const {store,project,execute,opened,viewerId,annotation}=await fixture()
  expect(opened.image).toMatchObject({coordinates:{width:2000,height:1000,pages:1,calibration:null},previewWidth:1200,previewHeight:600})
  const preview = await sharp(Buffer.from(opened.image!.pngBase64,'base64')).metadata()
  expect(preview.width).toBe(1200)
  const saved = await execute({action:'image_save',viewerId,expectedVersion:1,imageState:{page:0,zoom:2,panX:10,panY:5}})
  expect(saved.viewer).toMatchObject({version:2,state:{zoom:2,panX:10}})
  await expect(execute({action:'annotation_save',viewerId,expectedVersion:1,annotation})).rejects.toThrow('revision conflict')
  const rois = await execute({action:'annotation_save',viewerId,expectedVersion:2,annotation})
  expect(rois.annotationHead!.payload.rois[0]).toMatchObject({x:10,y:20,width:8,height:8})
  expect((await execute({action:'image_read',viewerId})).annotationHead!.id).toBe(rois.annotationHead!.id)
  expect(store.listResearchStudies(project.id)).toEqual([])
})
it('round-trips an exchange and preserves a stale native return as a conflict branch',async()=>{
  const {store,project,execute,asset,viewerId,annotation}=await fixture()
  const first = await execute({action:'annotation_save',viewerId,expectedVersion:1,annotation})
  const exported = await execute({action:'annotation_export',viewerId,expectedVersion:1})
  const document = JSON.parse(await readFile(fileURLToPath(exported.artifact!.uri),'utf8'))
  expect(document).toMatchObject({format:'zerowall-image-annotations',assetId:asset.id,baseRevisionId:first.annotationHead!.id,payload:annotation.payload})
  await execute({action:'annotation_save',viewerId,expectedVersion:1,annotation:{expectedRevisionId:first.annotationHead!.id,payload:{...annotation.payload,rois:[]}}})
  const importPath=join(project.rootPath,'returned.json')
  await writeFile(importPath,JSON.stringify({...document,origin:'napari'}))
  const imported=store.createDataAsset({projectId:project.id,name:'Returned',uri:pathToFileURL(importPath).href,location:'local',mediaType:'application/json'})
  const result=await execute({action:'annotation_import',viewerId,expectedVersion:1,importAssetId:imported.id})
  expect(result.annotationSave).toMatchObject({conflict:true,revision:{status:'conflict',origin:'napari'},head:{payload:{rois:[]}}})
  expect(store.listArtifacts(project.id)[0]!.metadata.needsReview).toBe(true)
  await writeFile(importPath,JSON.stringify({...document,sourceSha256:'0'.repeat(64)}))
  await expect(execute({action:'annotation_import',viewerId,expectedVersion:1,importAssetId:imported.id})).rejects.toThrow('source hash')
  expect(store.listAnnotationRevisions(project.id)).toHaveLength(3)
})
it('rejects changed source bytes, foreign viewers, junction escapes and incorrect geometry',async()=>{
  const {root,store,project,path,execute,asset,viewerId,annotation,service}=await fixture()
  const foreign=store.createProject({name:'Other',rootPath:root})
  await expect(service.execute(foreign,{sessionId:'other',action:'image_read',viewerId})).rejects.toThrow('active project')
  await expect(execute({action:'annotation_save',viewerId,expectedVersion:1,annotation:{...annotation,payload:{...annotation.payload,coordinates:{...annotation.payload.coordinates,width:100}}}})).rejects.toThrow('dimensions')
  await symlink(root,join(project.rootPath,'escape'),process.platform==='win32'?'junction':'dir')
  await sharp({create:{width:8,height:8,channels:3,background:'white'}}).png().toFile(join(root,'outside.png'))
  const escaped=store.createDataAsset({...asset,uri:pathToFileURL(join(project.rootPath,'escape','outside.png')).href})
  await expect(execute({action:'image_open',assetId:escaped.id})).rejects.toThrow('outside')
  await sharp({create:{width:100,height:100,channels:3,background:'white'}}).png().toFile(path)
  await expect(execute({action:'image_read',viewerId})).rejects.toThrow('Source file changed')
})
it('reads TIFF through the actual decoder and keeps orientation/physical calibration explicit',async()=>{
  const {project,store,execute}=await fixture()
  const path=join(project.rootPath,'synthetic.tif')
  await sharp({create:{width:40,height:20,channels:3,background:'#ff0000'}}).tiff().toFile(path)
  const asset=store.createDataAsset({projectId:project.id,name:'TIFF',uri:pathToFileURL(path).href,location:'local',mediaType:'image/tiff'})
  const opened=await execute({action:'image_open',assetId:asset.id})
  expect(opened.image).toMatchObject({format:'tiff',coordinates:{width:40,height:20,calibration:null}})
  await expect(execute({action:'image_save',viewerId:opened.viewer!.id,expectedVersion:1,imageState:{page:1,zoom:1,panX:0,panY:0}})).rejects.toThrow('Invalid image page')
})
it('collects a bound native return once, preserving stale edits and rejecting substituted exchanges',async()=>{
  const {store,project,asset,viewerId,annotation,opened}=await fixture()
  const engines=new NativeEngineService(store);cleanup.push(async()=>engines.dispose())
  const service=new ImageViewerService(store,engines)
  const execute=(input:any)=>service.execute(project,{sessionId:'s1',viewerId,expectedVersion:1,...input})
  const first=await execute({action:'annotation_save',annotation})
  const returnPath=join(project.rootPath,'native-return.json')
  const document={format:'zerowall-image-annotations',version:1,projectId:project.id,assetId:asset.id,sourceSha256:opened.image!.sourceSha256,baseRevisionId:first.annotationHead!.id,bridgeId:'native-1',origin:'fiji',payload:annotation.payload}
  store.recordAuditEvent(project.id,'science-engine.lifecycle',{launchId:'native-1',id:'fiji',projectId:project.id,sessionId:'s1',lifecycleRevision:1,started:true,status:'exited',guiReady:'unverified',path:'fiji',assetId:asset.id,createdAt:new Date().toISOString(),message:'test',annotationBridge:{viewerId,baseRevisionId:first.annotationHead!.id,sourceSha256:opened.image!.sourceSha256,returnPath,adapterSha256:'d'.repeat(64)}})
  await expect(execute({action:'annotation_collect',launchId:'unknown'})).rejects.toThrow('associated')
  await expect(execute({action:'annotation_collect',launchId:'native-1'})).rejects.toThrow('ENOENT')
  await execute({action:'annotation_save',annotation:{...annotation,expectedRevisionId:first.annotationHead!.id,payload:{...annotation.payload,rois:[]}}})
  await writeFile(returnPath,JSON.stringify({...document,bridgeId:'other'}))
  await expect(execute({action:'annotation_collect',launchId:'native-1'})).rejects.toThrow('immutable exchange')
  await writeFile(returnPath,JSON.stringify(document))
  const collected=await execute({action:'annotation_collect',launchId:'native-1'})
  expect(collected.annotationSave).toMatchObject({conflict:true,revision:{origin:'fiji',status:'conflict'},head:{payload:{rois:[]}}})
  const replay=await execute({action:'annotation_collect',launchId:'native-1'})
  expect(replay.annotationSave!.revision.id).toBe(collected.annotationSave!.revision.id)
  expect(store.listArtifacts(project.id)).toHaveLength(1)
  await writeFile(returnPath,JSON.stringify({...document,payload:{...document.payload,rois:[]}}))
  await expect(execute({action:'annotation_collect',launchId:'native-1'})).rejects.toThrow('different content')
  expect(store.listAnnotationRevisions(project.id)).toHaveLength(3)
})
