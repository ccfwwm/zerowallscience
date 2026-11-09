/** Host-owned uv dependency management shared by settings, tools and MCP. */
import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { openNativePath } from '@deepseek-ai/dsh-native-command'
import z from '@deepseek-ai/schemastery'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { createRequire } from 'node:module'
import { z as validator } from 'zod'
import { managementResponse } from './management-json.js'
import { UvRuntime, defaultAssetsRoot } from './uv-runtime.js'
import { OcrModels } from './ocr-models.js'
import { PythonPackageCatalog, packageMatches } from './package-catalog.js'
import { packageIndexes } from '../shared/package-indexes.js'
import type { PythonRuntimePaths } from '../shared/runtime-path.js'
import type { PythonEnvironmentRequest, PythonManagementResponse } from '../shared/types.js'

/** Deployment locations, independent of the user's installation folder. */
export interface Config { basePython: string; environmentRoot: string; assetsRoot: string; uv: string; indexUrl: string; catalogIndexUrl?: string; metadataUrl?: string; timeoutMs: number; wheelhouse?: string; ocrModelsRoot?: string; ocrModelMirror?: string; downloadAttempts?: number; retryDelayMs?: number }
/** Values supplied by the carrier can be overridden in a profile. */
export const Config: z<Config> = z.object({
  basePython: z.string().default(process.env.DSH_PYTHON_EXECUTABLE ?? ''),
  environmentRoot: z.string().default(process.env.ZEROWALL_PYTHON_DEPENDENCIES_ROOT ?? join(resolveDshHome(), 'zerowall', 'python')),
  assetsRoot: z.string().default(process.env.ZEROWALL_PYTHON_ASSETS_ROOT ?? defaultAssetsRoot()),
  metadataUrl: z.string().default('https://pypi.org/pypi/'),
  catalogIndexUrl: z.string().default('https://mirrors.aliyun.com/pypi/simple/'),
  uv: z.string().default(process.env.ZEROWALL_UV_EXECUTABLE ?? ''),
  wheelhouse: z.string().default(process.env.ZEROWALL_PYTHON_WHEELHOUSE ?? ''),
  indexUrl: z.string().default(process.env.ZEROWALL_PYTHON_INDEX_URL ?? 'https://pypi.tuna.tsinghua.edu.cn/simple'),
  timeoutMs: z.number().min(1000).max(1_800_000).default(600_000),
  ocrModelsRoot: z.string().default(process.env.ZEROWALL_OCR_MODELS_ROOT ?? join(resolveDshHome(), 'zerowall', 'models', 'ocr')),
  ocrModelMirror: z.string().default(process.env.ZEROWALL_OCR_MODEL_MIRROR ?? ''),
  downloadAttempts: z.number().min(1).max(5).default(3),
  retryDelayMs: z.number().min(0).max(30_000).default(1000),
})
declare module '@deepseek-ai/cordis' { interface Context { zerowallPythonManagement: PythonManagement } }

type Plan = { planId: string; snapshotId: string; requested: string[]; changes: { name: string; to: string }[]; lock: string }
const SavedConfig = validator.object({ schema: validator.literal(1), indexUrl: validator.string() }).strict()

function packageIndex(value: string): string {
  let url: URL
  try { url = new URL(value) } catch (error) { throw new Error('Python package index must be a valid HTTPS URL without credentials, query parameters or fragments.') }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Python package index must use HTTPS without credentials, query parameters or fragments.')
  return url.toString()
}

