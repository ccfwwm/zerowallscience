import {spawn,type ChildProcess} from 'node:child_process'

/**
 * How long to wait, after the direct child has been observed to exit, for the
 * inherited stdio pipes to close before declaring the process settled anyway.
 */
export const EXIT_SETTLE_GRACE_MS=5000

/**
 * Last-resort bound on a runner, measured from spawn. The callers' own limits
 * are the primary control (180 s for an analysis, 20 minutes for the atlas
 * download); this sits above them so it only fires when the child never reports
 * 'exit' at all, which is the case that used to hang a caller forever.
 */
export const EXIT_SETTLE_DEADLINE_MS=30*60*1000

/**
 * Stop only the process tree owned by this job, including NiftyReg workers.
 *
 * The exitCode/signalCode check is not enough on its own: a runner that spawns
 * native worker processes can leave those grandchildren alive after the direct
 * child has exited, still holding the inherited stdout/stderr pipes. Returning
 * early in that state leaks the worker tree and, because 'close' never fires,
 * also strands whatever promise is waiting on it.
 */
export function stopBrainProcess(child:ChildProcess):void{
 if(!child.pid)return
 const gone=child.exitCode!==null||child.signalCode!==null
 if(process.platform==='win32'){
  const killer=spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,shell:false,stdio:'ignore'})
  // An already-reaped pid is the expected failure. Anything else means the tree
  // may still be running — a killed process group that keeps holding the pipes
  // is what leaves the caller waiting on an 'exit' that never arrives — so fall
  // back to killing the direct child instead of reporting success.
  killer.on('error',()=>{if(!gone)child.kill()})
  killer.on('close',code=>{if(code!==0&&!gone)child.kill()})
 }else{
  try{process.kill(-child.pid,'SIGKILL')}catch{if(!gone)child.kill('SIGKILL')}
 }
}

/** Runs `settle` at most once, whoever fires first. */
export function settleOnce(settle:()=>void):()=>void{
 let done=false
 return()=>{if(done)return;done=true;settle()}
}

/**
 * Drive a spawned runner to a bounded, single settlement.
 *
 * `child.on('close')` fires only when every holder of the inherited stdio pipes
 * has exited. A runner that starts native workers — brainreg via NiftyReg,
 * cellfinder via its torch worker — can therefore leave a grandchild holding
 * the pipes after the direct child is gone, so 'close' never fires. Callers
 * that await it never resolve, their `finally` never runs, and the service-level
 * busy flag stays set for the life of the process: the "runner is busy" error.
 *
 * The direct child's own 'exit' is the reliable signal, so it carries the
 * settlement: the run is finished as soon as the child is reaped, after a grace
 * period that lets the pipes drain normally first. 'error' settles too, for a
 * spawn that never produced a pid.
 *
 * `finish(exitCode)` receives the code seen on 'exit', or null when the child
 * never reported one (spawn failure, or an 'error' before 'exit'). Callers treat
 * null as a failure rather than as success.
 */
export function settleRunner(child:ChildProcess,finish:(exitCode:number|null)=>void,graceMs=EXIT_SETTLE_GRACE_MS,deadlineMs=EXIT_SETTLE_DEADLINE_MS):{gone:(code:number|null)=>void}{
 let code:number|null=null
 let timer:NodeJS.Timeout|undefined
 let deadline:NodeJS.Timeout|undefined
 const clear=()=>{if(timer){clearTimeout(timer);timer=undefined}if(deadline){clearTimeout(deadline);deadline=undefined}}
 // Both timers are cleared before `finish` runs, so a settle reached through the
 // grace period cannot leave the 30-minute deadline armed behind it: an orphaned
 // ref'd timer would keep the event loop alive long after the run finished.
 const done=settleOnce(()=>{clear();finish(code)})
 // A run whose pipes drain normally settles the instant they close, with no grace
 // period at all. 'close' trails 'exit' by about a millisecond, so this event — not
 // a flag sampled when 'exit' arrives — is what keeps the healthy path fast.
 child.on('close',done)
 child.on('error',done)
 // Arm the hard deadline at spawn, not at 'exit'. The grace timer below only
 // starts once the direct child has been reaped, so a child that never reports
 // 'exit' — a stuck taskkill, a hung native worker tree — left this promise with
 // no timer at all. Callers awaited it forever, their `finally` never ran, and
 // the service-level busy flag stayed set for the life of the process. This
 // deadline is the guarantee that settlement always happens.
 deadline=setTimeout(done,deadlineMs)
 return{gone:(exitCode:number|null)=>{
  code=exitCode
  // The direct child is reaped but its pipes are still open, so a grandchild is
  // holding them (NiftyReg, the cellfinder torch worker). Settle anyway once the
  // grace period is up — but this timer must stay ref'd: it is the only reference
  // the event loop has left for the caller's promise, and an unref'd timer is
  // simply dropped when nothing else is pending, which would strand that promise
  // and hang whoever awaits it. A 'close' arriving first clears it and settles
  // early; `done` runs at most once either way.
  timer=setTimeout(done,graceMs)
 }}
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
  // Tracking settles on the same bounded schedule as the callers: a scope that
  // waited for 'close' alone would hold dispose(), and every job that re-checks
  // assertActive(), open for as long as a grandchild keeps a pipe.
  const done=new Promise<void>(resolve=>{
   const settle=settleOnce(()=>{this.children.delete(child);resolve()})
   settleRunner(child,settle)
  })
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
