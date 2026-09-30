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
import type { McpEnvironmentStatus } from '../shared/contracts.js'
import { MCP_ENVIRONMENT_KEYRING } from './mcp-environment.js'

const execute = promisify(execFile)

export { normalizePythonRuntimePath } from './python-location.js'
export interface PythonEnvironmentRequest {
  action: 'status' | 'check_manifest' | 'preview_sync' | 'apply_sync' | 'sync' | 'list_packages' | 'configure' | 'diagnose' | 'rollback'
  requestId: string
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
  checkManifest(): Promise<unknown>
  previewSync(): Promise<unknown>
  applySync(planId: string, revision: string, confirm: boolean): Promise<unknown>
}
interface ManifestSummary { revision: string; changes: Array<{ name: string; from?: string; to: string }>; packageCount: number }

export class PythonEnvironmentApi {
  private operation: Promise<unknown> = Promise.resolve()
  private mutation: Promise<unknown> = Promise.resolve()
  private readonly syncAccepts = new Map<string, Promise<Record<string, unknown>>>()
  private readonly activeSyncIds = new Set<string>()
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
  constructor(private root: string, private updater: PythonUpdaterService, private sync: SyncService, private locationPath = join(root, 'python-location.json'), private applicationInstallRoot?: string) {
    updater.watchProgress?.(status => this.recordProgress(status))
  }

  private recordProgress(status: McpEnvironmentStatus): void {
    const job = status.updateJob
    const entry: Record<string, unknown> = { action: 'progress', status: 'running', createdAt: new Date().toISOString(), phase: status.phase, stage: job?.stage ?? null, percent: status.progress ?? null, message: status.message ?? null, logLine: job?.logLines?.at(-1) ?? null, taskId: job?.taskId ?? null, packageCount: job?.packageNames?.length ?? 0, packageNames: job?.packageNames?.slice(0, 20) ?? [], completedFiles: job?.completedFiles ?? null, totalFiles: job?.totalFiles ?? null, receivedBytes: job?.receivedBytes ?? null, totalBytes: job?.totalBytes ?? null }
    const previous = this.progress[this.progress.length - 1]
    // Collapse a repeated stage in place: the log should show the shape of the
    // run, not a per-percent transcript.
    if (previous && previous.stage === entry.stage && previous.phase === entry.phase && previous.logLine === entry.logLine) this.progress[this.progress.length - 1] = entry
    else this.progress.push(entry)
    if (this.progress.length > 200) this.progress.splice(0, this.progress.length - 200)
    this.progressTimer ??= setTimeout(() => { this.progressTimer = undefined; void this.flushProgress() }, 2000)
  }

  private async flushProgress(): Promise<void> {
    const rows = this.progress.splice(0)
    if (!rows.length) return
    await mkdir(join(this.controlRoot(), 'logs'), { recursive: true })
    await appendFile(join(this.controlRoot(), 'logs', 'environment-events.jsonl'), rows.map(row => JSON.stringify({ requestId: String(row.taskId ?? 'progress'), ...row }) + '\n').join('')).catch(() => undefined)
  }

  private controlRoot(): string { return dirname(this.locationPath) }

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
    if (input.action === 'sync') return this.acceptSync(input)
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

  private acceptSync(input: PythonEnvironmentRequest): Promise<Record<string, unknown>> {
    const pending = this.syncAccepts.get(input.requestId)
    if (pending !== undefined) return pending
    const accepted = this.persistAndQueueSync(input)
    this.syncAccepts.set(input.requestId, accepted)
    void accepted.finally(() => { this.syncAccepts.delete(input.requestId) }).catch(() => undefined)
    return accepted
  }

  private async persistAndQueueSync(input: PythonEnvironmentRequest): Promise<Record<string, unknown>> {
    if (input.confirm !== true) throw new Error('CONFIRMATION_REQUIRED: 一键同步需要显式确认。')
    const directory = join(this.controlRoot(), 'requests')
    const path = join(directory, `${input.requestId}.json`)
    const fingerprint = createHash('sha256').update(JSON.stringify(Object.entries(input).sort(([a], [b]) => a.localeCompare(b)))).digest('hex')
    let receipt: { fingerprint: string; state?: string; taskId?: string; result?: Record<string, unknown>; error?: string } | undefined
    try { receipt = JSON.parse(await readFile(path, 'utf8')) }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    if (receipt !== undefined) {
      if (receipt.fingerprint !== fingerprint) throw new Error('REQUEST_ID_CONFLICT: use a new requestId for a different operation.')
      if (receipt.result !== undefined) return receipt.result
      if (receipt.taskId !== undefined) {
        if (this.activeSyncIds.has(input.requestId)) return { requestId: input.requestId, taskId: receipt.taskId, queued: true }
        // The read may have captured `running` immediately before completion
        // atomically replaced that receipt and released its in-process owner.
        // Once the owner is gone its final write has settled; refresh the
        // durable result before interpreting an old snapshot as interrupted.
        receipt = JSON.parse(await readFile(path, 'utf8'))
        if (receipt!.fingerprint !== fingerprint) throw new Error('REQUEST_ID_CONFLICT: use a new requestId for a different operation.')
        if (receipt!.result !== undefined) return receipt!.result
      }
      throw new Error(receipt!.error ?? 'REQUEST_INTERRUPTED: Python synchronization stopped before completion; inspect the operation log before retrying.')
    }

    await mkdir(directory, { recursive: true })
    const taskId = randomUUID()
    const save = async (value: unknown) => {
      const temporary = `${path}.${randomUUID()}.tmp`
      await writeFile(temporary, JSON.stringify(value))
      await renameFile(temporary, path)
    }
    await writeFile(path, JSON.stringify({ fingerprint, state: 'accepted', taskId }), { flag: 'wx' })
    await this.log(input, 'queued', { taskId })
    this.activeSyncIds.add(input.requestId)
    const operation = this.mutation.catch(() => undefined).then(async () => {
      await save({ fingerprint, state: 'running', taskId })
      await this.log(input, 'running', { taskId })
      try {
        const result = await this.auditedExecute(input)
        const completed = { requestId: input.requestId, ...result, taskId: typeof result.taskId === 'string' ? result.taskId : taskId }
        await save({ fingerprint, state: 'completed', taskId, result: completed })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        await save({ fingerprint, state: 'failed', taskId, error: message })
      } finally {
        this.activeSyncIds.delete(input.requestId)
      }
    })
    this.mutation = operation
    void operation.catch(() => undefined)
    return { requestId: input.requestId, taskId, queued: true }
  }

