import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { runImageJExperiment } from '../../plugins/research/src/host/fiji-image-runner.js'

if(!process.argv.includes('--run'))throw new Error('Pass --run to test installed AnalyzeSkeleton and Skeletonize3D.')
const root=resolve('.build/fiji-tube-native',new Date().toISOString().replaceAll(':','-'));await mkdir(root,{recursive:true});const results=[]
for(const name of ['line','loop','empty']){
 const pixels=Buffer.alloc(20*20)
 if(name==='line')for(let x=2;x<=14;x++)pixels[6*20+x]=255
 if(name==='loop'){for(let x=3;x<=10;x++){pixels[3*20+x]=255;pixels[10*20+x]=255}for(let y=3;y<=10;y++){pixels[y*20+3]=255;pixels[y*20+10]=255}}
 const source=Buffer.concat([Buffer.from('P5\n20 20\n255\n'),pixels]);const directory=join(root,name);await mkdir(directory)
 const result=await runImageJExperiment(directory,source,{kind:'tube-formation',sampleId:name,threshold:128,polarity:'bright',roi:{x:0,y:0,width:20,height:20},unit:'um',unitScale:0.5})
 const measurement=result.analysis.measurement as any
 if(name==='line'){assert.equal(measurement.endpoints,2);assert.equal(measurement.junctions,0);assert.equal(measurement.segments,1);assert.equal(measurement.meshes,0);assert.equal(measurement.length,6)}
 if(name==='loop'){assert.equal(measurement.endpoints,0);assert.equal(measurement.meshes,1);assert.ok(measurement.length>0)}
 if(name==='empty'){assert.equal(measurement.length,0);assert.equal(measurement.meshes,0);assert.equal(measurement.segments,0)}
 assert.ok(result.files.some(file=>file.name==='skeleton.png'));assert.ok(result.files.some(file=>file.name==='skeleton-topology.json'));results.push({name,...result})
}
await writeFile(join(root,'report.json'),JSON.stringify({passed:true,reference:'Known planar topology: open line, one closed ring, and empty image; 13 collinear pixels at 0.5 um/pixel have 6 um edge length.',results},null,2));console.log(root)
