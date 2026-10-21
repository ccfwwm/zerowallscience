import { Context } from '@deepseek-ai/cordis'
import { mkdir, mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { MediaStudioService, defaultMediaProjectId } from '../src/media-studio.js'
import { MediaJobLedger } from '../../../plugins/ai-cloud/src/host/media-jobs.js'

const roots: string[] = []
const ledgers: MediaJobLedger[] = []
afterEach(async () => {
  await Promise.all(ledgers.splice(0).map(ledger => ledger.dispose()))
  await Promise.all(roots.splice(0).map(p => rm(p, {recursive:true,force:true})))
})
async function fixture(saved: any = {}) {
  const cwd = await mkdtemp(join(tmpdir(), 'media-dialog-')); roots.push(cwd)
  const ctx = new Context()
  const model = {groupId:'99',modelId:'chosen',profileId:'p',operations:['video','chat_music'],duration:{},stale:false,qualities:[]}
  const media = {catalog:vi.fn(async()=>({models:[model],status:'succeeded'})), estimate:vi.fn(async()=>({currency:'USD',total:'0.01'})), submit:vi.fn(async(input:any)=>({requestId:input.requestId,status:'queued',artifacts:[]}))}
  let choices = saved
  const environment = {readMediaModelSelections:async()=>structuredClone(choices),readImageModelSelection:async()=>undefined,getImageQuality:()=> 'medium',setMediaModelSelections:vi.fn(async next=>{choices=next})}
  ctx.provide('typert',{lookups:new Map([['agent',{resolve:async()=>({session:{header:{cwd},snapshotEvents:()=>[]},ctx:{get:(key:string)=>key==='fs'?{processPathFromHostPath:(path:string)=>path}:{resolve:()=>({mode:'workspace-write'})}}})}]])} as never)
  ctx.provide('zerowallEnvironment',environment as never);ctx.provide('zerowallMedia',media as never)
  const ledger = new MediaJobLedger(media as any,async()=> 'account',join(cwd,'ledger'),{autoCollect:false});ledgers.push(ledger)
  ctx.provide('zerowallMediaJobs',ledger as never)
  const studio = new MediaStudioService(ctx)
  return {cwd,ctx,media,environment,ledger,studio,model}
}

it('persists a manifest through failed estimates, restart and new-call retries, and requires explicit clearing',async()=>{
  const f=await fixture(),projectId=defaultMediaProjectId('s1')
  const refs=[{url:'https://zerowall.chengxunkeji.cn/webfiles/zerowallsciencevideo.mp4',media_type:'video/mp4',role:'reference'},...['zerowall-icon.png','01-medical-research-workspace.png','02-singlecell-virtual-knockout.png','03-genetics-brand-finale.png'].map(name=>({url:'https://zerowall.chengxunkeji.cn/webfiles/'+name,media_type:'image/png',role:'reference',weight:0.5}))]
  await writeFile(join(f.cwd,'references.json'),JSON.stringify(refs))
  f.media.estimate.mockRejectedValueOnce(new Error('upstream rejects optional field'))
  try {
    const failed=await f.studio.generate('s1',{kind:'video',prompt:'animate with all materials',references_file:'references.json',parameters:{duration:5}})
    expect(failed.state).toBe('validation-failed');expect(failed.references).toHaveLength(5);expect(f.media.submit).not.toHaveBeenCalled()
    await expect(f.studio.generate('s1',{kind:'video',prompt:'retry',references_json:'[]'})).rejects.toThrow('CLEAR_REQUIRED')
    const mismatch=await f.studio.generate('s1',{kind:'video',prompt:'retry with missing video',parameters:{images:refs.slice(1)}})
    expect(mismatch).toMatchObject({state:'validation-failed',error:expect.stringContaining('INTENT_MISMATCH')})
    const restartContext=new Context()
    for(const key of ['typert','zerowallEnvironment','zerowallMedia'])restartContext.provide(key,f.ctx.get(key) as never)
    const restartedLedger=new MediaJobLedger(f.media as any,async()=> 'account',join(f.cwd,'ledger'),{autoCollect:false});ledgers.push(restartedLedger)
    restartContext.provide('zerowallMediaJobs',restartedLedger as never)
    const restarted=new MediaStudioService(restartContext)
    const retried=await restarted.generate('s1',{id:failed.id,kind:'video',prompt:'retry',parameters:{duration:5}})
    await vi.waitFor(()=>expect(f.media.submit).toHaveBeenCalledOnce())
    expect(retried.id).toBe(failed.id)
    const estimatedRequest=f.media.estimate.mock.calls.at(-1)?.[0]
    const submittedRequest=f.media.submit.mock.calls[0]![0]
    expect(estimatedRequest?.references).toHaveLength(5)
    expect(estimatedRequest?.references.map((ref:any)=>ref.url)).toEqual(refs.map(ref=>ref.url))
    expect(estimatedRequest?.references[1]).toMatchObject({role:'reference',properties:{weight:0.5}})
    expect(submittedRequest.references).toEqual(estimatedRequest?.references)
    expect(submittedRequest.parameters).toEqual(estimatedRequest?.parameters)
    const draft=JSON.parse(await restarted.call('s1','prepare',JSON.stringify({projectId,kind:'video',prompt:'new draft'})))
    await restarted.call('s1','prepare',JSON.stringify({projectId,id:draft.id,kind:'video',prompt:'explicit text-only',clearReferences:true}))
    expect(JSON.parse(await readFile(join(f.cwd,`media-projects/${projectId}/reference-intent.json`),'utf8')).references).toEqual([])
    expect(retried.references).toHaveLength(5)
    await expect(restarted.call('s1','prepare',JSON.stringify({projectId,kind:'video',prompt:'bad',references_file:'../outside.json'}))).rejects.toThrow('OUTSIDE_WORKSPACE')
    const conflict=JSON.parse(await restarted.call('s1','prepare',JSON.stringify({projectId,kind:'video',prompt:'bad',references_file:'references.json',references_json:'[]'})))
    expect(conflict).toMatchObject({state:'validation-failed',error:'MEDIA_REFERENCE_INPUT_CONFLICT'})
    await restartContext.fiber.dispose()
  }finally{await f.ctx.fiber.dispose()}
})
it('persists local reference validation failures and retries corrected material with the same id after restart',async()=>{
  const f=await fixture(),projectId=defaultMediaProjectId('s1'),assetRoot=join(f.cwd,'media-projects',projectId,'assets')
  const unsupported='media-projects/'+projectId+'/assets/reference.txt',corrected='media-projects/'+projectId+'/assets/reference.png'
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64')
  await mkdir(assetRoot,{recursive:true});await writeFile(join(assetRoot,'reference.txt'),'not media');await writeFile(join(assetRoot,'reference.png'),png)
  vi.spyOn(f.studio as any,'probe').mockResolvedValue({streams:[{codec_type:'video',codec_name:'png'}],format:{format_name:'png_pipe'}})
  const id='chat-reference-validation-0001'
  let restartContext:Context|undefined
  try{
    const failed=await f.studio.generate('s1',{id,kind:'video',prompt:'用参考素材生成视频',reference_paths:[unsupported]})
    expect(failed).toMatchObject({id,state:'validation-failed',error:'MEDIA_REFERENCE_TYPE_UNSUPPORTED'})
    expect(f.media.estimate).not.toHaveBeenCalled();expect(f.media.submit).not.toHaveBeenCalled()
    expect(await f.ledger.preparationInput({sessionId:'s1',cwd:f.cwd,projectId},id)).toEqual({reference_paths:[unsupported]})

    restartContext=new Context()
    for(const key of ['typert','zerowallEnvironment','zerowallMedia'])restartContext.provide(key,f.ctx.get(key) as never)
    const restartedLedger=new MediaJobLedger(f.media as any,async()=> 'account',join(f.cwd,'ledger'),{autoCollect:false});ledgers.push(restartedLedger)
    restartContext.provide('zerowallMediaJobs',restartedLedger as never)
    const restarted=new MediaStudioService(restartContext)
    vi.spyOn(restarted as any,'probe').mockResolvedValue({streams:[{codec_type:'video',codec_name:'png'}],format:{format_name:'png_pipe'}})
    const recovered=await restarted.generate('s1',{id,kind:'video',prompt:'用参考素材生成视频',parameters:{duration:5}})
    expect(recovered).toMatchObject({id,state:'validation-failed',error:'MEDIA_REFERENCE_TYPE_UNSUPPORTED'})
    expect(f.media.estimate).not.toHaveBeenCalled();expect(f.media.submit).not.toHaveBeenCalled()

    const retried=await restarted.generate('s1',{id,kind:'video',prompt:'用参考素材生成视频',reference_paths:[corrected],parameters:{duration:5}})
    await vi.waitFor(()=>expect(f.media.submit).toHaveBeenCalledOnce())
    expect(retried.id).toBe(id)
    expect(f.media.submit.mock.calls[0]![0]).toMatchObject({parameters:{duration:5},references:[{mediaType:'image/png',base64:png.toString('base64')}]})
  }finally{await restartContext?.fiber.dispose();await f.ctx.fiber.dispose()}
})
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
  expect(await g.studio.generate('s1',{id:'chat-retired-0001',kind:'video',prompt:'test'})).toMatchObject({id:'chat-retired-0001',state:'validation-failed',error:'MEDIA_SELECTION_INVALID'})
  expect(g.media.submit).not.toHaveBeenCalled();expect(g.environment.setMediaModelSelections).not.toHaveBeenCalled();await g.ctx.fiber.dispose()
})
it('refreshes an expired profile only for the same unique group/model/operation and preserves parameters',async()=>{
  const selection={groupId:'99',modelId:'chosen',profileId:'expired',operation:'video'}
  const f=await fixture({video:{selection,parameters:{duration:5,quality:'high'}}})
  try{
    const draft=JSON.parse(await f.studio.call('s1','prepare',JSON.stringify({kind:'video',prompt:'preserve my settings'})))
    expect(f.media.catalog).toHaveBeenCalledWith()
    expect(draft.selection).toEqual({...selection,profileId:'p'})
    expect(f.media.estimate.mock.calls[0]?.[0]).toMatchObject({profileId:'p',parameters:{duration:5,quality:'high'}})
    expect(f.environment.setMediaModelSelections).not.toHaveBeenCalled()
  }finally{await f.ctx.fiber.dispose()}
})
it('keeps an expired saved selection when refreshed candidates are ambiguous',async()=>{
  const selection={groupId:'99',modelId:'chosen',profileId:'expired',operation:'video'}
  const f=await fixture({video:{selection,parameters:{duration:5}}})
  try{
    f.media.catalog.mockResolvedValue({models:[f.model,{...f.model,profileId:'other'}],status:'succeeded'})
    f.media.estimate.mockRejectedValue(new Error('MEDIA_SELECTION_INVALID'))
    const job=await f.studio.generate('s1',{kind:'video',prompt:'same model'})
    expect(job).toMatchObject({state:'validation-failed',selection})
    expect(f.media.submit).not.toHaveBeenCalled()
    expect(f.environment.setMediaModelSelections).not.toHaveBeenCalled()
  }finally{await f.ctx.fiber.dispose()}
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

it('accepts ordered URL references, reuses their hidden source, and rejects mixed input contracts',async()=>{
 const f=await fixture();const projectId=defaultMediaProjectId('s1');
 try{
 const input={projectId,kind:'video',prompt:'reference scene',selection:{groupId:'99',modelId:'chosen',profileId:'p',operation:'video'},references_json:JSON.stringify([{url:'https://media.example.com/ref.mp4?signature=private',media_type:'video/mp4'},{url:'https://media.example.com/music.wav',media_type:'audio/wav'}])}
 const job=JSON.parse(await f.studio.call('s1','prepare',JSON.stringify(input)))
 expect(job.references.map((r:any)=>r.mediaType)).toEqual(['video/mp4','audio/wav']);expect(JSON.stringify(job)).not.toContain('private');
 const next=JSON.parse(await f.studio.call('s1','prepare',JSON.stringify({...input,id:job.id,references_json:JSON.stringify(job.references.map((r:any)=>({reference_id:r.sha256})))})))
 expect((await f.ledger.references({cwd:f.cwd,sessionId:'s1',projectId},next.id))[0]?.url).toBe('https://media.example.com/ref.mp4?signature=private')
 expect(JSON.parse(await f.studio.call('s1','prepare',JSON.stringify({...input,reference_paths:[]})))).toMatchObject({state:'validation-failed',error:'MEDIA_REFERENCE_INPUT_CONFLICT'})
 expect(JSON.parse(await f.studio.call('s1','prepare',JSON.stringify({...input,references_json:[{url:'https://media.example.com/ref.mp4',path:'x',media_type:'video/mp4'}]})))).toMatchObject({state:'validation-failed',error:expect.stringContaining('ONE_SOURCE')})
 expect(f.media.submit).not.toHaveBeenCalled()
 }finally{await f.ctx.fiber.dispose()}
})

it('reuses an imported identical asset and reimports when its stored bytes changed',async()=>{
 const f=await fixture();try{
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');await writeFile(join(f.cwd,'fixture.png'),png)
 vi.spyOn(f.studio as any,'probe').mockResolvedValue({streams:[{codec_type:'video',codec_name:'png'}],format:{format_name:'png_pipe'}})
 const first=await f.studio.importSource('s1',{path:'fixture.png'}),second=await f.studio.importSource('s1',{path:'fixture.png'})
 expect(second.path).toBe(first.path)
 await writeFile(join(f.cwd,first.path),'changed')
 const third=await f.studio.importSource('s1',{path:'fixture.png'});expect(third.path).not.toBe(first.path)
 }finally{await f.ctx.fiber.dispose()}
})

it('preserves configured options and explicit seconds without adding a conflicting catalog duration',async()=>{
 const selection={groupId:'99',modelId:'chosen',profileId:'p',operation:'video'}
 const f=await fixture({video:{selection,parameters:{quality:'chosen-quality',future_option:true}}})
 try{
  Object.assign(f.model,{duration:{required:true,mode:'enum',values:[8],default:8}})
  await f.studio.generate('s1',{kind:'video',prompt:'explicit seconds',parameters:{seconds:5}})
  await vi.waitFor(()=>expect(f.media.submit).toHaveBeenCalledOnce())
  expect(f.media.submit.mock.calls[0]![0].parameters).toEqual({quality:'chosen-quality',future_option:true,seconds:5})
 }finally{await f.ctx.fiber.dispose()}
})
