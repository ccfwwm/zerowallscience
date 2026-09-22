import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {BRAIN_GLOBE_RUNNER} from '../../plugins/research/src/host/brainglobe-runner.js'
if(!process.argv.includes('--run'))throw new Error('Pass --run for local installed atlas coordinate acceptance.')
const root=resolve('.build/brain-coordinate-smoke',new Date().toISOString().replaceAll(':','-'));await mkdir(root,{recursive:true})
const atlasDir=process.env.ZEROWALL_BRAINGLOBE_DIR||resolve('.zerowall/brainglobe-managed')
const python=process.env.ZEROWALL_BRAINGLOBE_PYTHON||'python'
const run=(script:string,input:unknown)=>new Promise<any>((yes,no)=>{const child=spawn(python,['-E','-P','-c',script],{windowsHide:true,stdio:['pipe','pipe','pipe']});let stdout='',stderr='';const timer=setTimeout(()=>child.kill(),60000);child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);child.on('error',no);child.on('close',code=>{clearTimeout(timer);if(code)no(new Error(stderr||stdout));else try{yes(JSON.parse(stdout))}catch{no(new Error(stdout))}});child.stdin.end(JSON.stringify(input))})
const reference=await run(`import json,sys,numpy as np
from brainglobe_atlasapi import BrainGlobeAtlas
r=json.load(sys.stdin)
a=BrainGlobeAtlas('allen_mouse_25um',brainglobe_dir=r['dir'],check_latest=False)
point=None
for row in np.argwhere(a.annotation[::16,::16,::16]>0):
 p=(row*16).tolist(); label=int(a.annotation[tuple(p)])
 if label in a.structures: point=p; break
assert point is not None
print(json.dumps({'shape':list(a.shape),'resolution':list(a.resolution),'orientation':a.orientation,'point':point,'regionId':int(a.annotation[tuple(point)]),'acronym':a.structures[int(a.annotation[tuple(point)])]['acronym']}))`,{dir:atlasDir})
const p=reference.point as number[];const outside=[[-1,p[1],p[2]],[-.1,p[1],p[2]],[p[0],-1,p[2]],[p[0],p[1],-1],...[0,1,2].map(i=>p.map((v,j)=>i===j?reference.shape[j]:v))]
const voxel=await run(BRAIN_GLOBE_RUNNER,{operation:'coordinates',brainglobeDir:atlasDir,coordinateUnits:'voxel',coordinates:[p,...outside]})
assert.equal(voxel.analysis.mapped,1);assert.equal(voxel.analysis.outside,7);assert.equal(voxel.analysis.cells[0].regionId,reference.regionId)
const micron=await run(BRAIN_GLOBE_RUNNER,{operation:'coordinates',brainglobeDir:atlasDir,coordinateUnits:'micron',coordinates:[p.map((v,i)=>v*reference.resolution[i]),[-.1,0,0],[reference.shape[0]*25,0,0]]})
assert.equal(micron.analysis.mapped,1);assert.equal(micron.analysis.outside,2);assert.equal(micron.analysis.cells[0].regionId,reference.regionId)
await writeFile(join(root,'report.json'),JSON.stringify({status:'passed',scope:'Real installed Allen 25um atlas, independent direct NumPy annotation lookup; axis/bounds software validation only',reference,voxel,micron},null,2))
console.log(JSON.stringify({status:'passed',output:root,reference}))
