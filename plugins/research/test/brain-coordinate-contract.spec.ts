import {execFile} from 'node:child_process'
import {mkdtemp,rm,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach,expect,it} from 'vitest'
import {BRAIN_GLOBE_RUNNER} from '../src/host/brainglobe-runner.js'

const paths:string[]=[]
afterEach(async()=>{for(const path of paths.splice(0))await rm(path,{recursive:true,force:true})})
async function run(coordinates:unknown,extra:Record<string,unknown>={},orientation='asr'){
  const root=await mkdtemp(join(tmpdir(),'brain-coordinates-'));paths.push(root)
  // Deliberately emulate NumPy's unsafe negative indexing with nonzero tissue at
  // every face. A caller which omits its own bounds check will map negative data.
  await writeFile(join(root,'brainglobe_atlasapi.py'),`import numpy as np
class BrainGlobeAtlas:
    def __init__(self,*args,**kwargs):
        self.orientation=${JSON.stringify(orientation)}
        self.shape=(3,4,5)
        self.resolution=(25,50,100)
        self.annotation=np.ones(self.shape,dtype=int)*7
        self.annotation[1,2,3]=8
        self.structures={7:{'acronym':'A'},8:{'acronym':'ASYMMETRIC'}}
    def structure_from_coords(self,point,microns=False,as_acronym=False):
        p=[x/r for x,r in zip(point,self.resolution)] if microns else point
        return self.annotation[tuple(int(x) for x in p)]
    def hemisphere_from_coords(self,*args,**kwargs):return 'left'
`)
  await writeFile(join(root,'runner.py'),BRAIN_GLOBE_RUNNER)
  return await new Promise<any>((resolve,reject)=>{const child=execFile(process.env.ZEROWALL_PYTHON||'python',[join(root,'runner.py')],{timeout:15000,windowsHide:true},(error,stdout,stderr)=>{try{resolve({code:error?(error as any).code:0,...JSON.parse(stdout)})}catch{reject(new Error(stderr||stdout))}});child.stdin?.end(JSON.stringify({operation:'coordinates',brainglobeDir:root,coordinates,...extra}))})
}
it('rejects NumPy negative wrapping before int conversion and bounds every atlas axis',async()=>{
  const result=await run([[-1,2,3],[-.01,2,3],[1,-1,3],[1,2,-1],[3,2,3],[1,4,3],[1,2,5],[1,2,3]])
  expect(result.code).toBe(0);expect(result.analysis).toMatchObject({mapped:1,outside:7})
  expect(result.analysis.cells.at(-1)).toMatchObject({regionId:8,acronym:'ASYMMETRIC'})
  expect(result.analysis.notes.join(' ')).toContain('AP,SI,RL')
},20000)
it('uses anisotropic micron scales in atlas axis order and the same exclusive upper bounds',async()=>{
  const result=await run([[25,100,300],[-.01,100,300],[75,100,300],[25,200,300],[25,100,500]],{coordinateUnits:'micron'})
  expect(result.analysis).toMatchObject({mapped:1,outside:4});expect(result.analysis.cells[0].regionId).toBe(8)
},20000)
it('fails closed on nonfinite/string coordinates and unexpected orientation',async()=>{
  expect((await run([[null,2,3]])).error).toContain('numeric')
  expect((await run([['1',2,3]])).error).toContain('numeric')
  expect((await run([[1,2,3]],{},'psl')).error).toContain('Unexpected atlas orientation')
},20000)
