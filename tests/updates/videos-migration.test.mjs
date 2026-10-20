import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {initializeProfile} from '../../tools/commands/profile.mjs'
const old='@oh-story/dsh', next='@zerowallscience/plugin-videos'
for(const mode of ['managed','disabled','removed','pinned','custom'])test('media identity migration preserves '+mode,async t=>{
 const home=await mkdtemp(join(tmpdir(),'zws-videos-migration-'));t.after(()=>rm(home,{recursive:true,force:true}))
 await mkdir(join(home,'profiles/web'),{recursive:true});await mkdir(join(home,'resources/plugins'),{recursive:true})
 const manifest={zerowall:{pluginArchitecture:6,disabledPlugins:mode==='disabled'?[old]:[],mediaModel:'keep'},dependencies:{[old]:mode==='custom'?'file:custom.tgz':mode==='pinned'?'0.1.17-zws.4':'^0.1.17-zws.4'},dsh:{profile:{bundles:[old,'other']}}}
 const selection={removed:mode==='removed'?[old]:[],pinned:mode==='pinned'?{[old]:'0.1.17-zws.4'}:{}}
 await writeFile(join(home,'profiles/web/package.json'),JSON.stringify(manifest));await writeFile(join(home,'resources/plugins/selection.json'),JSON.stringify(selection))
 await initializeProfile(home,[next,'other']);const result=JSON.parse(await readFile(join(home,'profiles/web/package.json'),'utf8'));const choices=JSON.parse(await readFile(join(home,'resources/plugins/selection.json'),'utf8'))
 assert.equal(result.zerowall.mediaModel,'keep');assert.equal(result.dsh.profile.bundles.includes(next),mode==='managed');assert.equal(result.dsh.profile.bundles.includes(old),['pinned','custom'].includes(mode));if(mode==='disabled')assert(result.zerowall.disabledPlugins.includes(next));if(mode==='removed')assert(choices.removed.includes(next));if(mode==='pinned')assert.deepEqual(choices.pinned,selection.pinned)
 const before=JSON.stringify(result);await initializeProfile(home,[next,'other']);assert.equal(JSON.stringify(JSON.parse(await readFile(join(home,'profiles/web/package.json'),'utf8'))),before)
})
