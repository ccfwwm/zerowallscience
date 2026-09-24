import {createHash,randomUUID} from 'node:crypto'
import {createReadStream} from 'node:fs'
import {mkdir,readFile,stat,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {spawn} from 'node:child_process'
import type {ResearchStore} from '@zerowallscience/research-store'
import type {JsonObject,ProjectRecord} from '@zerowallscience/research-store/types'
import type {BrainTransformContract,BrainTransformRequest} from '../shared/brain-transform.js'
import {containedFile} from './science-viewer.js'
import {BRAIN_TRANSFORM_RUNNER} from './brain-transform-runner.js'
import {BrainJobScope,settleRunner,stopBrainProcess} from './brain-process.js'

import { pythonChildEnvironment } from './python-env.js'
import {defaultAtlasDirectory} from './brain-atlas.js'

/**
 * Resolve the managed atlas directory the same way the atlas service does.
 *
 * Reading ZEROWALL_BRAINGLOBE_DIR alone broke every packaged build: nothing in
 * the application sets that variable, so transform inspection and transform use
 * both threw before reaching any runner. The environment variable stays the
 * override; the managed root is the default, matching brain-atlas.ts.
 */
function managedAtlasDirectory():string|undefined{
 const configured=process.env.ZEROWALL_BRAINGLOBE_DIR?.trim()
 return configured&&configured.length>0?configured:defaultAtlasDirectory()
}

const NAMES=['downsampled.tiff','deformation_field_0.tiff','deformation_field_1.tiff','deformation_field_2.tiff']
export const brainFileHash=async(path:string)=>{const hash=createHash('sha256');for await(const bytes of createReadStream(path))hash.update(bytes);return hash.digest('hex')}
export async function runBrainTransform(input:unknown,scope?:BrainJobScope):Promise<JsonObject>{
 const python=process.env.ZEROWALL_BRAINGLOBE_PYTHON?.trim()||process.env.ZEROWALL_PYTHON?.trim()||'python'
 return new Promise((yes,no)=>{const child=(scope?.spawn??spawn)(python,['-E','-P','-c',BRAIN_TRANSFORM_RUNNER],{windowsHide:true,shell:false,detached:process.platform!=='win32',stdio:['pipe','pipe','pipe'],env: pythonChildEnvironment(undefined,{OMP_NUM_THREADS:'1',OPENBLAS_NUM_THREADS:'1',MKL_NUM_THREADS:'1'})});let output='',error='';let exceeded=false;const timer=setTimeout(()=>{exceeded=true;stopBrainProcess(child)},180000);child.on('error',e=>{clearTimeout(timer);no(e)});child.stdout.on('data',b=>{output+=b;if(output.length>32*1024**2){exceeded=true;stopBrainProcess(child)}});child.stderr.on('data',b=>error=(error+b).slice(-12000));const settle=settleRunner(child,code=>{clearTimeout(timer);if(exceeded)return no(new Error('Brain transform exceeded its time/output bound.'));if(code===null)return no(new Error(error||'Brain transform runner exited without reporting a status.'));if(code!==0)return no(new Error(error||output));try{const value=JSON.parse(output);if(value.error)throw new Error(value.error);yes(value)}catch(e){no(e)}});child.on('exit',code=>settle.gone(code));child.stdin.end(JSON.stringify(input))})
}
export async function createBrainTransformContract(directory:string,scope?:BrainJobScope):Promise<BrainTransformContract>{
 const atlasDirectory=managedAtlasDirectory();if(!atlasDirectory)throw new Error('Managed atlas directory is required for transform inspection; configure the shared Python environment first.')
 const inspected=await runBrainTransform({action:'inspect',directory,atlasDirectory},scope)
 const producer=inspected.producer as unknown as BrainTransformContract['producer']
 if(producer.brainreg!=='1.0.16')throw new Error('Transform semantics currently validated only for brainreg 1.0.16.')
 const files=[];for(const name of NAMES){const path=await containedFile(directory,join(directory,name));const info=await stat(path);if(!info.isFile()||info.size<1)throw new Error('Missing transform volume.');files.push({name,bytes:info.size,sha256:await brainFileHash(path)})}
 return{format:'zerowall-brainreg-transform',version:1,producer,atlas:'allen_mouse_25um',atlasVersion:String(inspected.atlasVersion),atlasOrientation:'asr',sourceSpace:'brainreg-downsampled-asr-voxel',fieldUnits:'atlas-absolute-millimeter',direction:'sample-grid-to-atlas',interpolation:'trilinear',sourceShape:inspected.sourceShape as unknown as [number,number,number],atlasShape:inspected.atlasShape as unknown as [number,number,number],atlasResolution:inspected.atlasResolution as unknown as [number,number,number],files}
}
export class BrainTransformService{
 private busy=false
 private jobs=new BrainJobScope()
 constructor(private store:ResearchStore){}
 private get activeStore():ResearchStore{this.jobs.assertActive();return this.store}
 dispose():Promise<void>{return this.jobs.dispose()}
 async execute(project:ProjectRecord,input:BrainTransformRequest):Promise<JsonObject>{
  if(this.busy)throw new Error('A brain transform is already in progress.');this.busy=true
  try{return await this.jobs.run(()=>this.executeOne(project,input))}finally{this.busy=false}
 }
 private async executeOne(project:ProjectRecord,input:BrainTransformRequest):Promise<JsonObject>{
  if(!['inspect','map'].includes(input.action))throw new Error('Unsupported transform action.')
  const artifact=this.activeStore.listArtifacts(project.id).find(a=>a.id===input.registrationArtifactId)
  if(!artifact||artifact.name!=='BrainGlobe brainreg registration'||!artifact.uri.startsWith('file:'))throw new Error('Select a registered brainreg artifact in this project.')
  const path=await containedFile(project.rootPath,fileURLToPath(artifact.uri));if((await stat(path)).size>2*1024**2)throw new Error('Registration manifest exceeds its size limit.')
  const bytes=await readFile(path);if(createHash('sha256').update(bytes).digest('hex')!==artifact.checksum)throw new Error('Registration manifest checksum changed.')
  const manifest=JSON.parse(bytes.toString('utf8'));const contract=manifest.transform as BrainTransformContract|undefined
  if(!contract||contract.format!=='zerowall-brainreg-transform'||contract.version!==1||contract.producer?.brainreg!=='1.0.16'||contract.direction!=='sample-grid-to-atlas'||contract.sourceSpace!=='brainreg-downsampled-asr-voxel'||contract.fieldUnits!=='atlas-absolute-millimeter'||contract.atlasOrientation!=='asr'||contract.interpolation!=='trilinear'||contract.atlas!=='allen_mouse_25um')throw new Error('Registration has no compatible verified transform contract; rerun with the current engine.')
  for(const key of ['sourceShape','atlasShape','atlasResolution'] as const){const values=contract[key];if(!Array.isArray(values)||values.length!==3||values.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<=0||(key!=='atlasResolution'&&!Number.isSafeInteger(v))))throw new Error('Invalid transform geometry.')}
  if(!Array.isArray(contract.files)||contract.files.length!==4||NAMES.some(name=>contract.files.filter(f=>f.name===name).length!==1))throw new Error('Invalid transform file manifest.')
  const directory=await containedFile(project.rootPath,String(manifest.outputDirectory))
  const verifyFiles=async()=>{for(const entry of contract.files){if(!Number.isSafeInteger(entry.bytes)||entry.bytes<1||!/^[a-f0-9]{64}$/u.test(entry.sha256))throw new Error('Invalid transform file integrity metadata.');const file=await containedFile(directory,join(directory,entry.name));const info=await stat(file);if(!info.isFile()||info.size!==entry.bytes||await brainFileHash(file)!==entry.sha256)throw new Error('Brainreg transform file checksum changed: '+entry.name)}}
  await verifyFiles()
  const atlasDirectory=managedAtlasDirectory();if(!atlasDirectory)throw new Error('Managed atlas directory is required for transform use; configure the shared Python environment first.')
  const live=await runBrainTransform({action:'atlas-metadata',directory,atlasDirectory},this.jobs)
  if(String(live.atlasVersion)!==contract.atlasVersion||JSON.stringify(live.atlasShape)!==JSON.stringify(contract.atlasShape)||JSON.stringify(live.atlasResolution)!==JSON.stringify(contract.atlasResolution))throw new Error('Managed atlas version or geometry differs from the registration contract.')
  if(input.action==='inspect')return JSON.parse(JSON.stringify({contract,registrationArtifactId:artifact.id,scientificReview:'pending',notes:['Coordinates must come from the exact downsampled.tiff grid, in zero-based ASR array axes. Raw sample/cellfinder XYZ is not accepted.']}))
  if(input.coordinateSpace!=='brainreg-downsampled-asr-voxel'||!Array.isArray(input.coordinates)||!input.coordinates.length||input.coordinates.length>100000||input.coordinates.some(p=>!Array.isArray(p)||p.length!==3||p.some(v=>typeof v!=='number'||!Number.isFinite(v))))throw new Error('Declare brainreg-downsampled-asr-voxel coordinates; raw sample coordinates require a separately verified resampling transform.')
  const result=await runBrainTransform({action:'map',directory,contract,coordinates:input.coordinates},this.jobs)
  await verifyFiles()
  const root=join(project.rootPath,'.zerowall','science-exports');this.jobs.assertActive();await mkdir(root,{recursive:true});await containedFile(project.rootPath,root)
  const target=join(root,randomUUID());this.jobs.assertActive();await mkdir(target);const output=join(target,'brain-transform.json')
  const text=JSON.stringify({format:'zerowall-brain-transformed-points',version:1,registrationArtifactId:artifact.id,registrationSha256:artifact.checksum,contract,input:input.coordinates,result,scientificReview:'pending'},null,2)
  this.jobs.assertActive();await writeFile(output,text,{flag:'wx'});const created=this.activeStore.createArtifact({projectId:project.id,name:'BrainGlobe transformed atlas coordinates',uri:pathToFileURL(output).href,mediaType:'application/json',checksum:createHash('sha256').update(text).digest('hex'),metadata:{registrationArtifactId:artifact.id,registrationSha256:artifact.checksum,scientificReview:'pending'}})
  return JSON.parse(JSON.stringify({contract,result,artifact:created,notes:['A computed transform is not anatomical registration approval. Coordinates may be used for atlas preview, with scientific review still pending.']}))
 }
}
