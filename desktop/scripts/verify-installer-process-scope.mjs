import { spawn } from 'node:child_process'
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import assert from 'node:assert/strict'

const root=resolve(import.meta.dirname,'../../.build/installer-process-scope')
const helper=resolve(import.meta.dirname,'../../.build/installer-ui/modern-installer.exe')
const children=[]
const call=(mode,path)=>new Promise((ok,fail)=>{const child=spawn(helper,[mode,path],{windowsHide:true,stdio:'ignore'});child.on('error',fail);child.on('exit',ok)})
try {
  for(const name of ['target','unrelated']) {
    const dir=join(root,name);await mkdir(dir,{recursive:true});const executable=join(dir,'ZeroWallScience.exe');await copyFile(process.execPath,executable)
    const child=spawn(executable,['-e','setInterval(()=>{},1000)'],{windowsHide:true,stdio:'ignore'});children.push({child,executable})
    await new Promise((ok,fail)=>{child.once('spawn',ok);child.once('error',fail)})
  }
  assert.equal(await call('--check-running',children[0].executable),0)
  assert.equal(await call('--check-running',children[1].executable),0)
  assert.equal(await call('--stop-running',children[0].executable),1)
  assert.equal(await call('--check-running',children[0].executable),1)
  assert.equal(await call('--check-running',children[1].executable),0)
  const result={passed:true,scope:'Only the exact installation path was stopped; same-named unrelated executable remained running.'}
  await writeFile(join(root,'result.json'),JSON.stringify(result,null,2));console.log(result)
} finally { for(const {child} of children)if(child.exitCode===null)child.kill() }
