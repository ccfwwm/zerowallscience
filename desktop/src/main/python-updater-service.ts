import { fork, spawn, type ChildProcess } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { mkdir, readFile, writeFile, readdir, rename } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import type { McpEnvironmentControllerOptions } from './mcp-environment.js'
import type { McpEnvironmentStatus, McpPythonInfo } from '../shared/contracts.js'
import type { PythonDependencyManifest } from './python-dependency-manifest.js'
import type { StoredPackagePlan } from './python-packages.js'
import type { PythonEnvironmentRequest } from './python-environment-api.js'

/** Electron owns only this small broker; all environment IO lives in the child. */
export class PythonUpdaterService {
  private child?: ChildProcess
  private status: McpEnvironmentStatus = { phase: 'idle' }
  private requests = new Map<string, { child: ChildProcess; resolve(value: any): void; reject(error: Error): void }>()
  private queue: Promise<unknown> = Promise.resolve()
  private busy = false
  private queuedUpdate = false
  private activeMethod?: string
  private activeTaskId?: string
  private paused = false
  private stopped = false
  private restored = false
  private scheduled = new Set<string>()
  private interrupted = new Map<string, { method: string; args: unknown[] }>()
  private resumeRequested = false
  private environmentHandler?: (request: PythonEnvironmentRequest) => Promise<Record<string, unknown>>
  constructor(private options: McpEnvironmentControllerOptions) {}
  setEnvironmentHandler(handler: (request: PythonEnvironmentRequest) => Promise<Record<string, unknown>>): void { this.environmentHandler = handler }
  environmentRequest(request: PythonEnvironmentRequest): Promise<Record<string, unknown>> {
    if (!this.environmentHandler) return Promise.reject(new Error('PYTHON_MANAGER_UNAVAILABLE: environment API is not ready.'))
    return this.environmentHandler(request)
  }
  current(): McpEnvironmentStatus { return this.status }
  /**
   * Observe every published status, including the ones that only move progress.
   * The worker's `configure` message and the `while` loop here must agree on the
   * shape of `status`, so this stays a single funnel rather than a second source.
   */
  private progressWatchers: Array<(status: McpEnvironmentStatus) => void> = []
  watchProgress(listener: (status: McpEnvironmentStatus) => void): void { this.progressWatchers.push(listener) }
  private publish(status: McpEnvironmentStatus): void {
    this.status = status
    this.options.publish(status)
    for (const listener of this.progressWatchers) { try { listener(status) } catch { /* a logger must not break the updater */ } }
  }
  private connect(): ChildProcess {
    if (this.child) return this.child
    // Loading a worker from the full application ASAR also loads its large file
    // index. The tiny updater and ZIP reader are packaged outside that archive.
    const worker = fileURLToPath(new URL('./python-updater-worker.js', import.meta.url)).replace(/app\.asar([\\/])/u, 'app.asar.unpacked$1')
    const child = fork(worker, [], {
      execPath: process.execPath, execArgv: ['--max-old-space-size=128', '--max-semi-space-size=8'],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    })
    this.child = child
    child.stderr?.resume()
    child.on('message', (message: any) => {
      // A terminated worker may still flush IPC while its replacement handles
      // read-only inventory calls. Its status must not overwrite the new state.
      if (message.type === 'status' && this.child === child && !this.paused && !this.stopped) this.publish({ ...message.status, updateJob: message.status.updateJob ? { ...message.status.updateJob, taskId: this.activeTaskId ?? message.status.updateJob.taskId, kind: this.activeMethod ?? message.status.updateJob.kind, canPause: this.activeMethod === 'initialize' && message.status.phase !== 'verifying' } : undefined })
      else if (message.id) {
        const request = this.requests.get(message.id)
        if (request?.child !== child) return
        this.requests.delete(message.id)
        if (message.error) request?.reject(new Error(message.error)); else request?.resolve(message.result)
      }
    })
    const rejectRequests = (error: Error) => { for (const [id, request] of this.requests) if (request.child === child) { this.requests.delete(id); request.reject(error) } }
    child.on('error', error => { if (this.child === child) this.child = undefined; rejectRequests(error) })
    child.on('exit', () => {
      if (this.child === child) this.child = undefined
      rejectRequests(new Error(this.paused ? '更新已暂停。' : '更新子进程已退出；当前环境保留。'))
    })
    const { publish: _publish, fetcher: _fetcher, healthCheck: _health, ...config } = this.options
    child.send({ type: 'configure', config })
    return child
  }
  private rpc<T>(method: string, args: unknown[] = []): Promise<T> {
    if (this.stopped) return Promise.reject(new Error('软件正在退出。'))
    const id = randomUUID()
    return new Promise((resolve, reject) => {
      const child = this.connect()
      this.requests.set(id, { child, resolve, reject })
      child.send({ id, method, args })
    })
  }
  pythonInfo(query = ''): Promise<McpPythonInfo> { return this.rpc('pythonInfo', [query]) }
  async taskStatus(taskId?: string): Promise<unknown> {
    if (!taskId) return this.current()
    if (!/^[a-f0-9-]{36}$/u.test(taskId)) throw new Error('Invalid task id')
    const job = JSON.parse(await readFile(join(this.options.root, 'jobs', `${taskId}.json`), 'utf8'))
    return { ...job, ...(this.status.updateJob?.taskId === taskId ? { progress: this.status.progress, message: this.status.message, error: this.status.lastUpdateError } : {}) }
  }
  async previewUninstall(names: string[]): Promise<unknown> { await this.ensurePackageRuntime(); return this.rpc('previewUninstall', [names]) }
  async checkPythonPackageUpdates(names: string[] = []): Promise<McpPythonInfo> { await this.ensurePackageRuntime(); return this.rpc('checkPythonPackageUpdates', [names]) }
  checkForUpdates(): Promise<McpEnvironmentStatus> { return this.busy ? Promise.resolve(this.status) : this.rpc('checkForUpdates') }
  private enqueue(method: string, args: unknown[] = [], taskId: string = randomUUID()): { taskId: string } {
    if (this.scheduled.has(taskId)) return { taskId }
    this.scheduled.add(taskId)
    const save = async (state: string, error?: string) => {
      const directory = join(this.options.root, 'jobs'); await mkdir(directory, { recursive: true })
      const destination = join(directory, `${taskId}.json`); const temporary = `${destination}.tmp`
      await writeFile(temporary, JSON.stringify({ taskId, method, args, state, error, updatedAt: Date.now() }))
      await rename(temporary, destination)
    }
    const persisted = save('queued')
    this.queue = this.queue.catch(() => undefined).then(async () => {
      try { await persisted } catch (error) {
        this.scheduled.delete(taskId)
        if (method === 'initialize') this.queuedUpdate = false
        const message = `无法保存更新任务：${error instanceof Error ? error.message : String(error)}`
        // Keep the failure attached to the durable task id that callers may
        // already be waiting on. In particular, first-run bootstrap must not
        // leave ensureReady() polling forever when LocalAppData or a selected
        // runtime drive is unavailable or read-only.
        this.publish({
          ...this.status,
          phase: this.status.activeEnvironment ? 'ready' : 'failed',
          message,
          lastUpdateError: message,
          updateJob: { taskId, kind: method, stage: 'failed', canPause: false },
        })
        return
      }
      if (this.stopped || this.paused) { this.interrupted.set(taskId, { method, args }); await save('paused'); this.scheduled.delete(taskId); if (method === 'initialize') this.queuedUpdate = false; return }
      this.busy = true
      this.activeMethod = method; this.activeTaskId = taskId
      this.publish({ ...this.status, phase: 'checking', lastUpdateError: undefined, progress: 0, updateJob: { taskId, kind: method, stage: 'checking', canPause: method === 'initialize' }, message: '后台任务已启动' })
      try {
        await save('running')
        const result = await this.rpc<any>(method, args)
        if (this.paused || this.stopped) throw new Error('任务已暂停；等待用户继续。')
        const info = result?.packages ? result : await this.pythonInfo()
        const next = await this.rpc<McpEnvironmentStatus>('localStatus')
        if (this.paused || this.stopped) throw new Error('任务已暂停；等待用户继续。')
        const failed = next.phase !== 'ready' && next.phase !== 'manual' || !!next.lastUpdateError
        this.publish({ ...next, updated: !failed && (method !== 'initialize' || result?.updated === true), packageInventory: info, updateJob: { taskId, kind: method, stage: failed ? 'failed' : 'ready', canPause: false } })
        await save(failed ? 'failed' : 'complete', failed ? next.lastUpdateError ?? next.message : undefined)
      } catch (error) {
        if (this.paused || this.stopped) this.interrupted.set(taskId, { method, args })
        const interrupted = this.paused || this.stopped
        await save(interrupted ? 'paused' : 'failed', String(error)).catch(() => undefined)
        this.publish({ ...this.status, phase: interrupted ? 'paused' : this.status.activeEnvironment ? 'ready' : 'failed', lastUpdateError: interrupted ? undefined : String(error), updateJob: { taskId, kind: method, stage: interrupted ? 'paused' : 'failed', canPause: false } })
      } finally { this.scheduled.delete(taskId); this.busy = false; this.activeMethod = undefined; this.activeTaskId = undefined; if (method === 'initialize') this.queuedUpdate = false; if (this.resumeRequested && !this.stopped) { this.resumeRequested = false; this.updateForUser() } }
    })
    return { taskId }
  }
  updateForUser(): McpEnvironmentStatus {
    if (this.paused && this.busy) { this.resumeRequested = true; return this.status }
    this.paused = false
    let taskId: string | undefined
    if (this.interrupted.size) {
      for (const [id, job] of this.interrupted) { if (job.method === 'initialize') this.queuedUpdate = true; this.enqueue(job.method, job.args, id); taskId = id }
      this.interrupted.clear()
    } else if (!this.queuedUpdate) { this.queuedUpdate = true; taskId = randomUUID(); this.enqueue('initialize', [], taskId) }
    if (taskId) this.publish({ ...this.status, phase: 'checking', progress: 0, updateJob: { taskId, kind: 'initialize', stage: 'checking', canPause: true }, message: '后台任务已启动' })
    return this.status
  }
  async autoUpdate(): Promise<McpEnvironmentStatus> {
    if (this.busy || this.paused || this.queuedUpdate || this.stopped) return this.status
    // A first-run install must be driven by the local signed bundle.  The old
    // implementation called only checkForUpdates(), which reported an update
    // but never created the shared Python directory; a following dependency
    // request then tried to use the old Roaming/profile layout.
    let local: McpEnvironmentStatus
    try { local = await this.rpc<McpEnvironmentStatus>('localStatus') }
    catch (error) { local = { phase: 'failed', message: error instanceof Error ? error.message : String(error) } }
    if (this.busy || this.paused || this.queuedUpdate || this.stopped) return this.status
    this.publish(local)
    if (!this.restored) {
      this.restored = true
      const directory = join(this.options.root, 'jobs')
      const files = await readdir(directory).catch(() => [])
      const jobs = await Promise.all(files.filter(file => file.endsWith('.json')).map(file => readFile(join(directory, file), 'utf8').then(JSON.parse, () => undefined)))
      const resumable = jobs.filter(job => job && ['queued', 'running', 'paused'].includes(job.state)).sort((a, b) => a.updatedAt - b.updatedAt)
      for (const job of resumable) this.interrupted.set(job.taskId, { method: job.method, args: job.args })
      if (resumable.length && (local.phase === 'ready' || local.phase === 'manual')) {
        this.paused = true
        this.publish({ ...this.status, phase: 'paused', message: '发现中断的依赖任务，点击继续后恢复；当前环境保持可用。' })
        return this.status
      }
    }
    if (local.phase !== 'ready' && local.phase !== 'manual') {
      // A stale job receipt must not prevent first-run installation. Resume at
      // most the interrupted bootstrap now; dependency jobs remain pending
      // until the signed runtime has actually been installed.
      const pending = [...this.interrupted]
      const bootstrap = pending.find(([, job]) => job.method === 'initialize')
      this.interrupted.clear()
      if (bootstrap) this.interrupted.set(...bootstrap)
      const started = this.updateForUser()
      for (const [id, job] of pending) if (job.method !== 'initialize') this.interrupted.set(id, job)
      const taskId = started.updateJob?.taskId
      return taskId ? await this.waitForTask(taskId) : started
    }
    // Once the bundled base runtime is present, background checks remain
    // read-only and report signed updates for user review.
    return await this.checkForUpdates()
  }

