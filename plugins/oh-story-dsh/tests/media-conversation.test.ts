import { Context } from '@deepseek-ai/cordis'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { MediaStudioService, defaultMediaProjectId } from '../src/media-studio.js'
import { MediaJobLedger } from '../../../plugins/ai-cloud/src/host/media-jobs.js'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(p => rm(p, {recursive:true,force:true}))) })
async function fixture(saved: any = {}) {
  const cwd = await mkdtemp(join(tmpdir(), 'media-dialog-')); roots.push(cwd)
  const ctx = new Context()
  const model = {groupId:'99',modelId:'chosen',profileId:'p',operations:['video','chat_music'],duration:{},stale:false,qualities:[]}
  const media = {catalog:vi.fn(async()=>({models:[model],status:'succeeded'})), estimate:vi.fn(async()=>({currency:'USD',total:'0.01'})), submit:vi.fn(async(input:any)=>({requestId:input.requestId,status:'queued',artifacts:[]}))}
  let choices = saved
  const environment = {readMediaModelSelections:async()=>structuredClone(choices),readImageModelSelection:async()=>undefined,getImageQuality:()=> 'medium',setMediaModelSelections:vi.fn(async next=>{choices=next})}
  ctx.provide('typert',{lookups:new Map([['agent',{resolve:async()=>({session:{header:{cwd},snapshotEvents:()=>[]},ctx:{get:(key:string)=>key==='fs'?{processPathFromHostPath:(path:string)=>path}:{resolve:()=>({mode:'workspace-write'})}}})}]])} as never)
  ctx.provide('zerowallEnvironment',environment as never);ctx.provide('zerowallMedia',media as never)
  const ledger = new MediaJobLedger(media as any,async()=> 'account',join(cwd,'ledger'),{autoCollect:false})
  ctx.provide('zerowallMediaJobs',ledger as never)
  const studio = new MediaStudioService(ctx)
  return {cwd,ctx,media,environment,ledger,studio,model}
}
it('rejects ordinary image generation at direct and workspace entry points before any paid request',async()=>{
  const f=await fixture(),input={kind:'image',prompt:'生成一张测试图片'}
  try{
    await expect(f.studio.generate('s1',input)).rejects.toThrow('MEDIA_IMAGE_ROUTE_DISABLED')
    for(const action of ['prepare','generate'])await expect(f.studio.call('s1',action,JSON.stringify(input))).rejects.toThrow('MEDIA_IMAGE_ROUTE_DISABLED')
    expect(f.media.catalog).not.toHaveBeenCalled();expect(f.media.estimate).not.toHaveBeenCalled();expect(f.media.submit).not.toHaveBeenCalled()
  }finally{await f.ctx.fiber.dispose()}
})
it('keeps legacy image jobs readable but rejects editing or resubmitting them through old entry points',async()=>{
  const f=await fixture(),projectId=defaultMediaProjectId('s1')
  try{
    const job=await f.ledger.prepare({sessionId:'s1',cwd:f.cwd,projectId},{kind:'image',prompt:'历史图片',selection:{groupId:'99',modelId:'chosen',profileId:'p',operation:'image'}})
    const reviewed=vi.spyOn(f.ledger,'submitReviewed')
    await expect(f.studio.generate('s1',{projectId,id:job.id})).rejects.toThrow('MEDIA_IMAGE_ROUTE_DISABLED')
    await expect(f.studio.call('s1','prepare',JSON.stringify({projectId,id:job.id,kind:'video',prompt:'changed'}))).rejects.toThrow('MEDIA_IMAGE_ROUTE_DISABLED')
    await expect(f.studio.call('s1','submit',JSON.stringify({projectId,reviews:[{id:job.id,revision:job.revision,authorization:'unused'}]}))).rejects.toThrow('MEDIA_IMAGE_ROUTE_DISABLED')
    const history=JSON.parse(await f.studio.call('s1','list',JSON.stringify({projectId})))
    expect(history.jobs).toContainEqual(job);expect(reviewed).not.toHaveBeenCalled();expect(f.media.submit).not.toHaveBeenCalled()
  }finally{await f.ctx.fiber.dispose()}
})
it('exposes only video and music models in the multimedia catalog',async()=>{
  const f=await fixture(),image={...f.model,modelId:'image-only',operations:['image','image_edit']}
  try{
    f.media.catalog.mockResolvedValueOnce({models:[image,f.model],status:'succeeded'})
    const catalog=JSON.parse(await f.studio.call('s1','catalog','{}'))
    expect(catalog.models).toEqual([f.model])
  }finally{await f.ctx.fiber.dispose()}
})
it.each(['video','music'])('creates a %s project and chooses first model only when unconfigured; duplicate direct requests submit once',async(kind)=>{
  const f=await fixture()
  const input={id:'chat-repeat-0001',kind,prompt:kind==='video'?'生成一段宣传视频':'生成一段背景音乐'}
  const results=await Promise.all([f.studio.generate('s1',input),f.studio.generate('s1',input)])
  await new Promise(r=>setTimeout(r,25))
  expect(f.media.submit).toHaveBeenCalledOnce();expect(results[0]?.requestId).toBe(results[1]?.requestId)
  expect(f.environment.setMediaModelSelections).toHaveBeenCalledOnce()
  const p=JSON.parse(await readFile(join(f.cwd,'media-projects',defaultMediaProjectId('s1'),'project.json'),'utf8'))
  expect(p.sessionId).toBe('s1');await f.ctx.fiber.dispose()
})
it('preserves explicit saved model parameters and refuses to replace an invalid saved model',async()=>{
  const saved={video:{selection:{groupId:'99',modelId:'chosen',profileId:'p',operation:'video'},parameters:{quality:'high'}}}
  const f=await fixture(saved)
  await f.studio.generate('s1',{id:'chat-chosen-0001',kind:'video',prompt:'test'})
  await new Promise(r=>setTimeout(r,25));expect(f.media.submit.mock.calls[0]?.[0].parameters).toEqual({quality:'high'})
  expect(f.environment.setMediaModelSelections).not.toHaveBeenCalled()
  await f.ctx.fiber.dispose()
  const g=await fixture({video:{selection:{...saved.video.selection,modelId:'retired'},parameters:{quality:'high'}}})
  g.media.estimate.mockRejectedValueOnce(new Error('MEDIA_SELECTION_INVALID'))
  await expect(g.studio.generate('s1',{id:'chat-retired-0001',kind:'video',prompt:'test'})).rejects.toThrow('SELECTION_INVALID')
  expect(g.media.submit).not.toHaveBeenCalled();expect(g.environment.setMediaModelSelections).not.toHaveBeenCalled();await g.ctx.fiber.dispose()
})
it('retains image references while changing a video draft and submitting through the conversation', async () => {
  const f = await fixture()
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
  await writeFile(join(f.cwd, 'fixture.png'), png)
  vi.spyOn(f.studio as any, 'probe').mockResolvedValue({ streams: [{codec_type:'video',codec_name:'png'}], format:{format_name:'png_pipe'} })
  const asset = await f.studio.importSource('s1', {path:'fixture.png'})
  const projectId = defaultMediaProjectId('s1')
  const first = JSON.parse(await f.studio.call('s1', 'prepare', JSON.stringify({projectId,kind:'video',prompt:'用参考图生成视频',selection:{groupId:'99',modelId:'chosen',profileId:'p',operation:'video'},reference_paths:[asset.path]})))
  const changed = JSON.parse(await f.studio.call('s1', 'prepare', JSON.stringify({projectId,id:first.id,kind:'video',prompt:'保留参考图，调整镜头'})))
  expect(changed.selection.operation).toBe('video'); expect(changed.references).toHaveLength(1)
  await f.studio.generate('s1', {projectId,id:first.id,kind:'video',prompt:changed.prompt})
  await new Promise(r=>setTimeout(r,25))
  expect(f.media.submit.mock.calls[0]?.[0]).toMatchObject({operation:'video',references:[{base64:png.toString('base64')}]})
  await f.ctx.fiber.dispose()
})

