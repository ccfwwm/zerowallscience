import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { MediaJobLedger } from '../../ai-cloud/src/host/media-jobs.js'
import { MEDIA_SKILL_DESCRIPTION, mergeStandardReferenceParameters, removeNumberedMediaReferences, validateMediaJobKind, validateMediaToolIds } from '../src/media-contract.js'
import { createMediaSkillProvider } from '../src/media-skill.js'

const studio = vi.hoisted(() => ({ scope: vi.fn(async () => ({ sessionId: 's1', projectId: 'session-s1' })), generate: vi.fn(async (_session: string, input: any) => ({ id: input.id, state: 'queued' })), call: vi.fn(async () => '{}'), importSource: vi.fn(async () => ({})) }))
vi.mock('../src/media-studio.js', () => ({
  defaultMediaProjectId: (sessionId: string) => 'session-' + sessionId,
  MediaStudioService: class { constructor() { return studio } },
}))
import { installMediaStudio as apply } from '../src/index.js'

async function fixture() {
  vi.clearAllMocks()
  const tools = new Map<string, any>(), prompts: any[] = []
  const jobs = { list: vi.fn(async () => [{ id: 'actual-job-0001', projectId: 'session-s1' }]), refresh: vi.fn(async (_scope: unknown, id: string) => ({ id, state: 'queued' })), pause: vi.fn(async (_scope: unknown,id:string)=>({id,state:'completed',collection:'paused'})) }
  const context: any = { skills: { registerProvider: vi.fn() }, effect: vi.fn(), inject: (_keys: unknown, install: any) => install({ systemPrompt: { context: (value: any) => prompts.push(value) } }), tools: { register: (tool: any) => tools.set(tool.name, tool) }, zerowallMediaJobs: jobs }
  context.get = (key: string) => context[key]
  await apply(context)
  const exec: any = { agent: { session: { id: 's1' } }, callId: 'call-1' }
  return { tools, jobs, prompts, exec, context }
}

it('publishes consistent discovery routes for deck illustrations and independent media', async () => {
  const f = await fixture()
  expect(f.prompts).toEqual([])
  expect(MEDIA_SKILL_DESCRIPTION).toContain('独立视频')
  const provider = createMediaSkillProvider(new URL('../knowledge/media-create', import.meta.url).pathname)
  const candidates = await provider.list()
  expect(candidates[0]?.description).toContain('普通图片生成和编辑使用 gpt-image-generator')
  const skill = await readFile(new URL('../knowledge/media-create/SKILL.md', import.meta.url), 'utf8')
  expect(skill).toContain('不为普通配图建立媒体项目')
  expect(f.tools.get('media_job').description).toContain('普通图片生成和编辑必须使用 gpt-image-generator')
  expect(f.tools.get('media_job').description).toContain('status 查询状态并尊重 paused/failed')
  expect(f.tools.get('media_job').description).toContain('通过提问窗口让用户选择是否继续提交新任务')
  expect(skill).toContain('用户明确要求继续、重试收集或重新获取时才用 collect')
  expect(f.tools.get('media_import').description).toContain('用于视频参考的图片')
  expect(f.tools.get('media_project').description).toContain('不用于 PPT/PPTX')
})

it('rejects standalone image media jobs while preserving video and music jobs', async () => {
  expect(() => validateMediaJobKind({ kind: 'image' })).toThrow('MEDIA_IMAGE_ROUTE_DISABLED')
  expect(() => validateMediaJobKind({ kind: 'video' })).not.toThrow()
  expect(() => validateMediaJobKind({ kind: 'music' })).not.toThrow()
  expect(() => validateMediaJobKind({ kind: 'speech' })).not.toThrow()
  const f = await fixture(), tool = f.tools.get('media_job')
  await expect(tool.execute({ action: 'generate', kind: 'image', prompt: '海报' }, f.exec)).rejects.toThrow('must be one of ["video","music","speech"]')
  await expect(f.tools.get('media_models').execute({action:'select',choices_json:JSON.stringify({image:{selection:{groupId:'99',modelId:'image',profileId:'p',operation:'image'}}})},f.exec)).rejects.toThrow('MEDIA_IMAGE_ROUTE_DISABLED')
  expect(studio.generate).not.toHaveBeenCalled()
})

it('removes numbered media selectors from prompt text without changing ordinary numbers',()=>{
 expect(removeNumberedMediaReferences('使用 images[0] 和 image [ 4 ]，参考 videos[0]、reference-audio[n]、reference_images[2]，镜头在 0–3 秒开始。'))
  .toBe('使用 图片 和 图片，参考 视频、音频、图片，镜头在 0–3 秒开始。')
})

