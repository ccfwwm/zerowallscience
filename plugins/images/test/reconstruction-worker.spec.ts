import { afterEach, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { PassThrough, Writable } from 'node:stream'
const fixture=vi.hoisted(()=>({spawns:[] as any[],revision:'r1'}))
vi.mock('../../python/src/shared/runtime-path.js',()=>({resolveFixedPythonRuntime:async()=>({root:'unconfigured-test-runtime',executable:'python',sitePackages:fixture.revision})}))
vi.mock('../../python/src/shared/runtime-process.js',()=>({spawnWithRuntimeLease:vi.fn(()=>{
  const child:any=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough()
  child.messages=[];child.stdin=new Writable({write(data,_encoding,callback){child.messages.push(JSON.parse(data.toString()));callback()}})
  child.kill=vi.fn(()=>{queueMicrotask(()=>child.emit('close',null));return true})
  fixture.spawns.push(child);return child
})}))
import { runReconstructionWorker, disposeReconstructionWorkers } from '../src/host/reconstruction-worker.js'
afterEach(()=>{disposeReconstructionWorkers();fixture.spawns=[];fixture.revision='r1'})
const tick=()=>new Promise(resolve=>setTimeout(resolve,0))
const done=(child:any,ok=true)=>child.stdout.write(JSON.stringify({id:child.messages.at(-1).id,ok,error:'stage failed'})+'\n')
it('can allocate five real worker processes for a user-selected five-page batch',async()=>{
  const pending=Array.from({length:5},(_,i)=>runReconstructionWorker(`page-${i}.json`,new AbortController().signal))
  await vi.waitFor(()=>expect(fixture.spawns.filter(child=>child.messages.length===1)).toHaveLength(5))
  fixture.spawns.forEach(child=>done(child));await Promise.all(pending)
  expect(fixture.spawns).toHaveLength(5)
})
it('reuses a warm model process and frames results by request id',async()=>{
  const signal=new AbortController().signal
  const first=runReconstructionWorker('page-1.json',signal);await vi.waitFor(()=>expect(fixture.spawns[0]?.messages).toHaveLength(1))
  const child=fixture.spawns[0];child.stdout.write('{"id":"unrelated","ok":true}\n');done(child);await first
  const second=runReconstructionWorker('page-2.json',signal);await vi.waitFor(()=>expect(child.messages).toHaveLength(2))
  expect(fixture.spawns).toHaveLength(1);expect(child.messages).toHaveLength(2);done(child);await second
})
it('cancels only the associated worker and starts a fresh process for a retry',async()=>{
  const controller=new AbortController(),pending=runReconstructionWorker('page-1.json',controller.signal)
  const check=expect(pending).rejects.toThrow('cancelled');await vi.waitFor(()=>expect(fixture.spawns[0]?.messages).toHaveLength(1));controller.abort();await check;await tick()
  expect(fixture.spawns[0].kill).toHaveBeenCalledOnce()
  const next=runReconstructionWorker('retry.json',new AbortController().signal);await vi.waitFor(()=>expect(fixture.spawns[1]?.messages).toHaveLength(1))
  expect(fixture.spawns).toHaveLength(2);done(fixture.spawns[1]);await next
})
it('invalidates an idle worker when the managed runtime revision changes',async()=>{
  const first=runReconstructionWorker('page-1.json',new AbortController().signal);await vi.waitFor(()=>expect(fixture.spawns[0]?.messages).toHaveLength(1));done(fixture.spawns[0]);await first
  fixture.revision='r2'
  const second=runReconstructionWorker('page-2.json',new AbortController().signal);await vi.waitFor(()=>expect(fixture.spawns[1]?.messages).toHaveLength(1))
  expect(fixture.spawns[0].kill).toHaveBeenCalledOnce();expect(fixture.spawns).toHaveLength(2)
  done(fixture.spawns[1]);await second
})
