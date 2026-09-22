import assert from 'node:assert/strict'
import {execFile} from 'node:child_process'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {promisify} from 'node:util'
import {pathToFileURL} from 'node:url'
import {ResearchStore} from '../../store/src/index.js'
import {BrainAtlasService} from '../../plugins/research/src/host/brain-atlas.js'
import {CELLFINDER_RUNNER} from '../../plugins/research/src/host/brainglobe-runner.js'
if(!process.argv.includes('--run'))throw new Error('Pass --run for actual CPU cellfinder synthetic positives.')
const root=resolve('.build/brain-cellfinder-positive',new Date().toISOString().replaceAll(':','-'));await mkdir(root,{recursive:true})
const python=process.env.ZEROWALL_BRAINGLOBE_PYTHON||'python'
const generate=`import json,sys,numpy as np
from pathlib import Path
root=Path(sys.argv[1]);shape=(64,128,128);grid=np.indices(shape,dtype=np.float32);centres=[(16,32,32),(32,64,96),(48,96,48)]
signal=np.full(shape,100,dtype=np.float32)
for z,y,x in centres:
 d=((grid[0]-z)*5)**2+(grid[1]-y)**2+(grid[2]-x)**2
 signal+=50000*np.exp(-d/(2*4**2))
np.save(root/'signal.npy',signal.astype(np.uint16))
print(json.dumps({'shape':shape,'voxelSizes':[5,1,1],'expectedXYZ':[[x,y,z] for z,y,x in centres],'source':'Deterministic synthetic 3D Gaussian somas, sigma 4 microns, amplitude 50000, background100; no anatomical labels or classification'}))`
const fixture=JSON.parse((await promisify(execFile)(python,['-E','-P','-c',generate,root],{windowsHide:true})).stdout)
// Windows multiprocessing requires a real main guard around the exact product runner.
const entry=join(root,'runner.py');await writeFile(entry,"if __name__ == '__main__':\n"+CELLFINDER_RUNNER.split('\n').map(line=>' '+line).join('\n'))
const started=Date.now()
const result=await new Promise<any>((yes,no)=>{const child=execFile(python,['-E','-P',entry],{windowsHide:true,timeout:300000,maxBuffer:64*1024**2,env:{...process.env,OMP_NUM_THREADS:'1',OPENBLAS_NUM_THREADS:'1',MKL_NUM_THREADS:'1'}},(error,stdout,stderr)=>{void writeFile(join(root,'stderr.log'),stderr);void writeFile(join(root,'stdout.log'),stdout);if(error)return no(new Error(stderr||stdout));try{yes(JSON.parse(stdout))}catch{no(new Error(stdout))}});child.stdin?.end(JSON.stringify({signalPath:join(root,'signal.npy'),voxelSizes:[5,1,1],skipClassification:true,nFreeCpus:2}))})
await writeFile(join(root,'result.json'),JSON.stringify(result,null,2))
const points=result.analysis.cells.map((c:any)=>[c.x,c.y,c.z]);const distances=fixture.expectedXYZ.map((p:number[])=>points.map((q:number[])=>Math.hypot(...p.map((v:number,i:number)=>(v-q[i]!)*(i===2?5:1)))))
const matched=new Set<number>();let maxDistanceMicron=0;const missed:number[]=[]
for(const [i,row]of distances.entries()){const nearest=Math.min(...row);const at=row.indexOf(nearest);if(nearest>5||matched.has(at)){missed.push(i);continue}matched.add(at);maxDistanceMicron=Math.max(maxDistanceMicron,nearest)}
const falsePositives=points.length-matched.size
process.env.ZEROWALL_BRAINGLOBE_DIR||=resolve('.zerowall/brainglobe-managed')
const store=new ResearchStore(join(root,'store.sqlite'));let host
try{const project=store.createProject({name:'Synthetic cellfinder positives',rootPath:root});const asset=store.createDataAsset({projectId:project.id,name:'signal.npy',uri:pathToFileURL(join(root,'signal.npy')).href,location:'local',mediaType:'application/octet-stream'});host=await new BrainAtlasService(store).execute(project,{sessionId:'fixture',action:'cellfinder',assetId:asset.id,voxelSizes:[5,1,1],skipClassification:true,nFreeCpus:2});assert.equal(host.cellfinder?.detected,points.length);assert.deepEqual(host.analysis?.cells.map(row=>row.coordinate),points);assert.ok(host.artifact?.checksum)}finally{store.close()}
const report={status:missed.length||falsePositives?'partial':'passed',scope:'Synthetic detection-only CPU test; actual Host matches direct engine. Does not establish biological sensitivity/specificity or classification performance. Fixture and upstream default thresholds were not tuned after observing misses.',fixture,result,host,matched:matched.size,missed,falsePositives,maxDistanceMicron,durationMs:Date.now()-started}
await writeFile(join(root,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,output:root,detected:points.length,missed,falsePositives,maxDistanceMicron,durationMs:report.durationMs}))
assert.ok(matched.size>0,'No synthetic positive detected')
