import { Context } from '@deepseek-ai/cordis'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { MediaStudioService } from '../src/media-studio.js'

const roots:string[]=[]
afterEach(async()=>{await Promise.all(roots.splice(0).map(p=>rm(p,{recursive:true,force:true})))})
async function fixture(){
 const cwd=await mkdtemp(join(tmpdir(),'media-project-'));roots.push(cwd)
 const ctx=new Context(),fs={processPathFromHostPath:(p:string)=>p},policy={resolve:()=>({mode:'workspace-write'})}
 const resolve=vi.fn(async(id:string)=>({session:{header:{cwd}},ctx:{get:(key:string)=>key==='fs'?fs:policy}}))
 ctx.provide('typert',{lookups:new Map([['agent',{resolve}]])} as never)
 ctx.provide('zerowallMediaJobs',{list:async()=>[]} as never)
 const service=new MediaStudioService(ctx)
 const call=async(sessionId:string,action:string,input:any={})=>JSON.parse(await service.call(sessionId,action,JSON.stringify(input)))
 return {cwd,ctx,service,call}
}
it('keeps session-owned projects, assets and outputs through edits, and rejects stale or cross-session writes',async()=>{
 const f=await fixture(),p=await f.call('session-a','create',{projectId:'promo'})
 expect(p.sessionId).toBe('session-a')
 await expect(f.call('session-b','create',{projectId:'promo'})).rejects.toThrow('OWNER_MISMATCH')
 const changed={...p,title:'Updated',assets:[{path:'forged'}],outputs:[{path:'forged'}]}
 const result=await f.call('session-a','save',{projectId:'promo',project:changed})
 expect(result.assets).toEqual([]);expect(result.outputs).toEqual([]);expect(result.revision).toBe(2)
 await expect(f.call('session-a','save',{projectId:'promo',project:p})).rejects.toThrow('STALE')
 expect((await f.call('session-b','list')).projects).toEqual([])
 expect(JSON.parse(await readFile(join(f.cwd,'media-projects/promo/project.json'),'utf8')).title).toBe('Updated')
 await f.ctx.fiber.dispose()
})
it('serializes imports and prevents cross-session, wrong-offset, oversized or outside-project references',async()=>{
 const f=await fixture(),upload=await f.call('session-a','import-start',{projectId:'promo',name:'fixture.png'})
 await expect(f.call('session-b','import-chunk',{projectId:'promo',id:upload.id,offset:0,base64:'YWJj'})).rejects.toThrow('IMPORT_OWNER')
 await f.call('session-a','import-chunk',{projectId:'promo',id:upload.id,offset:0,base64:'YWJj'})
 await expect(f.call('session-a','import-chunk',{projectId:'promo',id:upload.id,offset:0,base64:'YWJj'})).rejects.toThrow('IMPORT_OFFSET')
 await expect(f.call('session-a','import-start',{projectId:'promo',name:'../fixture.png'})).rejects.toThrow('IMPORT_FORMAT')
 ctxMedia(f.ctx)
 await expect(f.call('session-a','prepare',{projectId:'promo',kind:'video',prompt:'test',reference_paths:['../fixture.png']})).rejects.toThrow('REFERENCE_OUTSIDE_PROJECT')
 await f.ctx.fiber.dispose()
})
function ctxMedia(ctx:Context){ctx.provide('zerowallEnvironment',{readMediaModelSelections:async()=>({}),readImageModelSelection:async()=>undefined} as never)}

it('does not invalidate edits when assets or outputs advance, but rejects another scheme edit',async()=>{
 const f=await fixture(),original=await f.call('s','create',{projectId:'promo'})
 const file=join(f.cwd,'media-projects/promo/project.json')
 await writeFile(file,JSON.stringify({...original,revision:original.revision+2,outputs:[{id:'old-output',path:'media-projects/promo/outputs/old.mp4'}]}))
 const saved=await f.call('s','save',{projectId:'promo',project:{...original,title:'new scheme'}})
 expect(saved.editRevision).toBe(2);expect(saved.revision).toBe(4);expect(saved.outputs).toHaveLength(1)
 await expect(f.call('s','save',{projectId:'promo',project:{...original,title:'stale concurrent scheme'}})).rejects.toThrow('STALE')
 await f.ctx.fiber.dispose()
})

it('records running/completed compositions and restores an identical render call without recomposing',async()=>{
 const f=await fixture(),project=await f.call('s','create',{projectId:'promo'})
 let complete:(value:any)=>void=()=>{}
 const render=vi.spyOn(f.service as any,'renderProject').mockImplementation(()=>new Promise(resolve=>{complete=resolve}))
 const input={projectId:'promo',revision:project.revision,editRevision:project.editRevision,requestId:'same-render-call'}
 const first=f.call('s','compose',input),second=f.call('s','compose',input)
 await vi.waitFor(async()=>expect((await f.call('s','list')).compositions[0]?.state).toBe('running'))
 const asset={id:'result',path:'media-projects/promo/outputs/result.mp4',mediaType:'video/mp4',bytes:100,sha256:'hash'}
 complete(asset);expect(await first).toEqual(asset);expect(await second).toEqual(asset)
 expect((await f.call('s','list')).compositions[0]).toMatchObject({state:'completed',assets:[asset]})
 expect(await f.call('s','compose',input)).toEqual(asset);expect(render).toHaveBeenCalledOnce()
 await f.ctx.fiber.dispose()
})

it('records a failed local render and retains a readable failure card',async()=>{
 const f=await fixture(),project=await f.call('s','create',{projectId:'promo'})
 vi.spyOn(f.service as any,'renderProject').mockRejectedValue(new Error('Missing fixture encoder'))
 await expect(f.call('s','compose',{projectId:'promo',editRevision:project.editRevision,requestId:'failed-render-call'})).rejects.toThrow('fixture encoder')
 expect((await f.call('s','list')).compositions[0]).toMatchObject({state:'failed',error:'Missing fixture encoder'})
 await f.ctx.fiber.dispose()
})
