import {execFile} from 'node:child_process'
import {mkdtemp,rm,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {promisify} from 'node:util'
import {createHash} from 'node:crypto'
import {afterEach,beforeAll,expect,it} from 'vitest'
import {ResearchStore} from '../../../store/src/index.js'
import {BrainTransformService,runBrainTransform,brainFileHash} from '../src/host/brain-transform.js'

const roots:string[]=[]
const stores:ResearchStore[]=[]
const py=process.env.ZEROWALL_BRAINGLOBE_PYTHON||process.env.ZEROWALL_PYTHON||'python'
beforeAll(()=>{process.env.ZEROWALL_BRAINGLOBE_PYTHON=py})
afterEach(async()=>{for(const s of stores.splice(0))s.close();for(const p of roots.splice(0))await rm(p,{recursive:true,force:true})})
async function fixture(nonfinite=false){
 const root=await mkdtemp(join(tmpdir(),'brain-transform-'));roots.push(root)
 await promisify(execFile)(py,['-E','-P','-c',`import sys,numpy as np,tifffile
from pathlib import Path
r=Path(sys.argv[1]);shape=(3,4,5);grid=np.indices(shape)
tifffile.imwrite(r/'downsampled.tiff',np.zeros(shape,dtype=np.uint16),photometric='minisblack')
for i in range(3):
 f=(grid[(i+1)%3]*.1+i*.2).astype(np.float32)
 if sys.argv[2]=='true' and i==0:f[0,0,0]=np.nan
 tifffile.imwrite(r/f'deformation_field_{i}.tiff',f,photometric='minisblack')`,root,String(nonfinite)],{windowsHide:true,timeout:15000})
 return root
}
const contract={sourceShape:[3,4,5],atlasResolution:[25,50,100],atlasShape:[528,320,456]}
it('trilinearly interpolates absolute-mm fields with nontrivial axis mapping and micron conversion',async()=>{
 const directory=await fixture();const result:any=await runBrainTransform({action:'map',directory,contract,coordinates:[[1.25,2.5,3.75],[2,3,4]]})
 expect(result.mapped).toBe(2);for(const [i,expected]of [[250,575,525],[300,600,600]].entries())for(let a=0;a<3;a++)expect(result.rows[i].atlasMicron[a]).toBeCloseTo(expected[a]!,3)
},20000)
it('rejects negative and beyond-center samples without wrapping and keeps atlas-outside separate',async()=>{
 const directory=await fixture();const result:any=await runBrainTransform({action:'map',directory,contract:{...contract,atlasShape:[1,1,1]},coordinates:[[-.1,1,1],[2.01,1,1],[1,4,1],[1,1,5],[1,1,1]]})
 expect(result).toMatchObject({outsideSourceGrid:4,outsideAtlas:1,mapped:0})
},20000)
it('refuses nonfinite fields, wrong source shape and nonnumeric coordinates',async()=>{
 const directory=await fixture(true)
 await expect(runBrainTransform({action:'map',directory,contract,coordinates:[[0,0,0]]})).rejects.toThrow('non-finite')
 await expect(runBrainTransform({action:'map',directory,contract:{...contract,sourceShape:[5,4,3]},coordinates:[[0,0,0]]})).rejects.toThrow('shape')
 await expect(runBrainTransform({action:'map',directory,contract,coordinates:[['0',0,0]]})).rejects.toThrow('numeric')
},20000)
it('Host refuses cross-project, unhashed and incompatible registration artifacts',async()=>{
 const root=await fixture();const store=new ResearchStore(join(root,'store.sqlite'));stores.push(store)
 const project=store.createProject({name:'Transform',rootPath:root});const other=store.createProject({name:'Other',rootPath:root});const service=new BrainTransformService(store)
 const file=join(root,'registration.json');await writeFile(file,JSON.stringify({transform:{format:'unsupported'}}))
 const artifact=store.createArtifact({projectId:project.id,name:'BrainGlobe brainreg registration',uri:pathToFileURL(file).href,mediaType:'application/json',checksum:await brainFileHash(file)})
 const input={sessionId:'test',action:'inspect' as const,registrationArtifactId:artifact.id}
 await expect(service.execute(other,input)).rejects.toThrow('this project')
 await expect(service.execute(project,input)).rejects.toThrow('compatible')
 await writeFile(file,'{}');await expect(service.execute(project,input)).rejects.toThrow('checksum changed')
},20000)
it('Host refuses malformed geometry and changed field bytes before launching mapping',async()=>{
 const root=await fixture();const store=new ResearchStore(join(root,'store.sqlite'));stores.push(store);const project=store.createProject({name:'Transform',rootPath:root});const service=new BrainTransformService(store)
 const metadata={...contract,format:'zerowall-brainreg-transform',version:1,producer:{brainreg:'1.0.16'},direction:'sample-grid-to-atlas',sourceSpace:'brainreg-downsampled-asr-voxel',fieldUnits:'atlas-absolute-millimeter',atlasOrientation:'asr',interpolation:'trilinear',atlas:'allen_mouse_25um',files:['downsampled.tiff',...Array.from({length:3},(_,i)=>`deformation_field_${i}.tiff`)].map(name=>({name,bytes:1,sha256:'a'.repeat(64)}))}
 for(const sourceShape of [[3.5,4,5],[3,4,5]]){const text=JSON.stringify({outputDirectory:root,transform:{...metadata,sourceShape}});const file=join(root,`${sourceShape[0]}.json`);await writeFile(file,text);const artifact=store.createArtifact({projectId:project.id,name:'BrainGlobe brainreg registration',uri:pathToFileURL(file).href,mediaType:'application/json',checksum:createHash('sha256').update(text).digest('hex')});await expect(service.execute(project,{sessionId:'test',action:'inspect',registrationArtifactId:artifact.id})).rejects.toThrow(sourceShape[0]===3?'checksum changed':'geometry')}
},20000)
