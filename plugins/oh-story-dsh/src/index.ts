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
import { MEDIA_CONVERSATION_PROMPT, validateMediaJobKind, validateMediaToolIds } from './media-contract.js'
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
  context.tools.register(defineTool({name:'media_job',description:'生成用户明确要求的独立视频或音乐任务；普通图片生成和编辑必须使用 gpt-image-generator 的 generate_image/edit_image。图片仅可作为视频参考素材。明确视频/音乐生成用 generate，讨论方案用 prepare。status/collect 恢复原任务；没有 ID 时省略 id 列出任务，不重新生成。',parameters:{action:{type:'string',required:true,enum:['prepare','generate','status','collect']},project_id:{type:'string',description:'省略使用当前会话项目；只传真实返回的项目 ID，不传标题、路径、空值或占位符。'},id:{type:'string',description:'原任务返回的 id（8–128 位字母、数字、下划线或短横线）。首次 prepare/generate 省略；status/collect 省略时列出任务。'},kind:{type:'string',enum:['video','music'],description:'仅用于独立视频或音乐；不要传 image。视频可通过 reference_paths 或 input_attachment_ids 使用图片参考素材。'},prompt:{type:'string'},reference_paths:{type:'array',items:{type:'string'}},input_attachment_ids:{type:'array',items:{type:'string'}},mask_path:{type:'string'},selection_json:{type:'string',description:'用户明确指定的目录选择；省略沿用已有选择或首次自动配置'},parameters_json:{type:'string',description:'用户要求的能力参数 JSON；省略沿用已选参数'}},output,isConcurrencySafe:()=>false,async execute(args,exec){
    if(!exec.agent)throw new Error('MEDIA_SESSION_REQUIRED')
    validateMediaToolIds(args)
    validateMediaJobKind(args)
    const sessionId=String(exec.agent.session.id),projectId=args.project_id??defaultMediaProjectId(sessionId)
    const input={...args,projectId,...(args.selection_json?{selection:JSON.parse(args.selection_json)}:{}),...(args.parameters_json?{parameters:JSON.parse(args.parameters_json)}:{})}
    if(args.action==='generate')return {result:JSON.stringify(await studio.generate(sessionId,{...input,id:args.id??'chat-'+createHash('sha256').update(sessionId+':'+exec.callId).digest('hex')}))}
    const scope=await studio.scope(sessionId,projectId,args.action==='prepare')
    const result=args.action==='prepare'?JSON.parse(await studio.call(sessionId,'prepare',JSON.stringify(input))):args.id?await context.zerowallMediaJobs.refresh(scope,args.id):await context.zerowallMediaJobs.list(scope)
    return {result:JSON.stringify(result)}
  }}))
  context.tools.register(defineTool({name:'media_import',description:'将视频、音频或用于视频参考的图片附件导入独立媒体项目。普通图片配图直接使用 gpt-image-generator，不导入媒体项目。提供 path 或 attachment_id 中的一项，项目 ID 可省略。',parameters:{project_id:{type:'string',description:'省略使用当前会话项目，或使用已返回的真实项目 ID。'},path:{type:'string'},attachment_id:{type:'string'}},output,isConcurrencySafe:()=>false,async execute(args,exec){
    if(!exec.agent)throw new Error('MEDIA_SESSION_REQUIRED')
    validateMediaToolIds(args)
    return {result:JSON.stringify(await studio.importSource(String(exec.agent.session.id),{...(args.project_id?{projectId:args.project_id}:{}),...(args.path?{path:args.path}:{}),...(args.attachment_id?{attachmentId:args.attachment_id}:{})}))}
  }}))
  context.tools.register(defineTool({name:'media_project',description:'管理独立媒体项目、分镜时间线与宣传片合成；不用于 PPT/PPTX 或文档配图。项目 ID 可省略。先 read，按要求 save，再 compose。save 保留 editRevision；compose 使用 save 返回的 edit_revision。版本冲突时重新 read 合并修改。',parameters:{action:{type:'string',required:true,enum:['create','read','save','compose','preflight']},project_id:{type:'string',description:'省略使用当前会话项目；显式值仅使用返回的真实 ID，不传项目标题、路径、空值或占位符。'},project_json:{type:'string'},revision:{type:'integer'},edit_revision:{type:'integer',description:'compose 传最新项目 editRevision；旧调用可仅传 revision'}},output,isConcurrencySafe:()=>false,async execute(args,exec){
    if(!exec.agent)throw new Error('MEDIA_SESSION_REQUIRED')
    validateMediaToolIds(args)
    const sessionId=String(exec.agent.session.id),projectId=args.project_id??defaultMediaProjectId(sessionId)
    if(args.action==='read'){await studio.call(sessionId,'create',JSON.stringify({projectId}));return {result:await studio.call(sessionId,'list',JSON.stringify({projectId}))}}
    return {result:await studio.call(sessionId,args.action,JSON.stringify({projectId,...(args.project_json?{project:JSON.parse(args.project_json)}:{}),...(args.revision!==undefined?{revision:args.revision}:{}),...(args.edit_revision!==undefined?{editRevision:args.edit_revision}:{}),...(args.action==='compose'?{requestId:String(exec.callId)}:{})}))}
  }}))
}
export default {name,inject,Config,apply}
