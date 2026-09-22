import {once} from 'node:events'
import {tmpdir} from 'node:os'
import {expect,it} from 'vitest'
import {BrainJobScope} from '../src/host/brain-process.js'
import {BrainAtlasService} from '../src/host/brain-atlas.js'
import {BrainTransformService} from '../src/host/brain-transform.js'
import {ResearchStore} from '../../../store/src/index.js'

it('shutdown stops its owned native process tree and waits for termination',async()=>{
 const scope=new BrainJobScope()
 const leaf="process.stdout.write('ready\\n');setInterval(()=>{},1000)"
 const parent=`const{spawn}=require('node:child_process');const child=spawn(process.execPath,['-e',${JSON.stringify(leaf)}],{windowsHide:true});child.stdout.once('data',()=>process.stdout.write(String(child.pid)+'\\n'));setInterval(()=>{},1000)`
 let child:ReturnType<typeof scope.spawn>|undefined
 const job=scope.run(async()=>{child=scope.spawn(process.execPath,['-e',parent],{windowsHide:true,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe']});await once(child,'close')})
 const outcome=job.then(()=>null,error=>error)
 await Promise.resolve()
 const data=await once(child!.stdout!,'data');const leafPid=Number(String(data[0]).trim());expect(Number.isSafeInteger(leafPid)).toBe(true)
 const parentPid=child!.pid!
 await scope.dispose();expect(await outcome).toBeInstanceOf(Error)
 expect(()=>process.kill(parentPid,0)).toThrow();expect(()=>process.kill(leafPid,0)).toThrow()
 expect(()=>scope.spawn(process.execPath,['-e',''])).toThrow('disposed')
 await scope.dispose()
},15000)

it('atlas shutdown waits for pending analysis and prevents late viewer registration',async()=>{
 const store=new ResearchStore(':memory:');const service=new BrainAtlasService(store)
 const project=store.createProject({name:'Lifetime',rootPath:tmpdir()})
 let resume!:(value:unknown)=>void;let started!:()=>void
 const ready=new Promise<void>(resolve=>started=resolve)
 ;(service as any).run=()=>{started();return new Promise(resolve=>resume=resolve)}
 const pending=service.execute(project,{sessionId:'test',action:'open'}).then(()=>null,error=>error)
 await ready;let stopped=false;const closing=service.dispose().then(()=>{stopped=true})
 await Promise.resolve();expect(stopped).toBe(false)
 resume({summary:{regions:[],version:'3.0'}})
 await closing;expect((await pending).message).toContain('disposed');expect(store.listViewerSessions(project.id)).toHaveLength(0)
 store.close()
 await expect(service.execute(project,{sessionId:'test',action:'open'})).rejects.toThrow('disposed')
})

it('transform service rejects new requests after disposal without touching the closed store',async()=>{
 const store=new ResearchStore(':memory:');const service=new BrainTransformService(store)
 const project=store.createProject({name:'Lifetime',rootPath:tmpdir()})
 await service.dispose();store.close()
 await expect(service.execute(project,{sessionId:'test',action:'inspect',registrationArtifactId:'missing'})).rejects.toThrow('disposed')
})
