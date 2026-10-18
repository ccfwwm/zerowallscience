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
import { MEDIA_CONVERSATION_PROMPT, MEDIA_PROJECT_ID_PARAMETER, MEDIA_JOB_ID_PARAMETER, validateMediaJobKind, validateMediaToolIds } from './media-contract.js'
export { MediaStudioService } from './media-studio.js'
export const name='oh-story'
export const inject=['skills','tools','typert','webServer','zerowallMedia','zerowallMediaJobs','zerowallPython','zerowallEnvironment','attachments','connection']
export interface Config { trustedHosts?:string[]; editorMaxBytes?:number }
export const Config=z.object({trustedHosts:z.array(String).default([]),editorMaxBytes:z.natural().default(2097152)}) as z<Config>
export async function apply(context:Context,config:Config={}){
  for(const entry of config.trustedHosts??[])assertTrustedWorkspaceAuthority(entry)
  const studio=new MediaStudioService(context)
  context.skills.registerProvider(()=>createMediaSkillProvider())
  registerMediaRoute(context,studio,config.trustedHosts??[])
  context.inject(['systemPrompt'], scoped => scoped.systemPrompt.context({
    name:'zerowall:media-conversation', order:950,
    text:MEDIA_CONVERSATION_PROMPT
  }))
  const output={schema:{type:'object' as const,additionalProperties:false,properties:{result:{type:'string' as const,required:true as const}}},render:(_:unknown,value:{result:string})=>[{type:'text' as const,text:value.result}]}
  context.tools.register(defineTool({name:'media_models',description:'查询当前账号可用的视频和音乐能力与已选默认模型，或按用户明确要求保存模型选择。普通图片使用 gpt-image-generator，不在此选择。无需供应商密钥。',parameters:{action:{type:'string',required:true,enum:['list','choices','select']},choices_json:{type:'string',description:'select 时传默认选择 JSON {video|music:{selection:{groupId,modelId,profileId,operation},parameters:{}}}，须先查询真实目录，保留未修改类别'}},output,isConcurrencySafe:()=>false,async execute(args,exec){
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
  context.tools.register(defineTool({name:'media_job',description:'生成用户明确要求的独立视频或音乐任务；普通图片生成和编辑必须使用 gpt-image-generator 的 generate_image/edit_image。图片仅可作为视频参考素材。明确视频/音乐生成用 generate，讨论方案用 prepare。status 查询状态并尊重 paused/failed，不恢复已停止或失败的收集；collect 明确恢复原任务的后台查询和下载并立即返回。waiting 表示等待原作品可用，Host 持续跟踪同一原任务，无整体时长或轮数上限，用户可手动停止；本地 collection=failed 不代表上游生成失败，只用 collect 恢复原任务，未经用户明确要求新生成不得再次 generate 或换模型。没有 ID 时省略 id 列出任务，不重新生成。pause 仅停止本地查询和下载，不取消上游任务。不要循环查询或等待，结果会自动显示。',parameters:{action:{type:'string',required:true,enum:['prepare','generate','status','collect','pause']},project_id:MEDIA_PROJECT_ID_PARAMETER,id:MEDIA_JOB_ID_PARAMETER,kind:{type:'string',enum:['video','music'],description:'仅用于独立视频或音乐；不要传 image。视频可通过 reference_paths 或 input_attachment_ids 使用图片参考素材。'},prompt:{type:'string'},reference_paths:{type:'array',items:{type:'string'}},input_attachment_ids:{type:'array',items:{type:'string'}},mask_path:{type:'string'},selection_json:{type:'string',description:'用户明确指定的目录选择；省略沿用已有选择或首次自动配置'},parameters_json:{type:'string',description:'用户要求的能力参数 JSON；省略沿用已选参数'}},output,isConcurrencySafe:args=>['status','collect','pause'].includes((args as any)?.action),async execute(args,exec){
    if(!exec.agent)throw new Error('MEDIA_SESSION_REQUIRED')
    const {project_id,id}=validateMediaToolIds(args)
    validateMediaJobKind(args)
    const sessionId=String(exec.agent.session.id),projectId=project_id??defaultMediaProjectId(sessionId)
    const input={...args,project_id,id,projectId,...(args.selection_json?{selection:JSON.parse(args.selection_json)}:{}),...(args.parameters_json?{parameters:JSON.parse(args.parameters_json)}:{})}
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
export default {name,inject,Config,apply}
