import { fork, type ChildProcess } from 'node:child_process'
import { createHash, randomUUID, verify } from 'node:crypto'
import { lstat, readFile, realpath, readdir } from 'node:fs/promises'
import { dirname, delimiter, isAbsolute, join, relative, resolve } from 'node:path'
import type { McpEnvironmentControllerOptions } from './mcp-environment.js'
import type { McpEnvironmentStatus, McpPythonInfo } from '../shared/contracts.js'
import type { PythonEnvironmentRequest } from './python-environment-api.js'

interface Worker { child: ChildProcess; identity: string; busy: boolean; retired: boolean; pending: number }
function canonical(value: any): any { return Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value }

/** Stable Electron boundary. The signed Python plugin owns all domain code,
 * queues and diagnostics. Loaded workers survive unrelated Host restarts. */
export class PythonUpdaterService {
  private active?: Worker
  private workers = new Set<Worker>()
  private owners = new Map<string, Worker>()
  private pending = new Map<string, { worker: Worker; accept(value: any): void; reject(error: Error): void }>()
  private status: McpEnvironmentStatus = { phase: 'idle' }
  private configuration?: Record<string, unknown>
  private connecting?: Promise<Worker>
  private stopped = false
  constructor(private options: McpEnvironmentControllerOptions & { resolveWorker: () => Promise<string>; allowDevelopment?: boolean }) {}
  configureManager(config: Record<string, unknown>) { this.configuration = config }
  current() { return this.status }
  private retire(worker: Worker) {
    if (!worker.retired || worker.busy || worker.pending) return
    worker.child.send({ type: 'shutdown' }); this.workers.delete(worker)
    for (const [id, owner] of this.owners) if (owner === worker) this.owners.delete(id)
  }
  private async connect(): Promise<Worker> {
    if (this.connecting) return this.connecting
    this.connecting = this.loadWorker().finally(() => { this.connecting = undefined })
    return this.connecting
  }
  private async loadWorker(): Promise<Worker> {
    if (this.stopped) throw new Error('Python broker is shutting down.')
    const entry = await this.options.resolveWorker(); const directory = dirname(entry)
    const manifestBytes = await readFile(join(directory, 'worker-manifest.json'))
    const manifest = JSON.parse(manifestBytes.toString())
    const { signature, ...payload } = manifest
    const developmentKeys = this.options.allowDevelopment && manifest.localOnly
      ? await readFile(join(directory, 'development-keys.json'), 'utf8').then(JSON.parse, () => ({})) : {}
    const key = this.options.publicKeys?.[signature?.keyId] ?? developmentKeys[signature?.keyId]
    if (manifest.schema !== 1 || manifest.abi !== 1 || manifest.entry !== 'python-updater-worker.js' || !Array.isArray(manifest.files) || (manifest.localOnly && !this.options.allowDevelopment) || !key || signature.algorithm !== 'ed25519' || !verify(null, Buffer.from(JSON.stringify(canonical(payload))), key, Buffer.from(signature.value, 'base64'))) throw new Error('PYTHON_WORKER_SIGNATURE: incompatible or untrusted Python plugin worker.')
    const identity = createHash('sha256').update(manifestBytes).digest('hex')
    const seen = new Set<string>()
    for (const file of manifest.files) {
      const path = resolve(directory, file.path); const local = relative(directory, path)
      if (!local || local.startsWith('..') || isAbsolute(local) || seen.has(file.path)) throw new Error('PYTHON_WORKER_PATH: unsafe worker closure.')
      const info = await lstat(path); const physical = relative(await realpath(directory), await realpath(path))
      if (!info.isFile() || info.isSymbolicLink() || physical.startsWith('..') || isAbsolute(physical)) throw new Error('PYTHON_WORKER_PATH: linked worker resource.')
      const bytes = await readFile(path)
      if (bytes.length !== file.size || createHash('sha256').update(bytes).digest('hex') !== file.sha256) throw new Error('PYTHON_WORKER_HASH: worker resource differs from the signed manifest.')
      seen.add(file.path)
    }
    if (!seen.has(manifest.entry)) throw new Error('PYTHON_WORKER_MISSING: entry omitted from signed worker closure.')
    const actual = new Set<string>()
    const collect = async (base: string): Promise<void> => {
      for (const item of await readdir(base, { withFileTypes: true })) {
        const path = join(base, item.name)
        if (item.isDirectory()) await collect(path)
        else if (item.isFile()) actual.add(relative(directory, path).replaceAll('\\', '/'))
        else throw new Error('PYTHON_WORKER_PATH: linked worker resource.')
      }
    }
    await collect(directory)
    actual.delete('worker-manifest.json')
    actual.delete('receipt.json')
    if (manifest.localOnly && this.options.allowDevelopment) actual.delete('development-keys.json')
    if (actual.size !== seen.size || [...actual].some(path => !seen.has(path))) throw new Error('PYTHON_WORKER_FILES: worker closure contains unsigned files.')
    if (this.active?.identity === identity) return this.active
    const child = fork(entry, [], { execPath: process.execPath, execArgv: ['--max-old-space-size=256'], env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', NODE_PATH: [join(directory, 'modules'), process.env.NODE_PATH].filter(Boolean).join(delimiter) }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] })
    const worker: Worker = { child, identity, busy: true, retired: false, pending: 0 }
    this.workers.add(worker); child.stderr?.resume()
    child.on('message', (message: any) => {
      if (message.type === 'status') {
        const id = message.status?.updateJob?.taskId
        if (typeof id === 'string') this.owners.set(id, worker)
        if (worker === this.active || (worker.busy && id && this.owners.get(id) === worker && this.status.updateJob?.taskId === id)) { this.status = message.status; this.options.publish(message.status) }
      }
      else if (message.type === 'activity') { worker.busy = message.busy; this.retire(worker) }
      else if (message.id) {
        const request = this.pending.get(message.id)
        if (request?.worker !== worker) return
        this.pending.delete(message.id); worker.pending--
        if (message.error) request.reject(new Error(message.error))
        else {
          const id = message.result?.taskId ?? message.result?.task?.taskId ?? message.result?.updateJob?.taskId
          if (typeof id === 'string') this.owners.set(id, worker)
          request.accept(message.result)
        }
        this.retire(worker)
      }
    })
    const fail = (error: Error) => {
      for (const [id, request] of this.pending) if (request.worker === worker) { this.pending.delete(id); request.reject(error) }
      this.workers.delete(worker); if (this.active === worker) this.active = undefined
      for (const [id, owner] of this.owners) if (owner === worker) this.owners.delete(id)
    }
    child.once('error', fail); child.once('exit', () => fail(new Error('PYTHON_WORKER_EXITED: inspect interrupted tasks before resuming.')))
    const { publish, resolveWorker, allowDevelopment, fetcher, healthCheck, ...config } = this.options
    const configured = new Promise<void>((accept, reject) => {
      const timer = setTimeout(() => { cleanup(); child.kill(); reject(new Error('PYTHON_WORKER_ABI: configuration handshake timed out.')) }, 10_000)
      const ready = (message: any) => { if (message.type === 'configured') { cleanup(); message.abi === 1 ? accept() : reject(new Error('PYTHON_WORKER_ABI: unsupported handshake.')) } }
      const failed = () => { cleanup(); reject(new Error('PYTHON_WORKER_EXITED: configuration failed.')) }
      const cleanup = () => { clearTimeout(timer); child.off('message', ready); child.off('exit', failed) }
      child.on('message', ready); child.once('exit', failed)
    })
    child.send({ type: 'configure', config: { ...config, manager: this.configuration } })
    await configured
    const previous = this.active; this.active = worker
    if (previous) { previous.retired = true; this.retire(previous) }
    return worker
  }
  async rpc<T = any>(scope: string, method: string, args: unknown[] = [], taskId?: string): Promise<T> {
    const owner = taskId && this.owners.get(taskId)
    const worker = owner || await this.connect(); const id = randomUUID(); worker.pending++
    return new Promise((accept, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); worker.pending--; worker.child.send({ type: 'cancel', id }); reject(new Error('PYTHON_RPC_TIMEOUT: inspect task status before retrying.')); this.retire(worker) }, ['pythonInfo', 'pythonCoreInfo', 'pythonPackages'].includes(method) ? 46_000 : 900_000)
      this.pending.set(id, { worker, accept: result => { clearTimeout(timer); accept(result) }, reject: error => { clearTimeout(timer); reject(error) } })
      worker.child.send({ id, scope, method, args }, error => { if (error) { this.pending.delete(id); worker.pending--; clearTimeout(timer); reject(error) } })
    })
  }
  environmentRequest(request: PythonEnvironmentRequest): Promise<Record<string, unknown>> { return this.rpc('api', 'request', [request], request.taskId) }
  resumeAutomaticSyncTask(taskId: string): Promise<Record<string, unknown> | undefined> { return this.rpc('api', 'resumeAutomaticSyncTask', [taskId], taskId) }
  pythonInfo(query = ''): Promise<McpPythonInfo> { return this.rpc('manager', 'pythonInfo', [query]) }
  pythonCoreInfo(): Promise<McpPythonInfo> { return this.rpc('manager', 'pythonCoreInfo') }
  pythonPackages(names: string[]): Promise<McpPythonInfo> { return this.rpc('manager', 'pythonPackages', [names]) }
  taskStatus(id?: string) { return this.rpc('manager', 'taskStatus', [id], id) }
  checkForUpdates(): Promise<McpEnvironmentStatus> { return this.rpc('manager', 'checkForUpdates') }
  checkPythonPackageUpdates(names: string[] = []): Promise<McpPythonInfo> { return this.rpc('manager', 'checkPythonPackageUpdates', [names]) }
  previewPackages(names: string[]) { return this.rpc('manager', 'previewPackages', [names]) }
  previewUninstall(names: string[]) { return this.rpc('manager', 'previewUninstall', [names]) }
  applyPackagePlan(id: string) { return this.rpc('manager', 'applyPackagePlan', [id]) }
  installPythonPackage(spec: string) { return this.rpc('manager', 'installPythonPackage', [spec]) }
  updatePythonPackages(names: string[]) { return this.rpc('manager', 'updatePythonPackages', [names]) }
  updateForUser(): Promise<McpEnvironmentStatus> { return this.rpc('manager', 'updateForUser') }
  ensureReady(): Promise<McpEnvironmentStatus> { return this.rpc('manager', 'ensureReady') }
  autoUpdate(): Promise<McpEnvironmentStatus> { return this.rpc('manager', 'autoUpdate') }
  retry() { return this.updateForUser() }
  pause() { return this.rpc('manager', 'pause') }
  rollback() { return this.rpc('manager', 'rollback') }
  selectManual(root: string) { return this.rpc('manager', 'selectManual', [root]) }
  async shutdown(): Promise<void> { await Promise.allSettled([...this.workers].map(worker => new Promise<void>(resolve => { worker.child.once('exit', () => resolve()); worker.child.send({ type: 'shutdown' }); setTimeout(resolve, 5000).unref() }))) }
  stop(): void { this.stopped = true; for (const worker of this.workers) worker.child.send({ type: 'shutdown' }) }
}
