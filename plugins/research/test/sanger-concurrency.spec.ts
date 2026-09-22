import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ResearchStore } from '../../../store/src/index.js'
import { SangerService } from '../src/host/sanger.js'
import { reviewBidirectionalSanger } from '../src/shared/sanger.js'
const exportGate=vi.hoisted(()=>({block:false,entered:undefined as (()=>void)|undefined,release:undefined as Promise<void>|undefined}))
vi.mock('node:fs/promises',async(importOriginal)=>{const actual=await importOriginal<typeof import('node:fs/promises')>();return {...actual,writeFile:async(...args:Parameters<typeof actual.writeFile>)=>{if(exportGate.block&&String(args[0]).endsWith('result.json')){exportGate.entered?.();await exportGate.release}return actual.writeFile(...args)}}})
const cleanup:(()=>Promise<void>)[]=[];afterEach(async()=>{exportGate.block=false;for(const fn of cleanup.splice(0).reverse())await fn()})
function scf(sequence:string):Buffer{const b=Buffer.alloc(128+16+24);b.write('.scf');b.writeUInt32BE(4,4);b.writeUInt32BE(128,8);b.writeUInt32BE(2,12);b.writeUInt32BE(144,24);b.write('3.00',36);b.writeUInt32BE(1,40);b.writeUInt32BE(1,144);b.writeUInt32BE(2,148);b.fill(255,152,160);b.write(sequence,160);return b}
async function setup(){const root=await mkdtemp(join(tmpdir(),'sanger-audit-'));const store=new ResearchStore(join(root,'store.sqlite'));const project=store.createProject({name:'Audit',rootPath:root});const service=new SangerService(store);cleanup.push(async()=>{store.close();await rm(root,{recursive:true,force:true})});const open=async(name:string,sequence:string)=>{const path=join(root,name+'.scf');await writeFile(path,scf(sequence));const asset=store.createDataAsset({projectId:project.id,name,uri:pathToFileURL(path).href,location:'local',mediaType:'application/octet-stream'});return service.execute(project,{sessionId:'s',action:'open',assetId:asset.id})};return{root,store,project,service,open}}

it('rejects an export if a manual revision commits before artifact registration',async()=>{
 const {store,project,service,open}=await setup();const view=(await open('forward','AC')).viewer!
 let release!:()=>void;let entered!:()=>void;const ready=new Promise<void>(r=>entered=r);exportGate.release=new Promise<void>(r=>release=r);exportGate.entered=entered;exportGate.block=true
 const pending=service.execute(project,{sessionId:'s',action:'export',viewerId:view.id,expectedVersion:view.version,threshold:0});await ready
 const current=store.listViewerSessions(project.id).find(v=>v.id===view.id)!
 const revision=await service.execute(project,{sessionId:'s',action:'revise',viewerId:view.id,expectedVersion:current.version,edits:[{position:1,from:'A',to:'G',reason:'actual concurrent manual revision'}]})
 release();await expect(pending).rejects.toThrow(/revision|changed|conflict/i);exportGate.block=false
 expect(revision.trace!.bases[0].base).toBe('G');expect(store.listArtifacts(project.id)).toHaveLength(0)
})

it('rejects bidirectional review if either view changes during source reads',async()=>{
 const {store,project,service,open}=await setup();const f=(await open('forward','AC')).viewer!,r=(await open('reverse','GT')).viewer!
 const otherService=new SangerService(store);const original=(service as any).read.bind(service);let release!:()=>void;let entered!:()=>void;const ready=new Promise<void>(resolve=>entered=resolve);const gate=new Promise<void>(resolve=>release=resolve)
 vi.spyOn(service as any,'read').mockImplementation(async(p:any,a:any)=>{const input=await original(p,a);if(a.id===r.assetId){entered();await gate}return input})
 const pending=service.execute(project,{sessionId:'s',action:'review',viewerId:f.id,reverseViewerId:r.id,expectedVersion:f.version,expectedReverseVersion:r.version,threshold:0,window:1});await ready
 await otherService.execute(project,{sessionId:'s',action:'revise',viewerId:r.id,expectedVersion:r.version,edits:[{position:1,from:'G',to:'A',reason:'Changed reverse peak call'}]})
 release();await expect(pending).rejects.toThrow(/revision|changed|conflict/i);expect(store.listViewerSessions(project.id).find(v=>v.id===r.id)!.version).toBe(2)
})

it('treats compatible IUPAC ambiguity as insufficient and disjoint calls as discordant',()=>{
 const analysis=(sequence:string)=>({trim:{sequence,threshold:0,window:1,start:1,end:sequence.length,qualities:[]},notes:[]})
 const result=reviewBidirectionalSanger(analysis('AR'),analysis('TT'))
 expect(result.reverseComplement).toBe('AA');expect(result.status).toBe('insufficient');expect(result.disagreements).toEqual([])
 expect(reviewBidirectionalSanger(analysis('AR'),analysis('GT')).status).toBe('discordant')
})

it('invalidates evidence-of-evidence and claims recursively through legal documentId links',async()=>{
 const {store,project,open}=await setup();const v=(await open('forward','AC')).viewer!
 const artifact=store.createArtifact({projectId:project.id,name:'result',uri:'file:///placeholder.json',mediaType:'application/json',metadata:{viewerId:v.id}})
 const study=store.createResearchStudy({projectId:project.id,title:'Audit'});const first=store.createResearchDocument({projectId:project.id,studyId:study.id,kind:'evidence',payload:{artifactId:artifact.id,needsReview:false}})
 const second=store.createResearchDocument({projectId:project.id,studyId:study.id,kind:'evidence',payload:{documentId:first.id,needsReview:false}})
 const claim=store.createResearchDocument({projectId:project.id,studyId:study.id,kind:'claim',payload:{evidenceIds:[second.id],needsReview:false}})
 store.updateViewerSession(project.id,v.id,{expectedVersion:v.version,state:v.state,invalidateOutputs:true})
 expect(store.getResearchDocument(first.id)!.payload.needsReview).toBe(true)
 expect(store.getResearchDocument(second.id)!.payload.needsReview).toBe(true);expect(store.getResearchDocument(claim.id)!.payload.needsReview).toBe(true)
})
