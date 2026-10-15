import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, writeFile, lstat, realpath } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { homedir } from 'node:os'
import { artifactFormat } from './artifact-format.js'
import type { MediaDraft, MediaJob, MediaReview, MediaScope, MediaRequest, ZeroWallMedia, ZeroWallMediaJobs } from '../shared/media.js'

const digest = (value: unknown) => createHash('sha256').update(typeof value === 'string' || value instanceof Uint8Array ? value : JSON.stringify(value)).digest('hex')
const extensions: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/webm': 'webm', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/ogg': 'ogg', 'audio/flac': 'flac' }
interface Stored { scope: MediaScope; owner: string; draft: MediaDraft; job: MediaJob; submitted: boolean; authorizationHash?: string; authorizationExpires?: number }
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
  private running = new Set<string>()
  constructor(private media: ZeroWallMedia, private owner: () => Promise<string>, private root = join(process.env.DSH_HOME || join(homedir(), '.zerowall'), 'media-jobs')) {}
  private lock<T>(fn: () => Promise<T>): Promise<T> { const next = this.serial.then(fn, fn); this.serial = next.catch(() => {}); return next }
  private path(id: string) { if (!/^[a-zA-Z0-9_-]{8,128}$/.test(id)) throw new Error('MEDIA_JOB_ID_INVALID'); return join(this.root, id + '.json') }
  private async read(id: string): Promise<Stored> { return JSON.parse(await readFile(this.path(id), 'utf8')) }
  private async save(value: Stored) {
    await mkdir(this.root, { recursive: true }); const target = this.path(value.job.id), temp = target + '.' + randomUUID() + '.tmp'
    await writeFile(temp, JSON.stringify(value), { mode: 0o600, flag: 'wx' }); await rename(temp, target)
  }
  private async check(value: Stored, scope: Pick<MediaScope, 'sessionId' | 'cwd'>) {
    if (value.scope.sessionId !== scope.sessionId || resolve(value.scope.cwd) !== resolve(scope.cwd) || value.owner !== await this.owner()) throw new Error('MEDIA_JOB_OWNER_MISMATCH')
  }
  async prepare(scope: MediaScope, draft: MediaDraft, id = randomUUID()): Promise<MediaJob> {
    return this.lock(async () => {
      if (!/^[a-zA-Z0-9_-]{1,80}$/.test(scope.projectId) || !scope.sessionId || !['image', 'video', 'music'].includes(draft.kind) || !draft.prompt?.trim()) throw new Error('MEDIA_DRAFT_INVALID')
      await mediaTarget(scope.cwd, `media-projects/${scope.projectId}/project.json`)
      for (const ref of [...(draft.references ?? []), ...(draft.mask ? [draft.mask] : [])]) {
        if (!/^[A-Za-z0-9+/]+={0,2}$/.test(ref.base64) || Buffer.byteLength(ref.base64,'base64') > 50*1024*1024 || !/^image\/(png|jpeg|webp)$/.test(ref.mediaType) || artifactFormat(Buffer.from(ref.base64,'base64')).mediaType !== ref.mediaType) throw new Error('MEDIA_REFERENCE_INVALID')
      }
      if ((draft.references?.length ?? 0) > 16) throw new Error('MEDIA_REFERENCE_LIMIT')
      const owner = await this.owner()
      const old = await this.read(id).catch(e => { if (e.code !== 'ENOENT') throw e; return undefined })
      if (old) { await this.check(old, scope); if (old.submitted) throw new Error('MEDIA_JOB_ALREADY_SUBMITTED'); if (old.scope.projectId !== scope.projectId) throw new Error('MEDIA_JOB_OWNER_MISMATCH') }
      if (old && draft.references === undefined && old.draft.references) draft.references = old.draft.references
      if (old && draft.mask === undefined && old.draft.mask) draft.mask = old.draft.mask
      if (draft.selection) {
        const allowed = draft.kind === 'image' ? ['image', 'image_edit', 'gemini_image'] : draft.kind === 'video' ? ['video'] : ['chat_music']
        if (!allowed.includes(draft.selection.operation)) throw new Error('MEDIA_OPERATION_KIND_MISMATCH')
      }
      const now = new Date().toISOString(), revision = (old?.job.revision ?? 0) + 1
      const frozen: MediaDraft = structuredClone(draft), requestId = 'media-' + digest({ scope, id, revision, draft })
      const estimate = draft.selection ? await this.media.estimate({ ...draft.selection, requestId, prompt: draft.prompt, parameters: draft.parameters ?? {}, ...(draft.references ? { references: draft.references } : {}), ...(draft.mask ? { mask: draft.mask } : {}), async: true }) : undefined
      if (estimate && (!estimate.currency || (estimate.maximumCharge === undefined && estimate.total === undefined) || !Number.isFinite(Number(estimate.maximumCharge ?? estimate.total)) || Number(estimate.maximumCharge ?? estimate.total) < 0)) throw new Error('MEDIA_ESTIMATE_UNAVAILABLE')
      if (owner !== await this.owner()) throw new Error('MEDIA_ACCOUNT_CHANGED')
      const job: MediaJob = { id, sessionId: scope.sessionId, projectId: scope.projectId, revision, kind: draft.kind, prompt: draft.prompt, ...(draft.selection ? { selection: draft.selection } : {}), parameters: draft.parameters ?? {}, references: [...(draft.references ?? []), ...(draft.mask ? [draft.mask] : [])].map(ref => ({ name: ref.name ?? '参考素材', mediaType: ref.mediaType, bytes: Buffer.byteLength(ref.base64, 'base64'), sha256: digest(Buffer.from(ref.base64, 'base64')), ...(ref === draft.mask ? { mask: true } : {}) })), ...(estimate ? { estimate } : {}), state: estimate ? 'prepared' : 'model-required', requestId, assets: [], createdAt: old?.job.createdAt ?? now, updatedAt: now }
      await this.save({ scope, owner, draft: frozen, job, submitted: false }); return structuredClone(job)
    })
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
  /** Host-only: the authenticated review route issues this token, never a model tool. */
  async authorize(scope: Pick<MediaScope, 'sessionId' | 'cwd'>, id: string, revision: number): Promise<string> {
    return this.lock(async () => {
      const value = await this.read(id); await this.check(value, scope)
      if (value.submitted || value.job.revision !== revision || !value.job.estimate || !value.draft.selection) throw new Error('MEDIA_REVIEW_STALE')
      const token = randomUUID() + randomUUID()
      value.authorizationHash = digest(token); value.authorizationExpires = Date.now() + 300_000
      await this.save(value); return token
    })
  }
  async submitReviewed(scope: Pick<MediaScope, 'sessionId' | 'cwd'>, reviews: MediaReview[]): Promise<MediaJob[]> {
    return this.lock(async () => {
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
            value.job.estimate = estimate; value.job.revision++; value.job.updatedAt = new Date().toISOString(); await this.save(value); throw new Error('MEDIA_COST_CHANGED: 请重新查看费用并确认。')
          }
        }
        values.push(value)
      }
      // Freeze complete batch before any POST. Repeated clicks never dispatch again.
      const fresh = values.filter(v => !v.submitted)
      for (const value of fresh) { value.submitted = true; value.job.state = 'submitting'; await this.save(value) }
      for (const value of fresh) this.start(value)
      return values.map(v => structuredClone(v.job))
    })
  }
  private request(value: Stored): MediaRequest {
    if (!value.draft.selection) throw new Error('MEDIA_SELECT_MODEL_FIRST')
    return { ...value.draft.selection, requestId: value.job.requestId, prompt: value.draft.prompt, parameters: value.draft.parameters ?? {}, ...(value.draft.references ? { references: value.draft.references } : {}), ...(value.draft.mask ? { mask: value.draft.mask } : {}), async: true }
  }
  async submitRequested(scope: Pick<MediaScope, 'sessionId' | 'cwd'>, id: string, revision: number): Promise<MediaJob> {
    return this.lock(async () => {
      const value = await this.read(id); await this.check(value, scope)
      if (value.job.revision !== revision) throw new Error('MEDIA_REQUEST_STALE')
      if (value.submitted) return structuredClone(value.job)
      if (!value.draft.selection) throw new Error('MEDIA_SELECT_MODEL_FIRST')
      value.job.estimate = await this.media.estimate(this.request(value))
      const estimate = value.job.estimate
      if (!estimate.currency || !Number.isFinite(Number(estimate.maximumCharge ?? estimate.total)) || Number(estimate.maximumCharge ?? estimate.total) < 0) throw new Error('MEDIA_ESTIMATE_UNAVAILABLE')
      await this.check(value, scope)
      value.submitted = true; value.job.state = 'submitting'; value.job.updatedAt = new Date().toISOString()
      await this.save(value); this.start(value)
      return structuredClone(value.job)
    })
  }
  private start(value: Stored) {
    this.running.add(value.job.id)
    void (async () => {
      try {
        if (value.owner !== await this.owner()) throw new Error('MEDIA_JOB_OWNER_MISMATCH')
        const task = await this.media.submit(this.request(value)); value.job.state = task.status; if (task.taskId) value.job.taskId = task.taskId
      } catch { value.job.state = 'submission-uncertain'; value.job.error = '提交状态待核查；请恢复原任务，不要重新生成。' }
      value.job.updatedAt = new Date().toISOString(); await this.lock(() => this.save(value))
    })().catch(() => {}).finally(() => this.running.delete(value.job.id))
  }
  async refresh(scope: MediaScope, id: string): Promise<MediaJob> {
    return this.lock(async () => {
      const value = await this.read(id); await this.check(value, scope)
      if (scope.projectId !== value.scope.projectId) throw new Error('MEDIA_JOB_OWNER_MISMATCH')
      if (!value.submitted || this.running.has(id)) return structuredClone(value.job)
      const task = await this.media.query(value.job.requestId); value.job.state = task.status; if (task.taskId) value.job.taskId = task.taskId
      if (['completed', 'succeeded'].includes(task.status)) {
        for (const artifact of task.artifacts) {
          if (value.job.assets.some(a => a.id === artifact.key)) continue
          const data = await this.media.download(task.requestId, artifact.key), ext = extensions[data.mediaType]
          if (!ext || !/^[\w-]+$/.test(artifact.key) || digest(data.bytes) !== data.sha256) throw new Error('MEDIA_ARTIFACT_INVALID')
          const path = `media-projects/${scope.projectId}/assets/${id}-${artifact.key}.${ext}`, target = await mediaTarget(scope.cwd, path, true)
          try { await writeFile(target, data.bytes, { flag: 'wx' }) } catch (e: any) { if (e.code !== 'EEXIST' || digest(await readFile(target)) !== data.sha256) throw e }
          value.job.assets.push({ id: artifact.key, projectId:scope.projectId, sessionId:scope.sessionId, path, bytes: data.bytes.length, mediaType: data.mediaType, sha256: data.sha256, ...((data.duration??artifact.duration) !== undefined ? { duration: data.duration??artifact.duration } : {}) })
        }
        delete value.job.error
      }
      value.job.updatedAt = new Date().toISOString(); await this.save(value); return structuredClone(value.job)
    })
  }
}
