import { fork, spawn, type ChildProcess } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { mkdir, readFile, writeFile, readdir, rename } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import type { McpEnvironmentControllerOptions } from './mcp-environment.js'
import type { McpEnvironmentStatus, McpPythonInfo } from '../shared/contracts.js'

/** Electron owns only this small broker; all environment IO lives in the child. */
export class PythonUpdaterService {
  private child?: ChildProcess
  private status: McpEnvironmentStatus = { phase: 'idle' }
  private requests = new Map<string, { resolve(value: any): void; reject(error: Error): void }>()
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
  constructor(private options: McpEnvironmentControllerOptions) {}
  current(): McpEnvironmentStatus { return this.status }
  private publish(status: McpEnvironmentStatus): void { this.status = status; this.options.publish(status) }
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
      if (message.type === 'status') this.publish({ ...message.status, updateJob: message.status.updateJob ? { ...message.status.updateJob, taskId: this.activeTaskId ?? message.status.updateJob.taskId, kind: this.activeMethod ?? message.status.updateJob.kind, canPause: this.activeMethod === 'initialize' && message.status.phase !== 'verifying' } : undefined })
      else if (message.id) {
        const request = this.requests.get(message.id); this.requests.delete(message.id)
        if (message.error) request?.reject(new Error(message.error)); else request?.resolve(message.result)
      }
    })
    child.on('error', error => { for (const request of this.requests.values()) request.reject(error); this.requests.clear() })
    child.on('exit', () => {
      if (this.child === child) this.child = undefined
      for (const request of this.requests.values()) request.reject(new Error(this.paused ? '更新已暂停。' : '更新子进程已退出；当前环境保留。'))
      this.requests.clear()
    })
    const { publish: _publish, fetcher: _fetcher, healthCheck: _health, ...config } = this.options
    child.send({ type: 'configure', config })
    return child
  }
  private rpc<T>(method: string, args: unknown[] = []): Promise<T> {
    if (this.stopped) return Promise.reject(new Error('软件正在退出。'))
    const id = randomUUID()
    return new Promise((resolve, reject) => {
      this.requests.set(id, { resolve, reject })
      this.connect().send({ id, method, args })
    })
  }
  pythonInfo(query = ''): Promise<McpPythonInfo> { return this.rpc('pythonInfo', [query]) }
  async taskStatus(taskId?: string): Promise<unknown> {
    if (!taskId) return this.current()
    if (!/^[a-f0-9-]{36}$/u.test(taskId)) throw new Error('Invalid task id')
    const job = JSON.parse(await readFile(join(this.options.root, 'jobs', `${taskId}.json`), 'utf8'))
    return { ...job, ...(this.status.updateJob?.taskId === taskId ? { progress: this.status.progress, message: this.status.message, error: this.status.lastUpdateError } : {}) }
  }
  previewUninstall(names: string[]): Promise<unknown> { return this.rpc('previewUninstall', [names]) }
  checkPythonPackageUpdates(names: string[] = []): Promise<McpPythonInfo> { return this.rpc('checkPythonPackageUpdates', [names]) }
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
        this.scheduled.delete(taskId); if (method === 'initialize') this.queuedUpdate = false
        this.publish({ ...this.status, lastUpdateError: `无法保存更新任务：${String(error)}` }); return
      }
      if (this.stopped || this.paused) { this.interrupted.set(taskId, { method, args }); this.scheduled.delete(taskId); if (method === 'initialize') this.queuedUpdate = false; return }
      this.busy = true
      this.activeMethod = method; this.activeTaskId = taskId
      this.publish({ ...this.status, phase: 'checking', lastUpdateError: undefined, progress: 0, updateJob: { taskId, kind: method, stage: 'checking', canPause: method === 'initialize' }, message: '后台任务已启动' })
      try {
        await save('running')
        const result = await this.rpc<any>(method, args)
        const info = result?.packages ? result : await this.pythonInfo()
        const next = await this.rpc<McpEnvironmentStatus>('localStatus')
        this.publish({ ...next, updated: !next.lastUpdateError && (method !== 'initialize' || result?.updated === true), packageInventory: info, updateJob: { taskId, kind: method, stage: next.lastUpdateError ? 'failed' : 'ready', canPause: false } })
        await save(next.lastUpdateError ? 'failed' : 'complete')
      } catch (error) {
        if (this.paused || this.stopped) this.interrupted.set(taskId, { method, args })
        await save(this.paused || this.stopped ? 'queued' : 'failed', String(error)).catch(() => undefined)
        this.publish({ ...this.status, phase: this.paused ? 'paused' : this.status.activeEnvironment ? 'ready' : 'failed', lastUpdateError: this.paused ? undefined : String(error), updateJob: { taskId, kind: method, stage: this.paused ? 'paused' : 'failed', canPause: false } })
      } finally { this.scheduled.delete(taskId); this.busy = false; this.activeMethod = undefined; this.activeTaskId = undefined; if (method === 'initialize') this.queuedUpdate = false; if (this.resumeRequested && !this.stopped) { this.resumeRequested = false; this.updateForUser() } }
    })
    return { taskId }
  }
  updateForUser(): McpEnvironmentStatus {
    if (this.paused && this.busy) { this.resumeRequested = true; return this.status }
    this.paused = false
    if (this.interrupted.size) {
      for (const [id, job] of this.interrupted) { if (job.method === 'initialize') this.queuedUpdate = true; this.enqueue(job.method, job.args, id) }
      this.interrupted.clear()
    } else if (!this.queuedUpdate) { this.queuedUpdate = true; this.enqueue('initialize') }
    return this.status
  }
  async autoUpdate(): Promise<McpEnvironmentStatus> {
    if (this.busy || this.paused || this.queuedUpdate) return this.status
    if (!this.restored) {
      this.restored = true
      const directory = join(this.options.root, 'jobs')
      const files = await readdir(directory).catch(() => [])
      const jobs = await Promise.all(files.filter(file => file.endsWith('.json')).map(file => readFile(join(directory, file), 'utf8').then(JSON.parse, () => undefined)))
      const resumable = jobs.filter(job => job && ['queued', 'running'].includes(job.state)).sort((a, b) => a.updatedAt - b.updatedAt)
      for (const job of resumable) { if (job.method === 'initialize') this.queuedUpdate = true; this.enqueue(job.method, job.args, job.taskId) }
      if (resumable.length) return this.status
    }
    this.queuedUpdate = true; this.enqueue('initialize')
    return this.status
  }
  retry(): McpEnvironmentStatus { return this.updateForUser() }
  pause(): McpEnvironmentStatus {
    if (this.status.updateJob?.canPause === false) return this.status
    this.paused = true; this.killWorker()
    this.publish({ ...this.status, phase: 'paused', message: '已暂停，下次继续时复用下载断点。' })
    return this.status
  }
  private killWorker(): void {
    if (!this.child?.pid) return
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(this.child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' })
    else this.child.kill()
  }
  stop(): void { this.stopped = true; this.killWorker() }
  installPythonPackage(spec: string): { taskId: string } { return this.enqueue('installPythonPackage', [spec]) }
  updatePythonPackages(names: string[]): { taskId: string } { return this.enqueue('updatePythonPackages', [names]) }
  selectManual(root: string): { taskId: string } { return this.enqueue('selectManual', [root]) }
  rollback(): { taskId: string } { return this.enqueue('rollback') }
  previewPackages(names: string[], profile?: string): Promise<unknown> { return this.rpc('previewPackages', [names, profile]) }
  applyPackagePlan(planId: string): { taskId: string } { return this.enqueue('applyPackagePlan', [planId]) }
}
