import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { runImageJExperiment } from '../../plugins/research/src/host/fiji-image-runner.js'
import type { FijiImageConfig } from '../../plugins/research/src/shared/fiji-experiments.js'

if(!process.argv.includes('--run'))throw new Error('Pass --run to execute installed native ImageJ.')
const root=resolve('.build/fiji-image-native',new Date().toISOString().replaceAll(':','-'));await mkdir(root,{recursive:true})
// Independent geometry oracle: two rectangles of 12 and 6 pixels, one 1-pixel debris.
const pixels=Buffer.alloc(20*12)
for(let y=2;y<5;y++)for(let x=2;x<6;x++)pixels[y*20+x]=200
for(let y=7;y<9;y++)for(let x=12;x<15;x++)pixels[y*20+x]=200
pixels[10*20+18]=200
const source=Buffer.concat([Buffer.from('P5\n20 12\n255\n'),pixels]);const roi={x:0,y:0,width:20,height:12}
const configs:FijiImageConfig[]=[
  {kind:'scratch-wound',sampleId:'S1',time:'24h',initialArea:38,threshold:150,polarity:'bright',roi},
  {kind:'colony-formation',wellId:'A1',threshold:150,polarity:'bright',roi,minArea:2,maxArea:20,stainUnit:'mm2',pixelArea:0.01},
  {kind:'bacterial-cfu',plateId:'P1',threshold:150,polarity:'bright',roi,minArea:2,maxArea:20,dilutionFactor:100,platedVolumeMl:0.1},
]
const report=[]
for(const config of configs){const directory=join(root,config.kind!);await mkdir(directory);const start=performance.now();const result=await runImageJExperiment(directory,source,config)
  assert.equal(result.analysis.foregroundPixels,19)
  if(config.kind==='scratch-wound')assert.equal((result.analysis.measurement as any).closurePercent,50)
  if(config.kind==='colony-formation'){assert.equal((result.analysis.measurement as any).independentCount,2);assert.equal((result.analysis.measurement as any).stainedArea,0.18)}
  if(config.kind==='bacterial-cfu')assert.equal((result.analysis.measurement as any).cfuPerMl,2000)
  if(config.kind!=='scratch-wound'){assert.deepEqual((result.analysis as any).componentAreas,[12,6]);assert.equal((result.analysis as any).discardedComponents,1)}
  for(const name of ['mask.png','overlay.png'])assert.equal((await readFile(join(directory,name))).subarray(1,4).toString(),'PNG')
  report.push({experiment:config.kind,milliseconds:performance.now()-start,...result})
}
const roiDirectory=join(root,'scratch-subroi');await mkdir(roiDirectory)
const subroi=await runImageJExperiment(roiDirectory,source,{...configs[0]!,kind:'scratch-wound',sampleId:'S1',time:'24h',initialArea:24,threshold:150,polarity:'bright',roi:{x:1,y:1,width:7,height:5}})
assert.equal(subroi.analysis.width,7);assert.equal(subroi.analysis.height,5);assert.equal(subroi.analysis.foregroundPixels,12);assert.equal((subroi.analysis.measurement as any).closurePercent,50)
report.push({experiment:'scratch-subroi',milliseconds:0,...subroi})
await writeFile(join(root,'report.json'),JSON.stringify({passed:true,oracle:'independent exact synthetic geometry including non-full-image ROI; no TS segmentation oracle',report},null,2));console.log(root)
