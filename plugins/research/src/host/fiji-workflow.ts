import { spawn, type ChildProcess } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { ResearchStore } from '@zerowallscience/research-store'
import type { CreateArtifactInput, JsonObject, ProjectRecord, RunRecord } from '@zerowallscience/research-store/types'
import { engineExecutable } from './native-engines.js'
import { containedFile } from './science-viewer.js'
import { readProjectAsset } from './image-viewer.js'
import { westernBlotRunner } from './western-blot-runner.js'
import { validateWesternBlotPlan, type WesternBlotResult } from '../shared/western-blot.js'
import type { FijiWorkflowRequest, FijiWorkflowResponse } from '../shared/types.js'

const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex')
const terminal = new Set(['succeeded','failed','cancelled','timed_out'])
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)])) : value
const MAX_BYTES = 128 * 1024 * 1024

export type FijiJavaResolver = (project?: ProjectRecord) => Promise<{ executable: string; jars: string }>
export async function fijiJava(): Promise<{ executable: string; jars: string }> {
  const root = dirname(await realpath(engineExecutable('fiji')))
  const override = process.env.ZEROWALL_FIJI_JAVA?.trim()
  if (override) return { executable: await realpath(override), jars: join(root,'jars','*') }
  const runtime = join(root,'java',process.platform === 'win32' ? 'win64' : 'linux-amd64')
  const candidates = (await readdir(runtime)).sort()
  for (const candidate of candidates) {
    const path = join(runtime,candidate,'bin',process.platform === 'win32' ? 'java.exe' : 'java')
    if (await stat(path).then(item=>item.isFile(),()=>false)) return { executable: await realpath(path), jars: join(root,'jars','*') }
  }
  throw new Error('Fiji bundled Java was not found. Set ZEROWALL_FIJI_JAVA to an existing compatible Java executable.')
}

/** Bounded local scientific runner; native interactive image instances are never used for computation. */
export class FijiWorkflowService {
  private readonly live = new Map<string, { child: ChildProcess; timer: NodeJS.Timeout }>()
  private readonly finishing = new Map<string, Promise<FijiWorkflowResponse>>()
  private disposed = false
  constructor(private readonly store: ResearchStore, private readonly javaResolver?: FijiJavaResolver) {}

  private resolveJava(project: ProjectRecord): Promise<{ executable: string; jars: string }> { return this.javaResolver ? this.javaResolver(project) : fijiJava() }

  async execute(project: ProjectRecord, input: FijiWorkflowRequest): Promise<FijiWorkflowResponse> {
    if (this.disposed) throw new Error('Fiji workflow service stopped.')
    if (input.action === 'list') return { runs: this.store.listRuns(project.id).filter(run=>run.leaseOwner === 'fiji-workflow') }
    if (input.action === 'submit') return this.submit(project,input)
    const run = this.store.getRun(input.runId ?? '')
    if (!run || run.projectId !== project.id || run.leaseOwner !== 'fiji-workflow') throw new Error('Fiji workflow does not belong to this project.')
    if (input.action === 'cancel') {
      if (terminal.has(run.status)) return { run }
      const owned = this.live.get(run.id)
      if (!owned) throw new Error('This Host does not own the process. Inspect its completion manifest; do not kill a historical PID.')
      this.store.updateRun(run.id,{status:'cancelled',error:'Cancelled by user; partial files and logs retained.'})
      this.syncTaskForRun(run.id)
      owned.child.kill(); clearTimeout(owned.timer); this.live.delete(run.id)
      return { run: this.store.getRun(run.id)! }
    }
    if (input.action !== 'status') throw new Error('Unsupported Fiji workflow action.')
    return this.status(project,run.id)
  }