  /**
   * Make a dependency operation safe to call while first-run bootstrap is
   * still running.  The UI can be opened before the delayed startup check has
   * completed; in that window a sync request must wait for the signed base
   * runtime instead of attempting to use a legacy slot/profile.
   */
  async ensureReady(): Promise<McpEnvironmentStatus> {
    if (this.busy && this.activeTaskId) return await this.waitForTask(this.activeTaskId)
    if (this.paused) return this.status
    // `updateForUser()` publishes the durable task id before its queue
    // callback gets a chance to mark the service busy.  A package request can
    // arrive in that small window (for example when the workbench opens while
    // first-run bootstrap is still being scheduled).  Wait for that queued
    // bootstrap instead of treating the old localStatus response as a ready
    // environment and falling through to the legacy-profile error.
    if (this.queuedUpdate && this.status.updateJob?.taskId) {
      return await this.waitForTask(this.status.updateJob.taskId)
    }
    const local = await this.rpc<McpEnvironmentStatus>('localStatus').catch(error => ({ phase: 'failed' as const, message: error instanceof Error ? error.message : String(error) }))
    if (local.phase === 'ready' || local.phase === 'manual') {
      this.publish(local)
      return local
    }
    this.publish(local)
    const started = this.updateForUser()
    const taskId = started.updateJob?.taskId
    return taskId ? await this.waitForTask(taskId) : this.status
  }

