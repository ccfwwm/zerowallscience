import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ResearchStore } from '../../store/src/index.js'
import { FijiExperimentService } from '../../plugins/research/src/host/fiji-experiments.js'
import type { FijiImageConfig } from '../../plugins/research/src/shared/fiji-experiments.js'
if(!process.argv.includes('--run'))throw new Error('Pass --run for actual native ImageJ.')
const root=resolve('.build/fiji-review-native',new Date().toISOString().replaceAll(':','-'));await mkdir(root,{recursive:true})
execFileSync('python',[resolve('tools/science/fiji-workflow-reference-fixtures.py'),'--output',join(root,'fixtures')])
const store=new ResearchStore(join(root,'store.sqlite'));const project=store.createProject({name:'Fiji review geometry reference',rootPath:root});const service=new FijiExperimentService(store)
const asset=async(name:string)=>store.createDataAsset({projectId:project.id,name,uri:pathToFileURL(join(root,'fixtures',name)).href,location:'local',mediaType:'image/x-portable-graymap'})
const outputs:unknown[]=[]
try{
 const colony=await asset('colony-A1-raw.pgm');const checksum=createHash('sha256').update(await readFile(join(root,'fixtures','colony-A1-raw.pgm'))).digest('hex')
 const rois=[{id:'reflection',x:20,y:4,width:3,height:3},{id:'edge',x:0,y:19,width:2,height:2},...[[4,4],[12,4],[4,13],[8,13]].map(([x,y],i)=>({id:`colony-${i}`,x:x!,y:y!,width:3,height:3}))].map(roi=>({...roi,kind:'rectangle' as const,name:roi.id,page:0}))
 const payload={coordinates:{convention:'pixel-edge-top-left' as const,width:40,height:24,pages:1,calibration:null},rois}
 const revision=store.createAnnotationRevision({projectId:project.id,assetId:colony.id,sourceSha256:checksum,expectedRevisionId:null,origin:'workbench',payload}).head
 const common={threshold:150,polarity:'bright' as const,minArea:2,maxArea:100,roi:{x:0,y:0,width:40,height:24}}
 const run=async(key:string,sourceAssetId:string,image:FijiImageConfig)=>{const result=await service.execute(project,{sessionId:'fixture',action:'analyze',requestId:key,experiment:image.kind??'bacterial-cfu',sourceAssetId,image});assert.equal(result.run?.status,'succeeded',result.run?.error);outputs.push({key,...result});return result}
 const raw=await run('raw',colony.id,{...common,kind:'colony-formation',wellId:'A1',stainUnit:'pixel'});assert.equal((raw.result!.measurements[0] as any).independentCount,5)
 const review={annotationRevisionId:revision.id,excludedRoiIds:['reflection','edge'],reason:'Declared reflection and plate edge'}
 const excluded=await run('excluded',colony.id,{...common,kind:'colony-formation',wellId:'A1',stainUnit:'pixel',review});assert.deepEqual([(excluded.result!.measurements[0] as any).independentCount,(excluded.result!.measurements[0] as any).stainedArea],[3,37])
 const accepted={...review,foregroundRoiIds:['colony-0','colony-1','colony-2','colony-3'],reason:'Review two touching colonies separately'}
 const corrected=await run('corrected',colony.id,{...common,kind:'colony-formation',wellId:'A1',stainUnit:'pixel',seededCells:100,review:accepted});assert.deepEqual([(corrected.result!.measurements[0] as any).independentCount,(corrected.result!.measurements[0] as any).stainedArea,(corrected.result!.measurements[0] as any).colonyFormationFraction],[4,36,.04])
 const cfu=await run('count-only',colony.id,{...common,kind:'bacterial-cfu',plateId:'P1',review:accepted});assert.equal((cfu.result!.measurements[0] as any).colonyCount,4);assert.equal((cfu.result!.measurements[0] as any).cfuPerMl,null)
 const full=await run('cfu',colony.id,{...common,kind:'bacterial-cfu',plateId:'P1',dilutionFactor:1000,platedVolumeMl:.1,review:accepted});assert.equal((full.result!.measurements[0] as any).cfuPerMl,40000)
 store.createAnnotationRevision({projectId:project.id,assetId:colony.id,sourceSha256:checksum,expectedRevisionId:revision.id,origin:'fiji',payload})
 assert.equal((await service.status(project,corrected.run!.id)).result!.reviewState,'needs_recheck')
 await assert.rejects(()=>run('stale',colony.id,{...common,kind:'bacterial-cfu',plateId:'P1',review:accepted}),/current accepted/)
 const timeline={fieldId:'F1',timeHours:0,expectedHours:[0,24,48],pixelSpacing:{x:1,y:1,unit:'um' as const,source:'synthetic fixture geometry'}}
 const scratch={kind:'scratch-wound' as const,sampleId:'S1',time:'ignored',initialArea:999,threshold:150,polarity:'bright' as const,roi:{x:2,y:2,width:18,height:12},timeline}
 const zero=await run('0h',(await asset('scratch-S1-0h.pgm')).id,scratch);assert.equal((zero.result!.measurements[0] as any).initialArea,48)
 const twenty=await asset('scratch-S1-24h.pgm');const later=await run('24h',twenty.id,{...scratch,timeline:{...timeline,timeHours:24,baselineRunId:zero.run!.id}});assert.equal((later.result!.measurements[0] as any).closurePercent,50);assert.deepEqual(later.result!.timeline?.missingHours,[48])
 const duplicate=await run('same-time-retry',twenty.id,{...scratch,timeline:{...timeline,timeHours:24,baselineRunId:zero.run!.id}});assert.equal(duplicate.run!.id,later.run!.id)
 await assert.rejects(()=>run('same-time-changed',twenty.id,{...scratch,threshold:151,timeline:{...timeline,timeHours:24,baselineRunId:zero.run!.id}}),/IDEMPOTENCY_CONFLICT/)
 const final=await run('48h',(await asset('scratch-S1-48h.pgm')).id,{...scratch,timeline:{...timeline,timeHours:48,baselineRunId:zero.run!.id}});assert.equal((final.result!.measurements[0] as any).closurePercent,100);assert.deepEqual(final.result!.timeline?.missingHours,[])
 await assert.rejects(()=>run('wrong-sample',twenty.id,{...scratch,sampleId:'S2',timeline:{...timeline,timeHours:24,baselineRunId:zero.run!.id}}),/sample\/field/)
 await assert.rejects(()=>run('wrong-scale',twenty.id,{...scratch,timeline:{...timeline,timeHours:24,baselineRunId:zero.run!.id,pixelSpacing:{...timeline.pixelSpacing,x:2}}}),/spacing/)
 const tube=await asset('tube-ring.pgm');const tubeSha=createHash('sha256').update(await readFile(join(root,'fixtures','tube-ring.pgm'))).digest('hex')
 const tubeAnnotation=store.createAnnotationRevision({projectId:project.id,assetId:tube.id,sourceSha256:tubeSha,expectedRevisionId:null,origin:'workbench',payload:{coordinates:{convention:'pixel-edge-top-left',width:20,height:20,pages:1,calibration:null},rois:[{id:'break',name:'reviewed break',kind:'rectangle',page:0,x:8,y:5,width:1,height:1}]}}).head
 const tubeConfig={kind:'tube-formation' as const,sampleId:'tube',threshold:128,polarity:'bright' as const,unit:'pixel' as const,unitScale:1,roi:{x:0,y:0,width:20,height:20}}
 const closed=await run('tube-closed',tube.id,tubeConfig);const opened=await run('tube-open',tube.id,{...tubeConfig,review:{annotationRevisionId:tubeAnnotation.id,excludedRoiIds:['break'],reason:'Geometric broken ring reference'}})
 assert.equal((closed.result!.measurements[0] as any).meshes,1);assert.equal((opened.result!.measurements[0] as any).meshes,0)
 const sourceBefore=await readFile(join(root,'fixtures','scratch-S1-0h.pgm'));await writeFile(join(root,'fixtures','scratch-S1-0h.pgm'),Buffer.concat([sourceBefore,Buffer.from('changed')]))
 assert.equal((await service.status(project,later.run!.id)).result!.reviewState,'needs_recheck')
 await writeFile(join(root,'report.json'),JSON.stringify({passed:true,scope:'Actual local ImageJ; synthetic independent geometry; no biological accuracy claim',outputs},null,2));console.log(root)
}finally{service.dispose();store.close()}