it('passes unified reference fields and safely merges matching legacy parameter fields', async () => {
  const f = await fixture(), tool = f.tools.get('media_job')
  const image = { url: 'https://assets.example/reference.png', role: 'first_frame', vendor: { quality: 'high', seed: 17 } }
  const parameters = {
    seconds: 5,
    images: [{ vendor: { seed: 17, quality: 'high' }, role: 'first_frame', url: 'https://assets.example/reference.png' }],
  }
  const videos = ['data:video/mp4;base64,AAAA']
  const audios = [{ b64_json: 'AAAA', media_type: 'audio/mpeg', role: 'guide' }]

  await tool.execute({
    action: 'generate', kind: 'video', prompt: '保持素材内容',
    images: [image], videos, audios, parameters_json: JSON.stringify(parameters),
  }, f.exec)

  expect(studio.generate).toHaveBeenCalledWith('s1', expect.objectContaining({
    parameters: { seconds: 5, images: [image], videos, audios },
  }), expect.any(Function))
  expect(mergeStandardReferenceParameters(parameters, { images: [image] })).toEqual({
    seconds: 5, images: [image],
  })
})

it('rejects conflicting or malformed unified reference fields before creating a task', async () => {
  const f = await fixture(), tool = f.tools.get('media_job')
  await expect(tool.execute({
    action: 'generate', kind: 'video', prompt: '保留两份参考',
    images: ['https://assets.example/one.png'],
    parameters_json: JSON.stringify({ images: ['https://assets.example/two.png'] }),
  }, f.exec)).rejects.toThrow('MEDIA_REFERENCE_INPUT_CONFLICT: images')
  await expect(tool.execute({
    action: 'generate', kind: 'video', prompt: '参数必须是对象', parameters_json: '[]',
  }, f.exec)).rejects.toThrow('MEDIA_PARAMETERS_INVALID')
  await expect(tool.execute({
    action: 'generate', kind: 'video', prompt: '素材必须是数组', videos: 'https://assets.example/clip.mp4',
  }, f.exec)).rejects.toThrow('must be an array')
  expect(() => mergeStandardReferenceParameters(undefined, { videos: 'https://assets.example/clip.mp4' })).toThrow('MEDIA_REFERENCES_INVALID: videos')

  expect(studio.generate).not.toHaveBeenCalled()
  expect(studio.scope).not.toHaveBeenCalled()
})

it('rejects invented titles, paths and short task IDs before creating projects or jobs', async () => {
  const f = await fixture()
  await expect(f.tools.get('media_project').execute({ action: 'read', project_id: '汇报 PPT' }, f.exec)).rejects.toThrow('请省略该字段')
  await expect(f.tools.get('media_import').execute({ path: 'image.png', project_id: 'media-projects/deck' }, f.exec)).rejects.toThrow('MEDIA_PROJECT_ID_INVALID')
  await expect(f.tools.get('media_job').execute({ action: 'status', id: 'job-1' }, f.exec)).rejects.toThrow('先用 media_job status')
  expect(studio.call).not.toHaveBeenCalled(); expect(studio.scope).not.toHaveBeenCalled(); expect(studio.importSource).not.toHaveBeenCalled(); expect(studio.generate).not.toHaveBeenCalled()
  expect(f.jobs.refresh).not.toHaveBeenCalled()
  expect(() => validateMediaToolIds({ project_id: 123, id: 'actual-job-0001' })).toThrow('MEDIA_PROJECT_ID_INVALID')
  expect(() => validateMediaToolIds({ id: 12345678 })).toThrow('MEDIA_JOB_ID_INVALID')
})

