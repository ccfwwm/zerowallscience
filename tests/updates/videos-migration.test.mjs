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
 assert.equal(result.zerowall.mediaModel,'keep');assert.equal(result.dsh.profile.bundles.includes(next),['managed','pinned'].includes(mode));assert.equal(result.dsh.profile.bundles.includes(old),mode==='custom');if(mode==='disabled')assert(result.zerowall.disabledPlugins.includes(next));if(mode==='removed')assert(choices.removed.includes(next));if(mode==='pinned')assert.deepEqual(choices.pinned,selection.pinned)
 const before=JSON.stringify(result);await initializeProfile(home,[next,'other']);assert.equal(JSON.stringify(JSON.parse(await readFile(join(home,'profiles/web/package.json'),'utf8'))),before)
})

for (const mode of ['managed-new-wins','custom-new-wins','custom-installed']) test('media migration avoids duplicate activation: '+mode, async t => {
 const home=await mkdtemp(join(tmpdir(),'zws-videos-selection-'));t.after(()=>rm(home,{recursive:true,force:true}))
 await mkdir(join(home,'profiles/web'),{recursive:true});await mkdir(join(home,'resources/plugins'),{recursive:true})
 const custom=mode.startsWith('custom'),both=mode!=='custom-installed'
 const manifest={zerowall:{pluginArchitecture:6,disabledPlugins:mode==='managed-new-wins'?[old]:[]},dependencies:{[old]:custom?'file:custom.tgz':'^0.1.17-zws.4',[next]:'0.2.2'},dsh:{profile:{bundles:both?[old,next]:[old]}}}
 await writeFile(join(home,'profiles/web/package.json'),JSON.stringify(manifest));await writeFile(join(home,'resources/plugins/selection.json'),JSON.stringify({removed:mode==='managed-new-wins'?[old]:[],pinned:{[old]:'0.1.17-zws.4',[next]:'0.2.2'}}))
 if(mode==='custom-installed'){
  // A custom installed manifest wins over an adaptation-looking dependency version.
  manifest.dependencies[old]='0.1.17-zws.4';await writeFile(join(home,'profiles/web/package.json'),JSON.stringify(manifest))
  await mkdir(join(home,'profiles/web/node_modules',old),{recursive:true});await writeFile(join(home,'profiles/web/node_modules',old,'package.json'),JSON.stringify({name:old,version:'0.1.17-zws.4',custom:true}))
 }
 await initializeProfile(home,[next]);const result=JSON.parse(await readFile(join(home,'profiles/web/package.json'),'utf8'))
 assert.deepEqual(result.dsh.profile.bundles,both?[next]:[old])
 assert.equal(result.dependencies[old]!==undefined,custom)
 assert.equal(result.dependencies[next],'0.2.2')
 const choices=JSON.parse(await readFile(join(home,'resources/plugins/selection.json'),'utf8'))
 assert.equal(choices.pinned[old],'0.1.17-zws.4');assert.equal(choices.pinned[next],'0.2.2')
 assert(!result.zerowall.disabledPlugins.includes(next));assert(!choices.removed.includes(next))
 const before=JSON.stringify(result);await initializeProfile(home,[next]);assert.equal(JSON.stringify(JSON.parse(await readFile(join(home,'profiles/web/package.json'),'utf8'))),before)
})