  /**
   * All operations that inspect or mutate packages must use the signed base
   * runtime first.  Keeping this gate in the broker means the legacy MCP IPC,
   * the Harness Python broker, and the settings API share exactly the same
   * first-run behavior.
   */
  private async ensurePackageRuntime(): Promise<void> {
    const status = await this.ensureReady()
    if (status.phase !== 'ready' && status.phase !== 'manual') {
      throw new Error(status.lastUpdateError ?? status.message ?? '共享 Python 尚未就绪，请先完成基础环境安装。')
    }
  }

  retry(): McpEnvironmentStatus { return this.updateForUser() }
  pause(): McpEnvironmentStatus {
    if (this.status.updateJob?.canPause === false) return this.status
    this.paused = true; this.resumeRequested = false; this.killWorker()
    this.publish({ ...this.status, phase: 'paused', message: '已暂停，下次继续时复用下载断点。' })
    return this.status
  }
  private killWorker(): void {
    const child = this.child
    if (!child) return
    // Do not reuse a worker after requesting termination. Existing RPCs remain
    // owned by that child until its exit; new read-only calls use a new worker.
    this.child = undefined
    if (!child.pid) return
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' })
    else child.kill()
  }
  private async waitForTask(taskId: string): Promise<McpEnvironmentStatus> {
    while (!this.stopped) {
      const job = await readFile(join(this.options.root, 'jobs', `${taskId}.json`), 'utf8').then(text => JSON.parse(text) as { state?: string }, () => undefined)
      // A resumed task may still have its previous paused receipt while the
      // queue writes the new `queued` state. Do not report that stale receipt
      // as the result of the current bootstrap attempt.
      if (job?.state === 'complete' || job?.state === 'failed' || (job?.state === 'paused' && !this.scheduled.has(taskId))) return this.status
      if (this.status.updateJob?.taskId === taskId && this.status.updateJob.stage === 'failed') return this.status
      await new Promise(resolve => setTimeout(resolve, 400))
    }
    return this.status
  }
  stop(): void { this.stopped = true; this.killWorker() }
  async installPythonPackage(spec: string): Promise<{ taskId: string }> { await this.ensurePackageRuntime(); return this.enqueue('installPythonPackage', [spec]) }
  async updatePythonPackages(names: string[]): Promise<{ taskId: string }> { await this.ensurePackageRuntime(); return this.enqueue('updatePythonPackages', [names]) }
  selectManual(root: string): { taskId: string } { return this.enqueue('selectManual', [root]) }
  rollback(): { taskId: string } { return this.enqueue('rollback') }
  async previewPackages(names: string[]): Promise<unknown> { await this.ensurePackageRuntime(); return this.rpc('previewPackages', [names]) }
  async previewDependencyManifest(manifest: PythonDependencyManifest): Promise<StoredPackagePlan> { await this.ensurePackageRuntime(); return this.rpc('previewDependencyManifest', [manifest]) }
  async applyPackagePlan(planId: string): Promise<{ taskId: string }> { await this.ensurePackageRuntime(); return this.enqueue('applyPackagePlan', [planId]) }
}