it('uses a capability duration default for a saved video model without overwriting its parameters', async () => {
  const f = await fixture({video:{selection:{groupId:'99',modelId:'chosen',profileId:'p',operation:'video'},parameters:{aspect_ratio:'16:9'}}})
  Object.assign(f.model, {operations:['video'],duration:{required:true,mode:'enum',values:[4,8],default:8}})
  await f.studio.generate('s1', {id:'chat-video-default',kind:'video',prompt:'短视频'})
  await new Promise(r=>setTimeout(r,25))
  expect(f.media.submit.mock.calls[0]?.[0].parameters).toEqual({aspect_ratio:'16:9',duration:8})
  expect(f.environment.setMediaModelSelections).not.toHaveBeenCalled()
  await f.ctx.fiber.dispose()
})

it('imports dialogue file paths with actual type validation and rejects out-of-workspace or foreign attachments',async()=>{
  const f=await fixture();await writeFile(join(f.cwd,'fixture.wav'),'fixture')
  vi.spyOn(f.studio as any,'probe').mockResolvedValue({streams:[{codec_type:'audio',codec_name:'pcm_s16le'}],format:{format_name:'wav',duration:'1'}})
  const asset=await f.studio.importSource('s1',{path:'fixture.wav'})
  expect(asset.mediaType).toBe('audio/wav');expect(asset.sessionId).toBe('s1');expect(asset.duration).toBe(1)
  await expect(f.studio.importSource('s1',{path:'../fixture.wav'})).rejects.toThrow('OUTSIDE_WORKSPACE')
  await expect(f.studio.importSource('s1',{attachmentId:'foreign'})).rejects.toThrow('NOT_IN_SESSION')
  await f.ctx.fiber.dispose()
})
