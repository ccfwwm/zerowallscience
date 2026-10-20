import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, writeFile, lstat, realpath, unlink } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { homedir } from 'node:os'
import { setTimeout as delay } from 'node:timers/promises'
import { artifactFormat } from './artifact-format.js'
import { referenceBytes, referenceValue, referenceSignature, normalizeMediaReferences, validateFrameReferences } from './media-reference.js'
import { mediaAbortable } from './media-abort.js'
import { mediaRetryAfter, retryableMediaError } from './media-retry.js'
import type { MediaDraft, MediaJob, MediaReview, MediaScope, MediaRequest, ZeroWallMedia, ZeroWallMediaJobs } from '../shared/media.js'

const digest = (value: unknown) => createHash('sha256').update(typeof value === 'string' || value instanceof Uint8Array ? value : JSON.stringify(value)).digest('hex')
const extensions: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/webm': 'webm', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/ogg': 'ogg', 'audio/flac': 'flac' }
interface Stored { scope: MediaScope; owner: string; draft: MediaDraft; job: MediaJob; submitted: boolean; authorizationHash?: string; authorizationExpires?: number }
export const MEDIA_COLLECTION_MAX_BACKOFF_MS = 30_000
export const MEDIA_COLLECTION_POLL_MS = 5_000
const TERMINAL_STATES = ['failed', 'rejected', 'cancelled', 'manual_review', 'submission-uncertain']
interface CollectionRuntime { now?: () => number; sleep?: (ms: number, signal: AbortSignal) => Promise<void>; autoCollect?: boolean }
export async function mediaTarget(cwd: string, path: string, create = false): Promise<string> {
  const root = await realpath(cwd), target = resolve(root, path), sub = relative(root, target)
  if (!sub || sub === '..' || sub.startsWith('../') || sub.startsWith('..\\') || isAbsolute(sub)) throw new Error('MEDIA_PATH_OUTSIDE_WORKSPACE')
  let current = root
  const segments = sub.split(/[\\/]/)
  for (const [i, part] of segments.entries()) {
    current = join(current, part)
    let info = await lstat(current).catch(e => { if (e.code !== 'ENOENT') throw e; return undefined })
    if (info?.isSymbolicLink()) throw new Error('MEDIA_SYMLINK_REJECTED')
    if (i < segments.length - 1) {
      if (!info && create) { await mkdir(current); info = await lstat(current) }
      if (info && !info.isDirectory()) throw new Error('MEDIA_PARENT_INVALID')
    }
  }
  return target
}

