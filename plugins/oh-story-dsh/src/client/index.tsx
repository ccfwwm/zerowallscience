import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { useEffect, useRef } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import type { MediaJob } from '@zerowallscience/plugin-ai-cloud/types'
import { WorkbenchSeat } from './workbench-seat.js'
import { MediaWorkspace } from './workspace.js'
import { MediaToolRow } from './media-tool.js'
import { mediaTurnDefinition, MediaTurnResults } from './media-turn.js'
export { MediaWorkspace } from './workspace.js'
export const name='oh-story'
export const inject=['betterSidebar','slots','sessions','conversation','uiConversation','remote','remote.zerowallMediaStudio']
declare module '@deepseek-ai/dsh-client-ui-slots' { interface SlotMap { 'oh-story.workspace':{kind:'single';scope:'session'} } }
import type { Call } from './components.js'
export * from './components.js'
export function TaskObserver({sessionId,call,reveal}:PropsRuntime<'oh-story.workspace'>&{call:Call;reveal:(sessionId:string)=>void}) {
 const seen=useRef<Set<string>>()
 useEffect(()=>{let cancelled=false,running=false;const started=Date.now();seen.current=undefined
 const poll=async()=>{if(running)return;running=true;try{const data=await call(sessionId,'list');if(cancelled)return;const ids=new Set<string>((data.jobs??[]).map((job:MediaJob)=>job.id));for(const job of data.compositions??[])ids.add('render:'+job.id);for(const project of data.projects??[])for(const asset of [...project.assets,...project.outputs])ids.add('asset:'+asset.path);if(seen.current?[...ids].some(id=>!seen.current!.has(id)):(data.jobs??[]).some((job:MediaJob)=>Date.parse(job.createdAt)>=started))reveal(sessionId);seen.current=ids}catch{}finally{running=false}}
 void poll();const timer=setInterval(()=>void poll(),2500);return()=>{cancelled=true;clearInterval(timer)}
 },[sessionId]);return null
}
export function apply(ctx:Context){
 const remote=(ctx.get('remote.zerowallMediaStudio' as any) as any)
 const sidebar=ctx.get('betterSidebar' as any) as {registerTab:(descriptor:any)=>()=>void;openTab:(seed:any,scope:{sessionId:string})=>void}
 const call:Call=async(sessionId,action,input={})=>{const result=await remote.call(sessionId,action,JSON.stringify(input));if(!result.ok)throw new Error(result.error?.message??'媒体操作失败');return JSON.parse(result.value??result.result?.value??'{}')}
 const send=(sessionId:string,prompt:string)=>{const binding=(ctx.sessions as unknown as ISessions).binding(sessionId as Parameters<ISessions['binding']>[0]);const conversation=binding?.ctx.get('conversation');if(!conversation)throw new Error('请先打开一个聊天会话');return conversation.send(prompt)}
 const reveal=(sessionId:string)=>sidebar.openTab({type:'zerowall:media-studio',target:'side'},{sessionId})
 ctx.uiConversation.events.register(mediaTurnDefinition)
 ctx.slots.inject('conversation.chat.turnTail',()=>ctx.slots.register({name:'conversation.chat.turnTail',id:'zerowall:media-results',order:4,inject:()=>({call})},MediaTurnResults))
 ctx.slots.inject('tool.call.toolview', () => ['media_job','media_import','media_project'].map(key => ctx.slots.register({name:'tool.call.toolview',key,inject:()=>({call})},MediaToolRow)))
 ctx.effect(()=>sidebar.registerTab({id:'zerowall:media-studio',title:'多媒体创作',description:'视频、音乐与宣传片创作，图片作为视频参考素材',single:true,order:22,
 icon:(size:number)=><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="5" width="18" height="15" rx="3"/><path d="m9 10 6 4-6 4zM8 2v4m8-4v4"/></svg>,
 component:({scope,visible}:{scope:{sessionId:string};visible:boolean})=><MediaWorkspace key={scope.sessionId} sessionId={scope.sessionId} call={call} send={prompt=>send(scope.sessionId,prompt)} visible={visible}/>
 }), 'oh-story: media sidebar')
 ctx.slots.inject('shell.overlay',()=>{
 const seat=ctx.slots.register({name:'shell.overlay',id:'oh-story-workspace',order:-100,inject:()=>({sessionController:ctx.sessions as unknown as ISessions,empty:()=>null}),children:{'oh-story.workspace':{kind:'single',scope:'session'}}},WorkbenchSeat)
 const observer=ctx.slots.register({name:'oh-story.workspace',inject:()=>({call,reveal})},TaskObserver)
 return [seat,observer]
 })
}
export default {name,inject,apply}