  private async submit(project: ProjectRecord, input: FijiWorkflowRequest): Promise<FijiWorkflowResponse> {
    const viewer = this.store.listViewerSessions(project.id).find(item=>item.id===input.viewerId && item.tool==='image')
    if (!viewer || viewer.version !== input.expectedVersion) throw new Error('Reload the image view: project or viewer revision mismatch.')
    const annotation = this.store.listAnnotationRevisions(project.id,viewer.assetId).find(item=>item.id===input.annotationRevisionId)
    if (!annotation || annotation.status !== 'accepted' || annotation.sourceSha256 !== viewer.state.sourceSha256) throw new Error('Select an accepted ROI revision matching the image source.')
    const head = this.store.listAnnotationRevisions(project.id,viewer.assetId).filter(item=>item.sourceSha256===annotation.sourceSha256 && item.status==='accepted').at(-1)
    if (head?.id !== annotation.id) throw new Error('Quantification requires the current accepted ROI revision.')
    const plan = validateWesternBlotPlan(input.plan,annotation.payload)
    const source = this.store.listDataAssets(project.id).find(item=>item.id===viewer.assetId)!
    if (source.location !== 'local' || !source.uri.startsWith('file:') || !/\.(tiff?|png|pgm)$/iu.test(source.uri)) throw new Error('Western blot requires a local raw PNG/TIFF/PGM asset; JPEG is unsuitable for quantitative input.')
    const bytes = await readProjectAsset(project,source,MAX_BYTES)
    if (hash(bytes)!==annotation.sourceSha256) throw new Error('Source changed since ROI revision; reopen and review annotations.')
    const runnerHash=hash(westernBlotRunner)
    const task = input.researchTaskId === undefined ? undefined : this.store.listResearchStudies(project.id).flatMap(study => this.store.listResearchTasks(study.id)).find(item => item.id === input.researchTaskId)
    if (input.researchTaskId !== undefined && !task) throw new Error('Fiji research task is not in the active project.')
    if (task && !task.exploratory) {
      const study = this.store.getResearchStudy(task.studyId)
      if (!study || ['archived', 'completed', 'blocked'].includes(study.status) || !study.currentFreezeId || study.gate1 !== 'approved') throw new Error('Confirmatory Fiji tasks require gate one approval and a frozen study plan.')
    }
    const fingerprint=hash(JSON.stringify(canonical({sourceAssetId:source.id,sourceSha256:annotation.sourceSha256,annotationRevisionId:annotation.id,plan,runnerHash,researchTaskId:input.researchTaskId??null})))
    // Persist the key before launching, including across different Host connections.
    let directory=await realpath(project.rootPath)
    for (const name of ['.zerowall','fiji-runs']) {
      const next=join(directory,name);try{await mkdir(next)}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error}
      directory=await containedFile(project.rootPath,next)
    }
    directory=join(directory,randomUUID())
    const reserved=this.store.reserveScientificRun({projectId:project.id,name:'Fiji Western blot',command:'fiji.western-blot.v1',workingDirectory:directory,status:'submitted',timeoutAt:new Date(Date.now()+120000).toISOString(),inputs:task?[{name:'research_task_id',uri:task.id}]:[]},input.requestId??'',fingerprint)
    if(!reserved.created)return this.status(project,reserved.run.id)
    const run=reserved.run
    try {
      if (task) this.store.updateResearchTask(task.id, { expectedVersion: task.version, status: 'running', runId: run.id })
      await mkdir(directory)
      const sourcePath=join(directory,'source'+extname(fileURLToPath(source.uri)))
      const requestPath=join(directory,'request.json');const scriptPath=join(directory,'runner.py');const logPath=join(directory,'runner.log')
      await writeFile(sourcePath,bytes,{flag:'wx'});await writeFile(scriptPath,westernBlotRunner,{flag:'wx'})
      const request={workflow:'fiji.western-blot',version:1,runId:run.id,directory,sourcePath,sourceAssetId:source.id,sourceSha256:annotation.sourceSha256,annotationRevisionId:annotation.id,annotation:annotation.payload,plan,runnerSha256:runnerHash}
      const requestText=JSON.stringify(request,null,2)+'\n';await writeFile(requestPath,requestText,{flag:'wx'})
      const java=await this.resolveJava(project)
      if(this.disposed)throw new Error('Host stopped during preparation; no process was launched.')
      const active=this.store.listRuns(project.id).filter(item=>item.id!==run.id && item.leaseOwner==='fiji-workflow' && !terminal.has(item.status))
      if(active.length)throw new Error('Another Fiji quantification is pending. Local heavy-job concurrency is 1.')
      this.store.updateRun(run.id,{status:'running',logUri:pathToFileURL(logPath).href,inputs:[...run.inputs,{name:'request',uri:pathToFileURL(requestPath).href,mediaType:'application/json'},{name:'request_sha256',uri:hash(requestText)},{name:'source_asset',uri:source.id},{name:'annotation_revision',uri:annotation.id}]})
      const log=await open(logPath,'wx')
      try {
        const child=spawn(java.executable,['-Xmx512m','-Djava.awt.headless=true','-XX:ActiveProcessorCount=2','-cp',java.jars,'org.python.util.jython',scriptPath],{cwd:directory,env:{...process.env,ZEROWALL_FIJI_REQUEST:requestPath},shell:false,windowsHide:true,stdio:['ignore',log.fd,log.fd]})
        const timer=setTimeout(()=>{if(!this.disposed && !terminal.has(this.store.getRun(run.id)!.status)){this.store.updateRun(run.id,{status:'timed_out',error:'Fiji bounded computation exceeded 120 seconds; partial files retained.'});this.syncTaskForRun(run.id)}child.kill()},120000)
        this.live.set(run.id,{child,timer})
        child.once('spawn',()=>{if(!this.disposed && child.pid && !terminal.has(this.store.getRun(run.id)!.status))this.store.updateRun(run.id,{pid:child.pid})})
        child.once('error',error=>{if(!this.disposed&&!terminal.has(this.store.getRun(run.id)!.status)){this.store.updateRun(run.id,{status:'failed',error:error.message});this.syncTaskForRun(run.id)}})
        child.once('close',()=>{clearTimeout(timer);this.live.delete(run.id);if(!this.disposed)void this.status(project,run.id,true).catch(error=>this.fail(run.id,error))})
      } finally {await log.close()}
    } catch(error){this.fail(run.id,error)}
    return {run:this.store.getRun(run.id)!}
  }

  private fail(id:string,error:unknown):void {
    if(!this.disposed&&!terminal.has(this.store.getRun(id)!.status)){this.store.updateRun(id,{status:'failed',error:String(error)});this.syncTaskForRun(id)}
  }
  private syncTaskForRun(id:string):void {
    const run=this.store.getRun(id);const taskId=run?.inputs.find(item=>item.name==='research_task_id')?.uri
    if(taskId) this.store.reconcileResearchTaskRun(taskId)
  }
  private status(project:ProjectRecord,id:string,exited=false):Promise<FijiWorkflowResponse> {
    const active=this.finishing.get(id);if(active)return active
    const task=this.inspect(project,id,exited);this.finishing.set(id,task)
    void task.finally(()=>this.finishing.delete(id)).catch(()=>{})
    return task
  }
  private async inspect(project:ProjectRecord,id:string,exited:boolean):Promise<FijiWorkflowResponse> {
    let run=this.store.getRun(id)!
    const artifacts=()=>this.store.listArtifacts(project.id).filter(item=>item.runId===id)
    if(run.status==='succeeded'){
      const artifact=artifacts().find(item=>item.name==='result.json')!
      const bytes=await readProjectAsset(project,{uri:artifact.uri,checksumAlgorithm:'sha256',checksum:artifact.checksum!},8*1024*1024)
      return {run,artifacts:artifacts(),result:JSON.parse(bytes.toString('utf8')) as WesternBlotResult}
    }
    if(terminal.has(run.status))return {run,artifacts:artifacts()}
    const directory=await containedFile(project.rootPath,run.workingDirectory).catch(()=>undefined)
    if(!directory)return {run}
    let completion: {status:string;requestSha256:string;error?:string;files?:Array<{path:string;sha256:string}>}
    try {completion=JSON.parse((await readProjectAsset(project,{uri:pathToFileURL(join(directory,'completion.json')).href},1024*1024)).toString('utf8'))}
    catch(error){
      if(exited || (run.timeoutAt && Date.now()>Date.parse(run.timeoutAt))){this.fail(id,`Worker ended or recovery deadline expired without a readable completion manifest: ${String(error)}`);run=this.store.getRun(id)!}
      return {run}
    }
    try {
      const expected=run.inputs.find(item=>item.name==='request_sha256')?.uri
      if(!expected || completion.requestSha256!==expected)throw new Error('Completion request hash mismatch.')
      if(completion.status!=='succeeded')throw new Error(completion.error??'ImageJ quantification failed.')
      const requestBytes=await readProjectAsset(project,{uri:pathToFileURL(join(directory,'request.json')).href,checksumAlgorithm:'sha256',checksum:expected},8*1024*1024)
      const request=JSON.parse(requestBytes.toString('utf8'))
      if(!Array.isArray(completion.files) || completion.files.length>804 || !['result.json','lanes.csv','roi-index.json','qc-page-0.png'].every(name=>completion.files!.some(file=>file.path===name)))throw new Error('Incomplete Fiji output manifest.')
      const currentHead=this.store.listAnnotationRevisions(project.id,request.sourceAssetId).filter(item=>item.sourceSha256===request.sourceSha256&&item.status==='accepted').at(-1)
      let needsReview=currentHead?.id!==request.annotationRevisionId
      const asset=this.store.listDataAssets(project.id).find(item=>item.id===request.sourceAssetId)
      try{if(!asset||hash(await readProjectAsset(project,asset,MAX_BYTES))!==request.sourceSha256)needsReview=true}catch{needsReview=true}
      let result:WesternBlotResult|undefined
      const registered:CreateArtifactInput[]=[];const names=new Set<string>()
      for(const file of completion.files){
        if(!/^(result\.json|lanes\.csv|roi-index\.json|qc-page-0\.png|roi-\d{4}\.roi)$/u.test(file.path)||names.has(file.path)||!/^[a-f0-9]{64}$/u.test(file.sha256))throw new Error('Invalid or duplicate manifest output.')
        names.add(file.path)
        const uri=pathToFileURL(join(directory,file.path)).href
        const bytes=await readProjectAsset(project,{uri,checksumAlgorithm:'sha256',checksum:file.sha256},8*1024*1024)
        if(file.path==='result.json'){
          result=JSON.parse(bytes.toString('utf8')) as WesternBlotResult
          if(result.format!=='zerowall-western-blot'||result.version!==1||result.requestSha256!==expected||result.sourceSha256!==request.sourceSha256||result.annotationRevisionId!==request.annotationRevisionId||!Array.isArray(result.rows)||result.rows.length!==request.plan.lanes.length||!result.rows.every((row,i)=>row.sampleId===request.plan.lanes[i].sampleId))throw new Error('Runner result does not match its frozen input.')
        }
        registered.push({projectId:project.id,runId:id,name:file.path,uri,mediaType:file.path.endsWith('.png')?'image/png':file.path.endsWith('.csv')?'text/csv':file.path.endsWith('.json')?'application/json':'application/octet-stream',checksum:file.sha256,metadata:{sourceAssetId:request.sourceAssetId,sourceSha256:request.sourceSha256,annotationRevisionId:request.annotationRevisionId,runnerSha256:request.runnerSha256,requestSha256:expected,needsReview,kind:'western-blot',scientificReview:'pending'} as JsonObject})
      }
      if(this.disposed)return {run}
      run=this.store.getRun(id)!
      if(terminal.has(run.status))return {run,artifacts:artifacts()}
      run=this.store.finishScientificRun(project.id,id,registered)
      this.syncTaskForRun(id)
      return {run,artifacts:artifacts(),...(result?{result}:{})}
    }catch(error){this.fail(id,error);return {run:this.store.getRun(id)!,artifacts:artifacts()}}
  }

  dispose():void {
    this.disposed=true
    // This bounded computational child owns only copied input. Interactive Fiji instances are separate.
    for(const [id,{child,timer}] of this.live){clearTimeout(timer);child.kill();const run=this.store.getRun(id);if(run&&!terminal.has(run.status)){this.store.updateRun(id,{status:'failed',error:'Host stopped during bounded Fiji computation. Partial outputs retained; inspect before a new request.'});this.syncTaskForRun(id)}}
    this.live.clear()
  }
}