/** Host-only ledger. Native authenticated Remote is the sole submitReviewed caller. */
export class MediaJobLedger implements ZeroWallMediaJobs {
  private serial: Promise<unknown> = Promise.resolve()
  private mutations = new Map<string, Promise<unknown>>()
  private running = new Set<string>()
  private collections = new Map<string, { controller: AbortController; promise: Promise<MediaJob> }>()
  private disposed = false
  constructor(private media: ZeroWallMedia, private owner: () => Promise<string>, private root = join(process.env.DSH_HOME || join(homedir(), '.zerowall'), 'media-jobs'), private runtime: CollectionRuntime = {}) {}
  private now() { return this.runtime.now?.() ?? Date.now() }
  suspend() { for (const active of this.collections.values()) active.controller.abort(); this.collections.clear() }
  async dispose() { this.disposed = true; this.suspend(); await this.serial }
  /** Restore only eligible account-owned work; persisted manual stops remain authoritative. */
  async resumePending(): Promise<void> {
    if (this.disposed) return
    const owner = await this.owner(), names = await readdir(this.root).catch(error => { if (error.code !== 'ENOENT') throw error; return [] })
    for (const name of names.filter(name => name.endsWith('.json'))) {
      if (this.disposed) return
      const value = await this.read(name.slice(0, -5))
      if (value.owner !== owner || !value.submitted || ['paused', 'failed', 'ready'].includes(value.job.collection ?? '') || TERMINAL_STATES.includes(value.job.state)) continue
      await this.refresh(value.scope, value.job.id, { background: true, automatic: true })
    }
  }
  private lock<T>(fn: () => Promise<T>): Promise<T> { const next = this.serial.then(fn, fn); this.serial = next.catch(() => {}); return next }
  private mutate<T>(ids: string[], fn: () => Promise<T>): Promise<T> {
    const keys = [...new Set(ids)].sort()
    const enter = (index: number): Promise<T> => {
      const key = keys[index]; if (key === undefined) return fn()
      const prior = this.mutations.get(key) ?? Promise.resolve(), next = prior.then(() => enter(index + 1), () => enter(index + 1))
      const settled = next.catch(() => {}); this.mutations.set(key, settled)
      void settled.finally(() => { if (this.mutations.get(key) === settled) this.mutations.delete(key) })
      return next
    }
    return enter(0)
  }
  private path(id: string) { if (!/^[a-zA-Z0-9_-]{8,128}$/.test(id)) throw new Error('MEDIA_JOB_ID_INVALID'); return join(this.root, id + '.json') }
  private async read(id: string): Promise<Stored> { return JSON.parse(await readFile(this.path(id), 'utf8')) }
  private async save(value: Stored) {
    await mkdir(this.root, { recursive: true }); const target = this.path(value.job.id), temp = target + '.' + randomUUID() + '.tmp'
    await writeFile(temp, JSON.stringify(value), { mode: 0o600, flag: 'wx' })
    try {
      for (let attempt = 0; ; attempt++) {
        try { await rename(temp, target); break } catch (error: any) {
          // Windows scanners/readers can briefly hold the destination. Retry
          // the same atomic rename; never delete or truncate the old journal.
          if (process.platform !== 'win32' || attempt >= 7 || !['EPERM', 'EBUSY', 'EACCES'].includes(error.code)) throw error
          await delay(Math.min(100, 10 * 2 ** attempt))
        }
      }
    } finally { await unlink(temp).catch(error => { if (error.code !== 'ENOENT') throw error }) }
  }
  private async check(value: Stored, scope: Pick<MediaScope, 'sessionId' | 'cwd'>) {
    if (value.scope.sessionId !== scope.sessionId || resolve(value.scope.cwd) !== resolve(scope.cwd) || value.owner !== await this.owner()) throw new Error('MEDIA_JOB_OWNER_MISMATCH')
  }
  async prepare(scope: MediaScope, draft: MediaDraft, id = randomUUID()): Promise<MediaJob> {
    return this.mutate([id], async () => {
      if (!/^[a-zA-Z0-9_-]{1,80}$/.test(scope.projectId) || !scope.sessionId || !['image', 'video', 'music'].includes(draft.kind) || !draft.prompt?.trim()) throw new Error('MEDIA_DRAFT_INVALID')
      await mediaTarget(scope.cwd, `media-projects/${scope.projectId}/project.json`)
      if (draft.kind === 'video') draft = normalizeMediaReferences(draft)
      for (const ref of [...(draft.references ?? []), ...(draft.mask ? [draft.mask] : [])]) referenceBytes(ref)
      validateFrameReferences(draft.references ?? [])
      if ((draft.references?.length ?? 0) > 16) throw new Error('MEDIA_REFERENCE_LIMIT')
      const owner = await this.owner()
      const old = await this.read(id).catch(e => { if (e.code !== 'ENOENT') throw e; return undefined })
      if (old) { await this.check(old, scope); if (old.submitted && old.job.state !== 'rejected') throw new Error('MEDIA_JOB_ALREADY_SUBMITTED'); if (old.scope.projectId !== scope.projectId) throw new Error('MEDIA_JOB_OWNER_MISMATCH') }
      if (old?.draft.references?.length && draft.references !== undefined && referenceSignature(draft.references) !== referenceSignature(old.draft.references) && !draft.clearReferences && !draft.references.length) throw new Error('MEDIA_REFERENCES_CLEAR_REQUIRED: 请使用明确清除参考操作。')
      if (old?.draft.references?.length && draft.references && !draft.clearReferences && !draft.replaceReferences) for (const kind of ['image','video','audio']) { if (draft.references.filter(ref=>ref.mediaType.startsWith(kind+'/')).length < old.draft.references.filter(ref=>ref.mediaType.startsWith(kind+'/')).length) throw new Error('MEDIA_REFERENCE_INTENT_MISMATCH: ' + kind) }
      delete draft.replaceReferences
      if (draft.clearReferences) { draft.references = []; delete draft.clearReferences }
      if (old && draft.references === undefined && old.draft.references) draft.references = old.draft.references
      if (old && draft.mask === undefined && old.draft.mask) draft.mask = old.draft.mask
      if (draft.selection) {
        const allowed = draft.kind === 'image' ? ['image', 'image_edit', 'gemini_image'] : draft.kind === 'video' ? ['video'] : ['chat_music']
        if (!allowed.includes(draft.selection.operation)) throw new Error('MEDIA_OPERATION_KIND_MISMATCH')
      }
      const correctedFrom = old?.submitted ? old.job.id : undefined
      if (correctedFrom) id = randomUUID()
      const now = new Date().toISOString(), revision = (old?.job.revision ?? 0) + 1
      const frozen: MediaDraft = structuredClone(draft), requestId = 'media-' + digest({ scope, id, revision, draft })
      const job: MediaJob = { id, sessionId: scope.sessionId, projectId: scope.projectId, revision, kind: draft.kind, prompt: draft.prompt, ...(draft.selection ? { selection: draft.selection } : {}), parameters: draft.parameters ?? {}, references: [...(draft.references ?? []), ...(draft.mask ? [draft.mask] : [])].map(ref => ({ name: ref.name ?? '参考素材', mediaType: ref.mediaType, bytes: ref.url !== undefined ? 0 : Buffer.byteLength(ref.base64!, 'base64'), sha256: digest(ref.url !== undefined ? referenceValue(ref) : Buffer.from(ref.base64!, 'base64')), source: ref.url !== undefined ? 'url' as const : 'base64' as const, ...(ref.role ? { role: ref.role } : {}), ...(ref === draft.mask ? { mask: true } : {}) })), ...(correctedFrom ? { correctedFrom } : {}), state: draft.selection ? 'validation-failed' : 'model-required', requestId, assets: [], createdAt: old?.job.createdAt ?? now, updatedAt: now }
      const stored: Stored = { scope, owner, draft: frozen, job, submitted: false }
      await this.lock(() => this.save(stored))
      if (draft.selection) {
        try {
          if (this.media.preview) job.diagnostics = await this.media.preview(this.request(stored))
          const estimate = await this.media.estimate(this.request(stored))
          if (!estimate.currency || !Number.isFinite(Number(estimate.maximumCharge ?? estimate.total)) || Number(estimate.maximumCharge ?? estimate.total) < 0) throw new Error('MEDIA_ESTIMATE_UNAVAILABLE')
          if (owner !== await this.owner()) throw new Error('MEDIA_ACCOUNT_CHANGED')
          job.estimate = estimate; job.state = 'prepared'
        } catch (error) {
          if (owner !== await this.owner()) throw new Error('MEDIA_ACCOUNT_CHANGED')
          job.error = error instanceof Error ? error.message : 'MEDIA_ESTIMATE_FAILED'
        }
        await this.lock(() => this.save(stored))
      }
      return structuredClone(job)
    })
  }
  async references(scope: MediaScope, id: string) {
    const value = await this.read(id); await this.check(value, scope)
    if (value.scope.projectId !== scope.projectId) throw new Error('MEDIA_JOB_OWNER_MISMATCH')
    return structuredClone(value.draft.references ?? [])
  }
  async list(scope: Pick<MediaScope, 'sessionId' | 'cwd'>): Promise<MediaJob[]> {
    const owner = await this.owner(), names = await readdir(this.root).catch(e => { if (e.code !== 'ENOENT') throw e; return [] })
    const results: MediaJob[] = []
    for (const name of names.filter(n => n.endsWith('.json'))) {
      const value = await this.read(name.slice(0, -5))
      if (value.scope.sessionId === scope.sessionId && resolve(value.scope.cwd) === resolve(scope.cwd) && value.owner === owner) results.push(value.job)
    }
    return results.sort((a,b) => a.createdAt.localeCompare(b.createdAt))
  }
  async recover(scope: MediaScope, requestId: string): Promise<MediaJob> {
    if (!/^[a-zA-Z0-9_-]{8,128}$/.test(requestId) || !/^[a-zA-Z0-9_-]{1,80}$/.test(scope.projectId) || !scope.sessionId) throw new Error('MEDIA_LEGACY_TASK_NOT_FOUND')
    await mediaTarget(scope.cwd, `media-projects/${scope.projectId}/project.json`)
    const owner = await this.owner()
    // Only the Host's credential-bound history is authoritative. No task URL,
    // model selection, paid submit body or owner is accepted from the caller.
    const tasks = await mediaAbortable(this.media.list(), AbortSignal.timeout(30_000))
    const task = tasks.find(task => task.requestId === requestId)
    if (!task) throw new Error('MEDIA_LEGACY_TASK_NOT_FOUND')
    if (owner !== await this.owner()) throw new Error('MEDIA_ACCOUNT_CHANGED')
    const id = 'recovered-' + digest({ owner, scope, requestId })
    const job = await this.mutate([id], async () => {
      const existing = (await this.list(scope)).find(job => job.requestId === requestId)
      if (existing) return existing
      if (owner !== await this.owner()) throw new Error('MEDIA_ACCOUNT_CHANGED')
      const now = new Date().toISOString(), kind = task.selection.operation === 'video' ? 'video' : task.selection.operation === 'chat_music' ? 'music' : 'image'
      const draft: MediaDraft = { kind, prompt: kind === 'video' ? '恢复历史视频任务' : kind === 'music' ? '恢复历史音乐任务' : '恢复历史图片任务', selection: structuredClone(task.selection), parameters: {} }
      const job: MediaJob = { id, sessionId: scope.sessionId, projectId: scope.projectId, revision: 1, kind, prompt: draft.prompt, selection: structuredClone(task.selection), parameters: {}, references: [], state: task.status, requestId: task.requestId, ...(task.taskId ? { taskId: task.taskId } : {}), assets: [], createdAt: now, updatedAt: now }
      // Freeze as already submitted before exposing it to any UI or tool. Even
      // prepare/generate on the recovered identity cannot dispatch another POST.
      await this.lock(() => this.save({ scope, owner, draft, job, submitted: true }))
      return structuredClone(job)
    })
    return this.refresh({ ...scope, projectId: job.projectId }, job.id, { background: true })
  }
  /** Host-only: the authenticated review route issues this token, never a model tool. */
  async authorize(scope: Pick<MediaScope, 'sessionId' | 'cwd'>, id: string, revision: number): Promise<string> {
    return this.mutate([id], async () => {
      const value = await this.read(id); await this.check(value, scope)
      if (value.submitted || value.job.revision !== revision || !value.job.estimate || !value.draft.selection) throw new Error('MEDIA_REVIEW_STALE')
      const token = randomUUID() + randomUUID()
      value.authorizationHash = digest(token); value.authorizationExpires = Date.now() + 300_000
      await this.lock(() => this.save(value)); return token
    })
  }
  async submitReviewed(scope: Pick<MediaScope, 'sessionId' | 'cwd'>, reviews: MediaReview[]): Promise<MediaJob[]> {
    return this.mutate(reviews.map(review => review.id), async () => {
      if (!reviews.length || reviews.length > 50 || new Set(reviews.map(r => r.id)).size !== reviews.length) throw new Error('MEDIA_REVIEW_INVALID')
      const values: Stored[] = []
      for (const review of reviews) {
        const value = await this.read(review.id); await this.check(value, scope)
        if (value.job.revision !== review.revision) throw new Error('MEDIA_REVIEW_STALE')
        if (!review.authorization || value.authorizationHash !== digest(review.authorization) || (!value.submitted && (value.authorizationExpires ?? 0) < Date.now())) throw new Error('MEDIA_AUTHORIZATION_REQUIRED')
        if (!value.submitted) {
          if (!value.draft.selection || !value.job.estimate) throw new Error('MEDIA_SELECT_MODEL_FIRST')
          const estimate = await this.media.estimate(this.request(value))
          if (JSON.stringify(estimate) !== JSON.stringify(value.job.estimate)) {
            value.job.estimate = estimate; value.job.revision++; value.job.updatedAt = new Date().toISOString(); await this.lock(() => this.save(value)); throw new Error('MEDIA_COST_CHANGED: 请重新查看费用并确认。')
          }
        }
        values.push(value)
      }
      // Freeze complete batch before any POST. Repeated clicks never dispatch again.
      const fresh = values.filter(v => !v.submitted)
      for (const value of fresh) { value.submitted = true; value.job.state = 'submitting'; await this.lock(() => this.save(value)) }
      for (const value of fresh) this.start(value)
      return values.map(v => structuredClone(v.job))
    })
  }
  private request(value: Stored): MediaRequest {
    if (!value.draft.selection) throw new Error('MEDIA_SELECT_MODEL_FIRST')
    return { ...value.draft.selection, requestId: value.job.requestId, prompt: value.draft.prompt, parameters: value.draft.parameters ?? {}, ...(value.draft.references ? { references: value.draft.references } : {}), ...(value.draft.mask ? { mask: value.draft.mask } : {}), async: true }
  }
  async submitRequested(scope: Pick<MediaScope, 'sessionId' | 'cwd'>, id: string, revision: number): Promise<MediaJob> {
    return this.mutate([id], async () => {
      const value = await this.read(id); await this.check(value, scope)
      if (value.job.revision !== revision) throw new Error('MEDIA_REQUEST_STALE')
      if (value.submitted) return structuredClone(value.job)
      if (!value.draft.selection) throw new Error('MEDIA_SELECT_MODEL_FIRST')
      value.job.estimate = await this.media.estimate(this.request(value))
      const estimate = value.job.estimate
      if (!estimate.currency || !Number.isFinite(Number(estimate.maximumCharge ?? estimate.total)) || Number(estimate.maximumCharge ?? estimate.total) < 0) throw new Error('MEDIA_ESTIMATE_UNAVAILABLE')
      await this.check(value, scope)
      value.submitted = true; value.job.state = 'submitting'; value.job.updatedAt = new Date().toISOString()
      await this.lock(() => this.save(value)); this.start(value)
      return structuredClone(value.job)
    })
  }
  private start(value: Stored) {
    this.running.add(value.job.id)
    void (async () => {
      try {
        if (value.owner !== await this.owner()) throw new Error('MEDIA_JOB_OWNER_MISMATCH')
        const task = await this.media.submit(this.request(value))
        if (this.disposed) return
        const latest = await this.read(value.job.id); await this.check(latest, value.scope)
        value = latest; value.job.state = task.status; if (task.diagnostics) value.job.diagnostics = task.diagnostics; if (task.error) value.job.error = task.error; else if (task.status === 'rejected') value.job.error = '服务端明确拒绝请求，请核对诊断信息并修正后重试。'; if (task.taskId) value.job.taskId = task.taskId
      } catch (error) {
        if (this.disposed) return
        value = await this.read(value.job.id)
        const rejected = (error as any)?.rejected === true
        value.job.state = rejected ? 'rejected' : 'submission-uncertain'
        value.job.error = rejected ? (error instanceof Error && error.message.startsWith('MEDIA_REFERENCE_URL_REQUIRED') ? '服务端明确拒绝了参考素材格式；请提供对应素材的公网 HTTPS 直链，修正后提交新请求。' : (error instanceof Error ? error.message : 'MEDIA_REQUEST_REJECTED')) : '提交状态待核查；请恢复原任务，不要重新生成。'
      }
      value.job.updatedAt = new Date().toISOString(); await this.lock(async () => { if (!this.disposed) await this.save(value) })
    })().catch(() => {}).finally(() => {
      this.running.delete(value.job.id)
      if (!this.disposed && this.runtime.autoCollect !== false) void this.refresh(value.scope, value.job.id, { background: true, automatic: true }).catch(() => {})
    })
  }
  async refresh(scope: MediaScope, id: string, options: { background?: boolean; signal?: AbortSignal; automatic?: boolean } = {}): Promise<MediaJob> {
    if (this.disposed) throw new Error('MEDIA_COLLECTOR_DISPOSED')
    options.signal?.throwIfAborted()
    // Serialize only transfer setup with pause, never the network promise.
    // Automatic callers may have a stale UI snapshot; the current journal is
    // authoritative and only an explicit retry can clear paused/failed state.
    const transfer = await this.mutate([id], async () => {
      options.signal?.throwIfAborted()
      if (this.disposed) throw new Error('MEDIA_COLLECTOR_DISPOSED')
      const value = await this.read(id); await this.check(value, scope)
      if (this.disposed) throw new Error('MEDIA_COLLECTOR_DISPOSED')
      if (scope.projectId !== value.scope.projectId) throw new Error('MEDIA_JOB_OWNER_MISMATCH')
      if (!value.submitted || this.running.has(id) || options.automatic && (['paused', 'failed', 'ready'].includes(value.job.collection ?? '') || TERMINAL_STATES.includes(value.job.state))) return { job: structuredClone(value.job) }
      let active = this.collections.get(id)
      if (!active) {
        if (!options.automatic && ['paused', 'failed', 'ready'].includes(value.job.collection ?? '')) delete value.job.collectionRetry
        const controller = new AbortController()
        // The journal lock protects small writes only. A slow gateway must never
        // hold other jobs, new conversations, or cancellation behind its network IO.
        const promise = this.refreshOnce(value, scope, controller.signal)
        active = { controller, promise }; this.collections.set(id, active)
        void promise.catch(() => {}).finally(() => { if (this.collections.get(id)?.promise === promise) this.collections.delete(id) })
      }
      const job: MediaJob = { ...value.job, collection: value.job.collection === 'waiting' || value.job.collection === 'downloading' ? value.job.collection : 'querying' }
      return { job: structuredClone(job), active }
    })
    const active = transfer.active
    if (!active || options.background) return transfer.job
    const abort = () => active.controller.abort(options.signal?.reason)
    options.signal?.addEventListener('abort', abort, { once: true })
    if (options.signal?.aborted) abort()
    try { return await active.promise } finally { options.signal?.removeEventListener('abort', abort) }
  }
  async pause(scope: MediaScope, id: string): Promise<MediaJob> {
    return this.mutate([id], async () => {
      const value = await this.read(id); await this.check(value, scope)
      if (scope.projectId !== value.scope.projectId) throw new Error('MEDIA_JOB_OWNER_MISMATCH')
      this.collections.get(id)?.controller.abort()
      this.collections.delete(id)
      return this.lock(async()=>{
        const latest=await this.read(id);await this.check(latest,scope)
        latest.job.collection = 'paused'; latest.job.error = '已停止本地查询和下载；上游任务未取消，可恢复原任务。'
        latest.job.updatedAt = new Date().toISOString()
        await this.save(latest);return structuredClone(latest.job)
      })
    })
  }
  private async refreshOnce(value: Stored, scope: MediaScope, signal: AbortSignal): Promise<MediaJob> {
    const id = value.job.id
    const persist = async () => { signal.throwIfAborted(); if (this.disposed) throw new DOMException('Aborted', 'AbortError'); await this.check(value, scope); await this.lock(async () => { signal.throwIfAborted(); if (this.disposed) throw new DOMException('Aborted', 'AbortError'); await this.save(value) }) }
    try {
      value.job.collectionRetry ??= { attempts: 0, startedAt: this.now(), nextAttemptAt: this.now() }
      const retry = value.job.collectionRetry
      if (![retry.attempts, retry.startedAt, retry.nextAttemptAt].every(Number.isSafeInteger)
        || retry.attempts < 0) throw new Error('MEDIA_COLLECTION_RETRY_INVALID')
      // Older releases stored a five-minute deadline. Long provider jobs must
      // continue the original identity even when that obsolete field expired.
      delete retry.deadlineAt
      delete value.job.error
      for (;;) {
        signal.throwIfAborted()
        const waitMs = Math.min(Math.max(0, retry.nextAttemptAt - this.now()), MEDIA_COLLECTION_MAX_BACKOFF_MS)
        if (waitMs > 0) {
          value.job.collection = 'waiting'; value.job.updatedAt = new Date(this.now()).toISOString(); await persist()
          await mediaAbortable(this.runtime.sleep ? this.runtime.sleep(waitMs, signal) : delay(waitMs, undefined, { signal }), signal)
          if (this.now() < retry.nextAttemptAt) continue
        }
        retry.attempts = Math.min(Number.MAX_SAFE_INTEGER, retry.attempts + 1); value.job.collection = 'querying'; value.job.updatedAt = new Date(this.now()).toISOString(); await persist()
        try {
          const querySignal = AbortSignal.any([signal, AbortSignal.timeout(30_000)])
          const task = await mediaAbortable(this.media.query(value.job.requestId, querySignal), querySignal); signal.throwIfAborted(); if (task.diagnostics) value.job.diagnostics = task.diagnostics
          if (task.requestId !== value.job.requestId || value.job.taskId && task.taskId !== value.job.taskId) throw new Error('MEDIA_TASK_IDENTITY_MISMATCH')
          value.job.state = task.status; if (task.diagnostics) value.job.diagnostics = task.diagnostics; if (task.error) value.job.error = task.error; else if (task.status === 'rejected') value.job.error = '服务端明确拒绝请求，请核对诊断信息并修正后重试。'; if (task.taskId) value.job.taskId = task.taskId
          if (!['completed', 'succeeded'].includes(task.status)) {
            if (TERMINAL_STATES.includes(task.status)) {
              delete value.job.collection; delete value.job.collectionRetry
              value.job.updatedAt = new Date(this.now()).toISOString(); await persist(); return structuredClone(value.job)
            }
            retry.backoff = 0; retry.nextAttemptAt = this.now() + MEDIA_COLLECTION_POLL_MS; retry.reason = 'provider-pending'
            value.job.collection = 'waiting'; value.job.updatedAt = new Date(this.now()).toISOString(); await persist(); continue
          }
          if (!task.artifacts.length) throw new Error('MEDIA_RESULT_NOT_READY')
          value.job.collection = 'downloading'; await persist()
          for (const artifact of task.artifacts) {
            const existing=value.job.assets.find(a=>a.id===artifact.key)
            if(existing){
              const current=await readFile(await mediaTarget(scope.cwd,existing.path)).catch(error=>{if(error.code!=='ENOENT')throw error;return undefined})
              if(current&&digest(current)===existing.sha256)continue
              value.job.assets=value.job.assets.filter(a=>a.id!==artifact.key)
            }
            // The downloader bounds each HTTP range separately. A video that
            // keeps making progress must not restart at a whole-file deadline.
            const data = await mediaAbortable(this.media.download(task.requestId, artifact.key, signal), signal), ext = extensions[data.mediaType]
            signal.throwIfAborted(); await this.check(value, scope)
            if (!ext || !/^[\w-]+$/.test(artifact.key) || digest(data.bytes) !== data.sha256) throw new Error('MEDIA_ARTIFACT_INVALID')
            const path = `media-projects/${scope.projectId}/assets/${id}-${artifact.key}.${ext}`, target = await mediaTarget(scope.cwd, path, true)
            try { await writeFile(target, data.bytes, { flag: 'wx' }) } catch (e: any) { if (e.code !== 'EEXIST' || digest(await readFile(target)) !== data.sha256) throw e }
            value.job.assets.push({ id: artifact.key, projectId:scope.projectId, sessionId:scope.sessionId, path, bytes: data.bytes.length, mediaType: data.mediaType, sha256: data.sha256, ...((data.duration??artifact.duration) !== undefined ? { duration: data.duration??artifact.duration } : {}) })
            await persist()
          }
          if (task.artifactsPending) throw new Error('MEDIA_RESULT_NOT_READY')
          value.job.collection = 'ready'; delete value.job.collectionRetry
          value.job.updatedAt = new Date(this.now()).toISOString(); await persist(); return structuredClone(value.job)
        } catch (error) {
          signal.throwIfAborted()
          if (!retryableMediaError(error)) throw error
          retry.backoff = Math.min(5, (retry.backoff ?? 0) + 1)
          const delayMs = Math.min(MEDIA_COLLECTION_MAX_BACKOFF_MS, Math.max(1000 * 2 ** retry.backoff, mediaRetryAfter(error)))
          retry.nextAttemptAt = this.now() + delayMs
          retry.reason = error instanceof Error && error.message === 'MEDIA_RESULT_NOT_READY' ? 'result-not-ready' : 'temporary-error'
          value.job.collection = 'waiting'; value.job.updatedAt = new Date(this.now()).toISOString(); await persist()
        }
      }
    } catch (error) {
      // pause() owns the paused journal entry. An aborted old transfer may not
      // overwrite a resumed transfer or return a false provider cancellation.
      if (!signal.aborted) {
        value.job.collection = 'failed'; value.job.error = '原任务结果收集失败，可恢复重试，不会重新生成。' + (error instanceof Error && /^MEDIA_[A-Z0-9_]+$/.test(error.message) ? ' ' + error.message : '')
        value.job.updatedAt = new Date().toISOString(); await persist()
      }
      throw error
    }
  }
}
