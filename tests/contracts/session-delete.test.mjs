import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { runInNewContext } from 'node:vm'
import { adaptSessionDelete } from '../../tools/packaging/adapt-session-delete.mjs'
import test from 'node:test'

test('rc.2 slot-based session menu offers deletion only through the desktop bridge', async () => {
 const original=await readFile(new URL('../../deepseek-harness/packages/client/ui-workspace/lib/client.js',import.meta.url),'utf8')
 const result=adaptSessionDelete(original)
 assert.equal(adaptSessionDelete(result),result)
 assert.match(result,/window\.zerowallDesktop\?\.deleteSession/)
 assert.match(result,/ZeroWallDeleteSessionMenuItem/)
 assert.match(result,/title: displayTitle, language: chinese \? "zh" : "en"/)
 assert.match(result,/id: "zerowall-delete-session"/)
 assert.match(result,/danger: true/)
 assert.match(result,/删除会话/)
 assert.match(result,/Delete session/)
 assert.match(result,/id: "session-id"/)
 assert.equal(result.match(/id: "zerowall-delete-session"/g)?.length,1)
 const syntax=spawnSync(process.execPath,['--check'],{input:result,encoding:'utf8'})
 assert.equal(syntax.status,0,syntax.stderr)
 assert.throws(()=>adaptSessionDelete(original.replace('inject: archiveInjected\n','inject: changedUpstream\n')),/Unrecognized session menu registrations/)
 const component=result.slice(result.indexOf('function ZeroWallDeleteSessionMenuItem'),result.indexOf('function apply(ctx)'))
 const calls=[]
 let open=true
 const sandbox={window:{zerowallDesktop:{deleteSession:async request=>calls.push(request)}},react_jsx_runtime:{jsx:(_type,props)=>props},_deepseek_ai_dsh_client_ui_primitives:{MenuItemButton:'button'}}
 const render=runInNewContext(`(${component.trim()})`,sandbox)
 for(const language of ['zh','en']){
   const props=render({sessionId:'fixture-session',displayTitle:'Draft',useMenuOpenState:()=>[open,value=>{open=value}],t:()=>language==='zh'?'归档会话':'Archive session'})
   assert.equal(props.children,language==='zh'?'删除会话':'Delete session')
   props.onSelect()
   assert.equal(open,false)
   assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1))),{sessionId:'fixture-session',title:'Draft',language})
 }
 sandbox.window={}
 assert.equal(render({useMenuOpenState:()=>[false,()=>{}],t:()=>''}),null)
 assert.throws(()=>adaptSessionDelete('changed upstream shape'),/Unrecognized/)
})