  private async log(input: PythonEnvironmentRequest, status: string, extra: Record<string, unknown> = {}): Promise<void> {
    await mkdir(join(this.controlRoot(), 'logs'), { recursive: true })
    await appendFile(join(this.controlRoot(), 'logs', 'environment-events.jsonl'), JSON.stringify({ requestId: input.requestId, action: input.action, status, createdAt: new Date().toISOString(), ...extra }) + '\n')
  }

  private async events(): Promise<unknown[]> {
    const file = await open(join(this.controlRoot(), 'logs', 'environment-events.jsonl'), 'r').catch(() => undefined)
    if (!file) return []
    try {
      const { size } = await file.stat(); const length = Math.min(size, 64 * 1024)
      const buffer = Buffer.alloc(length); await file.read(buffer, 0, length, size - length)
      const lines = buffer.toString('utf8').split('\n')
      if (size > length) lines.shift()
      return lines.filter(Boolean).slice(-50).flatMap(line => { try { return [{ status: 'succeeded', ...JSON.parse(line) }] } catch { return [] } }).reverse()
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
        const runtime = typeof runtimeBase === 'string' && current.health === 'ready' ? await readOptional(join(runtimeBase, 'Python', 'runtime.json')) : undefined
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
        const configuredRuntimeRoot = savedRuntimeRoot ?? join(dirname(this.root), 'Python')
        const activeRuntime = runtime && typeof runtime.rootPath === 'string'
          && (resolve(runtime.rootPath) === resolve(configuredRuntimeRoot) || (current.generation === true && typeof current.root === 'string' && resolve(runtime.rootPath) === resolve(current.root, 'Python') && !relative(join(this.root, 'slots'), current.root).startsWith('..')))
          ? runtime
          : undefined
        result = { status: this.updater.current(), runtime: activeRuntime, runtimeRoot: configuredRuntimeRoot, dependencies: await readOptional(join(this.root, 'dependency-sync', 'status.json')), events: await this.events() }; break
      }
      case 'list_packages': {
        // Opening Settings and refreshing inventory are read-only. A thin
        // installer reports an empty inventory until a Python operation or
        // explicit install requests the signed runtime.
        const inventory = await this.updater.pythonInfo()
        const manifest = await readFile(join(this.root, 'dependency-sync', 'manifest.json'), 'utf8').then(text => parsePythonDependencyManifest(JSON.parse(text), MCP_ENVIRONMENT_KEYRING)).catch(() => undefined)
        const normalize = (name: string) => name.toLowerCase().replace(/[-_.]+/gu, '-')
        const packages = new Map(manifest?.packages.map(pkg => [normalize(pkg.name), pkg]))
        // `sha256` is optional provenance now, so it is only carried through
        // when the signed manifest actually names one for this version.
        result = { inventory: { ...inventory, packages: inventory.packages.map(pkg => { const locked = packages.get(normalize(pkg.name)); return { ...pkg, capabilities: locked?.capabilities ?? [], ...(locked?.version === pkg.version && locked.sha256 ? { sha256: locked.sha256 } : {}) } }) } }; break
      }
      case 'check_manifest': await this.ensureRuntimeReady(); result = { manifest: await this.sync.checkManifest() }; break
      case 'preview_sync': await this.ensureRuntimeReady(); result = { plan: await this.sync.previewSync() }; break
      case 'sync': {
        // One-click synchronization runs after its durable queue receipt is
        // returned, so manifest resolution cannot make the UI appear unresponsive.
        if (input.confirm !== true) throw new Error('CONFIRMATION_REQUIRED: 一键同步需要显式确认。')
        await this.ensureRuntimeReady()
        const changed = await this.sync.checkManifest() as ManifestSummary | undefined
        const plan = await this.sync.previewSync() as { planId: string; changes: Array<{ name: string; from?: string; to: string }>; error?: string; manifestRevision: string }
        if (plan.error) throw new Error(`依赖清单已改变，无法同步：${plan.error}`)
        if (!plan.changes.length) { result = { upToDate: true, manifestRevision: plan.manifestRevision, changes: [] }; break }
        const task = await this.sync.applySync(plan.planId, plan.manifestRevision, true) as Record<string, unknown>
        result = { ...task, manifestRevision: plan.manifestRevision, changes: plan.changes, previousRevision: changed?.revision }
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
    const productRoot = current.generation !== true && basename(resolve(this.root)).toLowerCase() === 'zerowall-python'
    const expectedRuntimeRoot = dirname(resolve(this.root))
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
    const relativeExecutable = productRoot || current.runtimeRoot ? 'Python/python.exe' : current.manifest.python.relativeExecutable
    const relativeSitePackages = productRoot || current.runtimeRoot ? 'Python/Lib/site-packages' : current.manifest.python.relativeSitePackages
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
