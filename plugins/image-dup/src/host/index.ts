import { mkdir, rename, unlink, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { SessionId } from '@deepseek-ai/dsh-session'
import { defineTool, type JsonValue } from '@deepseek-ai/dsh-tools'
import type { ArtifactRef, ImageDupJob, ImageDupOptions, ImageDupReport, PdfDupOptions, ReportArtifact } from '../shared/types.js'
import { reportArtifact, reportChecksum } from './engine.js'
import { runImageDupWorker } from './worker-runner.js'

export const name = 'zerowall-image-dup'
// The service delegates authorized attachment materialization and project
// lookup to these first-party Host services. Declare them so composed Loader
// fibers can safely access the context properties.
export const inject = ['tools', 'sessions', 'zerowallFiles', 'zerowallResearch']
interface JobRecord { job: ImageDupJob; report?: ImageDupReport; cwd: string; controller: AbortController; sourceFiles?: Record<string, string> }
const jobs = new Map<string, JobRecord>()
const directoryGrants = new Map<string, { sessionId: string; path: string; expiresAt: number }>()

function containment(root: string, candidate: string): boolean {
  const rel = relative(root, candidate)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}
function options(input: ImageDupOptions | undefined): ImageDupOptions {
  return { threshold: Math.max(0, Math.min(64, Math.floor(input?.threshold ?? 8))), recursive: input?.recursive !== false, copyMove: input?.copyMove !== false, crossImage: input?.crossImage !== false, limit: Math.min(300, Math.max(1, Math.floor(input?.limit ?? 300))) }
}
async function atomic(path: string, value: string): Promise<void> {
  await mkdir(resolve(path, '..'), { recursive: true })
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`
  try { await writeFile(tmp, value, { encoding: 'utf8', flag: 'wx', mode: 0o600 }); await rename(tmp, path) } finally { await unlink(tmp).catch(() => undefined) }
}

export class ZeroWallImageDupService extends TypertRemoteService {
  static inject = ['tools', 'sessions', 'zerowallFiles', 'zerowallResearch']
  constructor(ctx: Context) { super(ctx, 'zerowallImageDup')
    ctx.tools.register(defineTool({
      name: 'check_image_duplicates',
      description: 'Scan images in the current session workspace for perceptual duplicates. Processing is local and offline.',
      parameters: {
        folder: { type: 'string', description: 'Optional workspace-relative folder.' },
        attachment_ids: { type: 'array', items: { type: 'string' }, description: 'Uploaded image attachment IDs.' },
        threshold: { type: 'integer', description: 'Hamming threshold from 0 to 64 (default 8).' },
        recursive: { type: 'boolean' }, copy_move: { type: 'boolean' }, cross_image: { type: 'boolean' },
      },
      output: {
        schema: { type: 'object', additionalProperties: true },
        render: (_args, value) => [{ type: 'text', text: `扫描完成：${value.total ?? 0} 张图片，疑似重复 ${Array.isArray(value.pairs) ? value.pairs.length : 0} 对。` }],
        presentationMeta: (_args, value) => value,
      },
      async execute(args, exec) {
        const sessionId = exec.agent?.session.id
        if (!sessionId) throw new Error('check_image_duplicates requires an active session.')
        const service = ctx.get('zerowallImageDup') as ZeroWallImageDupService
        const scanOptions = options({
          ...(args.threshold === undefined ? {} : { threshold: args.threshold }),
          ...(args.recursive === undefined ? {} : { recursive: args.recursive }),
          ...(args.copy_move === undefined ? {} : { copyMove: args.copy_move }),
          ...(args.cross_image === undefined ? {} : { crossImage: args.cross_image }),
        })
        const job = Array.isArray(args.attachment_ids) && args.attachment_ids.length > 0
          ? await service.scanAttachments({ sessionId: String(sessionId), attachmentIds: args.attachment_ids, options: scanOptions })
          : await service.scanWorkspace({ sessionId: String(sessionId), ...(args.folder === undefined ? {} : { relativeDirectory: args.folder }), options: scanOptions })
        if (job.status !== 'ready' || job.report === undefined) throw new Error(job.error ?? 'Image duplicate scan failed.')
        const projectId = (ctx.get('zerowallResearch') as { projectForSession?: (input: { sessionId: string }) => { id: string } | undefined } | undefined)?.projectForSession?.({ sessionId: String(sessionId) })?.id
        const artifact = job.artifact
        return JSON.parse(JSON.stringify({ jobId: job.jobId, sessionId: String(sessionId), ...(projectId === undefined ? {} : { projectId }), total: job.report.total, threshold: job.report.threshold, pairs: job.report.pairs, copyMove: job.report.copyMove, skipped: job.report.skipped, ...(artifact === undefined ? {} : { artifact }) })) as JsonValue as Record<string, JsonValue>
      },
    }))
  }

  private session(sessionId: string): { cwd?: string } {
    const value = this.ctx.sessions.get(SessionId(sessionId))
    if (value === undefined) throw new Error(`Session not found: ${sessionId}`)
    return value.header.cwd ? { cwd: resolve(value.header.cwd) } : {}
  }
  private artifactCwd(cwd: string | undefined): string {
    return resolve(cwd ?? process.env.DSH_HOME?.trim() ?? join(homedir(), '.dsh'), 'attachments', 'reports')
  }
  private projectForSession(sessionId: string): string | undefined {
    const research = this.ctx.get('zerowallResearch') as { projectForSession?: (input: { sessionId: string }) => { id: string } | undefined } | undefined
    return research?.projectForSession?.({ sessionId })?.id
  }
  private create(sessionId: string, source: ImageDupJob['source'], cwd: string, sourcePath?: string): JobRecord {
    const now = new Date().toISOString(); const job: ImageDupJob = { jobId: `imgdup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, sessionId, source, status: 'queued', inputChecksum: reportChecksum(`${sessionId}:${source}:${now}`), algorithmVersion: '7051eb55f611a46db3d9cfa1768e56c7d1a91553', createdAt: now, updatedAt: now }
    const record = { job: sourcePath ? { ...job, sourcePath } : job, cwd, controller: new AbortController() }; jobs.set(job.jobId, record); return record
  }
  private async run(record: JobRecord, work: (signal: AbortSignal) => Promise<ImageDupReport>): Promise<ImageDupJob> {
    record.job.status = 'running'; record.job.updatedAt = new Date().toISOString()
    try {
      record.report = await work(record.controller.signal)
      if (record.report.files) {
        record.sourceFiles = Object.fromEntries(record.report.files.filter(file => typeof file.path === 'string' && file.path.length > 0).map(file => [file.name, file.path!]))
        record.job.sourceFiles = record.sourceFiles
      }
      if (record.controller.signal.aborted) return record.job
      record.job.report = record.report; record.job.status = 'ready'
    } catch (error) {
      if (record.controller.signal.aborted) record.job.status = 'cancelled'
      else { record.job.status = 'failed'; record.job.error = error instanceof Error ? error.message : String(error) }
    }
    record.job.updatedAt = new Date().toISOString(); return record.job
  }
  @Remote('scanWorkspace') async scanWorkspace(input: { sessionId: string; relativeDirectory?: string; directoryPath?: string; directoryGrant?: string; options?: ImageDupOptions }): Promise<ImageDupJob> {
    const { cwd: sessionCwd } = this.session(input.sessionId)
    const requested = input.directoryPath?.trim()
    let directory: string
    if (requested) {
      // Absolute paths are accepted only through the explicit desktop folder
      // chooser. The model-facing tool never exposes this field.
      if (!isAbsolute(requested)) throw new Error('Selected directory must be an absolute path.')
      const granted = input.directoryGrant === undefined ? undefined : directoryGrants.get(input.directoryGrant)
      if (!granted || granted.sessionId !== input.sessionId || granted.expiresAt < Date.now() || resolve(granted.path) !== resolve(requested)) throw new Error('本机目录授权已失效，请重新选择目录。')
      directory = resolve(requested)
    } else {
      const rel = input.relativeDirectory?.trim() || '.'
      if (isAbsolute(rel)) throw new Error('Workspace directory must be relative.')
      if (sessionCwd === undefined) throw new Error('This session has no workspace directory.')
      directory = resolve(sessionCwd, rel)
      if (!containment(sessionCwd, directory)) throw new Error('Workspace directory escapes the session workspace.')
    }
    const scanOptions = options(input.options)
    const record = this.create(input.sessionId, 'workspace', directory, directory)
    return this.run(record, async signal => normalizeWorkerReport(await runImageDupWorker({ dir: directory, threshold: scanOptions.threshold, thumb: 0, limit: scanOptions.limit, recursive: scanOptions.recursive, copyMove: scanOptions.copyMove, crossImage: scanOptions.crossImage }, signal)))
  }
  @Remote('grantDirectory') grantDirectory(input: { sessionId: string; path: string }): { grant: string; path: string; expiresAt: string } {
    this.session(input.sessionId)
    if (!isAbsolute(input.path)) throw new Error('Selected directory must be an absolute path.')
    const path = resolve(input.path); const grant = randomUUID(); const expiresAt = Date.now() + 10 * 60 * 1000
    directoryGrants.set(grant, { sessionId: input.sessionId, path, expiresAt }); return { grant, path, expiresAt: new Date(expiresAt).toISOString() }
  }
  @Remote('scanAttachments') async scanAttachments(input: { sessionId: string; attachmentIds: string[]; options?: ImageDupOptions }): Promise<ImageDupJob> {
    const { cwd } = this.session(input.sessionId); const service = this.ctx.get('zerowallFiles') as { materialize(input: { sessionId: string; attachmentId: string }): Promise<{ path: string }> } | undefined
    if (!service) throw new Error('zerowallFiles service is unavailable.')
    const paths: string[] = []
    for (const attachmentId of input.attachmentIds.slice(0, 300)) { const result = await service.materialize({ sessionId: input.sessionId, attachmentId }); paths.push(result.path) }
    const scanOptions = options(input.options)
    const sourceFiles = Object.fromEntries(paths.map(path => [path.split(/[\\/]/u).pop() ?? path, path]))
    const record = this.create(input.sessionId, 'attachments', this.artifactCwd(cwd))
    record.sourceFiles = sourceFiles
    record.job.sourceFiles = sourceFiles
    return this.run(record, async signal => normalizeWorkerReport(await runImageDupWorker({ paths, threshold: scanOptions.threshold, thumb: 0, limit: scanOptions.limit, copyMove: scanOptions.copyMove, crossImage: scanOptions.crossImage }, signal)))
  }
  @Remote('scanPdf') async scanPdf(input: { sessionId: string; attachmentId: string; options?: PdfDupOptions }): Promise<ImageDupJob> {
    const { cwd } = this.session(input.sessionId)
    const service = this.ctx.get('zerowallFiles') as { materialize(input: { sessionId: string; attachmentId: string }): Promise<{ path: string }> } | undefined
    if (!service) throw new Error('zerowallFiles service is unavailable.')
    const attachment = await service.materialize({ sessionId: input.sessionId, attachmentId: input.attachmentId })
    const scanOptions = options(input.options)
    const record = this.create(input.sessionId, 'pdf', this.artifactCwd(cwd))
    return this.run(record, async signal => normalizeWorkerReport(await runImageDupWorker({ pdf: {
      pdfPath: attachment.path, threshold: scanOptions.threshold, thumb: 160,
      onlyPainted: input.options?.onlyPainted !== false, crossPageOnly: input.options?.crossPageOnly === true,
      crossImage: scanOptions.crossImage,
    } }, signal)))
  }
  @Remote('getJob') getJob(input: { sessionId: string; jobId: string }): ImageDupJob { const record = jobs.get(input.jobId); if (!record || record.job.sessionId !== input.sessionId) throw new Error('Image duplicate job not found.'); return record.job }
  @Remote('listJobs') listJobs(input: { sessionId: string }): ImageDupJob[] { return [...jobs.values()].filter(record => record.job.sessionId === input.sessionId).map(record => record.job).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) }
  @Remote('cancel') cancel(input: { sessionId: string; jobId: string }): void { const record = jobs.get(input.jobId); if (!record || record.job.sessionId !== input.sessionId) throw new Error('Image duplicate job not found.'); if (record.job.status === 'queued' || record.job.status === 'running') { record.job.status = 'cancelled'; record.job.updatedAt = new Date().toISOString(); record.controller.abort(new Error('用户已取消图片查重任务。')) } }
  @Remote('exportReport') async exportReport(input: { sessionId: string; jobId: string; format: 'html' | 'md' | 'json' }): Promise<ReportArtifact> {
    const record = jobs.get(input.jobId); if (!record || record.job.sessionId !== input.sessionId || record.report === undefined) throw new Error('Image duplicate report not found.')
    const body = reportArtifact(record.report, input.format); const ext = input.format === 'json' ? 'json' : input.format === 'md' ? 'md' : 'html'
    const fallbackRoot = resolve(process.env.DSH_HOME?.trim() ?? join(homedir(), '.dsh'), 'attachments', 'reports')
    const path = resolve(record.cwd) === fallbackRoot
      ? join(record.cwd, `${record.job.jobId}.${ext}`)
      : join(record.cwd, '.zerowall', 'artifacts', `${record.job.jobId}.${ext}`)
    await atomic(path, body)
    const artifact: ReportArtifact = { uri: pathToFileURL(path).href, name: `${record.job.jobId}.${ext}`, mediaType: input.format === 'html' ? 'text/html' : input.format === 'md' ? 'text/markdown' : 'application/json', checksum: reportChecksum(body), bytes: Buffer.byteLength(body), data: Buffer.from(body, 'utf8').toString('base64') }; record.job.artifact = artifact; return artifact
  }
}