it.each([undefined, null, '', ' \t\n'])('treats unused optional IDs (%j) as omission across actual tool entry points', async empty => {
  const f = await fixture()
  const input = empty === undefined ? {} : {project_id:empty, id:empty}
  await f.tools.get('media_project').execute({action:'read', ...input}, f.exec)
  expect(studio.call).toHaveBeenCalledWith('s1','create',JSON.stringify({projectId:'session-s1'}))
  await f.tools.get('media_import').execute({path:'reference.png', ...input}, f.exec)
  expect(studio.importSource).toHaveBeenCalledWith('s1',{path:'reference.png'})
  const tool=f.tools.get('media_job')
  const list=await tool.execute({action:'status',kind:'video',prompt:'',reference_paths:[],input_attachment_ids:[],mask_path:'',selection_json:'',parameters_json:'',...input},f.exec)
  expect(JSON.parse(list.result)[0].id).toBe('actual-job-0001')
  await tool.execute({action:'collect',...input},f.exec)
  expect(f.jobs.list).toHaveBeenCalledTimes(2)
  expect(f.jobs.refresh).not.toHaveBeenCalled();expect(studio.generate).not.toHaveBeenCalled()
  const parameters={quality:'high',duration:8,aspect_ratio:'16:9'}
  await tool.execute({action:'generate',kind:'video',prompt:'独立视频',parameters_json:JSON.stringify(parameters),...input},f.exec)
  expect(studio.generate).toHaveBeenCalledWith('s1',expect.objectContaining({project_id:undefined,projectId:'session-s1',id:expect.stringMatching(/^chat-[a-f0-9]{64}$/),parameters}),expect.any(Function))
  expect(studio.scope).toHaveBeenCalledWith('s1','session-s1',false)
  expect(validateMediaToolIds(input)).toEqual({project_id:undefined,id:undefined})
})

it('preserves explicit project and job IDs and does not coerce title or path values into the default project',async()=>{
  const f=await fixture()
  await f.tools.get('media_job').execute({action:'collect',project_id:'returned-project-01',id:'actual-job-0001'},f.exec)
  expect(studio.scope).toHaveBeenCalledWith('s1','returned-project-01',false)
  expect(f.jobs.refresh).toHaveBeenCalledOnce()
  for(const project_id of ['中文项目','media-projects/project','C:\\project',' project-id ']){
    await expect(f.tools.get('media_project').execute({action:'create',project_id},f.exec)).rejects.toThrow('MEDIA_PROJECT_ID_INVALID')
  }
  expect(studio.call).not.toHaveBeenCalled()
})

it('recovers real media tasks without generating a replacement and still supports explicit media creation', async () => {
  const f = await fixture(), tool = f.tools.get('media_job')
  const list = await tool.execute({ action: 'status' }, f.exec)
  expect(JSON.parse(list.result)[0].id).toBe('actual-job-0001')
  await tool.execute({ action: 'collect', id: 'actual-job-0001' }, f.exec)
  expect(f.jobs.refresh).toHaveBeenCalledWith({ sessionId: 's1', projectId: 'session-s1' }, 'actual-job-0001', {background:true,signal:undefined})
  expect(studio.generate).not.toHaveBeenCalled()
  await tool.execute({ action: 'generate', kind: 'video', prompt: '独立宣传视频' }, f.exec)
  expect(studio.generate).toHaveBeenCalledWith('s1', expect.objectContaining({ kind: 'video', projectId: 'session-s1', id: expect.stringMatching(/^chat-[a-f0-9]{64}$/) }), expect.any(Function))
})

it('uses the user question window for pending-task confirmation and fails closed when unavailable',async()=>{
 const f=await fixture(),tool=f.tools.get('media_job')
 const ask=vi.fn(async()=>({answers:[{id:'media-duplicate-submission',selected:['取消本次提交']}]}))
 f.context.userQuestions={ask}
 await tool.execute({action:'generate',kind:'video',prompt:'新宣传片'},f.exec)
 const confirmation=studio.generate.mock.calls.at(-1)?.[2]
 expect(confirmation).toBeTypeOf('function')
 const active=[{id:'existing-job',kind:'video',state:'queued',selection:{modelId:'XXsedanco2.5S'},taskId:'upstream-task'}]
 await expect(confirmation(active)).resolves.toBe(false)
 expect(ask).toHaveBeenCalledWith(expect.objectContaining({agent:f.exec.agent,signal:f.exec.signal,questions:[expect.objectContaining({
  question:'当前对话已有媒体任务尚未结束。仍要提交一个新的付费任务吗？',
  options:[expect.objectContaining({label:'继续提交新任务'}),expect.objectContaining({label:'取消本次提交'})],
 })]}))
 f.context.userQuestions=undefined
 await tool.execute({action:'generate',kind:'video',prompt:'另一条新视频'},f.exec)
 const unavailable=studio.generate.mock.calls.at(-1)?.[2]
 await expect(unavailable(active)).rejects.toThrow('MEDIA_DUPLICATE_CONFIRMATION_UNAVAILABLE')
})