/** Preparation failures remain visible in settings and can be retried without restarting. */
export class PythonManagement extends TypertRemoteService {
  private readonly catalog: PythonPackageCatalog
  private readonly runtime: UvRuntime
  private readonly models: OcrModels
  private readonly modelStartup: Promise<void>
  private readonly startup: Promise<void>
  private readonly initialization: Promise<void>
  private settingsWrite: Promise<void> = Promise.resolve()
  private readonly plans = new Map<string, Plan>()
  private task: { taskId: string; state: 'running' | 'succeeded' | 'failed'; message: string } | undefined
  private taskWork: Promise<void> = Promise.resolve()
  private revision = 1
  constructor(ctx: Context, private config: Config) {
    super(ctx, 'zerowallPythonManagement')
    if (![config.environmentRoot, config.assetsRoot].every(isAbsolute)) throw new Error('Python dependency locations must be absolute paths.')
    config.indexUrl = packageIndex(config.indexUrl)
    config.catalogIndexUrl = packageIndex(config.catalogIndexUrl ?? 'https://pypi.org/simple/')
    this.catalog = new PythonPackageCatalog(config.metadataUrl ?? 'https://pypi.org/pypi/', config.timeoutMs)
    ctx.effect(() => () => this.catalog.dispose())
    this.runtime = new UvRuntime(config)
    this.models = new OcrModels({ root: config.ocrModelsRoot ?? join(config.environmentRoot, 'models', 'ocr'), manifest: join(config.assetsRoot, 'ocr-v5.json'), mirror: config.ocrModelMirror, attempts: config.downloadAttempts ?? 3, timeoutMs: config.timeoutMs, retryDelayMs: config.retryDelayMs ?? 1000 })
    this.initialization = this.loadConfiguration()
    this.startup = this.initialization.then(() => this.runtime.prepare()).then(() => undefined).catch(error => {
      this.runtime.phase = 'failed'; this.runtime.error = error instanceof Error ? error.message : 'Python dependency initialization failed.'
      ctx.logger.warn(`Python dependencies: ${this.runtime.error}`)
    })
    this.modelStartup = this.initialization.then(() => this.models.prepare()).then(() => undefined).catch(error => {
      ctx.logger.warn(`OCR resources: ${error instanceof Error ? error.message : 'Preparation failed; retry in Python settings.'}`)
    })
    ctx.effect(() => async () => { await Promise.all([this.runtime.dispose(), this.models.dispose()]); await Promise.allSettled([this.startup, this.modelStartup, this.settingsWrite, this.taskWork]) })
  }

