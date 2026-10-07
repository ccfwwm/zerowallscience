import { renameFile } from './atomic-file.js'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { appendFile, mkdir, open, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { devNull } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { DEFAULT_INDEX_URL, sanitizePythonTlsEnvironment } from './python-mirror.js'
import { DEFAULT_MIRROR_PRESET, mirrorPresets } from './python-mirrors.js'
import { publicCAFile } from './python-pip.js'
import { assertWritablePythonRuntimePath, normalizePythonRuntimePath } from './python-location.js'
import type { PythonUpdaterService } from './python-updater-service.js'
import { parsePythonDependencyManifest } from './python-dependency-manifest.js'
import type { McpEnvironmentStatus, McpPythonInfo, PythonDependencyLayer, PythonDependencyTask, PythonTaskState } from '../shared/contracts.js'
import type { ReportPythonSyncProgress, PythonSyncProgress } from './python-sync.js'
import { MCP_ENVIRONMENT_KEYRING } from './mcp-environment.js'

const execute = promisify(execFile)

export { normalizePythonRuntimePath } from './python-location.js'
export interface PythonEnvironmentRequest {
  action: 'status' | 'task_status' | 'cancel' | 'check_manifest' | 'preview_sync' | 'apply_sync' | 'sync' | 'install_package' | 'list_packages' | 'configure' | 'diagnose' | 'rollback'
  requestId: string
  taskId?: string
  layer?: PythonDependencyLayer
  packageSpec?: string
  capabilityId?: string
  planId?: string
  manifestRevision?: string
  mirrorUrl?: string
  /** New shared-runtime directory (must end in a dedicated `Python` folder). */
  runtimeRoot?: string
  expectedRevision?: number
  confirm?: boolean
}
interface Settings { revision: number; mirrorUrl: string }
interface SyncService {
  checkManifest(layer?: PythonDependencyLayer, capabilityId?: string, report?: ReportPythonSyncProgress): Promise<unknown>
  previewSync(layer?: PythonDependencyLayer, capabilityId?: string, taskId?: string, report?: ReportPythonSyncProgress): Promise<unknown>
  applySync(planId: string, revision: string, confirm: boolean): Promise<unknown>
  verifyInstalled?(layer: PythonDependencyLayer, capabilityId?: string, report?: ReportPythonSyncProgress, knownFailures?: Array<{ name: string; version: string; message: string }>): Promise<unknown>
  installFailures?(planId: string): Promise<Array<{ name: string; version: string; message: string }>>
}
interface ManifestSummary { revision: string; changes: Array<{ name: string; from?: string; to: string }>; packageCount: number }
type AsyncPythonAction = Extract<PythonEnvironmentRequest['action'], 'check_manifest' | 'preview_sync' | 'apply_sync' | 'sync' | 'install_package'>
interface PythonJobReceipt { fingerprint: string; taskId: string; state: PythonTaskState | 'completed'; result?: Record<string, unknown>; error?: string }

export class PythonEnvironmentApi {
  private operation: Promise<unknown> = Promise.resolve()
  private mutation: Promise<unknown> = Promise.resolve()
  private readonly taskAccepts = new Map<string, Promise<Record<string, unknown>>>()
  private readonly activeTaskIds = new Set<string>()
  private readonly taskCache = new Map<string, PythonDependencyTask>()
  private readonly taskWrites = new Map<string, Promise<PythonDependencyTask | undefined>>()
  private readonly taskOperations = new Map<string, Promise<void>>()
  private readonly workerLogs = new Map<string, { taskId: string; lines: string[] }>()
  private progressFlush?: Promise<void>
  private activeTaskId?: string
  private activeUnderlyingTaskId?: string
  private recovery?: Promise<void>
  /**
   * Progress rows for the job currently running. The panel reads live progress
   * through `status`, but a job that fails takes that in-memory stream with it,
   * so each stage is also flushed to the operations log where it can be read
   * afterwards. Coalescing here is what keeps a 20-minute install from evicting
   * the operation history it is written beside, which the panel reads as one
   * 64 KiB tail.
   */
  private progress: Array<Record<string, unknown>> = []
  private progressTimer?: NodeJS.Timeout
  constructor(private root: string, private updater: PythonUpdaterService, private sync: SyncService, private locationPath = join(root, 'python-location.json'), private applicationInstallRoot?: string, private canonicalRuntimeRoot?: string) {
    updater.watchProgress?.(status => this.recordProgress(status))
  }

  private recordProgress(status: McpEnvironmentStatus): void {
    if (status.packageInventory?.ready) void this.persistRuntimeSummary(status.packageInventory).catch(() => undefined)
    const job = status.updateJob
    const activeId = this.activeTaskId
    const expectedId = this.activeUnderlyingTaskId ?? this.taskCache.get(activeId ?? '')?.underlyingTaskId ?? activeId
    if (activeId && job && job.taskId === expectedId) {
      const current = this.taskCache.get(activeId)
      if (current?.state === 'running') {
        const incoming = job.logLines ?? []
        const previous = this.workerLogs.get(activeId)
        let overlap = previous?.taskId === job.taskId ? Math.min(previous.lines.length, incoming.length) : 0
        while (overlap > 0 && previous!.lines.slice(-overlap).join('\n') !== incoming.slice(0, overlap).join('\n')) overlap--
        const appended = incoming.slice(overlap)
        this.workerLogs.set(activeId, { taskId: job.taskId, lines: incoming.slice(-80) })
        void this.updateTask(activeId, {
          stage: job.stage || status.phase,
          progress: status.progress,
          ...(job.completedFiles === undefined ? {} : { completedPackages: job.completedFiles }),
          ...(job.totalFiles === undefined ? {} : { totalPackages: job.totalFiles }),
          ...(job.targetVersion ? { currentPackage: job.targetVersion } : {}),
          ...(status.message ? { message: status.message } : {}),
        }, appended).catch(() => undefined)
      }
    }
    const entry: Record<string, unknown> = { action: 'progress', status: 'running', createdAt: new Date().toISOString(), phase: status.phase, stage: job?.stage ?? null, percent: status.progress ?? null, message: status.message ?? null, logLine: job?.logLines?.at(-1) ?? null, taskId: job?.taskId ?? null, packageCount: job?.packageNames?.length ?? 0, packageNames: job?.packageNames?.slice(0, 20) ?? [], completedFiles: job?.completedFiles ?? null, totalFiles: job?.totalFiles ?? null, receivedBytes: job?.receivedBytes ?? null, totalBytes: job?.totalBytes ?? null }
    const previous = this.progress[this.progress.length - 1]
    // Collapse a repeated stage in place: the log should show the shape of the
    // run, not a per-percent transcript.
    if (previous && previous.stage === entry.stage && previous.phase === entry.phase && previous.logLine === entry.logLine) this.progress[this.progress.length - 1] = entry
    else this.progress.push(entry)
    if (this.progress.length > 200) this.progress.splice(0, this.progress.length - 200)
    this.progressTimer ??= setTimeout(() => { this.progressTimer = undefined; void this.flushProgress() }, 500)
  }

  private async flushProgress(): Promise<void> {
    if (this.progressFlush) return this.progressFlush
    const rows = this.progress.splice(0)
    if (!rows.length) return
    const operation = (async () => {
      await mkdir(join(this.controlRoot(), 'logs'), { recursive: true })
      await appendFile(join(this.controlRoot(), 'logs', 'environment-events.jsonl'), rows.map(row => JSON.stringify({ requestId: String(row.taskId ?? 'progress'), ...row }, (_key, value) => typeof value === 'string' ? this.safeTaskText(value) : value) + '\n').join('')).catch(() => undefined)
    })()
    this.progressFlush = operation
    try { await operation } finally { if (this.progressFlush === operation) this.progressFlush = undefined }
  }

  /** Flush durable task receipts and pending progress before Electron exits. */
  async flush(): Promise<void> {
    if (this.progressTimer) { clearTimeout(this.progressTimer); this.progressTimer = undefined }
    for (;;) {
      await Promise.all([...this.taskWrites.values()].map(operation => operation.catch(() => undefined)))
      await this.flushProgress()
      if (!this.taskWrites.size && !this.progress.length && !this.progressFlush) break
    }
  }

  async shutdown(): Promise<void> {
    await this.flush()
    this.updater.stop()
    await this.flush()
  }

  /** All durable Python task state lives below the canonical runtime's
   * `.zerowall` directory.  `root` is supplied by resolvePythonLocation and
   * already points there; using the location-file parent would put receipts
   * beside the runtime and reintroduce the old split directory layout. */
  private controlRoot(): string { return this.root }

  /** One durable queue for every Python operation.  The directory lives under
   * the canonical runtime's private control tree so a restart can recover the
   * same task and its logs without exposing slots or a second environment. */
  private taskDirectory(): string { return join(this.controlRoot(), 'jobs') }
  private taskPath(taskId: string): string { return join(this.taskDirectory(), `${taskId}.json`) }
  private async writeJsonAtomic(path: string, value: unknown): Promise<void> {
    await mkdir(dirname(path), { recursive: true })
    const temporary = `${path}.${randomUUID()}.tmp`
    try { await writeFile(temporary, `${JSON.stringify(value)}\n`); await renameFile(temporary, path) }
    finally { await rm(temporary, { force: true }).catch(() => undefined) }
  }
  private safeTaskText(value: unknown): string {
    return String(value ?? '').replace(/https?:\/\/[^\s]+/giu, '[resource-url]')
      .replace(/((?:token|api[_-]?key|secret|password|authorization)\s*[=:]\s*)[^\s,;]+/giu, '$1[redacted]')
      .slice(0, 800)
  }
  async persistRuntimeSummary(info: McpPythonInfo): Promise<void> {
    const path = join(this.controlRoot(), 'python-summary.json')
    const previous = await readFile(path, 'utf8').then(text => JSON.parse(text) as Record<string, unknown>, () => ({}))
    await this.writeJsonAtomic(join(this.controlRoot(), 'python-summary.json'), {
      ...previous,
      ready: info.ready, version: info.version, runtimeRoot: info.runtimeRoot,
      executable: info.executable, sitePackages: info.sitePackages,
      coreReady: info.coreReady, officialPackageCount: info.officialPackageCount,
      corePackageCount: info.corePackageCount,
      ...(info.inventoryComplete ? { sciencePackageCount: info.sciencePackageCount, scienceInstalledPackageCount: info.scienceInstalledPackageCount, packageCount: info.packageCount } : {}),
      missingCorePackages: info.missingCorePackages ?? [],
      scannedAt: info.scannedAt ?? new Date().toISOString(), inventoryComplete: info.inventoryComplete === true,
    })
  }
  private async readTask(taskId: string): Promise<PythonDependencyTask | undefined> {
    const cached = this.taskCache.get(taskId)
    if (cached) return cached
    const value = await readFile(this.taskPath(taskId), 'utf8').then(text => JSON.parse(text) as PythonDependencyTask, () => undefined)
    if (value) this.taskCache.set(taskId, value)
    return value
  }
  private async updateTask(taskId: string, patch: Partial<PythonDependencyTask>, lines: string[] = []): Promise<PythonDependencyTask | undefined> {
    // Serialize the whole read/merge/write operation. Previously only disk
    // writes were chained, while concurrent progress callbacks all merged
    // against the same stale task and could overwrite each other's counters
    // and pip output.
    const previous = this.taskWrites.get(taskId) ?? Promise.resolve(undefined)
    const operation = previous.catch(() => undefined).then(async () => {
      const current = await this.readTask(taskId)
      if (!current) return undefined
      const terminal = this.isTerminal(current.state)
      if (terminal && patch.state !== current.state) return current
      if (!terminal && current.state !== 'queued' && current.state !== 'running' && patch.state === undefined) return current
      const appended = lines.map(line => this.safeTaskText(line)).filter(Boolean)
      const merged = [...current.logLines]
      for (const line of appended) if (merged.at(-1) !== line) merged.push(line)
      const now = new Date().toISOString()
      const next: PythonDependencyTask = {
        ...current,
        ...patch,
        ...(patch.message === undefined ? {} : { message: this.safeTaskText(patch.message) }),
        ...(patch.error === undefined ? {} : { error: this.safeTaskText(patch.error) }),
        logLines: merged.slice(-240),
        updatedAt: now,
        ...(this.isTerminal(patch.state) ? { completedAt: now } : {}),
      }
      this.taskCache.set(taskId, next)
      await this.writeJsonAtomic(this.taskPath(taskId), next)
      await this.writeJsonAtomic(join(this.taskDirectory(), 'latest.json'), { taskId, updatedAt: now })
      return next
    })
    this.taskWrites.set(taskId, operation)
    try { return await operation }
    finally { if (this.taskWrites.get(taskId) === operation) this.taskWrites.delete(taskId) }
  }
  private async recoverLatestTask(): Promise<PythonDependencyTask | undefined> {
    if (!this.recovery) this.recovery = (async () => {
      const pointer = await readFile(join(this.taskDirectory(), 'latest.json'), 'utf8').then(JSON.parse, () => undefined) as { taskId?: string } | undefined
      if (!pointer?.taskId) return
      const task = await this.readTask(pointer.taskId)
      if (task && (task.state === 'queued' || task.state === 'running') && !this.activeTaskIds.has(task.taskId)) {
        await this.updateTask(task.taskId, { state: 'interrupted', message: '桌面关闭或重启时任务尚未完成；以下为最后一次保存的进度和日志。', error: '任务因桌面进程结束而中断。' })
      }
    })()
    await this.recovery
    const pointer = await readFile(join(this.taskDirectory(), 'latest.json'), 'utf8').then(JSON.parse, () => undefined) as { taskId?: string } | undefined
    return pointer?.taskId ? this.readTask(pointer.taskId) : undefined
  }
  private async reportTask(taskId: string, progress: PythonSyncProgress): Promise<void> {
    const current = await this.readTask(taskId)
    if (!current || current.state !== 'running') return
    const stageChanged = progress.stage !== current.stage
    const packageChanged = progress.currentPackage !== undefined && progress.currentPackage !== current.currentPackage
    const countChanged = progress.completedPackages !== undefined && progress.completedPackages !== current.completedPackages
    const line = progress.logLine
      ? `${progress.currentPackage ? `${progress.currentPackage}: ` : ''}${progress.logLine}`
      : stageChanged || packageChanged || countChanged ? progress.message : undefined
    await this.updateTask(taskId, {
      state: 'running', stage: progress.stage,
      ...(progress.progress === undefined ? {} : { progress: Math.max(0, Math.min(99, progress.progress)) }),
      ...(progress.completedPackages === undefined ? {} : { completedPackages: progress.completedPackages }),
      ...(progress.totalPackages === undefined ? {} : { totalPackages: progress.totalPackages }),
      ...(progress.currentPackage === undefined ? {} : { currentPackage: progress.currentPackage }),
      ...(progress.message === undefined ? {} : { message: progress.message }),
    }, line ? [line] : [])
  }
  private compactResult(result: Record<string, unknown>): Record<string, unknown> {
    const plan = result.plan
    if (!plan || typeof plan !== 'object') return result
    const value = plan as Record<string, unknown>
    const safePlan = {
      planId: value.planId, snapshotId: value.snapshotId, requested: value.requested,
      changes: value.changes, error: value.error, manifestRevision: value.manifestRevision,
    }
    return { ...result, plan: safePlan }
  }
  private responseForTask(task: PythonDependencyTask): Record<string, unknown> {
    if (task.state === 'queued' || task.state === 'running') return { requestId: task.requestId, taskId: task.taskId, queued: true, task }
    // The public taskId is the durable outer task users poll across restarts.
    // The inner updater id remains separately available as underlyingTaskId;
    // allowing task.result.taskId to override it made the returned id change
    // after installation completed.
    if (task.state === 'succeeded' || task.state === 'partial') return { ...task.result, requestId: task.requestId, taskId: task.taskId, ...(task.underlyingTaskId ? { underlyingTaskId: task.underlyingTaskId } : {}), queued: false, task }
    return { requestId: task.requestId, taskId: task.taskId, queued: false, task, error: task.error }
  }

  private isTerminal(state: PythonTaskState | undefined): boolean {
    return state === 'succeeded' || state === 'partial' || state === 'failed' || state === 'interrupted' || state === 'cancelled'
  }

  private async ensureRuntimeReady(): Promise<void> {
    const updater = this.updater as PythonUpdaterService & { ensureReady?: () => Promise<McpEnvironmentStatus> }
    const status = typeof updater.ensureReady === 'function'
      ? await updater.ensureReady()
      : updater.current()
    if (status.phase !== 'ready' && status.phase !== 'manual') {
      throw new Error(status.lastUpdateError ?? status.message ?? '共享 Python 尚未就绪，请先完成基础环境安装。')
    }
  }

  private async settings(): Promise<Settings> {
    for (const root of [this.controlRoot(), this.root]) {
      try { return JSON.parse(await readFile(join(root, 'settings.json'), 'utf8')) as Settings }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || root === this.root) break }
    }
    return { revision: 0, mirrorUrl: DEFAULT_INDEX_URL }
  }

  async request(input: PythonEnvironmentRequest): Promise<Record<string, unknown>> {
    if (!input || typeof input.requestId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/u.test(input.requestId)) throw new Error('Invalid Python requestId')
    if (['check_manifest', 'preview_sync', 'apply_sync', 'sync', 'install_package'].includes(input.action)) return this.acceptTask(input)
    if (input.action === 'task_status') {
      if (!input.taskId || !/^[a-f0-9-]{36}$/u.test(input.taskId)) throw new Error('Invalid Python task id')
      // A progress callback updates the cache and receipt asynchronously. Wait
      // for updates already accepted by this process so polling never returns
      // an older snapshot than the progress event that triggered the poll.
      await this.taskWrites.get(input.taskId)?.catch(() => undefined)
      let task = await this.readTask(input.taskId)
      if (task && this.isTerminal(task.state)) {
        await this.taskOperations.get(input.taskId)?.catch(() => undefined)
        task = await this.readTask(input.taskId)
      }
      if (!task) throw new Error('Python task not found.')
      return { requestId: input.requestId, taskId: task.taskId, task }
    }
    if (input.action === 'cancel') return this.cancelTask(input)
    // `sync` installs into the shared environment, so it belongs behind the same
    // serialization lock and request receipt as the two-step apply. Leaving it
    // out would let a double click or a restart mid-install run it twice.
    const mutates = ['apply_sync', 'sync', 'rollback'].includes(input.action) || (input.action === 'configure' && (input.mirrorUrl !== undefined || input.runtimeRoot !== undefined))
    if (!mutates) return this.auditedExecute(input)
    const operation = this.mutation.catch(() => undefined).then(async () => {
      const directory = join(this.controlRoot(), 'requests')
      const path = join(directory, `${input.requestId}.json`)
      const fingerprint = createHash('sha256').update(JSON.stringify(Object.entries(input).sort(([a], [b]) => a.localeCompare(b)))).digest('hex')
      let receipt: { fingerprint: string; result?: Record<string, unknown>; error?: string } | undefined
      try { receipt = JSON.parse(await readFile(path, 'utf8')) }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
      if (receipt) {
        if (receipt.fingerprint !== fingerprint) throw new Error('REQUEST_ID_CONFLICT: use a new requestId for a different operation.')
        if (receipt.result) return receipt.result
        throw new Error(receipt.error ?? 'REQUEST_INTERRUPTED: inspect the durable task queue before submitting a new request.')
      }
      await mkdir(directory, { recursive: true })
      await writeFile(path, JSON.stringify({ fingerprint, state: 'accepted' }), { flag: 'wx' })
      const save = async (value: unknown) => {
        const temporary = `${path}.${randomUUID()}.tmp`
        await writeFile(temporary, JSON.stringify(value)); await renameFile(temporary, path)
      }
      try {
        const result = await this.auditedExecute(input)
        await save({ fingerprint, result }); return result
      } catch (error) {
        await save({ fingerprint, error: error instanceof Error ? error.message : String(error) })
        throw error
      }
    })
    this.mutation = operation
    return operation
  }

  private acceptTask(input: PythonEnvironmentRequest): Promise<Record<string, unknown>> {
    const pending = this.taskAccepts.get(input.requestId)
    if (pending !== undefined) return pending
    const accepted = this.persistAndQueueTask(input)
    this.taskAccepts.set(input.requestId, accepted)
    void accepted.finally(() => { this.taskAccepts.delete(input.requestId) }).catch(() => undefined)
    return accepted
  }

  private async persistAndQueueTask(input: PythonEnvironmentRequest): Promise<Record<string, unknown>> {
    if (input.action === 'sync' && input.confirm !== true) throw new Error('CONFIRMATION_REQUIRED: 一键同步需要显式确认。')
    if (input.action === 'apply_sync' && (!input.planId || !input.manifestRevision || input.confirm !== true)) throw new Error('CONFIRMATION_REQUIRED: review and approve the concrete dependency plan first.')
    if (input.action === 'install_package' && (!input.packageSpec || !/^[A-Za-z0-9][A-Za-z0-9_.-]*(?:\[[A-Za-z0-9_,.-]+\])?(?:[=<>!~]=?[A-Za-z0-9.*+!<>=~,.-]+)?$/u.test(input.packageSpec.trim()) || input.confirm !== true)) throw new Error('CONFIRMATION_REQUIRED: enter a valid package name and optional version, then confirm its installation.')
    const directory = join(this.controlRoot(), 'requests')
    const path = join(directory, `${input.requestId}.json`)
    const fingerprint = createHash('sha256').update(JSON.stringify(Object.entries(input).sort(([a], [b]) => a.localeCompare(b)))).digest('hex')
    let receipt: PythonJobReceipt | undefined
    try { receipt = JSON.parse(await readFile(path, 'utf8')) }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    if (receipt !== undefined) {
      if (receipt.fingerprint !== fingerprint) throw new Error('REQUEST_ID_CONFLICT: use a new requestId for a different operation.')
      if (receipt.taskId) {
        let existingTask = await this.readTask(receipt.taskId)
        if (existingTask && this.isTerminal(existingTask.state)) {
          await this.taskOperations.get(receipt.taskId)?.catch(() => undefined)
          existingTask = await this.readTask(receipt.taskId)
        }
        if (existingTask) return this.responseForTask(existingTask)
      }
      if (receipt.result !== undefined) return receipt.result
      throw new Error(receipt.error ?? 'REQUEST_INTERRUPTED: Python task state is missing; use a new requestId to retry.')
    }

    const taskId = randomUUID()
    const now = new Date().toISOString()
    const task: PythonDependencyTask = {
      taskId, requestId: input.requestId, action: input.action as AsyncPythonAction,
      layer: input.layer ?? 'science', ...(input.packageSpec ? { packageSpec: input.packageSpec.trim() } : {}), state: 'queued', stage: 'queued',
      message: '任务已加入队列，桌面可以继续使用。', logLines: [], createdAt: now, updatedAt: now,
    }
    this.taskCache.set(taskId, task)
    this.activeTaskIds.add(taskId)
    try {
      await this.writeJsonAtomic(this.taskPath(taskId), task)
      await this.writeJsonAtomic(join(this.taskDirectory(), 'latest.json'), { taskId, updatedAt: now })
      await this.writeJsonAtomic(path, { fingerprint, state: 'queued', taskId } satisfies PythonJobReceipt)
      await this.log(input, 'queued', { taskId })
    } catch (error) {
      this.activeTaskIds.delete(taskId)
      this.taskCache.delete(taskId)
      throw error
    }
    this.queueAcceptedTask(input, fingerprint, path, task)
    return { requestId: input.requestId, taskId, queued: true, task }
  }

  /** Resume an interrupted automatic core sync without replacing its receipt or progress history. */
  async resumeCoreSyncTask(taskId: string): Promise<Record<string, unknown> | undefined> {
    if (!/^[a-f0-9-]{36}$/u.test(taskId)) throw new Error('Invalid Python task id')
    const current = await this.readTask(taskId)
    if (!current || current.layer !== 'core' || current.action !== 'sync') return undefined
    if (current.state === 'queued' || current.state === 'running') return this.responseForTask(current)
    if (current.state !== 'interrupted' || this.activeTaskIds.has(taskId)) return undefined

    const input: PythonEnvironmentRequest = { action: 'sync', layer: 'core', confirm: true, requestId: current.requestId }
    const receiptPath = join(this.controlRoot(), 'requests', `${current.requestId}.json`)
    const receipt = await readFile(receiptPath, 'utf8').then(text => JSON.parse(text) as PythonJobReceipt, () => undefined)
    if (!receipt?.fingerprint || receipt.taskId !== taskId) throw new Error('Python 中断任务的持久收据不完整，不能安全续接。')
    const now = new Date().toISOString()
    const resumed: PythonDependencyTask = {
      ...current,
      state: 'queued', stage: 'queued',
      message: '正在恢复上次中断的核心依赖任务；保留此前进度和日志。',
      error: undefined, completedAt: undefined, updatedAt: now,
    }
    this.taskCache.set(taskId, resumed)
    this.activeTaskIds.add(taskId)
    await this.writeJsonAtomic(this.taskPath(taskId), resumed)
    await this.writeJsonAtomic(join(this.taskDirectory(), 'latest.json'), { taskId, updatedAt: now })
    await this.writeJsonAtomic(receiptPath, { ...receipt, state: 'queued', taskId })
    this.queueAcceptedTask(input, receipt.fingerprint, receiptPath, resumed)
    return { requestId: current.requestId, taskId, queued: true, task: resumed }
  }

  private queueAcceptedTask(input: PythonEnvironmentRequest, fingerprint: string, receiptPath: string, task: PythonDependencyTask): void {
    const taskId = task.taskId
    const operation = this.mutation.catch(() => undefined).then(async () => {
      this.activeTaskId = taskId
      this.activeUnderlyingTaskId = taskId
      await this.updateTask(taskId, { state: 'running', stage: task.stage === 'queued' ? 'starting' : task.stage, message: task.stage === 'queued' ? '正在准备 Python 依赖任务。' : task.message })
      await this.writeJsonAtomic(receiptPath, { fingerprint, state: 'running', taskId } satisfies PythonJobReceipt)
      await this.log(input, 'running', { taskId })
      try {
        const result = this.compactResult(await this.executeTask(input, taskId))
        const partial = result.partial === true
        const completed = await this.updateTask(taskId, { state: partial ? 'partial' : 'succeeded', stage: partial ? 'partial' : 'complete', progress: 100, message: partial ? this.taskPartialMessage(input.action as AsyncPythonAction) : this.taskSuccessMessage(input.action as AsyncPythonAction), result })
        if (!completed) throw new Error('任务已结束，但最终状态未能写入磁盘。')
        const response = this.responseForTask(completed)
        await this.writeJsonAtomic(receiptPath, { fingerprint, state: partial ? 'partial' : 'completed', taskId, result: response } satisfies PythonJobReceipt)
        await this.log(input, partial ? 'partial' : 'succeeded', { taskId })
      } catch (error) {
        const message = this.safeTaskText(error instanceof Error ? error.message : String(error))
        const cancelled = (await this.readTask(taskId))?.state === 'cancelled'
        if (cancelled) {
          await this.writeJsonAtomic(receiptPath, { fingerprint, state: 'cancelled', taskId, error: message } satisfies PythonJobReceipt)
          await this.log(input, 'cancelled', { taskId, message })
          return
        }
        const failed = await this.updateTask(taskId, { state: 'failed', stage: 'failed', progress: undefined, message: '任务失败，当前有效 Python 环境保持不变。', error: message }, [message])
        await this.writeJsonAtomic(receiptPath, { fingerprint, state: 'failed', taskId, error: message } satisfies PythonJobReceipt)
        await this.log(input, 'failed', { taskId, message })
        if (failed) this.taskCache.set(taskId, failed)
      } finally {
        this.activeTaskIds.delete(taskId)
        this.workerLogs.delete(taskId)
        this.activeTaskId = undefined
        this.activeUnderlyingTaskId = undefined
      }
    })
    this.mutation = operation
    this.taskOperations.set(taskId, operation)
    void operation.finally(() => { if (this.taskOperations.get(taskId) === operation) this.taskOperations.delete(taskId) }).catch(() => undefined)
    void operation.catch(() => undefined)
  }

  private taskSuccessMessage(action: AsyncPythonAction): string {
    return action === 'check_manifest' ? '依赖检查完成。' : action === 'preview_sync' ? '资源预检完成，可查看安装计划。' : 'Python 依赖任务已完成并通过验证。'
  }

  private taskPartialMessage(action: AsyncPythonAction): string {
    return action === 'preview_sync' ? '资源预检完成，但有资源不可用；可单独重试失败包。' : '任务部分完成；已成功安装的依赖已保留，失败包可单独重试。'
  }

  private async cancelTask(input: PythonEnvironmentRequest): Promise<Record<string, unknown>> {
    if (!input.taskId || !/^[a-f0-9-]{36}$/u.test(input.taskId)) throw new Error('Invalid Python task id')
    const task = await this.readTask(input.taskId)
    if (!task) throw new Error('Python task not found.')
    if (this.isTerminal(task.state)) return { requestId: input.requestId, taskId: task.taskId, queued: false, task }
    // Stop the updater worker when the task owns it. The queue catch path sees
    // the durable cancelled state and will not overwrite it with a generic
    // failure after the child exits.
    this.updater.pause()
    const cancelled = await this.updateTask(task.taskId, { state: 'cancelled', stage: 'cancelled', message: '任务已取消；已安装的依赖保持不变。', error: undefined })
    if (!cancelled) throw new Error('Python task could not be cancelled.')
    const receiptPath = join(this.controlRoot(), 'requests', `${task.requestId}.json`)
    const receipt = await readFile(receiptPath, 'utf8').then(text => JSON.parse(text) as PythonJobReceipt, () => undefined)
    if (receipt) await this.writeJsonAtomic(receiptPath, { ...receipt, state: 'cancelled', taskId: task.taskId })
    await this.log(input, 'cancelled', { taskId: task.taskId })
    return { requestId: input.requestId, taskId: task.taskId, queued: false, task: cancelled }
  }

  private async executeTask(input: PythonEnvironmentRequest, taskId: string): Promise<Record<string, unknown>> {
    const report: ReportPythonSyncProgress = progress => this.reportTask(taskId, progress)
    const layer = input.layer ?? 'science'
    if ((input.action === 'sync' || input.action === 'install_package') && input.confirm !== true) throw new Error('CONFIRMATION_REQUIRED: 一键同步需要显式确认。')
    await report({ stage: 'waiting-runtime', message: '等待基础 Python 环境就绪。' })
    const runtime = await (this.updater as PythonUpdaterService & { ensureReady?: () => Promise<McpEnvironmentStatus> }).ensureReady?.()
    if (runtime && runtime.phase !== 'ready' && runtime.phase !== 'manual') throw new Error(runtime.lastUpdateError ?? runtime.message ?? '共享 Python 尚未就绪。')
    const savedTask = await this.readTask(taskId)
    const verifyCompletedLayer = async (underlyingTaskId: string, resumed: boolean, planId?: string) => {
      await this.waitForInstall(underlyingTaskId, taskId, layer, input.capabilityId, report)
      const knownFailures = planId && this.sync.installFailures ? await this.sync.installFailures(planId) : []
      const verification = this.sync.verifyInstalled
        ? await this.sync.verifyInstalled(layer, input.capabilityId, report, knownFailures) as Record<string, unknown>
        : undefined
      const unresolved = verification ? Number(verification.unresolvedPackageCount ?? verification.pendingPackageCount ?? 0) : 0
      if (verification && unresolved > 0 && layer === 'core') {
        throw new Error(`安装后仍有 ${verification.pendingPackageCount} 个依赖未达到签名清单版本；请查看失败包日志后重试。`)
      }
      if (layer === 'core') {
        const pythonCoreInfo = (this.updater as PythonUpdaterService & { pythonCoreInfo?: () => Promise<McpPythonInfo> }).pythonCoreInfo
        if (typeof pythonCoreInfo === 'function') {
          const core = await pythonCoreInfo.call(this.updater)
          await this.persistRuntimeSummary(core)
          if (!core.ready || core.coreReady !== true) {
            throw new Error(`基础依赖安装后仍未通过核验：${(core.missingCorePackages ?? []).slice(0, 8).join('、') || core.message || '核心依赖状态不完整'}`)
          }
        }
      }
      const partial = layer !== 'core' && (knownFailures.length > 0 || unresolved > 0)
      return { taskId: underlyingTaskId, underlyingTaskId, layer, capabilityId: input.capabilityId, verification, ...(knownFailures.length ? { skippedPackages: knownFailures } : {}), ...(partial ? { partial: true } : {}), ...(resumed ? { resumed: true } : {}) }
    }
    // If shutdown happened after the package transaction started, continue
    // observing that exact durable updater job. Re-running check/preview/apply
    // here could create a second plan while the original transaction resumes.
    if (input.action === 'sync' && layer === 'core' && savedTask?.underlyingTaskId) {
      await report({ stage: 'installing', message: '正在续接原有核心依赖安装事务；保留已完成包和日志。', progress: savedTask.progress, completedPackages: savedTask.completedPackages, totalPackages: savedTask.totalPackages, currentPackage: savedTask.currentPackage })
      return verifyCompletedLayer(savedTask.underlyingTaskId, true)
    }
    if (input.action === 'check_manifest') {
      const manifest = await this.sync.checkManifest(layer, input.capabilityId, report) as Record<string, unknown>
      return { manifest }
    }
    if (input.action === 'preview_sync') {
      await this.sync.checkManifest(layer, input.capabilityId, report)
      const plan = await this.sync.previewSync(layer, input.capabilityId, taskId, report) as Record<string, unknown>
      return { plan }
    }
    if (input.action === 'install_package') {
      const packageUpdater = this.updater as PythonUpdaterService & {
        previewPackages?: (specs: string[]) => Promise<{ planId: string; changes?: Array<{ name: string; from?: string; to: string }>; error?: string }>
        pythonPackages?: (names: string[]) => Promise<McpPythonInfo>
      }
      const spec = input.packageSpec!.trim()
      if (!packageUpdater.previewPackages) throw new Error('当前 Python updater 不支持单包版本安装。')
      await report({ stage: 'package-preflight', progress: 10, message: `正在预检单包版本：${spec}。`, currentPackage: spec })
      const plan = await packageUpdater.previewPackages([spec]) as { planId: string; changes?: Array<{ name: string; from?: string; to: string }>; error?: string }
      if (plan.error) throw new Error(`单包版本预检失败：${plan.error}`)
      if (!plan.planId) throw new Error('单包预检未生成有效安装计划。')
      if (!plan.changes?.length) return { upToDate: true, packageSpec: spec, changes: [] }
      const queued = await packageUpdater.applyPackagePlan(plan.planId)
      if (!queued.taskId) throw new Error('单包安装没有启动可追踪任务。')
      this.activeUnderlyingTaskId = queued.taskId
      await this.updateTask(taskId, { underlyingTaskId: queued.taskId, stage: 'installing', message: `正在单独安装 ${spec}。` })
      await report({ stage: 'installing', message: `单包安装任务已持久化：${spec}。`, currentPackage: spec })
      await this.waitForInstall(queued.taskId, taskId, layer, undefined, report)
      const expected = plan.changes ?? []
      const installed = packageUpdater.pythonPackages ? await packageUpdater.pythonPackages(expected.map(change => change.name)) : await packageUpdater.pythonInfo()
      const actual = new Map(installed.packages.map(pkg => [pkg.name.toLowerCase().replace(/[-_.]+/gu, '-'), pkg.version]))
      const missed = expected.filter(change => actual.get(change.name.toLowerCase().replace(/[-_.]+/gu, '-')) !== change.to)
      if (missed.length) throw new Error(`单包安装结束后版本核验未通过：${missed.map(change => `${change.name}==${change.to}`).join('、')}`)
      return { taskId: queued.taskId, underlyingTaskId: queued.taskId, packageSpec: spec, changes: expected, installed: expected.length }
    }
    let planId = input.planId
    let plan: { planId: string; changes: Array<{ name: string; from?: string; to: string }>; preparationFailures?: Array<{ name: string; version: string; message: string }>; error?: string; manifestRevision: string } | undefined
    let manifestRevision = input.manifestRevision
    let changed: ManifestSummary | undefined
    if (input.action === 'sync') {
      if (layer !== 'core' && layer !== 'science' && layer !== 'capability') throw new Error('不支持的 Python 依赖层。')
      changed = await this.sync.checkManifest(layer, input.capabilityId, report) as ManifestSummary
    const plan = await this.sync.previewSync(layer, input.capabilityId, taskId, report) as { planId: string; changes: Array<{ name: string; from?: string; to: string }>; preparationFailures?: Array<{ name: string; version: string; message: string }>; error?: string; manifestRevision: string }
      if (plan.error) throw new Error(`依赖清单已改变，无法同步：${plan.error}`)
      if (!plan.changes.length) return { upToDate: true, manifestRevision: plan.manifestRevision, changes: [] }
      planId = plan.planId
      manifestRevision = plan.manifestRevision
    }
    if (!planId || !manifestRevision || input.confirm !== true) throw new Error('CONFIRMATION_REQUIRED: review and approve the concrete dependency plan first.')
    await report({ stage: 'install-queued', message: '安装计划已通过签名、哈希和资源检查，正在启动依赖安装。' })
    const applied = await this.sync.applySync(planId, manifestRevision, true) as { taskId?: string; partial?: boolean; skippedPackages?: Array<{ name: string; version: string; message: string }>; noInstallablePackages?: boolean }
    if (!applied.taskId) return { ...applied, layer, manifestRevision, changes: plan?.changes ?? [], partial: applied.partial === true }
    if (typeof applied.taskId !== 'string') throw new Error('Python 安装任务未返回有效任务 ID。')
    this.activeUnderlyingTaskId = applied.taskId
    await this.updateTask(taskId, { underlyingTaskId: applied.taskId, stage: 'installing', message: '依赖安装任务已持久化，正在下载并安装。' })
    await report({ stage: 'installing', message: '正在逐包下载并安装依赖；关闭桌面后可查看已保存的最后状态。' })
    const completed = await verifyCompletedLayer(applied.taskId, false, planId)
    return { ...completed, manifestRevision, previousRevision: changed?.revision, changes: changed?.changes }
  }

  private async waitForInstall(underlyingId: string, taskId: string, layer: PythonDependencyLayer, capabilityId: string | undefined, report: ReportPythonSyncProgress): Promise<void> {
    const taskStatus = (this.updater as PythonUpdaterService & { taskStatus?: (id?: string) => Promise<unknown> }).taskStatus
    if (typeof taskStatus !== 'function') throw new Error('当前 Python updater 不支持持久安装任务状态，不能确认依赖安装是否完成。')
    let missingSince: number | undefined
    for (;;) {
      const job = await taskStatus.call(this.updater, underlyingId).catch(error => ({ state: 'error', error: error instanceof Error ? error.message : String(error) })) as { state?: string; error?: string }
      if (job.state === 'failed' || job.state === 'paused' || job.state === 'error') throw new Error(job.error ?? `Python 安装任务状态异常：${job.state}`)
      if (job.state === 'complete' || job.state === 'succeeded') break
      if (!job.state) {
        missingSince ??= Date.now()
        if (Date.now() - missingSince > 30_000) throw new Error('等待 Python 安装任务时未找到持久任务记录。')
      } else missingSince = undefined
      const live = this.updater.current()
      const update = live.updateJob
      if (update?.taskId === underlyingId) {
        await report({ stage: update.stage || live.phase, message: live.message ?? '正在安装 Python 依赖。', progress: live.progress, completedPackages: update.completedFiles, totalPackages: update.totalFiles, currentPackage: update.targetVersion, logLine: update.logLines?.at(-1) })
      }
      await new Promise(resolve => setTimeout(resolve, 700))
    }
    await report({ stage: 'verifying', message: '安装进程已结束，正在核对实际环境中的依赖版本。', progress: 97 })
  }

  private async log(input: PythonEnvironmentRequest, status: string, extra: Record<string, unknown> = {}): Promise<void> {
    await mkdir(join(this.controlRoot(), 'logs'), { recursive: true })
    await appendFile(join(this.controlRoot(), 'logs', 'environment-events.jsonl'), JSON.stringify({ requestId: input.requestId, action: input.action, status, createdAt: new Date().toISOString(), ...extra }, (_key, value) => typeof value === 'string' ? this.safeTaskText(value) : value) + '\n')
  }

  private async events(): Promise<unknown[]> {
    const file = await open(join(this.controlRoot(), 'logs', 'environment-events.jsonl'), 'r').catch(() => undefined)
    if (!file) return []
    try {
      const { size } = await file.stat(); const length = Math.min(size, 64 * 1024)
      const buffer = Buffer.alloc(length); await file.read(buffer, 0, length, size - length)
      const lines = buffer.toString('utf8').split('\n')
      if (size > length) lines.shift()
      return lines.filter(Boolean).slice(-50).flatMap(line => { try { return [JSON.parse(line)] } catch { return [] } }).reverse()
    } finally { await file.close() }
  }

  private async auditedExecute(input: PythonEnvironmentRequest): Promise<Record<string, unknown>> {
    try { return await this.execute(input) }
    catch (error) { await this.log(input, 'failed', { message: error instanceof Error ? error.message : String(error) }); throw error }
  }

  private async execute(input: PythonEnvironmentRequest): Promise<Record<string, unknown>> {
    let result: Record<string, unknown>
    switch (input.action) {
      case 'status': {
        const readOptional = async (path: string) => readFile(path, 'utf8').then(JSON.parse, () => undefined)
        const current = await readOptional(join(this.root, 'current.json'))
        const runtimeBase = typeof current?.runtimeRoot === 'string' ? current.runtimeRoot : current?.root
        const runtimeMetadataPath = typeof runtimeBase === 'string' && current.health === 'ready'
          ? join(runtimeBase, this.canonicalRuntimeRoot !== undefined ? 'runtime.json' : current.generation === true ? 'Python/runtime.json' : 'runtime.json')
          : undefined
        const runtime = runtimeMetadataPath ? await readOptional(runtimeMetadataPath) : undefined
        const location = await readOptional(this.locationPath)
        let savedRuntimeRoot: string | undefined
        if (typeof location?.runtimeRoot === 'string') {
          try { savedRuntimeRoot = normalizePythonRuntimePath(location.runtimeRoot) } catch { /* use the safe derived default */ }
        }
        // The location pointer is the user-facing source of truth, including
        // before a restart activates a newly selected directory. Never derive
        // the displayed path from `current.json`/runtime.json: old releases
        // stored those records under a Roaming slot, and showing that path was
        // the exact inconsistency that made a failed migration look active.
        // The signed installer will rebuild the selected stable directory.
        const configuredRuntimeRoot = savedRuntimeRoot ?? this.canonicalRuntimeRoot ?? join(dirname(this.root), 'Python')
        const activeRuntime = runtime && typeof runtime.rootPath === 'string'
          && (resolve(runtime.rootPath) === resolve(configuredRuntimeRoot) || (current.generation === true && typeof current.root === 'string' && resolve(runtime.rootPath) === resolve(current.root, 'Python') && !relative(join(this.root, 'slots'), current.root).startsWith('..')))
          ? runtime
          : undefined
        // Status is intentionally a local snapshot read. It must never rescan
        // hundreds of Python packages, resolve pip dependencies, or contact a
        // feed: the renderer polls this path while work is in progress.
        const pythonSummary = await readOptional(join(this.controlRoot(), 'python-summary.json'))
        const dependencyStatus = await readOptional(join(this.root, 'dependency-sync', 'status.json'))
        const task = await this.recoverLatestTask()
        if (task) await this.taskWrites.get(task.taskId)?.catch(() => undefined)
        const stableRoot = configuredRuntimeRoot
        const coreReady = pythonSummary?.coreReady === true
        const corePackageCount = pythonSummary?.corePackageCount ?? 0
        const sciencePackageCount = dependencyStatus?.layer === 'science' ? dependencyStatus.packageCount ?? 0 : 0
        const scienceInstalledPackageCount = dependencyStatus?.layer === 'science' ? dependencyStatus.installedPackageCount ?? 0 : 0
        const scienceState = dependencyStatus?.layer === 'science'
          ? dependencyStatus.scienceInstalled ? 'installed' : dependencyStatus.resourceAvailability?.available === false ? 'error' : 'available'
          : 'not-installed'
        const liveStatus = this.updater.current()
        const taskIsWorking = task?.state === 'queued' || task?.state === 'running'
        const restoredStatus = taskIsWorking ? {
          ...liveStatus,
          phase: (task.stage.includes('install') || task.stage === 'verifying' ? 'installing' : 'checking') as McpEnvironmentStatus['phase'],
          ...(task.progress === undefined ? { progress: undefined } : { progress: task.progress }),
          message: task.message,
          updateJob: {
            taskId: this.activeUnderlyingTaskId ?? task.underlyingTaskId ?? task.taskId, kind: task.action, stage: task.stage, canPause: false,
            ...(task.completedPackages === undefined ? {} : { completedFiles: task.completedPackages }),
            ...(task.totalPackages === undefined ? {} : { totalFiles: task.totalPackages }),
            ...(task.currentPackage ? { targetVersion: task.currentPackage } : {}),
            logLines: task.logLines,
          },
        } : task?.state === 'interrupted' && ['checking', 'downloading', 'verifying', 'installing'].includes(liveStatus.phase)
          ? { ...liveStatus, phase: activeRuntime ? 'ready' as const : 'failed' as const, progress: undefined, message: task.message, updateJob: undefined }
          : liveStatus
        result = {
          status: restoredStatus, task, runtime: activeRuntime, runtimeRoot: stableRoot,
          inventory: {
            ready: pythonSummary?.ready === true || activeRuntime !== undefined,
            version: pythonSummary?.version ?? activeRuntime?.pythonVersion,
            runtimeRoot: stableRoot,
            executable: pythonSummary?.executable ?? activeRuntime?.executablePath,
            sitePackages: pythonSummary?.sitePackages ?? activeRuntime?.sitePackagesPath,
            snapshotId: activeRuntime?.rootPath,
            officialPackageCount: pythonSummary?.officialPackageCount ?? corePackageCount,
            coreReady, corePackageCount, sciencePackageCount, scienceInstalledPackageCount,
            missingCorePackages: pythonSummary?.missingCorePackages ?? [],
            ...(pythonSummary?.packageCount === undefined ? {} : { packageCount: pythonSummary.packageCount }),
            inventoryComplete: false, packages: [],
          },
          layers: { bootstrap: activeRuntime ? 'ready' : 'missing', core: activeRuntime ? coreReady ? 'ready' : pythonSummary ? 'error' : 'missing' : 'missing', science: scienceState },
          coreReady, corePackageCount, sciencePackageCount, scienceInstalledPackageCount,
          missingCorePackages: pythonSummary?.missingCorePackages ?? [],
          resourceAvailability: dependencyStatus?.resourceAvailability, lastSyncError: dependencyStatus?.lastSyncError,
          dependencies: dependencyStatus, events: await this.events(),
        }; break
      }
      case 'list_packages': {
        // Opening Settings and refreshing inventory are read-only. A thin
        // installer reports an empty inventory until a Python operation or
        // explicit install requests the signed runtime.
        const inventory = await this.updater.pythonInfo()
        await this.persistRuntimeSummary(inventory)
        const manifest = await readFile(join(this.root, 'dependency-sync', 'manifest.json'), 'utf8').then(text => parsePythonDependencyManifest(JSON.parse(text), MCP_ENVIRONMENT_KEYRING)).catch(() => undefined)
        const normalize = (name: string) => name.toLowerCase().replace(/[-_.]+/gu, '-')
        const packages = new Map(manifest?.packages.map(pkg => [normalize(pkg.name), pkg]))
        // `sha256` is optional provenance now, so it is only carried through
        // when the signed manifest actually names one for this version.
        result = { inventory: { ...inventory, packages: inventory.packages.map(pkg => { const locked = packages.get(normalize(pkg.name)); return { ...pkg, capabilities: locked?.capabilities ?? [], ...(locked?.version === pkg.version && locked.sha256 ? { sha256: locked.sha256 } : {}) } }) } }; break
      }
      case 'check_manifest': await this.ensureRuntimeReady(); result = { manifest: await this.sync.checkManifest(input.layer ?? 'science', input.capabilityId) }; break
      case 'preview_sync': await this.ensureRuntimeReady(); result = { plan: await this.sync.previewSync(input.layer ?? 'science', input.capabilityId) }; break
      case 'sync': {
        // One-click synchronization runs after its durable queue receipt is
        // returned, so manifest resolution cannot make the UI appear unresponsive.
        if (input.confirm !== true) throw new Error('CONFIRMATION_REQUIRED: 一键同步需要显式确认。')
        await this.ensureRuntimeReady()
        const layer = input.layer ?? 'science'
        if (layer !== 'core' && layer !== 'science' && layer !== 'capability') throw new Error('不支持的 Python 依赖层。')
        const changed = await this.sync.checkManifest(layer, input.capabilityId) as ManifestSummary | undefined
        const plan = await this.sync.previewSync(layer, input.capabilityId) as { planId: string; changes: Array<{ name: string; from?: string; to: string }>; error?: string; manifestRevision: string }
        if (plan.error) throw new Error(`依赖清单已改变，无法同步：${plan.error}`)
        if (!plan.changes.length) { result = { upToDate: true, manifestRevision: plan.manifestRevision, changes: [] }; break }
        const task = await this.sync.applySync(plan.planId, plan.manifestRevision, true) as Record<string, unknown>
        result = { ...task, layer, capabilityId: input.capabilityId, manifestRevision: plan.manifestRevision, changes: plan.changes, previousRevision: changed?.revision }
        break
      }
      case 'apply_sync': {
        if (!input.planId || !input.manifestRevision || input.confirm !== true) throw new Error('CONFIRMATION_REQUIRED: review and approve the concrete dependency plan first.')
        await this.ensureRuntimeReady()
        result = await this.sync.applySync(input.planId, input.manifestRevision, true) as Record<string, unknown>
        break
      }
      case 'rollback': {
        if (input.confirm !== true) throw new Error('CONFIRMATION_REQUIRED: approve restoring the previous environment first.')
        result = this.updater.rollback(); break
      }
      case 'configure': {
        const configure = async () => {
          const previous = await this.settings()
          if (input.runtimeRoot !== undefined) {
            const selected = normalizePythonRuntimePath(input.runtimeRoot)
            await assertWritablePythonRuntimePath(selected, this.applicationInstallRoot)
            await mkdir(dirname(this.locationPath), { recursive: true })
            const temporaryLocation = `${this.locationPath}.${randomUUID()}.tmp`
            try {
              await writeFile(temporaryLocation, `${JSON.stringify({ runtimeRoot: selected })}\n`, { flag: 'wx' })
              await renameFile(temporaryLocation, this.locationPath)
            } finally {
              await rm(temporaryLocation, { force: true }).catch(() => undefined)
            }
            // The updater is bound to its root for the lifetime of the Host.
            // Return a restart requirement instead of pretending the path has
            // changed while an active worker still owns the old environment.
            return { ...previous, runtimeRoot: selected, restartRequired: true }
          }
          if (input.mirrorUrl === undefined) return { ...previous }
          if (input.expectedRevision !== previous.revision) throw new Error(`REVISION_CONFLICT: current revision is ${previous.revision}`)
          const url = new URL(input.mirrorUrl)
          if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Mirror must be an HTTPS index without credentials, query or fragment.')
          const next = { revision: previous.revision + 1, mirrorUrl: url.href.replace(/\/$/u, '') }
          await mkdir(this.controlRoot(), { recursive: true })
          const temp = join(this.controlRoot(), `settings-${randomUUID()}.tmp`)
          try { await writeFile(temp, `${JSON.stringify(next)}\n`, { flag: 'wx' }); await renameFile(temp, join(this.controlRoot(), 'settings.json')) }
          finally { await rm(temp, { force: true }).catch(() => undefined) }
          return next
        }
        const work = this.operation.catch(() => undefined).then(configure)
        this.operation = work
        const saved = await work
        // The panel renders the catalogue rather than hard-coding one URL, so a
        // mirror can be switched without a new build. The saved index is appended
        // when it is not a preset, so an enterprise mirror stays selectable.
        result = { ...saved, mirrorPresets: mirrorPresets(saved.mirrorUrl), defaultMirrorUrl: DEFAULT_MIRROR_PRESET.indexUrl }; break
      }
      case 'diagnose': {
        const saved = await this.settings()
        result = { ...saved, mirrorPresets: mirrorPresets(saved.mirrorUrl), defaultMirrorUrl: DEFAULT_MIRROR_PRESET.indexUrl, diagnostics: await this.diagnose() }
        break
      }
      default: throw new Error('Unknown Python environment action')
    }
    if (input.action !== 'status' && input.action !== 'list_packages') await this.log(input, 'succeeded', {
      ...(typeof result.taskId === 'string' ? { taskId: result.taskId } : {}),
      ...(result.upToDate === true ? { upToDate: true } : {}),
    })
    return { requestId: input.requestId, ...result }
  }

  private async diagnose(): Promise<Record<string, unknown>> {
    const checkedAt = new Date().toISOString()
    const pending = { status: 'unknown' }
    const unavailable = { checkedAt, python: pending, pip: pending, tls: pending, mirror: pending }
    let current: { root: string; runtimeRoot?: string; generation?: boolean; manifest: { python: { relativeExecutable: string; relativeSitePackages: string } }; health: string }
    try { current = JSON.parse(await readFile(join(this.root, 'current.json'), 'utf8')) }
    catch { return unavailable }
    if (current.health !== 'ready') return unavailable
    const root = await realpath(current.root).catch(() => resolve(current.root))
    const stablePath = current.runtimeRoot
    const productRoot = this.canonicalRuntimeRoot !== undefined || (current.generation !== true && basename(resolve(this.root)).toLowerCase() === 'zerowall-python')
    const expectedRuntimeRoot = this.canonicalRuntimeRoot ?? dirname(resolve(this.root))
    if (productRoot && (typeof stablePath !== 'string' || resolve(stablePath) !== expectedRuntimeRoot || current.manifest.python.relativeExecutable !== 'Python/python.exe' || current.manifest.python.relativeSitePackages !== 'Python/Lib/site-packages')) {
      // A legacy slot/profile is not a usable shared runtime.  Diagnostics
      // must remain readable in this state and must never turn the harmless
      // legacy record into a hard "migration" gate.  The updater will replace
      // it from the signed Python archive on the next bootstrap attempt.
      return {
        checkedAt,
        python: { status: 'pending', message: '检测到旧 Python profile；不会迁移其依赖，将直接使用安装包内的签名 Python 重建共享环境。' },
        pip: pending,
        tls: pending,
        mirror: pending,
      }
    }
    const runtimeRoot = productRoot ? await realpath(expectedRuntimeRoot).catch(() => expectedRuntimeRoot) : typeof stablePath === 'string' ? await realpath(stablePath).catch(() => resolve(stablePath)) : root
    const relativeExecutable = this.canonicalRuntimeRoot !== undefined ? 'python.exe' : productRoot || current.runtimeRoot ? 'Python/python.exe' : current.manifest.python.relativeExecutable
    const relativeSitePackages = this.canonicalRuntimeRoot !== undefined ? 'Lib/site-packages' : productRoot || current.runtimeRoot ? 'Python/Lib/site-packages' : current.manifest.python.relativeSitePackages
    const executable = resolve(runtimeRoot, relativeExecutable)
    const rel = relative(runtimeRoot, executable)
    if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('Unsafe managed Python executable')
    const sitePackages = resolve(runtimeRoot, relativeSitePackages)
    const { mirrorUrl } = await this.settings()
    // The diagnostics import `requests` from the managed snapshot, not from the
    // interpreter's own path, so the probe sees what installed packages see.
    const paths = [sitePackages].filter(path => { const inside = relative(runtimeRoot, path); return !inside.startsWith('..') && !isAbsolute(inside) })
    // pip's vendored certificate bundle is what `pip install` trusts; a stale
    // inherited SSL_CERT_FILE would fail pip while `requests` still succeeds, so
    // a TLS failure must be reported per consumer rather than once.
    const code = `import json,sys,os,importlib.util,subprocess
paths=json.loads(sys.argv[2]); ca=sys.argv[3]; url=sys.argv[1]; probe=sys.argv[4]
sys.path[:0]=paths
result={'python':{'status':'available','message':sys.version.split()[0]},'pip':{'status':'unknown','message':''},'tls':{'status':'unknown','caPath':ca,'message':'Node 受信根证书，已注入 pip 与 requests'},'mirror':{'status':'unknown','message':''}}
PIP="import sys,runpy;sys.argv=['pip','--isolated','--disable-pip-version-check','--no-input','--timeout','30','--retries','2','check'];runpy.run_module('pip',run_name='__main__')"
try:
 p=subprocess.run([sys.executable,'-I','-B','-c',PIP],capture_output=True,text=True,timeout=60,env={**os.environ,'SSL_CERT_FILE':ca,'REQUESTS_CA_BUNDLE':ca,'PIP_CONFIG_FILE':os.devnull,'PIP_NO_INPUT':'1','PYTHONNOUSERSITE':'1'})
 out=(p.stdout+p.stderr).strip()
 result['pip']={'status':'available' if p.returncode==0 else 'failed','message':out[-2000:] or 'pip check 通过'}
except Exception as e: result['pip']={'status':'unknown','message':type(e).__name__}
# Probe a real project page, not the index root. Tsinghua answers a bare GET to
# /simple with 403 (it wants a project path), so the old raise_for_status() turned
# a healthy mirror into "失败" while TLS and pip both reported success. Any HTTP
# status now proves the mirror answered; only 5xx and transport errors are failures.
try:
 import requests
 r=requests.get(probe,timeout=15,headers={'Accept':'application/vnd.pypi.simple.v1+json, text/html'})
 if r.status_code>=500: result['mirror']={'status':'failed','message':'HTTPS '+str(r.status_code)+' '+probe}
 else: result['mirror']={'status':'available','message':'HTTPS '+str(r.status_code)+' '+probe}
except Exception as e:
 name=type(e).__name__; detail=str(e)
 result['mirror']={'status':'failed','message':(name+': '+detail)[:2000]}
try:
 import pip._vendor.certifi as c
 where=c.where()
 result['tls']={'status':'available' if os.path.isfile(where) else 'failed','caPath':where,'message':('pip vendored CA: '+os.path.basename(where)) if os.path.isfile(where) else 'CA_FILE_MISSING: '+str(where)}
except Exception as e: result['tls']={'status':'failed','caPath':None,'message':type(e).__name__}
print(json.dumps(result,ensure_ascii=False))`
    // The index root answers 403 on a bare GET, so the connectivity probe targets
    // a concrete project page that every PEP 503 index serves.
    const probeUrl = `${mirrorUrl.replace(/\/+$/u, '')}/pip/`
    try {
      // The CA bundle is written by this process; the probe must not inherit a
      // stale path from the parent environment.
      const certificateFile = await publicCAFile()
      const { stdout } = await execute(executable, ['-I', '-B', '-c', code, mirrorUrl, JSON.stringify(paths), certificateFile, probeUrl], { cwd: dirname(executable), windowsHide: true, timeout: 90_000, maxBuffer: 256_000, env: { ...sanitizePythonTlsEnvironment(process.env, certificateFile), PYTHONNOUSERSITE: '1', PIP_CONFIG_FILE: devNull } })
      return { checkedAt, ...JSON.parse(stdout.trim()) }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { ...unavailable, python: { status: 'failed', message: message.slice(-2000) } }
    }
  }
}
