import { createHash, randomUUID } from 'node:crypto'
import { readFile, writeFile, readdir, rename, stat, mkdir, open, unlink } from 'node:fs/promises'
import { basename, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { SessionId } from '@deepseek-ai/dsh-session'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { MediaDraft, MediaJob, MediaSelection, MediaScope, MediaAsset } from '@zerowallscience/plugin-ai-cloud/types'
import type {} from '@zerowallscience/plugin-ai-cloud'
import type {} from '@zerowallscience/plugin-python'
import type {} from '@zerowallscience/plugin-environment'
import { mediaTarget } from '@zerowallscience/plugin-ai-cloud'
import { commandOutput } from './host-python.js'
import type { CompositionJob, MediaProject } from './media-types.js'
import { PROJECT_ID } from './media-types.js'
import { validateMediaJobKind } from './media-contract.js'
const hash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex')
const MAX = 256 * 1024 * 1024
const mime: Record<string,string> = { '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.mp4':'video/mp4','.mov':'video/quicktime','.webm':'video/webm','.m4a':'audio/mp4','.aac':'audio/aac','.wav':'audio/wav','.mp3':'audio/mpeg','.ogg':'audio/ogg','.flac':'audio/flac' }
export function mediaMime(path: string) { return mime[extname(path).toLowerCase()] }
export const defaultMediaProjectId = (sessionId: string) => 'session-' + sessionId.replace(/[^A-Za-z0-9_-]/g, '_').slice(-60)
declare module '@deepseek-ai/cordis' { interface Context { zerowallMediaStudio: MediaStudioService } }
export class MediaStudioService extends TypertRemoteService {
  private activeSessions = new Set<string>()
  private writes: Promise<unknown> = Promise.resolve()
  private generations: Promise<unknown> = Promise.resolve()
  private activeRenders = new Map<string, Promise<MediaAsset>>()
  private uploads = new Map<string, { scope: MediaScope; path: string; name: string; bytes: number }>()
  constructor(private host: Context) { super(host, 'zerowallMediaStudio') }
  active(sessionId: string): boolean { return this.activeSessions.has(sessionId) }
  async generate(sessionId: string, input: any): Promise<MediaJob> {
    validateMediaJobKind(input)
    const next = this.generations.then(() => this.generateOnce(sessionId, input), () => this.generateOnce(sessionId, input))
    this.generations = next.catch(() => {})
    return next
  }
  private async generateOnce(sessionId: string, input: any): Promise<MediaJob> {
    const scope = await this.scope(sessionId, input.projectId ?? defaultMediaProjectId(sessionId), true)
    const previous = input.id ? (await this.host.zerowallMediaJobs.list(scope)).find(job => job.id === input.id) : undefined
    if (previous) validateMediaJobKind(previous)
    if (previous && !['prepared', 'model-required'].includes(previous.state)) return previous
    const draft = await this.prepare(scope, { ...input, autoSelect: true })
    if (draft.state === 'model-required') return draft
    return this.host.zerowallMediaJobs.submitRequested(scope, draft.id, draft.revision)
  }
  private async importBytes(sessionId: string, projectId: string, name: string, bytes: Uint8Array): Promise<MediaAsset> {
    if (bytes.byteLength > MAX) throw new Error('MEDIA_IMPORT_TOO_LARGE')
    const { id } = JSON.parse(await this.call(sessionId, 'import-start', JSON.stringify({ projectId, name })))
    for (let offset = 0; offset < bytes.byteLength; offset += 512 * 1024) {
      await this.call(sessionId, 'import-chunk', JSON.stringify({ projectId, id, offset, base64: Buffer.from(bytes.subarray(offset, offset + 512 * 1024)).toString('base64') }))
    }
    return JSON.parse(await this.call(sessionId, 'import-finish', JSON.stringify({ projectId, id })))
  }
  async importSource(sessionId: string, input: { projectId?: string; path?: string; attachmentId?: string }): Promise<MediaAsset> {
    const scope = await this.scope(sessionId, input.projectId ?? defaultMediaProjectId(sessionId), true)
    this.activeSessions.add(sessionId)
    if (input.path && input.attachmentId) throw new Error('MEDIA_IMPORT_ONE_SOURCE_REQUIRED')
    if (input.path) {
      if (!mediaMime(input.path)) throw new Error('MEDIA_IMPORT_FORMAT')
      const target = await mediaTarget(scope.cwd, input.path), info = await stat(target)
      if (!info.isFile() || info.size > MAX) throw new Error('MEDIA_IMPORT_TOO_LARGE')
      return this.importBytes(sessionId, scope.projectId, basename(target), await readFile(target))
    }
    if (!input.attachmentId) throw new Error('MEDIA_IMPORT_SOURCE_REQUIRED')
    const agent = await this.host.typert.lookups.get('agent')!.resolve(SessionId(sessionId)) as Agent
    const find = (value: any): any => {
      if (!value || typeof value !== 'object') return undefined
      if (value.attachmentId === input.attachmentId && typeof value.bytes === 'number') return value
      for (const child of Object.values(value)) { const ref = find(child); if (ref) return ref }
      return undefined
    }
    const ref = find(agent.session.snapshotEvents())
    if (!ref) throw new Error('MEDIA_ATTACHMENT_NOT_IN_SESSION')
    if (ref.bytes > MAX) throw new Error('MEDIA_IMPORT_TOO_LARGE')
    const store = this.host.get('attachments')
    if (!store) throw new Error('MEDIA_ATTACHMENT_STORE_UNAVAILABLE')
    if (ref.mediaType?.startsWith('image/')) {
      const stored = await store.readImage(ref)
      const extension = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' }[ref.mediaType as 'image/png'] ?? '.png'
      return this.importBytes(sessionId, scope.projectId, 'attachment' + extension, stored.data)
    }
    const name = basename(ref.name ?? '')
    if (!mediaMime(name)) throw new Error('MEDIA_IMPORT_FORMAT')
    const chunks: Uint8Array[] = []; let size = 0
    for await (const bytes of store.readFileStream(ref)) { size += bytes.byteLength; if (size > MAX) throw new Error('MEDIA_IMPORT_TOO_LARGE'); chunks.push(bytes) }
    return this.importBytes(sessionId, scope.projectId, name, Buffer.concat(chunks))
  }
  // Intentionally not a Remote method or a tool action.
  async authorizeReview(sessionId:string,reviews:Array<{id:string;revision:number;projectId:string}>):Promise<Array<{id:string;revision:number;authorization:string}>>{
    if(!Array.isArray(reviews)||!reviews.length||reviews.length>50||new Set(reviews.map(r=>r.id)).size!==reviews.length)throw new Error('MEDIA_REVIEW_INVALID')
    const authorized=[]
    for(const review of reviews){const scope=await this.scope(sessionId,review.projectId,true);await this.project(scope);authorized.push({id:review.id,revision:review.revision,authorization:await this.host.zerowallMediaJobs.authorize(scope,review.id,review.revision)})}
    return authorized
  }
  private lock<T>(fn:()=>Promise<T>) { const next=this.writes.then(fn,fn);this.writes=next.catch(()=>{});return next }
  async scope(sessionId: string, projectId: string = 'default', writing: boolean = false): Promise<MediaScope> {
    if (!PROJECT_ID.test(projectId)) throw new Error('MEDIA_PROJECT_ID_INVALID')
    const agent = await this.host.typert.lookups.get('agent')?.resolve(SessionId(sessionId)) as Agent | undefined
    if (!agent?.session.header.cwd || agent.session.header.parentSession || agent.session.header.origin === 'subagent') throw new Error('MEDIA_SESSION_UNAVAILABLE')
    const cwd = agent.session.header.cwd, fs = agent.ctx.get('fs'), policy = agent.ctx.get('sandboxPolicy')
    if (!fs || !policy || fs.processPathFromHostPath(cwd) !== cwd) throw new Error('MEDIA_LOCAL_WORKSPACE_REQUIRED')
    if (writing && policy.resolve({ session:agent.session }).mode === 'read-only') throw new Error('MEDIA_WORKSPACE_READ_ONLY')
    return { sessionId, cwd, projectId }
  }
  async authorizeAsset(sessionId: string, path: string): Promise<string> {
    const projectId=path.split('/')[1] ?? '',scope=await this.scope(sessionId,projectId)
    await this.project(scope)
    return mediaTarget(scope.cwd,path)
  }
  private async project(scope:MediaScope):Promise<MediaProject> {
    const file=await mediaTarget(scope.cwd,`media-projects/${scope.projectId}/project.json`)
    const project=JSON.parse(await readFile(file,'utf8')) as MediaProject
    if (project.schemaVersion!==1 || project.id!==scope.projectId || project.sessionId!==scope.sessionId) throw new Error('MEDIA_PROJECT_OWNER_MISMATCH')
    project.editRevision ??= project.revision
    return project
  }
  private async save(scope:MediaScope, value:MediaProject) {
    const target=await mediaTarget(scope.cwd,`media-projects/${scope.projectId}/project.json`,true),temp=target+'.'+randomUUID()+'.tmp'
    await writeFile(temp,JSON.stringify(value,null,2)+'\n',{flag:'wx'});await rename(temp,target)
  }
  private async prepare(scope:MediaScope,input:any):Promise<MediaJob> {
    validateMediaJobKind(input)
    this.activeSessions.add(scope.sessionId)
    await this.ensure(scope)
    const old = input.id ? (await this.host.zerowallMediaJobs.list(scope)).find(j => j.id === input.id) : undefined
    if (old) validateMediaJobKind(old)
    let selection:MediaSelection|undefined=input.selection
    if(input.selection===undefined&&!selection){selection=old?.selection;if(!input.parameters)input.parameters=old?.parameters}
    if (!selection && input.selection!==null) {
      const legacy=await this.host.zerowallEnvironment.readMediaModelSelections()
      if (!legacy.image) {
        const previous=await this.host.zerowallEnvironment.readImageModelSelection()
        const model=previous?(await this.host.zerowallMedia.catalog()).models.filter(m=>!m.stale&&m.groupId===previous.groupId&&m.modelId===previous.modelId&&(!previous.profileId||m.profileId===previous.profileId)):[]
        if(model.length===1)legacy.image={selection:{groupId:model[0]!.groupId,modelId:model[0]!.modelId,profileId:model[0]!.profileId,operation:model[0]!.operations.includes('gemini_image')?'gemini_image':'image'},parameters:{...(previous?.resolution?{resolution:previous.resolution}:{}),...(previous?.aspectRatio?{aspect_ratio:previous.aspectRatio}:{}),...(model[0]!.qualities.includes(this.host.zerowallEnvironment.getImageQuality())?{quality:this.host.zerowallEnvironment.getImageQuality()}:{})}}
      }
      selection=legacy?.[input.kind]?.selection
      if (selection && !input.parameters) input.parameters=legacy?.[input.kind]?.parameters
      if (!selection && input.autoSelect && !(input.kind === 'image' && await this.host.zerowallEnvironment.readImageModelSelection())) {
        const operations = input.kind === 'image' ? (input.reference_paths?.length || input.input_attachment_ids?.length ? ['image_edit', 'gemini_image'] : ['image', 'gemini_image']) : input.kind === 'video' ? ['video'] : ['chat_music']
        const model = (await this.host.zerowallMedia.catalog()).models.find(m => !m.stale && m.operations.some(op => operations.includes(op)))
        if (model) {
          selection = { groupId: model.groupId, modelId: model.modelId, profileId: model.profileId, operation: model.operations.find(op => operations.includes(op))! }
          const parameters = { ...(model.duration.required && model.duration.mode !== 'fixed' ? { duration: model.duration.default ?? model.duration.values?.[0] ?? model.duration.min ?? undefined } : {}), ...(input.parameters ?? {}) }
          input.parameters = parameters
          await this.host.zerowallEnvironment.setMediaModelSelections({ ...legacy, [input.kind]: { selection, parameters } })
        }
      }
    }
    if (selection) {
      const model = (await this.host.zerowallMedia.catalog()).models.find(m => !m.stale && m.groupId === selection!.groupId && m.modelId === selection!.modelId && m.profileId === selection!.profileId)
      if (model?.duration.required && model.duration.mode !== 'fixed' && input.parameters?.duration === undefined) {
        input.parameters = { ...(input.parameters ?? {}), duration: model.duration.default ?? model.duration.values?.[0] ?? model.duration.min }
      }
      if (input.kind === 'image') {
        const retained = old?.references.some(r => r.mask ? input.mask_path === undefined : input.reference_paths === undefined && input.input_attachment_ids === undefined)
        const editing = input.reference_paths?.length || input.input_attachment_ids?.length || input.mask_path || retained
        const operation = editing ? (model?.operations.includes('gemini_image') ? 'gemini_image' : 'image_edit') : (model?.operations.includes('gemini_image') ? 'gemini_image' : 'image')
        if (model?.operations.includes(operation)) selection = { ...selection, operation }
      }
    }
    const references=[]
    for(const path of input.reference_paths??[])references.push(await this.reference(scope,path))
    if(input.input_attachment_ids?.length){
      const agent=await this.host.typert.lookups.get('agent')!.resolve(SessionId(scope.sessionId)) as Agent
      const events=agent.session.snapshotEvents()
      for(const id of input.input_attachment_ids){
        const find=(value:any):any=>{if(!value||typeof value!=='object')return undefined;if(value.attachmentId===id&&typeof value.mediaType==='string'&&typeof value.bytes==='number')return value;for(const child of Object.values(value)){const ref=find(child);if(ref)return ref}return undefined}
        const ref=find(events);if(!ref)throw new Error('MEDIA_ATTACHMENT_NOT_IN_SESSION')
        const store=this.host.get('attachments') as any
        const stored=await store.readImage(ref),bytes=Buffer.from(stored.data)
        if(bytes.length>MAX)throw new Error('MEDIA_REFERENCE_TOO_LARGE')
        references.push({mediaType:ref.mediaType,base64:bytes.toString('base64'),name:ref.name??id})
      }
    }
    const mask=input.mask_path?await this.reference(scope,input.mask_path):undefined
    const draft:MediaDraft={kind:input.kind,prompt:input.prompt,...(selection?{selection}:{}),...(input.parameters?{parameters:input.parameters}:{}),...(references.length||input.reference_paths!==undefined||input.input_attachment_ids!==undefined?{references}:{}),...(mask?{mask}:input.mask_path===null?{mask:null}:{})}
    return this.host.zerowallMediaJobs.prepare(scope,draft,input.id)
  }
  private async reference(scope:MediaScope,path:string){
    if(!path.startsWith(`media-projects/${scope.projectId}/assets/`))throw new Error('MEDIA_REFERENCE_OUTSIDE_PROJECT')
    const type=mediaMime(path);if(!type?.startsWith('image/'))throw new Error('MEDIA_IMAGE_REFERENCE_REQUIRED')
    const target=await mediaTarget(scope.cwd,path),info=await stat(target)
    if(!info.isFile()||info.size>MAX)throw new Error('MEDIA_REFERENCE_TOO_LARGE')
    return {mediaType:type,base64:(await readFile(target)).toString('base64'),name:basename(path)}
  }
  private async ensure(scope:MediaScope):Promise<MediaProject>{
    return this.lock(async()=>{
      try{return await this.project(scope)}catch(e:any){if(e.code!=='ENOENT')throw e}
      const value:MediaProject={schemaVersion:1,id:scope.projectId,title:'多媒体项目',sessionId:scope.sessionId,revision:1,editRevision:1,brief:'',aspectRatio:'16:9',fps:30,shots:[],assets:[],outputs:[]}
      await this.save(scope,value);return value
    })
  }
  @Remote('call') async call(sessionId:string,action:string,payloadJson:string):Promise<string>{
    const input=JSON.parse(payloadJson||'{}')
    if(action==='prepare'||action==='generate')validateMediaJobKind(input)
    const scope=await this.scope(sessionId,input.projectId??'default',!['list','catalog','preflight','legacy','choices'].includes(action))
    if(action==='activate'){this.activeSessions.add(sessionId);return '{}'}
    if(action==='catalog'){
      const catalog=await this.host.zerowallMedia.catalog(input.refresh===true)
      return JSON.stringify({...catalog,models:catalog.models.filter(model=>model.operations.some(operation=>operation==='video'||operation==='chat_music'))})
    }
    if(action==='choices')return JSON.stringify(await this.host.zerowallEnvironment.readMediaModelSelections())
    if(action==='save-choices'){await this.host.zerowallEnvironment.setMediaModelSelections(input.choices);return '{}'}
    if(action==='list'){
      const entries=await readdir(resolve(scope.cwd,'media-projects'),{withFileTypes:true}).catch(e=>{if(e.code!=='ENOENT')throw e;return []})
      const projects=[]
      for(const entry of entries.filter(e=>e.isDirectory()&&PROJECT_ID.test(e.name)))try{projects.push(await this.project({...scope,projectId:entry.name}))}catch{}
      const jobs=await this.host.zerowallMediaJobs.list(scope).catch(e=>{if(e.message==='MEDIA_SIGN_IN_REQUIRED')return [];throw e})
      if(projects.length||jobs.length)this.activeSessions.add(sessionId)
      const compositions = (await Promise.all(projects.map(p=>this.compositions({...scope,projectId:p.id})))).flat()
      return JSON.stringify({projects,jobs,compositions})
    }
    if(action==='create'){this.activeSessions.add(sessionId);return JSON.stringify(await this.ensure(scope))}
    if(action==='prepare')return JSON.stringify(await this.prepare(scope,input))
    if(action==='generate')return JSON.stringify(await this.generate(sessionId,{...input,projectId:scope.projectId}))
    if(action==='submit'){
      const jobs=await this.host.zerowallMediaJobs.list(scope)
      for(const review of input.reviews??[]){const job=jobs.find(job=>job.id===review.id);if(job)validateMediaJobKind(job)}
      return JSON.stringify(await this.host.zerowallMediaJobs.submitReviewed(scope,input.reviews))
    }
    if(action==='refresh')return JSON.stringify(await this.host.zerowallMediaJobs.refresh(scope,input.id))
    if(action==='save')return this.lock(async()=>{
      const old=await this.project(scope),next=input.project as MediaProject
      if(next.editRevision!==undefined?next.editRevision!==old.editRevision:next.revision!==old.revision)throw new Error('MEDIA_PROJECT_STALE: 方案已被修改，请读取最新项目并合并本次修改后保存。')
      this.validateProject(next,scope);next.assets=old.assets;next.outputs=old.outputs;next.revision=old.revision+1;next.editRevision=old.editRevision!+1;await this.save(scope,next);return JSON.stringify(next)
    })
    if(action==='import-start'){
      if(typeof input.name!=='string'||basename(input.name)!==input.name||!mediaMime(input.name))throw new Error('MEDIA_IMPORT_FORMAT')
      await this.ensure(scope);const id=randomUUID(),path=await mediaTarget(scope.cwd,`media-projects/${scope.projectId}/assets/${id}.upload`,true)
      await writeFile(path,'',{flag:'wx'});this.uploads.set(id,{scope,path,name:input.name,bytes:0});return JSON.stringify({id})
    }
    if(action==='import-chunk')return this.lock(async()=>{
      const upload=this.uploads.get(input.id);if(!upload||upload.scope.sessionId!==sessionId||upload.scope.projectId!==scope.projectId)throw new Error('MEDIA_IMPORT_OWNER')
      if(!/^[A-Za-z0-9+/]+={0,2}$/.test(input.base64??'')||input.base64.length>1024*1024)throw new Error('MEDIA_IMPORT_CHUNK_INVALID')
      const bytes=Buffer.from(input.base64,'base64');if(upload.bytes+bytes.length>MAX)throw new Error('MEDIA_IMPORT_TOO_LARGE')
      if(input.offset!==upload.bytes)throw new Error('MEDIA_IMPORT_OFFSET')
      const file=await open(upload.path,'a');try{await file.write(bytes);upload.bytes+=bytes.length}finally{await file.close()};return JSON.stringify({bytes:upload.bytes})
    })
    if(action==='import-finish')return this.lock(async()=>{
      const upload=this.uploads.get(input.id);if(!upload||upload.scope.sessionId!==sessionId||upload.scope.projectId!==scope.projectId)throw new Error('MEDIA_IMPORT_OWNER')
      const path=`media-projects/${scope.projectId}/assets/${input.id}${extname(upload.name).toLowerCase()}`,target=await mediaTarget(scope.cwd,path,true)
      const bytes=await readFile(upload.path),type=mediaMime(upload.name)!
      const probe=await this.probe(upload.path)
      if(type.startsWith('image/')?!probe.streams?.some((s:any)=>s.codec_type==='video'):type.startsWith('audio/')?!probe.streams?.some((s:any)=>s.codec_type==='audio')||probe.streams?.some((s:any)=>s.codec_type==='video'&&!s.disposition?.attached_pic):!probe.streams?.some((s:any)=>s.codec_type==='video'))throw new Error('MEDIA_IMPORT_TYPE_MISMATCH')
      // A filename is only a hint. FFprobe establishes the container/codec;
      // never advertise renamed video bytes as an image or MP3 as M4A.
      const format=String(probe.format?.format_name??'').split(','),audioCodec=probe.streams?.find((s:any)=>s.codec_type==='audio')?.codec_name
      const valid=type==='image/png'?format.includes('png_pipe'):type==='image/jpeg'?format.includes('jpeg_pipe'):type==='image/webp'?format.includes('webp_pipe'):type==='audio/aac'?format.includes('aac'):type==='audio/mpeg'?format.includes('mp3'):type==='audio/wav'?format.includes('wav'):type==='audio/ogg'?format.includes('ogg'):type==='audio/flac'?format.includes('flac'):type==='audio/mp4'||type==='video/mp4'||type==='video/quicktime'?format.includes('mov'):type==='video/webm'?format.includes('webm'):false
      if(!valid||type==='audio/aac'&&audioCodec!=='aac')throw new Error('MEDIA_IMPORT_FORMAT_MISMATCH')
      await writeFile(target,bytes,{flag:'wx'});await unlink(upload.path);this.uploads.delete(input.id)
      const asset:MediaAsset={id:input.id,projectId:scope.projectId,sessionId:scope.sessionId,path,mediaType:type,bytes:bytes.length,sha256:hash(bytes),...(Number(probe.format?.duration)>0?{duration:Number(probe.format.duration)}:{})}
      const project=await this.project(scope);project.assets.push(asset);project.revision++;await this.save(scope,project);return JSON.stringify(asset)
    })
    if(action==='preflight')return JSON.stringify(await this.preflight())
    if(action==='compose')return JSON.stringify(await this.compose(scope,input.revision,input.editRevision,input.requestId))
    if(action==='legacy-recover'){
      const tasks=await this.host.zerowallMedia.list(),previous=tasks.find(t=>t.requestId===input.requestId)
      if(!previous)throw new Error('MEDIA_LEGACY_TASK_NOT_FOUND')
      const task=await this.host.zerowallMedia.query(previous.requestId),assets:MediaAsset[]=[]
      if(['completed','succeeded'].includes(task.status))for(const artifact of task.artifacts){
        const data=await this.host.zerowallMedia.download(task.requestId,artifact.key)
        const ext:Record<string,string>={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','video/mp4':'mp4','audio/mp4':'m4a','audio/aac':'aac','audio/mpeg':'mp3','audio/wav':'wav','audio/ogg':'ogg'}
        if(!ext[data.mediaType])throw new Error('MEDIA_FORMAT_INVALID')
        if(!/^[\w-]+$/.test(artifact.key))throw new Error('MEDIA_ARTIFACT_INVALID')
        const path=`media-projects/${scope.projectId}/assets/legacy-${hash(Buffer.from(task.requestId)).slice(0,24)}-${artifact.key}.${ext[data.mediaType]}`,target=await mediaTarget(scope.cwd,path,true)
        try{await writeFile(target,data.bytes,{flag:'wx'})}catch(e:any){if(e.code!=='EEXIST'||hash(await readFile(target))!==data.sha256)throw e}
        assets.push({id:artifact.key,projectId:scope.projectId,sessionId:scope.sessionId,path,mediaType:data.mediaType,bytes:data.bytes.length,sha256:data.sha256,...((data.duration??artifact.duration)?{duration:data.duration??artifact.duration}:{})})
      }
      if(assets.length){await this.ensure(scope);await this.lock(async()=>{const project=await this.project(scope);for(const asset of assets)if(!project.assets.some(a=>a.path===asset.path))project.assets.push(asset);project.revision++;await this.save(scope,project)})}
      return JSON.stringify({task,assets})
    }
    if(action==='legacy')return JSON.stringify(await this.host.zerowallMedia.list())
    throw new Error('MEDIA_ACTION_INVALID')
  }
  private validateProject(value:MediaProject,scope:MediaScope){
    if(value.id!==scope.projectId||value.sessionId!==scope.sessionId||value.schemaVersion!==1||!['16:9','9:16','1:1'].includes(value.aspectRatio)||value.fps!==30||!Array.isArray(value.shots)||value.shots.length>100)throw new Error('MEDIA_PROJECT_INVALID')
    const asset=(path:unknown)=>typeof path==='string'&&new RegExp(`^media-projects/${scope.projectId}/assets/[A-Za-z0-9_.-]+$`).test(path)
    const numeric=(n:unknown,lo:number,hi:number)=>typeof n==='number'&&Number.isFinite(n)&&n>=lo&&n<=hi
    if(new Set(value.shots.map(s=>s.id)).size!==value.shots.length)throw new Error('MEDIA_SHOT_DUPLICATE')
    for(const shot of value.shots)if(!PROJECT_ID.test(shot.id)||!numeric(shot.duration,0.1,600)||!asset(shot.asset)||(shot.trimStart!==undefined&&!numeric(shot.trimStart,0,86400))||(shot.motion!==undefined&&!['none','zoom-in','zoom-out'].includes(shot.motion))||(shot.caption!==undefined&&(typeof shot.caption!=='string'||shot.caption.length>2000)))throw new Error('MEDIA_SHOT_INVALID')
    if(value.music&&(!asset(value.music.path)||!numeric(value.music.volume,0,4)||!numeric(value.music.fadeIn,0,600)||!numeric(value.music.fadeOut,0,600)))throw new Error('MEDIA_MUSIC_INVALID')
    if(value.voiceover&&(!asset(value.voiceover.path)||!numeric(value.voiceover.volume,0,4)))throw new Error('MEDIA_VOICEOVER_INVALID')
  }
  private async probe(path:string){const text=await commandOutput('ffprobe',['-v','error','-show_streams','-show_format','-of','json',path]);if(!text)throw new Error('MEDIA_FILE_INVALID_OR_FFPROBE_MISSING');return JSON.parse(text)}
  private async preflight(){
    const runtime=await this.host.zerowallPython.resolve().catch(()=>undefined)
    const [filters,encoders,probe]=await Promise.all([commandOutput('ffmpeg',['-hide_banner','-filters']),commandOutput('ffmpeg',['-hide_banner','-encoders']),commandOutput('ffprobe',['-version'])])
    const missing=[...(!runtime?['固定 Python']:[]),...(!filters?['FFmpeg']:[]),...(!probe?['FFprobe']:[]),...(!/\bsubtitles\b/.test(filters??'')?['字幕滤镜 libass']:[]),...(!/\blibx264\b/.test(encoders??'')?['H.264 编码器']:[]),...(!/\baac\b/.test(encoders??'')?['AAC 编码器']:[])]
    return {ok:missing.length===0,missing}
  }
  private async compositionFile(scope:MediaScope,id:string) {
    if(!PROJECT_ID.test(id))throw new Error('MEDIA_RENDER_ID_INVALID')
    return mediaTarget(scope.cwd,`media-projects/${scope.projectId}/renders/${id}.job.json`,true)
  }
  private async recordComposition(scope:MediaScope,job:CompositionJob) {
    const target=await this.compositionFile(scope,job.id),temp=target+'.'+randomUUID()+'.tmp'
    await writeFile(temp,JSON.stringify(job),{flag:'wx'});await rename(temp,target)
  }
  private async compositions(scope:MediaScope):Promise<CompositionJob[]> {
    const directory=await mediaTarget(scope.cwd,`media-projects/${scope.projectId}/renders`)
    const files=await readdir(directory).catch(e=>{if(e.code!=='ENOENT')throw e;return []})
    const jobs:CompositionJob[]=[]
    for(const name of files.filter(n=>/^[A-Za-z0-9_-]+\.job\.json$/.test(n))){
      const file=await mediaTarget(scope.cwd,`media-projects/${scope.projectId}/renders/${name}`)
      const job=JSON.parse(await readFile(file,'utf8')) as CompositionJob
      if(job.projectId!==scope.projectId||job.sessionId!==scope.sessionId)throw new Error('MEDIA_RENDER_OWNER_MISMATCH')
      if(job.state==='running'&&!this.activeRenders.has(job.id)){job.state='unknown';job.error='合成曾被中断，请检查已有输出后重新合成。'}
      jobs.push(job)
    }
    return jobs.sort((a,b)=>b.createdAt.localeCompare(a.createdAt))
  }
  private async compose(scope:MediaScope,revision:number,editRevision?:number,requestId?:string):Promise<MediaAsset>{
    const renderId=requestId?'render-'+hash(Buffer.from(scope.sessionId+':'+scope.projectId+':'+requestId)).slice(0,40):randomUUID()
    const running=this.activeRenders.get(renderId);if(running)return running
    const operation=this.composeOnce(scope,revision,editRevision,renderId)
    this.activeRenders.set(renderId,operation)
    try{return await operation}finally{this.activeRenders.delete(renderId)}
  }
  private async composeOnce(scope:MediaScope,revision:number,editRevision:number|undefined,renderId:string):Promise<MediaAsset>{
    const previous=await this.compositions(scope).then(jobs=>jobs.find(j=>j.id===renderId))
    if(previous){if(previous.state==='completed'&&previous.assets[0])return previous.assets[0];throw new Error('MEDIA_RENDER_ALREADY_REQUESTED: 请查看原合成任务；重新合成请发起新的请求。')}
    const project=await this.lock(()=>this.project(scope));if(editRevision!==undefined?project.editRevision!==editRevision:project.revision!==revision)throw new Error('MEDIA_PROJECT_STALE: 合成前请读取最新项目，使用当前方案版本。');this.validateProject(project,scope)
    const now=new Date().toISOString(),job:CompositionJob={id:renderId,projectId:scope.projectId,sessionId:scope.sessionId,title:project.title,state:'running',editRevision:project.editRevision!,createdAt:now,updatedAt:now,assets:[]}
    await this.recordComposition(scope,job)
    try {
      const asset=await this.renderProject(scope,project,renderId)
      job.state='completed';job.assets=[asset];job.updatedAt=new Date().toISOString();await this.recordComposition(scope,job)
      return asset
    } catch(error) {
      job.state='failed';job.error=error instanceof Error?error.message:'合成失败';job.updatedAt=new Date().toISOString();await this.recordComposition(scope,job);throw error
    }
  }
  private async renderProject(scope:MediaScope,project:MediaProject,renderId:string){
    const preflight=await this.preflight();if(!preflight.ok)throw new Error('缺少依赖：'+preflight.missing.join('、'))
    for(const path of [...project.shots.map(s=>s.asset),...(project.music?[project.music.path]:[]),...(project.voiceover?[project.voiceover.path]:[])])await mediaTarget(scope.cwd,path)
    const specPath=`media-projects/${scope.projectId}/renders/${renderId}.json`,target=await mediaTarget(scope.cwd,specPath,true)
    await mediaTarget(scope.cwd,`media-projects/${scope.projectId}/outputs/${renderId}.mp4`,true)
    await writeFile(target,JSON.stringify(project),{flag:'wx'})
    const script=fileURLToPath(new URL('./media-create/compose.py',import.meta.url))
    const code=`import runpy, sys\nsys.argv = [${JSON.stringify(script)}, ${JSON.stringify(scope.cwd)}, ${JSON.stringify(target)}, ${JSON.stringify(renderId)}]\nrunpy.run_path(${JSON.stringify(script)}, run_name='__main__')`
    const result=await this.host.zerowallPython.run({code,description:'合成宣传片',timeoutMs:600000},{signal:new AbortController().signal,agent:{session:{header:{cwd:scope.cwd}}}})
    if(result.exitCode!==0||result.timedOut)throw new Error('MEDIA_COMPOSE_FAILED: '+result.stderr.slice(-1500))
    const asset=JSON.parse(result.stdout.trim().split('\n').at(-1)!) as MediaAsset
    asset.projectId=scope.projectId;asset.sessionId=scope.sessionId
    await this.lock(async()=>{const current=await this.project(scope);current.outputs.push(asset);current.revision++;await this.save(scope,current)})
    return asset
  }
}
