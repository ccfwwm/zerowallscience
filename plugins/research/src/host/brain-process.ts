import {spawn,type ChildProcess} from 'node:child_process'

/** Stop only the process tree owned by this job, including NiftyReg workers. */
export function stopBrainProcess(child:ChildProcess):void{
 if(!child.pid||child.exitCode!==null)return
 if(process.platform==='win32'){
  const killer=spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,shell:false,stdio:'ignore'})
  killer.on('error',()=>child.kill())
 }else{
  try{process.kill(-child.pid,'SIGKILL')}catch{child.kill('SIGKILL')}
 }
}

/** Owns a service's jobs and processes; shutdown settles jobs before store close. */
export class BrainJobScope{
 private closed=false
 private children=new Map<ChildProcess,Promise<void>>()
 private jobs=new Set<Promise<unknown>>()
 private shutdown:Promise<void>|undefined
 assertActive():void{if(this.closed)throw new Error('BrainGlobe service is disposed; operation interrupted.')}
 readonly spawn:typeof spawn=((...args:Parameters<typeof spawn>)=>{
  this.assertActive()
  const child=spawn(...args)
  const done=new Promise<void>(resolve=>child.once('close',()=>{this.children.delete(child);resolve()}))
  this.children.set(child,done)
  return child
 }) as typeof spawn
 run<T>(work:()=>Promise<T>):Promise<T>{
  this.assertActive()
  const job=Promise.resolve().then(async()=>{this.assertActive();const value=await work();this.assertActive();return value})
  this.jobs.add(job)
  return job.finally(()=>this.jobs.delete(job))
 }
 dispose():Promise<void>{
  if(this.shutdown)return this.shutdown
  this.closed=true
  for(const child of this.children.keys())stopBrainProcess(child)
  this.shutdown=Promise.allSettled([...this.jobs,...this.children.values()]).then(()=>undefined)
  return this.shutdown
 }
}
