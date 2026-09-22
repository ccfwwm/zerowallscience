import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { ResearchStore } from '../../store/src/index.js'
import { HeService } from '../../plugins/research/src/host/he.js'
import { heSegmentationPython } from '../../plugins/research/src/host/he-segmentation.js'

if(!process.argv.includes('--run'))throw new Error('Pass --run for a real CPU StarDist reference.')
const root=resolve('.build/he-stardist-reference',new Date().toISOString().replaceAll(':','-'));await mkdir(root,{recursive:true})
const python=heSegmentationPython();const imagePath=join(root,'public-he-repeated.tif')
await promisify(execFile)(python,['-I','-c',`import numpy as np,tifffile,sys,json
from stardist.data import test_image_he_2d
image=np.tile(test_image_he_2d(),(4,3,1))
with tifffile.TiffWriter(sys.argv[1]) as writer:
 for level in range(4):
  step=2**level;writer.write(image[::step,::step],photometric='rgb',tile=(128,128),compression=None,subfiletype=0 if level==0 else 1,metadata=None)
print(json.dumps({'height':image.shape[0],'width':image.shape[1]}))`,imagePath],{windowsHide:true,timeout:120000,maxBuffer:1024*1024})
const store=new ResearchStore(join(root,'store.sqlite'));const project=store.createProject({name:'Public HE repeated software reference',rootPath:root});const service=new HeService(store)
try{
 const asset=store.createDataAsset({projectId:project.id,name:'StarDist bundled public HE example repeated',uri:pathToFileURL(imagePath).href,location:'local',mediaType:'image/tiff'})
 const opened=await service.execute(project,{sessionId:'s',action:'open',assetId:asset.id});const region={x:0,y:0,width:opened.he!.width,height:opened.he!.height,page:0}
 const before=performance.now();const submitted=await service.execute(project,{sessionId:'s',action:'segment',viewerId:opened.viewer!.id,expectedVersion:opened.viewer!.version,requestId:'reference-1',region,segmentation:{tileSize:256}})
 assert.equal(submitted.run?.status,'running',submitted.run?.error);const runId=submitted.run!.id
 let state=submitted
 for(let attempt=0;attempt<240;attempt++){await new Promise(resolve=>setTimeout(resolve,1000));state=await service.execute(project,{sessionId:'s',action:'status',runId});if(['succeeded','failed','cancelled','timed_out'].includes(state.run!.status))break}
 assert.equal(state.run?.status,'succeeded',state.run?.error);assert.ok(state.segmentation!.count>0);assert.ok(state.segmentation!.tiles>1)
 const taskDir=join(root,'.zerowall','he-segmentation',runId);const result=state.segmentation!;const milliseconds=performance.now()-before
 const reference=await promisify(execFile)(python,['-I',resolve('tools/science/he-stardist-independent-reference.py'),imagePath,taskDir],{windowsHide:true,timeout:240000,maxBuffer:1024*1024,env:{...process.env,TF_CPP_MIN_LOG_LEVEL:'3'}})
 const comparison=JSON.parse((await readFile(join(taskDir,'independent-reference.json'))).toString('utf8'));assert.ok(comparison.passed,JSON.stringify(comparison))
 await writeFile(join(root,'report.json'),JSON.stringify({passed:true,scope:'Actual OpenSlide lazy reads + CPU StarDist blocks compared with one full-image native prediction on the repeated bundled public HE example; not clinical validation',milliseconds,runId,result:{...result,preview:{...result.preview,pngBase64:undefined}},comparison,referenceOutput:reference.stdout.slice(-2000)},null,2));console.log(root)
}finally{service.dispose();store.close()}
