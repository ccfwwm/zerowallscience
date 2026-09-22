import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { EventEmitter } from 'node:events'
import * as childProcess from 'node:child_process'
import { expect, it, vi } from 'vitest'
import { ResearchStore } from '../../../store/src/index.js'
import { HeSegmentationService } from '../src/host/he-segmentation.js'
import { validateHeSegmentationParameters } from '../src/shared/he-segmentation.js'

vi.mock('../src/host/he-stardist-model.js', () => ({ HE_STARDIST_MODEL: { files: [], sha256: 'a'.repeat(64) } }))
vi.mock('node:child_process', () => ({ spawn: vi.fn() }))

it('bounds StarDist CPU parameters and preserves the official model threshold', () => {
 expect(validateHeSegmentationParameters()).toMatchObject({tileSize:512,halo:128,probabilityThreshold:0.6924782541382084,nmsThreshold:0.3,threads:4})
 for(const input of [{tileSize:1},{halo:20},{threads:9},{probabilityThreshold:NaN},{nmsThreshold:1}])expect(()=>validateHeSegmentationParameters(input as any)).toThrow()
})

it('persists missing engine failures idempotently, rejects wrong projects and does not pretend lost runs resume', async () => {
 const root=await mkdtemp(join(tmpdir(),'he-segment-'));const store=new ResearchStore(join(root,'store.sqlite'));const service=new HeSegmentationService(store,{pythonPath:join(root,'missing.exe')})
 try {
  const project=store.createProject({name:'A',rootPath:root});const foreign=store.createProject({name:'B',rootPath:join(root,'b')});const path=join(root,'source.tif');const bytes=Buffer.from('bounded fixture');await writeFile(path,bytes);const sha256=createHash('sha256').update(bytes).digest('hex')
  const asset=store.createDataAsset({projectId:project.id,name:'source',uri:pathToFileURL(path).href,location:'local',mediaType:'image/tiff',checksum:sha256,checksumAlgorithm:'sha256'})
  const viewer=store.createViewerSession({projectId:project.id,assetId:asset.id,tool:'image',state:{heTool:'he',heRegion:{x:0,y:0,width:128,height:128,page:0}}})
  const input={path,sha256,asset,viewer,he:{width:128,height:128,pages:1,format:'tiff',engine:'openslide' as const,levels:[{level:0,width:128,height:128,downsample:1}],calibration:null,bounds:{x:0,y:0,width:128,height:128,source:'full-slide'},notes:[]}}
  const request={sessionId:'s',action:'segment' as const,requestId:'stable'};const first=await service.submit(project,request,input)
  expect(first.run).toMatchObject({status:'failed',error:expect.stringContaining('not installed')})
  expect((await service.submit(project,request,input)).run?.id).toBe(first.run?.id)
  await expect(service.submit(project,{...request,segmentation:{probabilityThreshold:.7}},input)).rejects.toThrow('IDEMPOTENCY_CONFLICT')
  await expect(service.status(foreign,first.run!.id)).rejects.toThrow('active project')
  const lost=store.createRun({projectId:project.id,name:'lost',command:'he.stardist.v1',workingDirectory:root,status:'running',leaseOwner:'he-segmentation',timeoutAt:new Date(Date.now()-1).toISOString()})
  expect((await service.status(project,lost.id)).run).toMatchObject({status:'failed',error:expect.stringContaining('no automatic rerun')})
  expect(store.listArtifacts(project.id)).toEqual([])
 }finally{service.dispose();store.close();await rm(root,{recursive:true,force:true})}
})

it('refuses a forged completion manifest without registering partial outputs', async () => {
 const root=await mkdtemp(join(tmpdir(),'he-manifest-'));const store=new ResearchStore(join(root,'store.sqlite'));const service=new HeSegmentationService(store)
 try {
  const project=store.createProject({name:'A',rootPath:root});const run=store.reserveScientificRun({projectId:project.id,name:'restore',command:'he.stardist.v1',workingDirectory:root,status:'running',leaseOwner:'he-segmentation'},'restore','a'.repeat(64)).run
  const directory=join(root,'.zerowall','he-segmentation',run.id);await mkdir(directory,{recursive:true});await writeFile(join(directory,'request.json'),JSON.stringify({runId:run.id,fingerprint:'a'.repeat(64)}));await writeFile(join(directory,'completion.json'),JSON.stringify({status:'succeeded',requestSha256:'b'.repeat(64),files:[]}))
  expect((await service.status(project,run.id)).run).toMatchObject({status:'failed',error:expect.stringContaining('does not match')});expect(store.listArtifacts(project.id)).toEqual([])
 }finally{service.dispose();store.close();await rm(root,{recursive:true,force:true})}
})

it('marks an owned child that exits without a manifest failed immediately, retaining logs', async () => {
 const root=await mkdtemp(join(tmpdir(),'he-exit-'));const store=new ResearchStore(join(root,'store.sqlite'));const pythonPath=join(root,'engine.exe');await writeFile(pythonPath,'mock executable')
 const service=new HeSegmentationService(store,{pythonPath});const child=Object.assign(new EventEmitter(),{pid:123,kill:vi.fn()});const spawn=vi.mocked(childProcess.spawn).mockReturnValue(child as any)
 try {
  const project=store.createProject({name:'A',rootPath:root});const path=join(root,'source.tif');const bytes=Buffer.from('fixture');await writeFile(path,bytes);const sha256=createHash('sha256').update(bytes).digest('hex')
  const asset=store.createDataAsset({projectId:project.id,name:'source',uri:pathToFileURL(path).href,location:'local',mediaType:'image/tiff'});const viewer=store.createViewerSession({projectId:project.id,assetId:asset.id,tool:'image',state:{heTool:'he',heRegion:{x:0,y:0,width:128,height:128,page:0}}})
  const input={path,sha256,asset,viewer,he:{width:128,height:128,pages:1,format:'tiff',engine:'openslide' as const,levels:[{level:0,width:128,height:128,downsample:1}],calibration:null,bounds:{x:0,y:0,width:128,height:128,source:'full-slide'},notes:[]}}
  const submitted=await service.submit(project,{sessionId:'s',action:'segment',requestId:'exit-1'},input);expect(submitted.run?.status).toBe('running')
  child.emit('close',17,null)
  await vi.waitFor(()=>expect(store.getRun(submitted.run!.id)).toMatchObject({status:'failed',error:expect.stringContaining('exited (17) without a valid completion manifest')}))
  expect(store.listArtifacts(project.id)).toEqual([])
 }finally{service.dispose();spawn.mockRestore();store.close();await rm(root,{recursive:true,force:true})}
})