it('releases collect to the background and pauses only the original local transfer',async()=>{
 const f=await fixture(),tool=f.tools.get('media_job'),controller=new AbortController()
 f.exec.signal=controller.signal
 await tool.execute({action:'collect',id:'actual-job-0001'},f.exec)
 expect(f.jobs.refresh).toHaveBeenCalledWith(expect.anything(),'actual-job-0001',{background:true,signal:controller.signal})
 expect(tool.isConcurrencySafe({action:'collect'})).toBe(true)
 const paused=JSON.parse((await tool.execute({action:'pause',id:'actual-job-0001'},f.exec)).result)
 expect(paused.collection).toBe('paused');expect(f.jobs.pause).toHaveBeenCalledOnce();expect(studio.generate).not.toHaveBeenCalled()
 controller.abort();await expect(tool.execute({action:'status',id:'actual-job-0001'},f.exec)).rejects.toThrow()
})

it('resolves an owned provider taskId to its persisted local job and original project',async()=>{
 const f=await fixture()
 f.jobs.list.mockResolvedValueOnce([{id:'actual-job-0001',projectId:'legacy-project',taskId:'mt_owned'}] as any)
 await f.tools.get('media_job').execute({action:'collect',id:'mt_owned'},f.exec)
 expect(studio.scope).toHaveBeenCalledWith('s1','legacy-project')
 expect(f.jobs.refresh).toHaveBeenCalledWith(expect.anything(),'actual-job-0001',expect.objectContaining({background:true}))
 expect(studio.generate).not.toHaveBeenCalled()
})

it.each(['paused','failed'])('keeps real %s original-task collection unchanged on status and resumes only on collect',async collection=>{
 const cwd=await mkdtemp(join(tmpdir(),'media-tool-status-')),previousScope=studio.scope.getMockImplementation()
 const f=await fixture(),scope={sessionId:'s1',projectId:'session-s1',cwd}
 const history={requestId:'original-request-0001',taskId:'mt_original',selection:{groupId:'99',modelId:'original-model',profileId:'original-profile',operation:'video'},status:'completed',artifacts:[{key:'video1',mediaType:'video/mp4'}]}
 const bytes=Buffer.from('unchanged original result'),sha256=createHash('sha256').update(bytes).digest('hex')
 const media={list:vi.fn(async()=>[history]),query:vi.fn(async()=>history),download:vi.fn(async()=>({bytes,mediaType:'video/mp4',sha256})),submit:vi.fn(),estimate:vi.fn()}
 if(collection==='paused')media.query.mockImplementationOnce(()=>new Promise(()=>{}))
 else media.download.mockRejectedValueOnce(new Error('MEDIA_DOWNLOAD_HTTP_401'))
 const ledger=new MediaJobLedger(media as any,async()=>'trusted-owner',join(cwd,'ledger'),{autoCollect:false})
 f.context.zerowallMediaJobs=ledger
 studio.scope.mockResolvedValue(scope)
 try{
  const job=await ledger.recover(scope,history.requestId)
  if(collection==='paused'){
   await vi.waitFor(()=>expect(media.query).toHaveBeenCalled())
   await ledger.pause(scope,job.id)
  }else await vi.waitFor(async()=>expect((await ledger.list(scope))[0]?.collection).toBe('failed'))
  const queryCalls=media.query.mock.calls.length,downloadCalls=media.download.mock.calls.length,tool=f.tools.get('media_job')
  const status=JSON.parse((await tool.execute({action:'status',id:history.taskId},f.exec)).result)
  expect(status).toMatchObject({id:job.id,requestId:history.requestId,taskId:history.taskId,selection:history.selection,collection})
  expect((await ledger.list(scope))[0]?.collection).toBe(collection)
  expect(media.query).toHaveBeenCalledTimes(queryCalls);expect(media.download).toHaveBeenCalledTimes(downloadCalls)
  await tool.execute({action:'collect',id:history.taskId},f.exec)
  await vi.waitFor(async()=>expect((await ledger.list(scope))[0]?.collection).toBe('ready'))
  const recovered=(await ledger.list(scope))[0]!
  expect(recovered).toMatchObject({id:job.id,requestId:history.requestId,taskId:history.taskId,selection:history.selection})
  expect(await readFile(join(cwd,recovered.assets[0]!.path))).toEqual(bytes)
  expect(media.submit).not.toHaveBeenCalled();expect(media.estimate).not.toHaveBeenCalled();expect(studio.generate).not.toHaveBeenCalled()
 }finally{
  await ledger.dispose()
  studio.scope.mockImplementation(previousScope!)
  await rm(cwd,{recursive:true,force:true})
 }
})
