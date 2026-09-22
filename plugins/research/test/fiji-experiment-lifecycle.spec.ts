import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'
import { ResearchStore } from '../../../store/src/index.js'
import { FijiExperimentService } from '../src/host/fiji-experiments.js'

it('retains completed measurements across retries and marks expired lost ownership honestly', async () => {
 const root=await mkdtemp(join(tmpdir(),'fiji-lifecycle-'));const store=new ResearchStore(join(root,'store.sqlite'));const service=new FijiExperimentService(store)
 try {
  const project=store.createProject({name:'A',rootPath:join(root,'a')});await mkdir(project.rootPath)
  const request={sessionId:'s1',action:'analyze' as const,experiment:'scratch-wound' as const,requestId:'measurements-1',measurements:[{sampleId:'s1',time:'24h',initialArea:100,remainingArea:40}]}
  const first=await service.execute(project,request);expect(first.run?.status).toBe('succeeded')
  expect((await new FijiExperimentService(store).execute(project,request)).run?.id).toBe(first.run?.id)
  expect((await service.status(project,first.run!.id)).result?.measurements).toEqual(first.result?.measurements)
  const interrupted=store.createRun({projectId:project.id,name:'Interrupted',command:'fiji.scratch-wound.v2',workingDirectory:project.rootPath,leaseOwner:'fiji-experiment',status:'running',timeoutAt:new Date(Date.now()-1000).toISOString()})
  expect((await service.status(project,interrupted.id)).run).toMatchObject({status:'failed',error:expect.stringContaining('No automatic rerun')})
  const foreign=store.createProject({name:'B',rootPath:join(root,'b')});await expect(service.status(foreign,first.run!.id)).rejects.toThrow('does not belong')
 }finally{service.dispose();store.close();await rm(root,{recursive:true,force:true})}
})

it('cancels only its owned native process and returns the persisted cancelled state', async () => {
 const root=await mkdtemp(join(tmpdir(),'fiji-cancel-'));const store=new ResearchStore(join(root,'store.sqlite'));const service=new FijiExperimentService(store)
 try {
  const project=store.createProject({name:'A',rootPath:root});const path=join(root,'source.pgm');await writeFile(path,Buffer.concat([Buffer.from('P5\n20 20\n255\n'),Buffer.alloc(400)]))
  const asset=store.createDataAsset({projectId:project.id,name:'source',uri:pathToFileURL(path).href,location:'local',mediaType:'image/x-portable-graymap'})
  const pending=service.execute(project,{sessionId:'s1',action:'analyze',experiment:'scratch-wound',requestId:'cancel-1',sourceAssetId:asset.id,image:{kind:'scratch-wound',sampleId:'s1',time:'24h',initialArea:100,threshold:128,polarity:'bright',roi:{x:0,y:0,width:20,height:20}}})
  await new Promise(resolve=>setTimeout(resolve,1000));const run=store.listRuns(project.id)[0]!
  expect((await service.cancel(project,run.id)).run?.status).toBe('cancelled')
  expect((await pending).run?.status).toBe('cancelled');expect(store.listArtifacts(project.id)).toHaveLength(0)
  expect((await service.status(project,run.id)).run?.status).toBe('cancelled')
 }finally{service.dispose();store.close();await rm(root,{recursive:true,force:true})}
},60000)
