import assert from 'node:assert/strict'
import {execFile} from 'node:child_process'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {promisify} from 'node:util'
import {runBrainTransform} from '../../plugins/research/src/host/brain-transform.js'
if(!process.argv.includes('--run'))throw new Error('Pass --run for the installed NiftyReg geometric reference.')
const root=resolve('.build/brain-transform-smoke',new Date().toISOString().replaceAll(':','-'));await mkdir(root,{recursive:true})
const python=process.env.ZEROWALL_BRAINGLOBE_PYTHON||'python'
const reference=JSON.parse((await promisify(execFile)(python,['-E','-P',resolve('tools/integration/brain-transform-reference.py'),root],{windowsHide:true,timeout:120000})).stdout)
const results=[];let maxErrorMicron=0
for(const fixture of reference.cases){
 const result:any=await runBrainTransform({action:'map',directory:fixture.directory,contract:{sourceShape:reference.shape,atlasResolution:[25,25,25],atlasShape:[528,320,456]},coordinates:[...fixture.points,[-.01,0,0],[15.01,0,0],[0,18,0],[0,0,20]]})
 assert.equal(result.outsideSourceGrid,4)
 for(let i=0;i<fixture.points.length;i++)for(let axis=0;axis<3;axis++){const error=Math.abs(result.rows[i].atlasMicron[axis]-fixture.expectedMillimeter[i][axis]*1000);maxErrorMicron=Math.max(maxErrorMicron,error);assert.ok(error<.001,`${fixture.name} point ${i} axis ${axis}: ${error}`)}
 results.push({name:fixture.name,result})
}
await writeFile(join(root,'report.json'),JSON.stringify({status:'passed',scope:'Synthetic geometry; actual NiftyReg reg_transform fields versus independent affine multiplication. Does not establish anatomical registration quality.',toleranceMicron:.001,maxErrorMicron,reference,results},null,2))
console.log(JSON.stringify({status:'passed',output:root,maxErrorMicron,cases:results.length}))