declare module '@deepseek-ai/cordis' { interface Context { zerowallImageDup: ZeroWallImageDupService } }
export function apply(ctx: Context): void { ctx.plugin(ZeroWallImageDupService) }

function normalizeWorkerReport(raw: Record<string, unknown>): ImageDupReport {
  const pairs = Array.isArray(raw.pairs) ? raw.pairs.filter(isPair) : []
  const skipped = Array.isArray(raw.skipped) ? raw.skipped.filter(isObject).map(value => ({ path: String(value.path ?? value.name ?? 'unknown'), reason: String(value.reason ?? value.error ?? 'unsupported') })) : []
  const copyMove = Array.isArray(raw.copyMove) ? raw.copyMove.filter(isObject).map(value => { const regions = Array.isArray(value.regions) ? value.regions : []; return { name: String(value.name ?? value.path ?? 'unknown'), ...(typeof value.path === 'string' ? { path: value.path } : {}), regionCount: regions.length } }) : []
  const crossPairs = Array.isArray(raw.crossPairs) ? raw.crossPairs.filter(isObject).map(value => ({ a: String(value.a ?? ''), b: String(value.b ?? ''), ...(typeof value.scale === 'number' ? { scale: value.scale } : {}), matches: typeof value.matches === 'number' ? value.matches : 0, confidence: typeof value.confidence === 'number' ? value.confidence : typeof value.conf === 'number' ? value.conf : 0 })) : []
  const files = Array.isArray(raw.files) ? raw.files.filter(isObject).map(value => ({ name: String(value.name ?? value.path ?? 'unknown'), ...(typeof value.path === 'string' && value.path.length > 0 ? { path: value.path } : {}), ...(typeof value.page === 'number' ? { page: value.page } : {}), ...(typeof value.w === 'number' ? { width: value.w } : {}), ...(typeof value.h === 'number' ? { height: value.h } : {}) })) : []
  return {
    ok: true, total: typeof raw.total === 'number' ? raw.total : 0, threshold: typeof raw.threshold === 'number' ? raw.threshold : 8,
    pairs, copyMove, ...(crossPairs.length > 0 ? { crossPairs } : {}), skipped, ...(files.length > 0 ? { files } : {}), algorithm: typeof raw.algorithm === 'string' ? raw.algorithm : 'pinned image duplicate worker',
    algorithmVersion: '7051eb55f611a46db3d9cfa1768e56c7d1a91553', generatedAt: new Date().toISOString(),
    ...(typeof raw.pages === 'number' ? { pages: raw.pages } : {}),
    ...(typeof raw.onlyPainted === 'boolean' ? { onlyPainted: raw.onlyPainted } : {}),
    ...(typeof raw.crossPageOnly === 'boolean' ? { crossPageOnly: raw.crossPageOnly } : {}),
    ...(typeof raw.ghostExcluded === 'number' ? { ghostExcluded: raw.ghostExcluded } : {}),
  }
}
function isObject(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function isPair(value: unknown): value is ImageDupReport['pairs'][number] { return isObject(value) && typeof value.a === 'string' && typeof value.b === 'string' && typeof value.distance === 'number' && typeof value.similarity === 'number' && typeof value.transform === 'string' }
