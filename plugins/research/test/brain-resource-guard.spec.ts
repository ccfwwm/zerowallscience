import {execFile} from 'node:child_process'
import {expect,it} from 'vitest'
import {BRAIN_RESOURCE_GUARD} from '../src/host/brain-resource-guard.js'
async function run(available:number,rss:number){
 const fake=`import types,sys
p=types.ModuleType('psutil')
class Process:
 def __init__(self,pid):pass
 def children(self,recursive=True):return []
 def memory_info(self):return types.SimpleNamespace(rss=${rss})
p.Process=Process;p.Error=RuntimeError;p.virtual_memory=lambda:types.SimpleNamespace(available=${available});sys.modules['psutil']=p
`
 return new Promise<{code:unknown;stdout:string;stderr:string}>(resolve=>execFile(process.env.ZEROWALL_PYTHON||'python',['-E','-P','-c',fake+BRAIN_RESOURCE_GUARD+"\ntime.sleep(.7)\nprint(_zw_peak_rss[0])"],{windowsHide:true,timeout:5000},(error,stdout,stderr)=>resolve({code:error?(error as any).code:0,stdout,stderr})))
}
it('refuses heavy starts below the available-memory floor',async()=>{const r=await run(1024**3,1000);expect(r.code).not.toBe(0);expect(r.stderr).toContain('at least 2 GiB')})
it('interrupts its own process when the sampled tree exceeds 24 GiB',async()=>{const r=await run(32*1024**3,25*1024**3);expect(r.code).toBe(137);expect(r.stderr).toContain('24 GiB memory budget')})
it('records the peak sampled RSS without interrupting a bounded job',async()=>{const r=await run(32*1024**3,12345678);expect(r.code).toBe(0);expect(r.stdout.trim()).toBe('12345678')})
