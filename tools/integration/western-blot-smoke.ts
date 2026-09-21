/** Actual installed Fiji/ImageJ computation and Host harvesting against independently specified numbers. */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { deflateSync } from 'node:zlib'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ResearchStore, type ImageRoi } from '../../store/src/index.js'
import { ImageViewerService } from '../../plugins/research/src/host/image-viewer.js'
import { FijiWorkflowService } from '../../plugins/research/src/host/fiji-workflow.js'
import type { WesternBlotPlan } from '../../plugins/research/src/shared/western-blot.js'
if(!process.argv.includes('--run'))throw new Error('Pass --run to quantify isolated synthetic blot fixtures with installed Fiji.')
const root=resolve('.build','western-blot-smoke',new Date().toISOString().replaceAll(':','-'));await mkdir(root,{recursive:true})
const store=new ResearchStore(join(root,'store.sqlite'));const project=store.createProject({name:'Synthetic blot independent numerical fixture',rootPath:root})
const images=new ImageViewerService(store);const workflows=new FijiWorkflowService(store)
const pixels=Buffer.alloc(64*40,200);const rois:ImageRoi[]=[];const lanes:WesternBlotPlan['lanes']=[]
for(let i=0;i<3;i++){
  const x=4+i*18
  for(const [name,y,value] of [['band',4,[100,50,0][i]!],['background',12,200],['loading',20,150],['loading-background',28,200]] as const){
    rois.push({id:`${name}-${i}`,name:`${name} ${i}`,kind:'rectangle',page:0,x,y,width:4,height:4})
    for(let row=y;row<y+4;row++)for(let col=x;col<x+4;col++)pixels[row*64+col]=value
  }
  lanes.push({sampleId:`lane-${i}`,biologicalReplicate:`donor-${i}`,group:i===0?'control':'treated',bandRoiId:`band-${i}`,backgroundRoiId:`background-${i}`,loadingRoiId:`loading-${i}`,loadingBackgroundRoiId:`loading-background-${i}`})
}
const plan:WesternBlotPlan={polarity:'dark',normalization:'housekeeping',saturation:{lower:0,upper:255,source:'Synthetic unsigned 8-bit acquisition; exact endpoints'},controlGroup:'control',lanes}
try{
  const crc=(bytes:Buffer)=>{let value=0xffffffff;for(const byte of bytes){value^=byte;for(let bit=0;bit<8;bit++)value=(value>>>1)^((value&1)?0xedb88320:0)}return (value^0xffffffff)>>>0}
  const chunk=(type:string,bytes:Buffer)=>{const body=Buffer.concat([Buffer.from(type),bytes]);const size=Buffer.alloc(4);size.writeUInt32BE(bytes.length);const check=Buffer.alloc(4);check.writeUInt32BE(crc(body));return Buffer.concat([size,body,check])}
  const header=Buffer.alloc(13);header.writeUInt32BE(64);header.writeUInt32BE(40,4);header[8]=8;header[9]=0;header[10]=0;header[11]=0;header[12]=0
  const filtered=Buffer.alloc(40*65);for(let y=0;y<40;y++){filtered[y*65]=0;pixels.copy(filtered,y*65+1,y*64,(y+1)*64)}
  const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(filtered)),chunk('IEND',Buffer.alloc(0))])
  const path=join(root,'blot.png');await writeFile(path,png)
  const asset=store.createDataAsset({projectId:project.id,name:'Synthetic grayscale blot',uri:pathToFileURL(path).href,mediaType:'image/png',location:'local'})
  const opened=await images.execute(project,{sessionId:'test',action:'image_open',assetId:asset.id})
  const saved=await images.execute(project,{sessionId:'test',action:'annotation_save',viewerId:opened.viewer!.id,expectedVersion:1,annotation:{expectedRevisionId:null,payload:{coordinates:opened.image!.coordinates,rois}}})
  const input={sessionId:'test',action:'submit' as const,requestId:'blot-independent-reference-1',viewerId:opened.viewer!.id,expectedVersion:1,annotationRevisionId:saved.annotationHead!.id,plan}
  let result=await workflows.execute(project,input)
  const replay=await workflows.execute(project,input)
  if(replay.run!.id!==result.run!.id)throw new Error('Idempotent submission failed')
  const runId=result.run!.id;const deadline=Date.now()+125000
  while(!['succeeded','failed','timed_out'].includes(result.run!.status)&&Date.now()<deadline){await new Promise(done=>setTimeout(done,250));result=await workflows.execute(project,{sessionId:'test',action:'status',runId})}
  if(result.run!.status!=='succeeded')throw new Error(JSON.stringify(result))
  const [control,treated,clipped]=result.result!.rows
  if(control!.correctedIntensity!==1600||control!.loadingCorrectedIntensity!==800||control!.normalized!==2||control!.relativeToControl!==1)throw new Error('Control reference mismatch')
  if(treated!.correctedIntensity!==2400||treated!.normalized!==3||treated!.relativeToControl!==1.5)throw new Error('Treatment reference mismatch')
  if(clipped!.normalized!==null||!clipped!.flags.includes('clipped_pixels'))throw new Error('Saturation QC failed')
  if(result.artifacts!.length!==16)throw new Error('ROI, result, CSV or QC overlay missing')
  const recovered=new FijiWorkflowService(store)
  const reopened=await recovered.execute(project,{sessionId:'test',action:'status',runId})
  if(reopened.result!.rows[1]!.relativeToControl!==1.5||store.listArtifacts(project.id).length!==16)throw new Error('Persistent recovery failed')
  recovered.dispose()
  await images.execute(project,{sessionId:'test',action:'annotation_save',viewerId:opened.viewer!.id,expectedVersion:1,annotation:{expectedRevisionId:saved.annotationHead!.id,payload:{coordinates:opened.image!.coordinates,rois:[]}}})
  if(!store.listArtifacts(project.id).every(item=>item.metadata.needsReview===true))throw new Error('ROI update did not invalidate measurements')
  await writeFile(join(root,'verification.json'),JSON.stringify({scope:'Synthetic numerical reference; not real biological evidence or GUI acceptance',independentReference:{control:{corrected:1600,loading:800,normalized:2,relative:1},treated:{corrected:2400,normalized:3,relative:1.5},clipped:{normalized:null}},result,idempotency:true,recovery:true,invalidation:true},null,2))
  console.log('WESTERN_BLOT_REFERENCE_PASS control=1 treated=1.5 clipped=null; 16 artifacts; idempotency/recovery/invalidation passed')
}finally{workflows.dispose();store.close();console.log(`REPORT ${root}`)}
