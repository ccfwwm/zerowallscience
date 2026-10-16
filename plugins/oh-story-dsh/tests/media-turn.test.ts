import { expect,it } from 'vitest'
import { mediaTurnDefinition } from '../src/client/media-turn.js'
import { ConversationNodeAssembler } from '../../../deepseek-harness/packages/client/ui-conversation/src/client/conversation/assembler.js'

it('publishes direct and deferred media results against their own turn without leaking previous results',()=>{
 const start:any={event:{type:'turn/start',data:{turn:3}}}
 const definition=mediaTurnDefinition as any
 let state=definition.start({},start)
 const asset={id:'a',path:'media-projects/p/outputs/a.mp4',mediaType:'video/mp4',bytes:100,sha256:'hash'}
 const result=(value:any,isError=false)=>({event:{type:'tool/result',data:{turn:3,message:{isError,content:[{type:'text',text:JSON.stringify(value)}]}}}})
 state=definition.update({state},result({protocol:'dsh-tool-dispatch',value:{result:JSON.stringify(asset)}}))
 state=definition.update({state},result(asset))
 expect(state.items).toEqual([asset])
 expect(definition.buildLocationData({state},'turn').value.items).toEqual([asset])
 expect(definition.update({state},result({path:'private/unsafe',mediaType:'video/mp4'})).items).toEqual([asset])
 expect(definition.update({state},result(asset,true)).items).toEqual([asset])
 expect(definition.start({}, {event:{type:'turn/start',data:{turn:4}}}).items).toEqual([])
})

it('keeps real conversation views activatable and publishes results under the definition owned key',()=>{
 const views=['chat','trajectory','zotero','ssh'].map(target=>({target,create:()=>({
  empty:null,
  replace:({timeline}:any)=>timeline,
  apply:({timeline}:any)=>timeline,
 })}))
 const assembler=new ConversationNodeAssembler({entries:()=>[mediaTurnDefinition],fallbackEntry:()=>undefined},{entries:()=>views})
 const input=(seq:number,type:string,data:any)=>({type:'event',event:{seq,time:1700000000000+seq,type,data}} as any)
 assembler.replaceWindow([input(1,'turn/start',{turn:3}),input(2,'step/start',{turn:3,step:1})],false)
 for(const view of views)expect(()=>assembler.activateTarget(view.target)).not.toThrow()
 const asset={id:'a',path:'media-projects/p/outputs/a.mp4',mediaType:'video/mp4',bytes:100,sha256:'hash'}
 assembler.append(input(3,'tool/result',{turn:3,step:1,message:{isError:false,content:[{type:'text',text:JSON.stringify(asset)}]}}))
 expect(()=>assembler.flush()).not.toThrow()
 for(const view of views){
  const timeline=assembler.snapshot(view.target) as any
  expect(timeline.turns.get(3).data.get('zerowall-media-results').items).toEqual([asset])
 }
 assembler.append(input(4,'turn/start',{turn:4}))
 assembler.flush()
 const timeline=assembler.snapshot('chat') as any
 expect(timeline.turns.get(4).data.get('zerowall-media-results').items).toEqual([])
 expect(timeline.turns.get(3).data.get('zerowall-media-results').items).toEqual([asset])
})
