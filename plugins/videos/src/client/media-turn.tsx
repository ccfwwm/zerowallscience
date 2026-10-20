import type { ConversationNodeDefinition } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { MediaAsset, MediaJob } from '@zerowallscience/plugin-ai-cloud/types'
import { MediaToolRow } from './media-tool.js'
import type { Call } from './components.js'

interface TurnMedia { turn:number; items:Array<MediaAsset|MediaJob> }
declare module '@deepseek-ai/dsh-client-ui-conversation/client' { interface ConversationTurnDataMap { 'zerowall-media-results':TurnMedia } }

function itemsFrom(value:any):Array<MediaAsset|MediaJob> {
 if(Array.isArray(value))return value.flatMap(itemsFrom)
 if(!value||typeof value!=='object')return []
 if(typeof value.requestId==='string'&&typeof value.state==='string'&&typeof value.projectId==='string'&&Array.isArray(value.assets))return [value]
 if(typeof value.path==='string'&&/^media-projects\/[\w-]+\/(assets|outputs)\/[\w.-]+$/.test(value.path)&&typeof value.mediaType==='string'&&typeof value.sha256==='string'&&typeof value.bytes==='number')return [value]
 return []
}
export const mediaTurnDefinition:ConversationNodeDefinition<TurnMedia>={
 kind:'zerowall-media-results',
 match:event=>event.type==='turn/start'?{id:String(event.data.turn),role:'start'}:event.type==='tool/result'?{id:String(event.data.turn),role:'update'}:null,
 start:(_context,match)=>{if(match.event.type!=='turn/start')throw new Error('Media result start requires turn/start');return {turn:match.event.data.turn,items:[]}},
 update:(context,match)=>{
  const event=match.event as any, result=event.type==='tool/result'?event.data.message:event.data
  if(result.isError)return context.state
  const additions=(result.content??[]).flatMap((part:any)=>{if(part.type!=='text')return [];try{const parsed=JSON.parse(part.text);return itemsFrom(parsed).length?itemsFrom(parsed):itemsFrom(parsed.value?JSON.parse(parsed.value.result??'null'):null)}catch{return []}})
  if(!additions.length)return context.state
  const key=(item:MediaAsset|MediaJob)=>'requestId' in item?item.requestId:item.path
  return {...context.state,items:[...new Map([...context.state.items,...additions].map(item=>[key(item),item])).values()]}
 },
 buildLocationData:(context,scope)=>scope==='turn'&&context.state?{kind:'turn',turn:context.state.turn,key:'zerowall-media-results',value:context.state}:null,
}

export function MediaTurnResults({turn,sessionId,call}:PropsRuntime<'conversation.chat.turnTail'>&{call:Call}) {
 const items=turn.data.get('zerowall-media-results')?.items??[]
 if(!items.length)return null
 return <div aria-label="本轮媒体作品">{items.map(item=><MediaToolRow {...{phase:'result',block:{kind:'tool-result',content:[{type:'text',text:JSON.stringify(item)}],isError:false},toolName:'requestId' in item?'media_job':'media_import',sessionId,call} as any} key={'requestId' in item?item.requestId:item.path}/>)}</div>
}
