import { afterEach, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
const fixture=vi.hoisted(()=>({worker:vi.fn()}))
vi.mock('../src/host/reconstruction-worker.js',()=>({runReconstructionWorker:fixture.worker,disposeReconstructionWorkers:vi.fn()}))
vi.mock('../../python/src/shared/runtime-path.js',()=>({resolveFixedPythonRuntime:async()=>({executable:'python',sitePackages:'fixture'})}))
vi.mock('../../python/src/shared/runtime-process.js',()=>({spawnWithRuntimeLease:()=>{const child:any=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=vi.fn();setTimeout(()=>child.emit('close',0),0);return child}}))
import { installReconstructionWorkflow } from '../src/host/presentation-reconstruction.js'
import { hash } from '../src/host/visual-assets.js'
const roots:string[]=[]
afterEach(async()=>{fixture.worker.mockReset();await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})))})
async function make(render:()=>Promise<any>){
  const root=await mkdtemp(join(tmpdir(),'ppt-reconstruction-life-'));roots.push(root)
  await mkdir(join(root,'deck'));await writeFile(join(root,'source.png'),'original')
  await writeFile(join(root,'spec.json'),JSON.stringify({width:960,height:540,fonts:{},palette:{},slides:[{}]}))
  const state:any={dir:'deck',spec:'spec.json',reconstruction:{jobs:{},representativePages:[1]},phase:'planned'}
  const snapshots:any[]=[{page:1,id:'pages/01.page',fingerprint:'input',data:{elements:[]}}]
  const handlers=new Map<string,any>();let changes=0,dispose=()=>{}
  const ctx:any={tools:{register:(definition:any)=>handlers.set(definition.name,definition)},effect:(fn:any)=>{dispose=fn()}}
  const dispatch=vi.fn(async(_exec:any,name:string,args:any)=>{
    if(name==='ppt_edit'){changes++;snapshots[0]={...snapshots[0],fingerprint:`applied-${changes}`,data:args.ops.at(-1).patch};return {ok:true}}
    if(name==='ppt_render')return render()
    throw new Error(name)
  })
  fixture.worker.mockImplementation(async(file:string)=>{
    const request=JSON.parse(await readFile(file,'utf8'));await mkdir(request.outputDir,{recursive:true})
    if(request.comparison){await writeFile(join(request.outputDir,'comparison.json'),JSON.stringify({comparisonKind:'final-pptx-render',ssim:.99,nativeTextMae:2,textEdgeP95:1,glyphEdgeP95:1,nativeTextGeometryCoverage:1,sourceSha256:hash(Buffer.from('original')),renderSha256:'a'.repeat(64)}));return}
    const receipt={schemaVersion:1,width:960,height:540,files:{},source:{sha256:hash(Buffer.from('original'))},elements:[{elementId:'title',elementType:'text',bounds:[10,10,200,50],content:{text:'Editable'}}],quality:{nativeTexts:1,rasterTexts:0,contentVerified:false,inventoryVerified:false},warnings:[]}
    await writeFile(join(request.outputDir,'receipt.json'),JSON.stringify(receipt))
  })
  installReconstructionWorkflow(ctx,{cwd:()=>root,bound:async()=>state,currentBinding:async()=>state,persist:async()=>{},project:async()=>({snapshots,manifest:{revision:changes}}),dispatch,sync:async()=>{}})
  const invoke=async(name:string,args:any)=>JSON.parse(await handlers.get(name).execute(args,{}))
  return {state,root,invoke,snapshots,dispatch,dispose:()=>dispose()}
}
it('keeps processing while a real renderer is pending and completes with separate quality review',async()=>{
  let release!:(value:any)=>void
  const pending=new Promise(resolve=>{release=resolve}),f=await make(()=>pending)
  await f.invoke('presentation_reconstruct_pages',{pages:[1],source_pptx:'source.png'})
  await vi.waitFor(()=>expect(f.state.reconstruction.jobs[1].phase).toBe('rendering'))
  expect(f.state.reconstruction.jobs[1].status).toBe('processing')
  const png=join(f.root,'render.png');await writeFile(png,'actual renderer output');release({images:[{page:1,path:png}],textProbes:[{page:1,path:png,colors:[]}]})
  await vi.waitFor(()=>expect(f.state.reconstruction.jobs[1].status).toBe('complete'))
  const job=f.state.reconstruction.jobs[1]
  expect(job.qualityStatus).toBe('review');expect(job.quality.finalRender.comparisonKind).toBe('final-pptx-render')
  expect(job.evidenceFingerprint).toBe(f.snapshots[0].fingerprint)
  await expect(f.invoke('presentation_confirm_reconstruction',{confirmed:true,observations:'Reviewed actual PNG and noted remaining edit boundaries.'})).rejects.toThrow('acceptance')
  await f.invoke('presentation_confirm_reconstruction',{confirmed:true,accept_limitations:true,observations:'Reviewed actual PNG and noted remaining edit boundaries.'})
  expect(f.state.reconstruction.approval.acceptedLimitations).toBe(true)
  f.dispose()
})
it('records render failure rather than reporting successful completion',async()=>{
  const f=await make(async()=>{throw new Error('renderer unavailable')})
  await f.invoke('presentation_reconstruct_pages',{pages:[1],source_pptx:'source.png'})
  await vi.waitFor(()=>expect(f.state.reconstruction.jobs[1].status).toBe('failed'))
  expect(f.state.reconstruction.jobs[1].error).toContain('renderer unavailable')
  expect(f.state.reconstruction.jobs[1].evidenceFingerprint).toBeUndefined();f.dispose()
})
it('persists user-selected concurrency and reuses it when the next request omits it',async()=>{
  const f=await make(async()=>{throw new Error('fixture-renderer')})
  const result=await f.invoke('presentation_reconstruct_pages',{pages:[1],source_pptx:'source.png',concurrency:5})
  expect(result.concurrency).toBe(5)
  await vi.waitFor(()=>expect(f.state.reconstruction.jobs[1].status).toBe('failed'))
  expect(f.state.reconstruction.concurrency).toBe(5)
  expect(f.state.reconstruction.jobs[1].concurrency).toBe(5)
  const resumed=await f.invoke('presentation_reconstruct_pages',{pages:[1],source_pptx:'source.png'})
  expect(resumed.concurrency).toBe(5)
  await vi.waitFor(()=>expect(f.state.reconstruction.jobs[1].status).toBe('failed'))
  f.dispose()
})
it('rejects late render evidence after the user changes the page',async()=>{
  let release!:(value:any)=>void
  const pending=new Promise(resolve=>{release=resolve}),f=await make(()=>pending)
  await f.invoke('presentation_reconstruct_pages',{pages:[1],source_pptx:'source.png'})
  await vi.waitFor(()=>expect(f.state.reconstruction.jobs[1].phase).toBe('rendering'))
  f.snapshots[0].fingerprint='user-edited'
  const png=join(f.root,'render.png');await writeFile(png,'render');release({images:[{page:1,path:png}],textProbes:[{page:1,path:png,colors:[]}]})
  await vi.waitFor(()=>expect(f.state.reconstruction.jobs[1].status).toBe('failed'))
  expect(f.state.reconstruction.jobs[1].error).toContain('stale');expect(f.snapshots[0].fingerprint).toBe('user-edited');f.dispose()
})
