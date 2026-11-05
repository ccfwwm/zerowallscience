import { randomUUID, createHash } from 'node:crypto'
import { readFile, mkdir, stat, copyFile } from 'node:fs/promises'
import { join, relative, resolve, basename } from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { resolveFixedPythonRuntime } from '../../../python/src/shared/runtime-path.js'
import { spawnWithRuntimeLease } from '../../../python/src/shared/runtime-process.js'
import { disposeReconstructionWorkers, runReconstructionWorker } from './reconstruction-worker.js'
import { reconstructionConcurrency, withReconstructionSlot } from './reconstruction-concurrency.js'
import { hash, readManifest, readSpecification, saveJson, withPresentationLock, workspacePath } from './visual-assets.js'

type Bridge = { cwd(exec: any): string; bound(exec: any): Promise<any>; currentBinding(exec: any, state: any): Promise<any>; persist(exec: any, state: any): Promise<void>; project(exec: any, state: any): Promise<any>; dispatch(exec: any, name: string, args: any, internal?: boolean): Promise<any>; sync(exec: any, state: any): Promise<any> }
export interface ReconstructionJob {
  taskId: string; page: number; status: 'queued' | 'processing' | 'complete' | 'failed' | 'interrupted' | 'cancelled'; runId: string
  source: string; sourceSha256: string; inputFingerprint: string | null; pageId: string | null; updatedAt: string
  receipt?: string; error?: string; quality?: Record<string, unknown>; timings?: Record<string, number>; cached?: boolean
  phase?: 'analyzing' | 'building' | 'rendering' | 'repairing' | 'review' | 'verified'
  qualityStatus?: 'pending' | 'review' | 'passed'
  evidenceFingerprint?: string
  referenceSource?: string
  analysisSource?: string
  analysisSha256?: string
  analysisPlan?: Record<string, unknown>
  concurrency?: number
}
export function readReviewedReconstructionPlan(bytes: Uint8Array, sourceSha256: string, page: number): Record<string, unknown> {
  if (bytes.byteLength > 2_000_000) throw new Error('Reconstruction analysis exceeds 2 MB.')
  const document = JSON.parse(Buffer.from(bytes).toString('utf8'))
  if (document?.schemaVersion !== 1 || document.sourceSha256 !== sourceSha256 || !document.pages || typeof document.pages !== 'object') throw new Error('Reconstruction analysis is invalid or belongs to a different source.')
  const plan = document.pages[String(page)]
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) throw new Error(`Reconstruction analysis has no page ${page}.`)
  const allowed = new Set(['regions', 'textAnnotations', 'inventory', 'fontProfile'])
  if (Object.keys(plan).some(key => !allowed.has(key))) throw new Error('Unsupported reconstruction analysis field.')
  return structuredClone(plan)
}
export function reconstructionQualityPassed(quality: any, comparison: any): boolean {
  return quality?.contentVerified === true && quality?.inventoryVerified === true && quality?.scientificImagesVerified === true
    && quality?.rasterTexts === 0 && comparison?.ssim >= .98 && typeof comparison?.textEdgeP95 === 'number' && comparison.textEdgeP95 <= 2
    && typeof comparison?.glyphEdgeP95 === 'number' && comparison.glyphEdgeP95 <= 2 && comparison.nativeTextGeometryCoverage === 1
}
export function reconstructionComparisonScore(comparison: any): number {
  const value=Number(comparison?.nativeTextMae ?? comparison?.mae)+Number(comparison?.textEdgeP95 ?? 20)*.5
  if(!Number.isFinite(value)||!Number.isFinite(comparison?.ssim))throw new Error('Invalid final render metrics.')
  return value
}
export function reconstructionComparisonImproved(candidate: any, best: any): boolean {
  if (!best) return true
  // Losing difficult objects must not make a smaller measured subset look
  // better. Bounding boxes alone also cannot justify worse glyph outlines.
  if (Number(candidate.nativeTextGeometryCoverage ?? 0) < Number(best.nativeTextGeometryCoverage ?? 0)) return false
  if (typeof best.glyphEdgeP95 === 'number' && (typeof candidate.glyphEdgeP95 !== 'number' || candidate.glyphEdgeP95 > best.glyphEdgeP95 + .5)) return false
  return reconstructionComparisonScore(candidate)<reconstructionComparisonScore(best)-.01 && candidate.ssim>=best.ssim-.0005
}
export function assertCurrentReconstructionEvidence(job: ReconstructionJob | undefined, fingerprint: string): void {
  if (job?.status !== 'complete' || !job.quality?.finalRender || job.quality.finalRenderError || job.evidenceFingerprint !== fingerprint) {
    throw new Error('Current final PPTX render evidence is required before reconstruction approval.')
  }
}
const visualFingerprint=(snapshot:any):string|null=>snapshot?.visualFingerprint ?? snapshot?.fingerprint ?? null
export function invalidateReconstructionEvidence(state: any, snapshots: { page: number; fingerprint: string; visualFingerprint?: string }[]): void {
  for (const job of Object.values(state.reconstruction?.jobs ?? {}) as ReconstructionJob[]) {
    const current = snapshots.find(page => page.page === job.page)
    if (job.evidenceFingerprint && job.evidenceFingerprint !== visualFingerprint(current)) {
      job.qualityStatus = 'review'; job.phase = 'review'
      job.quality = { ...job.quality, requiresReview: true, staleEvidence: true }
      delete job.evidenceFingerprint
      if (state.reconstruction?.approval?.pages[job.page]) delete state.reconstruction.approval
    }
  }
}
const output = { schema: { type: 'string' as const }, render: (_args: unknown, value: any) => [{ type: 'text' as const, text: value }] }
export function reconstructionCapabilityMessage(detail = ''): string {
  return `PPT_RECONSTRUCTION_CAPABILITY_MISSING: 请在设置中的 Python 环境同步已签名的 ppt-reconstruction 能力，然后重试。${detail ? ` 检测信息：${detail}` : ''}`
}
export function formatReconstructionWorkerError(message: string): string {
  return /No module named ['"](?:rapidocr_onnxruntime|cv2|PIL)['"]|ModuleNotFoundError.*(?:rapidocr_onnxruntime|cv2|PIL)/iu.test(message)
    ? reconstructionCapabilityMessage(message)
    : message
}
const sourceHashes = new Map<string, { signature: string; hash: string }>()
async function sourceHash(path: string): Promise<string> {
  const info = await stat(path, { bigint: true }), signature = `${info.size}:${info.mtimeNs}:${info.ctimeNs}:${info.ino}`
  const hit = sourceHashes.get(path)
  if (hit?.signature === signature) return hit.hash
  const value = hash(await readFile(path)); sourceHashes.set(path, { signature, hash: value }); return value
}
export function validateReconstructionReceipt(receipt: any, width: number, height: number): void {
  if (receipt?.schemaVersion !== 1 || receipt.width !== width || receipt.height !== height || !Array.isArray(receipt.elements) || receipt.elements.length > 1024 || !receipt.elements.length) throw new Error('Invalid reconstruction receipt.')
  const ids = new Set<string>()
  for (const element of receipt.elements) {
    if (!/^[\w.-]{1,128}$/u.test(element.elementId) || ids.has(element.elementId)) throw new Error('Invalid reconstruction element ID.')
    ids.add(element.elementId)
    const b = element.bounds
    if (!Array.isArray(b) || b.length !== 4 || !b.every(Number.isFinite) || b[0] < 0 || b[1] < 0 || b[2] <= 0 || b[3] <= 0 || b[0]+b[2] > width+.001 || b[1]+b[3] > height+.001) throw new Error('Reconstruction bounds exceed canvas.')
    if (!['text', 'image', 'shape', 'line'].includes(element.elementType)) throw new Error('Unsupported reconstruction object.')
    if (element.elementType === 'image' && (typeof element.src !== 'string' || basename(element.src) !== element.src || !/^[\w-]+\.png$/u.test(element.src) || !/^[a-f0-9]{64}$/u.test(receipt.files?.[element.src]))) throw new Error('Invalid reconstructed asset path/hash.')
    if (element.elementType === 'text' && typeof element.content?.text !== 'string') throw new Error('Invalid reconstructed text.')
  }
}
async function runWorker(request: string, signal: AbortSignal): Promise<void> {
  try { await runReconstructionWorker(request, signal) }
  catch (error) { throw new Error(formatReconstructionWorkerError(error instanceof Error ? error.message : String(error))) }
}

export function installReconstructionWorkflow(ctx: any, bridge: Bridge): void {
  const runId = randomUUID(), tasks = new Map<string, AbortController>()
  ctx.effect(() => () => { for (const controller of tasks.values()) controller.abort(new Error('Host stopped')); tasks.clear(); disposeReconstructionWorkers() })
  const lock = (exec: any, state: any) => resolve(bridge.cwd(exec), state.dir)
  async function update(exec: any, initial: any, expected: ReconstructionJob, patch: Partial<ReconstructionJob>) {
    return withPresentationLock(lock(exec, initial), async () => {
      const state = await bridge.currentBinding(exec, initial)
      const job = state.reconstruction?.jobs?.[expected.page]
      if (!job || job.runId !== runId || job.taskId !== expected.taskId) throw new Error('Reconstruction task has been superseded.')
      Object.assign(job, patch, { updatedAt: new Date().toISOString() })
      await bridge.persist(exec, state)
      await saveJson(await workspacePath(bridge.cwd(exec), join(state.dir, '.reconstruction/jobs.json')), state.reconstruction)
      return job
    })
  }
  async function executePage(exec: any, initial: any, job: ReconstructionJob, controller: AbortController): Promise<void> {
    const root = bridge.cwd(exec)
    let cancelTimer: ReturnType<typeof setInterval> | undefined
    try {
      controller.signal.throwIfAborted()
      const reconstructionRoot = await workspacePath(root, join(initial.dir, '.reconstruction'))
      await mkdir(reconstructionRoot, { recursive: true })
      const sourceDirectory = await workspacePath(root, join(reconstructionRoot, job.sourceSha256.slice(0,20)))
      await mkdir(sourceDirectory, { recursive: true })
      const directory = await workspacePath(root, join(sourceDirectory, `page-${job.page}`))
      await mkdir(directory, { recursive: true })
      const cancel = await workspacePath(root, join(reconstructionRoot, `cancel-${job.taskId}`))
      cancelTimer = setInterval(() => { void stat(cancel).then(() => controller.abort(new Error('Cancelled by user')), () => {}) }, 500)
      await update(exec, initial, job, { status: 'processing', phase: 'analyzing', qualityStatus: 'pending' })
      const spec = await readSpecification(root, initial.spec)
      await mkdir(directory, { recursive: true })
      const request = join(directory, 'request.json')
      if (job.analysisSource && hash(await readFile(job.analysisSource)) !== job.analysisSha256) throw new Error('Reconstruction analysis changed; queue the reviewed page again.')
      await saveJson(request, { ...(/\.pptx$/iu.test(job.source) ? { sourcePptx: job.source } : { image: job.source }), ...job.analysisPlan, page: job.page, width: spec.width, height: spec.height, outputDir: directory, referencePptx: job.referenceSource })
      await runWorker(request, controller.signal)
      const receiptPath = join(directory, 'receipt.json')
      const receipt = JSON.parse(await readFile(receiptPath, 'utf8'))
      validateReconstructionReceipt(receipt, spec.width, spec.height)
      if (await sourceHash(job.source) !== job.sourceSha256) throw new Error('Source changed during reconstruction. Result was not applied.')
      const elements = structuredClone(receipt.elements)
      // Asset preparation is outside the write lock, content-addressed and reusable.
      await mkdir(join(root, initial.dir, 'media'), { recursive: true })
      for (const element of elements.filter((item: any) => item.elementType === 'image')) {
        const file = await workspacePath(root, join(directory, element.src))
        const bytes = await readFile(file), digest = hash(bytes)
        if (digest !== receipt.files[element.src]) throw new Error('Reconstruction asset integrity mismatch.')
        const destination = `media/reconstruct-${digest}.png`
        await copyFile(file, await workspacePath(root, join(initial.dir, destination)))
        element.src = destination
      }
      controller.signal.throwIfAborted()
      let appliedFingerprint: string | undefined
      const sourceAssets = new Map(elements.filter((e: any) => e.elementType === 'image').map((e: any, i: number) => [receipt.elements.filter((x: any) => x.elementType === 'image')[i].src, e.src]))
      async function applyCandidate(candidate: any, phase: ReconstructionJob['phase']) {
        const nextElements = structuredClone(candidate.elements)
        for (const element of nextElements) if (element.elementType === 'image') element.src = sourceAssets.get(element.src) ?? element.src
        await withPresentationLock(lock(exec, initial), async () => {
          const state = await bridge.currentBinding(exec, initial), current = await bridge.project(exec, state)
          const liveJob = state.reconstruction?.jobs?.[job.page], existing = current.snapshots[job.page-1]
          if (liveJob?.taskId !== job.taskId || liveJob.runId !== runId) throw new Error('Reconstruction task was superseded.')
          if (job.analysisSource && hash(await readFile(job.analysisSource)) !== job.analysisSha256) throw new Error('Reconstruction analysis changed; result retained without applying.')
          if (visualFingerprint(existing) !== (appliedFingerprint ?? job.inputFingerprint) || (!appliedFingerprint && (existing?.id ?? null) !== job.pageId)) throw new Error('Page changed during reconstruction; candidate retained for review, not applied.')
          const ops: any[] = []
          for (let page=current.snapshots.length+1;page<job.page;page++) ops.push({op:'add_page',page:`pages/${String(page).padStart(2,'0')}.page`,content:{elements:[]}})
          const content={elements:nextElements,notes:JSON.stringify({kind:'raster-reconstruction',sourceSha256:job.sourceSha256,receipt:relative(root,receiptPath),quality:candidate.quality,warnings:candidate.warnings})}
          ops.push(existing?{op:'update_page',page:existing.id,patch:content}:{op:'add_page',page:`pages/${String(job.page).padStart(2,'0')}.page`,content})
          await bridge.dispatch(exec,'ppt_edit',{dir:state.dir,baseRevision:current.manifest.revision,ops,newVersion:true},true)
          state.templatePlans ??= {}; state.templatePlans[job.page]={page:job.page,elements:nextElements,createdAt:new Date().toISOString()}
          state.outputMode='editable';state.phase='reconstruction-checking'
          Object.assign(liveJob,{status:'processing',phase,qualityStatus:'pending',receipt:relative(root,receiptPath),quality:candidate.quality,timings:candidate.timings,cached:candidate.cached,updatedAt:new Date().toISOString()})
          await bridge.sync(exec,state)
          appliedFingerprint=visualFingerprint((await bridge.project(exec,state)).snapshots[job.page-1])??undefined
          await bridge.persist(exec,state)
          await saveJson(await workspacePath(root,join(state.dir,'.reconstruction/jobs.json')),state.reconstruction)
        })
      }
      await applyCandidate(receipt,'rendering')
      let candidate=receipt, best=receipt, bestComparison: any, bestScore=Infinity, stagnant=0
      const repairs: any[]=[]
      for(let round=0;round<=3;round++) {
        controller.signal.throwIfAborted()
        if (await sourceHash(job.source)!==job.sourceSha256) throw new Error('Source changed during rendering; evidence discarded.')
        const rendering=await bridge.dispatch(exec,'ppt_render',{dir:initial.dir,pages:[job.page],dpi:144,text_probes:true},true)
        const image=rendering.images?.find((item:any)=>item.page===job.page)
        if(!image?.path) throw new Error('PPTX renderer did not return the reconstructed page.')
        const textProbe=rendering.textProbes?.find((item:any)=>item.page===job.page)
        if(!textProbe?.path || !Array.isArray(textProbe.colors)) throw new Error('PPTX renderer did not return isolated text measurements.')
        const candidatePath=join(directory,'candidate.json'); await saveJson(candidatePath,candidate)
        const comparisonDir=join(directory,`final-render-${round}`), comparisonRequest=join(directory,'compare-request.json')
        await saveJson(comparisonRequest,{comparison:true,receipt:candidatePath,rendered:await workspacePath(root,image.path),
          textProbe:{...textProbe,path:await workspacePath(root,textProbe.path)},outputDir:comparisonDir})
        await runWorker(comparisonRequest,controller.signal)
        const comparison=JSON.parse(await readFile(join(comparisonDir,'comparison.json'),'utf8'))
        comparison.comparisonPath=relative(root,join(comparisonDir,'comparison.json')).replaceAll('\\','/')
        const score=reconstructionComparisonScore(comparison)
        repairs.push({round,score,ssim:comparison.ssim,textEdgeP95:comparison.textEdgeP95,renderSha256:comparison.renderSha256})
        if(reconstructionComparisonImproved(comparison,bestComparison)) {bestScore=score;best=structuredClone(candidate);bestComparison=comparison;stagnant=0} else stagnant++
        if(round===3 || stagnant>=2 || (comparison.ssim>=.98 && comparison.textEdgeP95<=2 && comparison.glyphEdgeP95<=2 && comparison.nativeTextGeometryCoverage===1)) break
        const repairRequest=join(directory,'repair-request.json')
        await saveJson(repairRequest,{repair:true,receipt:candidatePath,comparisonPath:join(comparisonDir,'comparison.json'),outputDir:directory})
        await runWorker(repairRequest,controller.signal)
        candidate=JSON.parse(await readFile(join(directory,'repair.json'),'utf8'))
        if(!candidate.repairChanges?.length) break
        validateReconstructionReceipt(candidate,spec.width,spec.height)
        await applyCandidate(candidate,'repairing')
      }
      if(JSON.stringify(best.elements)!==JSON.stringify(candidate.elements)) await applyCandidate(best,'rendering')
      await withPresentationLock(lock(exec,initial),async()=>{
        const state=await bridge.currentBinding(exec,initial),current=await bridge.project(exec,state),liveJob=state.reconstruction?.jobs?.[job.page]
        if(liveJob?.taskId!==job.taskId || liveJob.runId!==runId || visualFingerprint(current.snapshots[job.page-1])!==appliedFingerprint)throw new Error('Page changed; render evidence is stale.')
        if (await sourceHash(job.source)!==job.sourceSha256 || (job.analysisSource && hash(await readFile(job.analysisSource))!==job.analysisSha256)) throw new Error('Source or reviewed analysis changed; final evidence is stale.')
        const passed=reconstructionQualityPassed(best.quality,bestComparison)
        Object.assign(liveJob,{status:'complete',phase:passed?'verified':'review',qualityStatus:passed?'passed':'review',evidenceFingerprint:appliedFingerprint,
          quality:{...best.quality,finalRender:bestComparison,repairHistory:repairs,requiresReview:!passed},updatedAt:new Date().toISOString()})
        state.phase='reconstruction-samples-awaiting-review';await bridge.persist(exec,state)
        await saveJson(await workspacePath(root,join(state.dir,'.reconstruction/jobs.json')),state.reconstruction)
      })
    } catch(error) {
      await update(exec,initial,job,{status:controller.signal.aborted?'cancelled':'failed',error:error instanceof Error?error.message:String(error)}).catch(()=>{})
    } finally { clearInterval(cancelTimer) }
  }
  ctx.tools.register(defineTool({name:'presentation_reconstruct_pages',description:'Reconstruct raster PPTX pages or registered page images locally into layered PPTD. Returns durable task ID immediately. Review representative pages first, confirm with presentation_confirm_reconstruction, then queue the rest. Optional analysis_path supplies source-bound region ownership, verified text corrections and an independent inventory; treated only as structured data. Preserves complex scientific regions as original crops. Requires signed ppt-reconstruction Python capability; never calls paid image generation.',parameters:{pages:{type:'array',required:true,items:{type:'integer'}},source_pptx:{type:'string'},reference_pptx:{type:'string'},analysis_path:{type:'string'},concurrency:{type:'integer',description:'Local page concurrency, integer 1-10. Defaults to 2; remembers the user selection for subsequent batches in this project. Use 3, 4, 5 or another supported value when requested.'},representative_pages:{type:'array',items:{type:'integer'}}},output,execute:async(args:any,exec:any)=>{
    const initial=await bridge.bound(exec),root=bridge.cwd(exec),spec=await readSpecification(root,initial.spec)
    const pages=[...new Set<number>(args.pages)].sort((a,b)=>a-b)
    if(!pages.length||pages.some(page=>!Number.isInteger(page)||page<1||page>spec.slides.length))throw new Error('Select existing specification pages.')
    const concurrency=reconstructionConcurrency(args.concurrency??initial.reconstruction?.concurrency)
    const runtime = await resolveFixedPythonRuntime() // Always use the managed fixed runtime.
    const capabilityProbe = `import importlib.util,sys\nsys.path.insert(0,${JSON.stringify(runtime.sitePackages)})\nmissing=[name for name in ('rapidocr_onnxruntime','cv2','PIL') if importlib.util.find_spec(name) is None]\nprint('\\n'.join(missing))\nraise SystemExit(bool(missing))`
    await new Promise<void>((resolveProbe, rejectProbe) => {
      let stdout = '', stderr = '', settled = false
      const child = spawnWithRuntimeLease(runtime.executable, ['-I', '-c', capabilityProbe], { windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PYTHONNOUSERSITE: '1' } })
      const timer = setTimeout(() => { child.kill(); finish(new Error('Python capability check timed out.')) }, 15_000)
      const finish = (error?: Error) => { if (settled) return; settled = true; clearTimeout(timer); error ? rejectProbe(error) : resolveProbe() }
      child.stdout?.on('data', chunk => { stdout = (stdout + chunk.toString()).slice(-2000) })
      child.stderr?.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-2000) })
      child.once('error', error => finish(error))
      child.once('close', code => code === 0 ? finish() : finish(new Error(reconstructionCapabilityMessage((stdout || stderr).trim()))))
    })
    const source=args.source_pptx?await workspacePath(root,args.source_pptx):undefined
    const referenceSource=args.reference_pptx?await workspacePath(root,args.reference_pptx):undefined
    const analysisSource=args.analysis_path?await workspacePath(root,args.analysis_path):undefined
    if (analysisSource && (await stat(analysisSource)).size > 2_000_000) throw new Error('Reconstruction analysis exceeds 2 MB.')
    const analysisBytes=analysisSource?await readFile(analysisSource):undefined
    const manifest=source?undefined:await readManifest(root,initial.manifest)
    const inputs=await Promise.all(pages.map(async page=>{
      const asset=manifest?.assets.filter(asset=>asset.slideNumber===page&&['template','page-template','slide','full-slide','page-image'].includes(asset.role)).at(-1)??manifest?.assets.filter(asset=>asset.slideNumber===page).at(-1)
      const file=source??(asset?await workspacePath(root,asset.path):undefined)
      if(!file)throw new Error(`Page ${page} has no source image.`)
      const sourceSha256=await sourceHash(file)
      return {page,source:file,sourceSha256,...(analysisBytes&&analysisSource?{analysisSource,analysisSha256:hash(analysisBytes),analysisPlan:readReviewedReconstructionPlan(analysisBytes,sourceSha256,page)}:{})}
    }))
    const taskId=randomUUID()
    await mkdir(await workspacePath(root,join(initial.dir,'.reconstruction')),{recursive:true})
    const jobs=await withPresentationLock(lock(exec,initial),async()=>{
      const state=await bridge.currentBinding(exec,initial),current=await bridge.project(exec,state)
      state.reconstruction??={jobs:{},representativePages:args.representative_pages??[1,7,16,18,20].filter(page=>page<=spec.slides.length)}
      state.reconstruction.concurrency=concurrency
      const samples=state.reconstruction.representativePages as number[]
      if(!samples.length||samples.some(page=>!Number.isInteger(page)||page<1||page>spec.slides.length))throw new Error('Invalid representative page selection.')
      if(pages.some(page=>!samples.includes(page))&&!state.reconstruction.approval)throw new Error('PRESENTATION_SAMPLE_CONFIRMATION_REQUIRED: Reconstruct and display representative pages first; confirm editability and fonts before full-deck processing.')
      if(state.reconstruction.approval){
        for(const sample of samples){const snapshot=current.snapshots[sample-1];if(!snapshot||state.reconstruction.approval.pages[sample]!==visualFingerprint(snapshot))throw new Error('Sample approval is stale; review changed representative pages again.')}
        if(source&&state.reconstruction.approval.sourceSha256!==inputs[0]?.sourceSha256)throw new Error('Source changed; confirm representative pages again.')
      }
      const queued=inputs.map(input=>{
        const previous=state.reconstruction.jobs[input.page]
        if(previous&&['queued','processing'].includes(previous.status)&&previous.runId===runId)throw new Error(`Page ${input.page} already has an active task.`)
        const snapshot=current.snapshots[input.page-1]
        const job:ReconstructionJob={...input,...(referenceSource?{referenceSource}:{}),taskId,runId,status:'queued',concurrency,inputFingerprint:visualFingerprint(snapshot),pageId:snapshot?.id??null,updatedAt:new Date().toISOString()}
        state.reconstruction.jobs[input.page]=job;return job
      })
      await bridge.persist(exec,state)
      await saveJson(await workspacePath(root,join(state.dir,'.reconstruction/jobs.json')),state.reconstruction)
      return queued
    })
    const controller=new AbortController();tasks.set(taskId,controller)
    const background={...exec,signal:controller.signal,token:undefined,rootCallId:undefined};delete background.deferContext
    const pending=[...jobs]
    void Promise.all(Array.from({length:Math.min(concurrency,jobs.length)},async()=>{for(;;){
      const job=pending.shift();if(!job)return
      await withReconstructionSlot(concurrency,()=>executePage(background,initial,job,controller),controller.signal)
        .catch(error=>update(background,initial,job,{status:controller.signal.aborted?'cancelled':'failed',error:error instanceof Error?error.message:String(error)}).catch(()=>{}))
    }})).finally(()=>tasks.delete(taskId))
    return JSON.stringify({taskId,pages,status:'queued',concurrency,sampleApprovalRequired:!initial.reconstruction?.approval,statusTool:'presentation_reconstruction_status'})
  }}))
  ctx.tools.register(defineTool({name:'presentation_reconstruction_status',description:'Read durable local reconstruction progress; cancel a task without losing completed pages. Requeue selected failed/interrupted pages with presentation_reconstruct_pages.',parameters:{cancel_task_id:{type:'string'}},output,execute:async(args:any,exec:any)=>{
    const initial=await bridge.bound(exec)
    if(args.cancel_task_id){const controller=tasks.get(args.cancel_task_id);if(!controller)throw new Error('No active reconstruction task with that ID.');controller.abort(new Error('Cancelled by user'))}
    const state=await bridge.currentBinding(exec,initial)
    invalidateReconstructionEvidence(state,(await bridge.project(exec,state)).snapshots)
    for(const job of Object.values(state.reconstruction?.jobs??{}) as ReconstructionJob[])if(['queued','processing'].includes(job.status)&&job.runId!==runId){job.status='interrupted';job.error='Host restarted; resume selected pages manually.'}
    await bridge.persist(exec,state)
    return JSON.stringify(state.reconstruction??{jobs:{}})
  }}))
  ctx.tools.register(defineTool({name:'presentation_confirm_reconstruction',description:'Record explicit user approval after showing reconstructed representative pages, font alternatives, and raster edit boundaries. Required before full-deck reconstruction.',parameters:{confirmed:{type:'boolean',required:true},observations:{type:'string',required:true},accept_limitations:{type:'boolean'}},output,execute:async(args:any,exec:any)=>{
    if(!args.confirmed||args.observations.trim().length<20)throw new Error('Record user approval and concrete sample observations.')
    const initial=await bridge.bound(exec)
    return withPresentationLock(lock(exec,initial),async()=>{
      const state=await bridge.currentBinding(exec,initial),current=await bridge.project(exec,state),r=state.reconstruction
      if(!r)throw new Error('Reconstruct representative pages first.')
      const pages:Record<string,string>={}
      for(const page of r.representativePages){const snapshot=current.snapshots[page-1];if(!snapshot)throw new Error(`Sample page ${page} is missing.`);const fingerprint=visualFingerprint(snapshot)!;assertCurrentReconstructionEvidence(r.jobs[page],fingerprint);if(r.jobs[page]?.qualityStatus!=='passed'&&!args.accept_limitations)throw new Error('Sample requires review. Explicit acceptance of the listed edit boundaries is required.');pages[page]=fingerprint}
      r.approval={pages,sourceSha256:r.jobs[r.representativePages[0]]?.sourceSha256,observations:args.observations,
        acceptedLimitations:args.accept_limitations===true,
        editBoundaries:Object.fromEntries(r.representativePages.map((page:number)=>[page,{qualityStatus:r.jobs[page].qualityStatus,quality:r.jobs[page].quality}])),
        confirmedAt:new Date().toISOString()}
      state.phase='reconstruction-approved';await bridge.persist(exec,state);return JSON.stringify({confirmed:true,representativePages:r.representativePages})
    })
  }}))
}