  private async loadConfiguration(): Promise<void> {
    let body: string
    try { body = await readFile(join(this.config.environmentRoot, 'settings.json'), 'utf8') }
    catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return; throw new Error('Cannot read Python settings. Check access to the dependency data directory.') }
    let saved: validator.infer<typeof SavedConfig>
    try { saved = SavedConfig.parse(JSON.parse(body)) }
    catch (error) { throw new Error('Python settings are invalid. Restore settings.json in the dependency data directory before retrying.') }
    this.config.indexUrl = packageIndex(saved.indexUrl)
  }

  private saveIndex(indexUrl: string): Promise<void> {
    const operation = this.settingsWrite.then(async () => {
      await mkdir(this.config.environmentRoot, { recursive: true })
      const temporary = join(this.config.environmentRoot, `settings-${randomUUID()}.tmp`)
      try {
        await writeFile(temporary, JSON.stringify({ schema: 1, indexUrl }) + '\n', { flag: 'wx', mode: 0o600 })
        await rename(temporary, join(this.config.environmentRoot, 'settings.json'))
        this.config.indexUrl = indexUrl
        this.plans.clear()
        this.revision++
      } finally { await rm(temporary, { force: true }) }
    })
    this.settingsWrite = operation.catch(() => undefined)
    return operation
  }

  /** Wait for a usable environment; failures propagate to dependent operations. */
  async ready(): Promise<PythonRuntimePaths> { await this.initialization; await this.startup; return this.runtime.prepare() }
  /** Wait for dependencies and verified OCR resources; ordinary Python does not wait for models. */
  async readyOcr(): Promise<PythonRuntimePaths & { modelRoot: string }> {
    const [paths, modelRoot] = await Promise.all([this.ready(), this.models.prepare()])
    process.env.ZEROWALL_OCR_ACTIVE_MODELS_ROOT = modelRoot
    return { ...paths, modelRoot }
  }
  /** Resolve the active dependency directory, without reading an old location file. */
  async runtimeRoot(): Promise<string> { return (await this.ready()).root }

  /** Install the dependency declaration owned by an explicitly enabled skill topic. */
  async ensureCapability(capabilityId: string): Promise<PythonRuntimePaths> {
    if (capabilityId === 'skill-core') return this.ready()
    const require = createRequire(import.meta.url)
    const catalogPath = join(require.resolve('@zerowall/dsh-plugin-skills/package.json'), '..', 'resources', 'catalog.json')
    const raw: unknown = JSON.parse(await readFile(catalogPath, 'utf8'))
    const rows = Array.isArray(raw) ? raw : typeof raw === 'object' && raw !== null && 'skills' in raw && Array.isArray(raw.skills) ? raw.skills : []
    const requirements = new Set<string>()
    for (const row of rows) {
      if (typeof row !== 'object' || row === null || !('capabilityId' in row) || row.capabilityId !== capabilityId || !('requirements' in row) || !Array.isArray(row.requirements)) continue
      for (const value of row.requirements) { if (typeof value !== 'string') throw new Error('Invalid skill dependency declaration.'); requirements.add(value) }
    }
    if (!rows.some(row => typeof row === 'object' && row !== null && 'capabilityId' in row && row.capabilityId === capabilityId)) throw new Error('Unknown Python skill capability.')
    if (!requirements.size) return this.ready()
    return this.runtime.ensureCapability(capabilityId, [...requirements])
  }

  /** Resolve previously prepared dependencies without installing during skill loading. */
  async resolveCapability(capabilityId: string): Promise<PythonRuntimePaths> {
    await this.initialization
    await this.startup
    return this.runtime.resolveCapability(capabilityId)
  }

  private async inventory() {
    const paths = await this.ready()
    const data = JSON.parse(await this.runtime.command(paths.executable, ['-I', '-B', '-c', 'import importlib.metadata as m,json,platform;print(json.dumps({"version":platform.python_version(),"packages":[{"name":d.metadata["Name"],"version":d.version,"source":"core","health":"healthy"} for d in m.distributions()]}))'])) as { version: string; packages: { name: string; version: string; source: string; health: string }[] }
    const packages = [...new Map(data.packages.map(pkg => [pkg.name.toLowerCase().replace(/[-_.]+/gu, '-'), pkg])).values()].sort((a, b) => a.name.localeCompare(b.name))
    return { ...paths, ...data, uvVersion: await this.runtime.uvVersion(), packages, ready: true, coreReady: true, inventoryComplete: true, packageCount: packages.length, corePackageCount: packages.length, runtimeRoot: paths.root, runtimeExecutable: paths.executable, runtimeSitePackages: paths.sitePackages }
  }

  /** Validate actions at the Remote boundary; refresh actions do not install dependencies. */
  @Remote('request')
  async request(input: PythonEnvironmentRequest): Promise<PythonManagementResponse> {
    if (typeof input.requestId !== 'string' || !input.requestId) throw new Error('Python request identifier is required.')
    await this.initialization
    const result: Record<string, unknown> = { requestId: input.requestId, revision: this.revision, runtimeRoot: this.config.environmentRoot, mirrorUrl: this.config.indexUrl, defaultMirrorUrl: packageIndexes[0]!.indexUrl, mirrorPresets: packageIndexes }
    switch (input.action) {
      case 'status':
      case 'task_status': {
        result.status = { phase: this.runtime.phase, message: this.runtime.error, python: { ready: this.runtime.phase === 'ready', message: this.runtime.error } }
        result.ocr = { ...this.models.status }
        if (this.task) result.task = { ...this.task, kind: 'dependencies', layer: 'core', action: 'apply_sync', stage: this.task.state, logLines: [], createdAt: '', updatedAt: '' }
        break
      }
      case 'search_package': {
        if (input.packageName) result.packageCatalog = await this.catalog.versions(input.packageName)
        else result.packageMatches = await this.catalog.search(this.config.catalogIndexUrl ?? this.config.indexUrl, input.query ?? '')
        break
      }
      case 'scan_local':
      case 'list_packages': {
        const inventory = await this.inventory()
        const filtered = inventory.packages.filter(pkg => !input.query || packageMatches(pkg.name, input.query))
        result.inventory = { ...inventory, packages: filtered.slice(input.offset ?? 0, (input.offset ?? 0) + (input.limit ?? 500)) }
        break
      }
      case 'install_runtime':
      case 'apply_sync':
      case 'sync': {
        if (input.confirm !== true) throw new Error('Confirm dependency preparation before applying it.')
        if (input.layer === 'science') throw new Error('Enable a specific skill topic to install its dependencies.')
        if (input.planId) await this.operation('apply', [input.planId])
        else await this.startOperation(input.capabilityId)
        result.taskId = this.task?.taskId
        break
      }
      case 'check_manifest':
      case 'preview_sync': {
        if (input.packageSpec) {
          const { lock: _lock, ...plan } = await this.preview([input.packageSpec])
          result.plan = plan
          break
        }
        const body = await readFile(join(this.config.assetsRoot, 'runtime.json'), 'utf8')
        let payload: { revision: string; packageCount: number }
        try { payload = validator.object({ revision: validator.string(), packageCount: validator.number().int().nonnegative() }).parse(JSON.parse(body)) }
        catch (error) { throw new Error('Python dependency resource manifest is invalid. Restore matching resources before retrying.') }
        result.manifest = { revision: payload.revision, packageCount: payload.packageCount }
        result.dependencies = { revision: payload.revision, manifestRevision: payload.revision, layer: 'core', available: true, source: 'remote', changes: [] }
        break
      }
      case 'install_package': {
        if (input.confirm !== true || !input.packageSpec) throw new Error('Confirm a concrete package specification before installing.')
        await this.runtime.install([input.packageSpec]); result.inventory = await this.inventory(); this.revision++
        break
      }
      case 'configure': {
        if (input.runtimeRoot) throw new Error('The interpreter is supplied by DSH; its installation directory cannot be changed here.')
        if (!input.mirrorUrl || input.confirm !== true) throw new Error('Confirm the package index change.')
        await this.saveIndex(packageIndex(input.mirrorUrl)); result.mirrorUrl = this.config.indexUrl; result.revision = this.revision
        break
      }
      case 'diagnose': {
        const paths = await this.ready()
        await this.runtime.command(paths.executable, ['-I', '-B', '-c', 'import ssl,mcp,httpx;print(ssl.OPENSSL_VERSION)'])
        result.diagnostics = { checkedAt: new Date().toISOString(), python: { status: 'ready' }, pip: { status: 'ready', message: 'Dependencies are managed by uv' }, tls: { status: 'ready' }, mirror: { status: 'configured' } }
        break
      }
      case 'rollback': {
        if (input.confirm !== true) throw new Error('Confirm restoring the previous environment.')
        await this.runtime.rollback(); this.revision++; result.inventory = await this.inventory()
        break
      }
      default: throw new Error('This operation is unavailable. Dependencies are managed through uv and skill topics.')
    }
    return managementResponse(result)
  }

  private async startOperation(capabilityId?: string): Promise<void> {
    if (this.task?.state === 'running') throw new Error('Python dependency preparation is already running.')
    this.task = { taskId: randomUUID(), state: 'running', message: '' }
    const task = this.task
    this.taskWork = (capabilityId ? this.ensureCapability(capabilityId) : Promise.all([this.runtime.retry(), this.models.retry()])).then(() => { task.state = 'succeeded' }, error => {
      task.state = 'failed'; task.message = error instanceof Error ? error.message : String(error)
    })
  }

  /** Open the active dependency folder through the native Host service. */
  @Remote('revealRuntimeDirectory')
  async revealRuntimeDirectory(signal: AbortSignal): Promise<void> { await openNativePath(await this.runtimeRoot(), signal) }

  /** Adapt model tool operations to the same dependency owner. */
  async operation(operation: string, args: unknown[]): Promise<unknown> {
    if (operation === 'request') return this.request(args[0] as PythonEnvironmentRequest)
    if (operation === 'status') return this.request({ action: 'status', requestId: randomUUID() })
    if (operation === 'preview') {
      const requested = args[0] as string[]
      const { lock: _lock, ...plan } = await this.preview(requested)
      return plan
    }
    if (operation === 'apply') {
      const plan = this.plans.get(String(args[0]))
      if (!plan || plan.snapshotId !== (await this.ready()).root) throw new Error('Package plan is missing or stale; preview again.')
      await this.runtime.installLocked(plan.requested, plan.lock, plan.snapshotId); this.plans.delete(plan.planId)
      return { taskId: randomUUID(), state: 'succeeded' }
    }
    throw new Error('Unsupported uv dependency operation.')
  }

  private async preview(requested: string[]): Promise<Plan> {
    const lock = await this.runtime.install(requested, true)
    const changes = lock.split(/\r?\n/u).flatMap(line => {
      const match = /^([A-Za-z0-9_.-]+)==([^\s;\\]+)/u.exec(line)
      return match ? [{ name: match[1]!, to: `${match[1]}==${match[2]}` }] : []
    })
    const plan: Plan = { planId: randomUUID(), snapshotId: (await this.ready()).root, requested, changes, lock }
    if (this.plans.size > 50) this.plans.delete(this.plans.keys().next().value!)
    this.plans.set(plan.planId, plan)
    return plan
  }
}
