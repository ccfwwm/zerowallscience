import { createHash } from 'node:crypto'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@zerowallscience/plugin-ai-cloud'
import type {} from '@zerowallscience/plugin-python'
import type {} from '@zerowallscience/plugin-environment'
import type {} from '@deepseek-ai/dsh-attachment'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-skill'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-client-connection'
import { defineTool } from '@deepseek-ai/dsh-tools'
import z from '@deepseek-ai/schemastery'
import { defaultMediaProjectId, MediaStudioService } from './media-studio.js'
import { createMediaSkillProvider } from './media-skill.js'
import { registerMediaRoute } from './media-route.js'
import { assertTrustedWorkspaceAuthority } from './workspace-request-trust.js'
import { MEDIA_CONVERSATION_PROMPT, MEDIA_PROJECT_ID_PARAMETER, MEDIA_JOB_ID_PARAMETER, mergeStandardReferenceParameters, validateMediaJobKind, validateMediaToolIds } from './media-contract.js'
import { ownMediaRuntime } from './shared-runtime.js'
export { MediaStudioService } from './media-studio.js'
export const name='videos'
export const inject=['skills','tools','typert','webServer','zerowallMedia','zerowallMediaJobs','zerowallPython','zerowallEnvironment','attachments','connection']
export interface Config { trustedHosts?:string[]; editorMaxBytes?:number }
export const Config=z.object({trustedHosts:z.array(String).default([]),editorMaxBytes:z.natural().default(2097152)}) as z<Config>
export async function installMediaStudio(context:Context,config:Config={}){
  for(const entry of config.trustedHosts??[])assertTrustedWorkspaceAuthority(entry)
  const studio=new MediaStudioService(context)
  context.skills.registerProvider(()=>createMediaSkillProvider())
  registerMediaRoute(context,studio,config.trustedHosts??[])
  context.inject(['systemPrompt'], scoped => scoped.systemPrompt.context({
    name:'zerowall:media-conversation', order:950,
    text:MEDIA_CONVERSATION_PROMPT
  }))
  const output={schema:{type:'object' as const,additionalProperties:false,properties:{result:{type:'string' as const,required:true as const}}},render:(_:unknown,value:{result:string})=>[{type:'text' as const,text:value.result}]}
  const mediaReferences={type:'array',items:{oneOf:[{type:'string'},{type:'object',additionalProperties:true}]},description:'统一参考素材数组，支持 HTTPS URL、完整 MIME Data URL，或 {url:...}/{b64_json:...} 对象；对象可附带 role 和模板参数。'} as const
  context.tools.register(defineTool({name:'media_models',description:'查询当前账号可用的视频和音乐能力与已选默认模型，或按用户明确要求保存模型选择。普通图片使用 gpt-image-generator，不在此选择。无需供应商密钥。',parameters:{action:{type:'string',required:true,enum:['list','choices','select']},choices_json:{type:'string',description:'select 时传默认选择 JSON {video|music|speech:{selection:{groupId,modelId,profileId,operation},parameters:{}}}，须先查询真实目录，保留未修改类别'}},output,isConcurrencySafe:()=>false,async execute(args,exec){
    if(!exec.agent)throw new Error('MEDIA_SESSION_REQUIRED')
    const sessionId=String(exec.agent.session.id)
    if(args.action==='select'){
      const choices=JSON.parse(args.choices_json??'{}')
      for(const kind of Object.keys(choices))validateMediaJobKind({kind})
      const catalog=await context.zerowallMedia.catalog()
      for(const value of Object.values(choices) as any[])if(!catalog.models.some(m=>!m.stale&&m.groupId===value.selection?.groupId&&m.modelId===value.selection?.modelId&&m.profileId===value.selection?.profileId&&m.operations.includes(value.selection?.operation)))throw new Error('MEDIA_SELECTION_INVALID')
      const old=await context.zerowallEnvironment.readMediaModelSelections()
      await context.zerowallEnvironment.setMediaModelSelections({...old,...choices})
      return {result:JSON.stringify({saved:true})}
    }
    return {result:await studio.call(sessionId,args.action==='list'?'catalog':'choices','{}')}
  }}))
  context.tools.register(defineTool({name:'media_job',description:'生成用户明确要求的独立视频、音乐或语音任务；普通图片生成和编辑必须使用 gpt-image-generator 的 generate_image/edit_image。图片仅可作为视频参考素材。明确生成用 generate，讨论方案用 prepare。参考素材统一使用 images、videos、audios；status 查询状态并尊重 paused/failed，不会自动恢复；collect 明确恢复同一原任务的后台查询和下载；pause 仅停止本地查询和下载，不取消上游任务。没有 ID 时省略 id 列出任务；不要循环查询或等待，结果会自动显示。',parameters:{action:{type:'string',required:true,enum:['prepare','generate','status','collect','pause','clear_references']},project_id:MEDIA_PROJECT_ID_PARAMETER,id:MEDIA_JOB_ID_PARAMETER,kind:{type:'string',enum:['video','music','speech'],description:'用于独立视频、音乐或语音合成（speech）；不要传 image。'},prompt:{type:'string'},images:mediaReferences,videos:mediaReferences,audios:mediaReferences,references_file:{type:'string',description:'工作区内参考素材 JSON 清单路径，与其他参考输入互斥；读取并保留全部 URL、顺序、角色及附加参数。'},references_json:{type:'string',description:'兼容入口：有序参考数组 JSON；每项仅一个来源 path（已导入项目路径）、attachment_id（会话附件）、url（公网 HTTPS 直链）或 reference_id（当前任务参考摘要 sha256，复用原素材）。URL 必须给 media_type；可选 role: reference/first_frame/last_frame。首尾帧仅图片且不与普通图片参考混用。'},reference_paths:{type:'array',items:{type:'string'}},input_attachment_ids:{type:'array',items:{type:'string'}},mask_path:{type:'string'},selection_json:{type:'string',description:'用户明确指定的目录选择；省略沿用已有选择或首次自动配置'},parameters_json:{type:'string',description:'模型参数 JSON；省略沿用已选参数。不得与顶层 images/videos/audios 重复提供不同内容。'}},output,isConcurrencySafe:args=>['status','collect','pause'].includes((args as any)?.action),async execute(args,exec){
    if(!exec.agent)throw new Error('MEDIA_SESSION_REQUIRED')
    const {project_id,id}=validateMediaToolIds(args)
    validateMediaJobKind(args)
    const sessionId=String(exec.agent.session.id),projectId=project_id??defaultMediaProjectId(sessionId)
    const parametersJson=typeof args.parameters_json==='string'?args.parameters_json:undefined
    const selectionJson=typeof args.selection_json==='string'?args.selection_json:undefined
    const parameters=mergeStandardReferenceParameters(parametersJson?JSON.parse(parametersJson):undefined,args)
    const {images:_images,videos:_videos,audios:_audios,...toolArgs}=args
    const input={...toolArgs,project_id,id,projectId,...(selectionJson?{selection:JSON.parse(selectionJson)}:{}),...(parameters!==undefined?{parameters}:{})}
    if(args.action==='clear_references') { if(!id) throw new Error('MEDIA_JOB_ID_REQUIRED'); const scope=await studio.scope(sessionId,projectId,true); const old=(await context.zerowallMediaJobs.list(scope)).find(job=>job.id===id); if(!old)throw new Error('MEDIA_JOB_NOT_FOUND'); return {result:await studio.call(sessionId,'prepare',JSON.stringify({...input,kind:old.kind,prompt:old.prompt,clearReferences:true}))} }
    if(args.action==='generate')return {result:JSON.stringify(await studio.generate(sessionId,{...input,id:id??'chat-'+createHash('sha256').update(sessionId+':'+exec.callId).digest('hex')}))}
    const scope=await studio.scope(sessionId,projectId,args.action==='prepare')
    exec.signal?.throwIfAborted()
    // A user may quote the provider taskId instead of the local job id. Resolve
    // only owned persisted jobs; never adopt arbitrary remote tasks or resubmit.
    const known=id&&args.action!=='prepare'?(await context.zerowallMediaJobs.list(scope)).find(job=>job.id===id||job.taskId===id||job.requestId===id):undefined
    const targetScope=known&&!project_id?await studio.scope(sessionId,known.projectId):scope,targetId=known?.id??id
    const result=args.action==='prepare'?JSON.parse(await studio.call(sessionId,'prepare',JSON.stringify(input))):targetId?args.action==='pause'?await context.zerowallMediaJobs.pause(targetScope,targetId):await context.zerowallMediaJobs.refresh(targetScope,targetId,{background:true,signal:exec.signal,...(args.action==='status'?{automatic:true}:{})}):await context.zerowallMediaJobs.list(scope)
    return {result:JSON.stringify(result)}
  }}))
  context.tools.register(defineTool({name:'media_import',description:'将视频、音频或用于视频参考的图片附件导入独立媒体项目。普通图片配图直接使用 gpt-image-generator，不导入媒体项目。提供 path 或 attachment_id 中的一项，项目 ID 可省略。',parameters:{project_id:MEDIA_PROJECT_ID_PARAMETER,path:{type:'string'},attachment_id:{type:'string'}},output,isConcurrencySafe:()=>false,async execute(args,exec){
    if(!exec.agent)throw new Error('MEDIA_SESSION_REQUIRED')
    const {project_id}=validateMediaToolIds(args)
    return {result:JSON.stringify(await studio.importSource(String(exec.agent.session.id),{...(project_id?{projectId:project_id}:{}),...(args.path?{path:args.path}:{}),...(args.attachment_id?{attachmentId:args.attachment_id}:{})}))}
  }}))
  context.tools.register(defineTool({name:'media_project',description:'管理独立媒体项目、分镜时间线与宣传片合成；不用于 PPT/PPTX 或文档配图。项目 ID 可省略。先 read，按要求 save，再 compose。save 保留 editRevision；compose 使用 save 返回的 edit_revision。版本冲突时重新 read 合并修改。',parameters:{action:{type:'string',required:true,enum:['create','read','save','compose','preflight']},project_id:MEDIA_PROJECT_ID_PARAMETER,project_json:{type:'string'},revision:{type:'integer'},edit_revision:{type:'integer',description:'compose 传最新项目 editRevision；旧调用可仅传 revision'}},output,isConcurrencySafe:()=>false,async execute(args,exec){
    if(!exec.agent)throw new Error('MEDIA_SESSION_REQUIRED')
    const {project_id}=validateMediaToolIds(args)
    const sessionId=String(exec.agent.session.id),projectId=project_id??defaultMediaProjectId(sessionId)
    if(args.action==='read'){await studio.call(sessionId,'create',JSON.stringify({projectId}));return {result:await studio.call(sessionId,'list',JSON.stringify({projectId}))}}
    return {result:await studio.call(sessionId,args.action,JSON.stringify({projectId,...(args.project_json?{project:JSON.parse(args.project_json)}:{}),...(args.revision!==undefined?{revision:args.revision}:{}),...(args.edit_revision!==undefined?{editRevision:args.edit_revision}:{}),...(args.action==='compose'?{requestId:String(exec.callId)}:{})}))}
  }}))
}
const runtime = {name:'videos-runtime',inject,Config,apply:installMediaStudio}
export async function apply(context:Context,config:Config={}) { await ownMediaRuntime(context,'host',runtime,config) }
export default {name,inject,Config,apply}
