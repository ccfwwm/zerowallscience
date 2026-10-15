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
    text:'多媒体创作已安装。用户要求生图、改图、生成视频、音乐或宣传片时，请自动使用 media-create Skill 和 media_models / media_import / media_project / media_job 工具完成，不要求用户填写项目 ID、JSON、供应商密钥或打开工作台。项目 ID 可省略。用户明确要求生成时调用 media_job generate，直接执行，费用由后台校验；讨论方案、解释、修改文案只准备/保存，不提交。已有模型选择沿用，未配置时生成自动采用可用模型；失效选择须告知。结果在对话中报告并附文件，右侧工作台展示进度与预览。'
  }))
  const output={schema:{type:'object' as const,additionalProperties:false,properties:{result:{type:'string' as const,required:true as const}}},render:(_:unknown,value:{result:string})=>[{type:'text' as const,text:value.result}]}
  context.tools.register(defineTool({name:'media_models',description:'查询当前账号可用的图片、视频和音乐能力与已选默认模型，或按用户明确要求保存模型选择。无需供应商密钥。',parameters:{action:{type:'string',required:true,enum:['list','choices','select']},choices_json:{type:'string',description:'select 时传默认选择 JSON {image|video|music:{selection:{groupId,modelId,profileId,operation},parameters:{}}}，须先查询真实目录，保留未修改类别'}},output,isConcurrencySafe:()=>false,async execute(args,exec){
    if(!exec.agent)throw new Error('MEDIA_SESSION_REQUIRED')
    const sessionId=String(exec.agent.session.id)
    if(args.action==='select'){
      const choices=JSON.parse(args.choices_json??'{}'),catalog=await context.zerowallMedia.catalog()
      for(const value of Object.values(choices) as any[])if(!catalog.models.some(m=>!m.stale&&m.groupId===value.selection?.groupId&&m.modelId===value.selection?.modelId&&m.profileId===value.selection?.profileId&&m.operations.includes(value.selection?.operation)))throw new Error('MEDIA_SELECTION_INVALID')
      const old=await context.zerowallEnvironment.readMediaModelSelections()
      await context.zerowallEnvironment.setMediaModelSelections({...old,...choices})
      return {result:JSON.stringify({saved:true})}
    }
    return {result:await studio.call(sessionId,args.action==='list'?'catalog':'choices','{}')}
  }}))
  context.tools.register(defineTool({name:'media_job',description:'通过对话生成图片、改图、视频或音乐。用户明确要求生成时用 generate 直接执行；仅讨论/修改方案时用 prepare。项目和首次模型自动配置；任务异步返回，用 status/collect恢复原任务，禁止重复提交不确定任务。',parameters:{action:{type:'string',required:true,enum:['prepare','generate','status','collect']},project_id:{type:'string'},id:{type:'string'},kind:{type:'string',enum:['image','video','music']},prompt:{type:'string'},reference_paths:{type:'array',items:{type:'string'}},input_attachment_ids:{type:'array',items:{type:'string'}},mask_path:{type:'string'},selection_json:{type:'string',description:'用户明确指定的目录选择；省略沿用已有选择或首次自动配置'},parameters_json:{type:'string',description:'用户要求的能力参数 JSON；省略沿用已选参数'}},output,isConcurrencySafe:()=>false,async execute(args,exec){
    if(!exec.agent)throw new Error('MEDIA_SESSION_REQUIRED')
    const sessionId=String(exec.agent.session.id),projectId=args.project_id??defaultMediaProjectId(sessionId)
    const input={...args,projectId,...(args.selection_json?{selection:JSON.parse(args.selection_json)}:{}),...(args.parameters_json?{parameters:JSON.parse(args.parameters_json)}:{})}
    if(args.action==='generate')return {result:JSON.stringify(await studio.generate(sessionId,{...input,id:args.id??'chat-'+createHash('sha256').update(sessionId+':'+exec.callId).digest('hex')}))}
    const scope=await studio.scope(sessionId,projectId,args.action==='prepare')
    const result=args.action==='prepare'?JSON.parse(await studio.call(sessionId,'prepare',JSON.stringify(input))):args.id?await context.zerowallMediaJobs.refresh(scope,args.id):await context.zerowallMediaJobs.list(scope)
    return {result:JSON.stringify(result)}
  }}))
  context.tools.register(defineTool({name:'media_import',description:'通过对话将当前会话附件或工作区内的图片、视频、音频导入媒体项目。用户无需打开表单。提供 path 或 attachment_id 中的一项，项目 ID 可省略。返回校验过的素材路径和时长。',parameters:{project_id:{type:'string'},path:{type:'string'},attachment_id:{type:'string'}},output,isConcurrencySafe:()=>false,async execute(args,exec){
    if(!exec.agent)throw new Error('MEDIA_SESSION_REQUIRED')
    return {result:JSON.stringify(await studio.importSource(String(exec.agent.session.id),{...(args.project_id?{projectId:args.project_id}:{}),...(args.path?{path:args.path}:{}),...(args.attachment_id?{attachmentId:args.attachment_id}:{})}))}
  }}))
  context.tools.register(defineTool({name:'media_project',description:'通过对话自动建立媒体项目、管理方案和分镜时间线、合成导出宣传片。项目 ID 可省略。先 read 获取当前项目，按用户要求 save 调整镜头、字幕、音乐与旁白，再 compose。save 保留 read 返回的 editRevision；compose 使用 save 返回的 edit_revision。版本冲突时重新 read 合并修改，不盲目覆盖。无需让用户填写 JSON 或操作时间线。',parameters:{action:{type:'string',required:true,enum:['create','read','save','compose','preflight']},project_id:{type:'string'},project_json:{type:'string'},revision:{type:'integer'},edit_revision:{type:'integer',description:'compose 传最新项目 editRevision；旧调用可仅传 revision'}},output,isConcurrencySafe:()=>false,async execute(args,exec){
    if(!exec.agent)throw new Error('MEDIA_SESSION_REQUIRED')
    const sessionId=String(exec.agent.session.id),projectId=args.project_id??defaultMediaProjectId(sessionId)
    if(args.action==='read'){await studio.call(sessionId,'create',JSON.stringify({projectId}));return {result:await studio.call(sessionId,'list',JSON.stringify({projectId}))}}
    return {result:await studio.call(sessionId,args.action,JSON.stringify({projectId,...(args.project_json?{project:JSON.parse(args.project_json)}:{}),...(args.revision!==undefined?{revision:args.revision}:{}),...(args.edit_revision!==undefined?{editRevision:args.edit_revision}:{}),...(args.action==='compose'?{requestId:String(exec.callId)}:{})}))}
  }}))
}
export default {name,inject,Config,apply}
