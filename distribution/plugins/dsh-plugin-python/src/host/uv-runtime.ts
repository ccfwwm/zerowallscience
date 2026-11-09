/** uv owns fresh dependency generations; a committed environment is never modified. */
import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { pythonRuntimeEnvironment, type PythonRuntimePaths } from '../shared/runtime-path.js'

const hash = (body: string | Buffer) => createHash('sha256').update(body).digest('hex')
const Payload = z.object({ schema: z.literal(1), pythonVersion: z.string(), platform: z.string(), arch: z.string(), uv: z.string(), uvVersion: z.string(), uvSha256: z.string(), requirements: z.string(), wheels: z.string(), revision: z.string(), imports: z.array(z.string()), files: z.array(z.object({ filename: z.string(), sha256: z.string(), bytes: z.number() })) })
const Receipt = z.object({ schema: z.literal(1), identity: z.string().regex(/^[a-f0-9]{24}$/u), directory: z.uuid(), requirements: z.array(z.string()), lockSha256: z.string().regex(/^[a-f0-9]{64}$/u), isolated: z.boolean() })
type Receipt = z.infer<typeof Receipt>
type Payload = z.infer<typeof Payload>
/** Locations come from the carrier or profile, independently of installation directories. */
export interface RuntimeConfig { basePython: string; environmentRoot: string; assetsRoot: string; uv: string; indexUrl: string; timeoutMs: number; wheelhouse?: string; downloadAttempts?: number }
/** Preparation retains existing generations, including those leased by running consumers. */
export class UvRuntime {
  private readonly controller = new AbortController()
  private pending: Promise<PythonRuntimePaths> | undefined
  private active: PythonRuntimePaths | undefined
  private running: Promise<void> = Promise.resolve()
  private readonly commands = new Set<Promise<string>>()
  private payload: Payload | undefined
  private wheelhouse: string | undefined
  private base = ''
  private identity = ''
  phase: 'idle' | 'checking' | 'downloading' | 'installing' | 'verifying' | 'ready' | 'failed' = 'idle'
  error: string | undefined
  constructor(readonly config: RuntimeConfig) {}

  /** Wait for startup preparation. A failed attempt is retried only by an explicit retry action. */
  prepare(): Promise<PythonRuntimePaths> {
    if (this.controller.signal.aborted) return Promise.reject(new Error('Python dependency preparation was cancelled.'))
    if (this.active) return Promise.resolve(this.active)
    return this.pending ??= this.prepareCore()
  }

  /** Retry failed preparation without mutating a previously committed environment. */
  retry(): Promise<PythonRuntimePaths> { if (!this.active && this.phase === 'failed') this.pending = undefined; return this.prepare() }

  private asset(path: string): string {
    const result = resolve(this.config.assetsRoot, path)
    const local = relative(this.config.assetsRoot, result)
    if (!local || isAbsolute(local) || local === '..' || local.startsWith('../') || local.startsWith('..\\')) throw new Error('Invalid Python resource path.')
    return result
  }

  private async prepareCore(): Promise<PythonRuntimePaths> {
    this.phase = 'checking'; this.error = undefined
    try {
      const manifest = await readFile(join(this.config.assetsRoot, 'runtime.json'), 'utf8')
      let payload: Payload
      try { payload = Payload.parse(JSON.parse(manifest)) }
      catch (error) { throw new Error('Python dependency resource manifest is invalid. Restore matching resources before retrying.') }
      if (payload.platform !== process.platform || payload.arch !== process.arch) throw new Error('Python dependency resources do not match this platform.')
      if (hash(await readFile(this.asset(payload.requirements))) !== payload.revision) throw new Error('Python core lock checksum mismatch.')
      if (!this.config.uv && hash(await readFile(this.asset(payload.uv))) !== payload.uvSha256) throw new Error('uv executable checksum mismatch.')
      this.payload = payload
      this.wheelhouse = await this.resolveWheelhouse(payload)
      if ((await this.command(this.uv(), ['--version'])).trim().split(' ').slice(0, 2).join(' ') !== `uv ${payload.uvVersion}`) throw new Error('The configured uv version does not match the dependency payload.')
      this.base = this.config.basePython || await this.fallbackPython(payload)
      if (!isAbsolute(this.base)) throw new Error('DSH_PYTHON_EXECUTABLE must be an absolute interpreter path.')
      const version = await this.command(this.base, ['-I', '-B', '-c', 'import platform;print(platform.python_version())'])
      if (version.trim() !== payload.pythonVersion) throw new Error('Python dependency resources must match the bundled interpreter version.')
      this.identity = hash(this.base + '\0' + payload.revision).slice(0, 24)
      const existing = await this.readEnvironment('active')
      const paths = existing ?? await this.withWriter(async () => {
        const saved = await this.readEnvironment('active')
        if (!saved) return this.createEnvironment('active', [], false)
        await this.probe(saved, payload.imports)
        return saved
      })
      if (existing) await this.probe(existing, payload.imports)
      this.publish(paths)
      return paths
    } catch (error) {
      this.phase = 'failed'; this.error = error instanceof Error ? error.message : String(error)
      throw error
    }
  }

  /** @returns The version reported by the verified uv executable. */
  async uvVersion(): Promise<string> { await this.prepare(); return (await this.command(this.uv(), ['--version'])).trim() }

  private uv(): string { return this.config.uv || this.asset(this.payload!.uv) }

  private async resolveWheelhouse(payload: Payload): Promise<string | undefined> {
    const configured = this.config.wheelhouse
    if (!configured) return undefined
    if (configured && !isAbsolute(configured)) throw new Error('ZEROWALL_PYTHON_WHEELHOUSE must be an absolute wheel directory.')
    const directory = configured
    let directoryInfo
    try { directoryInfo = await stat(directory) }
    catch (error) {
      throw new Error('The configured Python wheel directory is unavailable. Restore it before retrying dependency preparation.')
    }
    if (!directoryInfo.isDirectory()) throw new Error('The Python wheel location must be a directory.')
    for (const file of payload.files) {
      this.controller.signal.throwIfAborted()
      if (basename(file.filename) !== file.filename) throw new Error('Invalid wheel resource path.')
      let body: Buffer
      try { body = await readFile(join(directory, file.filename)) }
      catch (error) { throw new Error('A locked Python wheel is missing or unreadable. Restore the wheel directory before retrying.') }
      if (body.length !== file.bytes || hash(body) !== file.sha256) throw new Error('Python wheel checksum mismatch. Restore the wheel directory before retrying.')
    }
    this.controller.signal.throwIfAborted()
    return directory
  }

  private async fallbackPython(payload: Payload): Promise<string> {
    const directory = join(this.config.environmentRoot, 'interpreters')
    await this.command(this.uv(), ['python', 'install', '--no-config', '--no-bin', ...(process.platform === 'win32' ? ['--no-registry'] : []), '--install-dir', directory, payload.pythonVersion], true)
    return (await this.command(this.uv(), ['python', 'find', '--no-config', '--managed-python', '--no-python-downloads', payload.pythonVersion])).trim()
  }

  private async paths(directory: string): Promise<PythonRuntimePaths> {
    const root = join(this.config.environmentRoot, 'environments', directory)
    const resolvedRoot = await realpath(root)
    if (relative(await realpath(dirname(root)), resolvedRoot) !== directory) throw new Error('Python environment directory must not redirect to another location.')
    const executable = join(root, ...(process.platform === 'win32' ? ['Scripts', 'python.exe'] : ['bin', 'python']))
    const output = await this.command(executable, ['-I', '-B', '-X', 'utf8', '-c', 'import sysconfig,json;print(json.dumps(sysconfig.get_path("purelib")))'])
    let sitePackages: string
    try { sitePackages = z.string().parse(JSON.parse(output)) }
    catch (error) { throw new Error('Python did not report a valid dependency directory.') }
    const local = relative(root, sitePackages)
    const resolvedLocal = relative(resolvedRoot, await realpath(sitePackages))
    if (!local || isAbsolute(local) || local === '..' || local.startsWith('../') || local.startsWith('..\\') || !(await stat(sitePackages)).isDirectory() || isAbsolute(resolvedLocal) || resolvedLocal === '..' || resolvedLocal.startsWith('../') || resolvedLocal.startsWith('..\\')) throw new Error('Invalid uv dependency directory.')
    return { root, executable, sitePackages, snapshotRoot: root }
  }

  private pointer(topic: string): string { return join(this.config.environmentRoot, `${topic}.json`) }

  private async readReceipt(topic: string): Promise<Receipt | undefined> {
    let body: string
    try { body = await readFile(this.pointer(topic), 'utf8') }
    catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined; throw error }
    try { return Receipt.parse(JSON.parse(body)) }
    catch (error) { throw new Error('Python environment receipt is invalid. Restore its saved metadata before retrying.') }
  }

  private async readEnvironment(topic: string): Promise<PythonRuntimePaths | undefined> {
    const receipt = await this.readReceipt(topic)
    if (!receipt || receipt.identity !== this.identity) return undefined
    if (receipt.isolated !== (topic !== 'active' && topic !== 'previous')) throw new Error('Python environment receipt does not match the requested environment.')
    this.validateRequirements(receipt.requirements)
    const paths = await this.paths(receipt.directory)
    if (hash(await readFile(join(paths.root, 'requirements.lock'))) !== receipt.lockSha256) throw new Error('Python environment receipt checksum mismatch.')
    return paths
  }

  private async createEnvironment(topic: string, requirements: readonly string[], isolated: boolean, suppliedLock?: string): Promise<PythonRuntimePaths> {
    const payload = this.payload!
    const directory = randomUUID()
    const root = join(this.config.environmentRoot, 'environments', directory)
    await mkdir(dirname(root), { recursive: true })
    try {
    if (!this.active) this.phase = 'installing'
    await this.command(this.uv(), ['venv', '--no-config', '--python', this.base, '--no-python-downloads', ...(!isolated ? ['--system-site-packages'] : []), root])
    const paths = await this.paths(directory)
    const lockPath = join(root, 'requirements.lock')
    if (!requirements.length && !isolated) {
      await writeFile(lockPath, await readFile(this.asset(payload.requirements)))
    } else {
      await writeFile(lockPath, suppliedLock ?? await this.compile(requirements, isolated))
    }
    const source = !requirements.length && !isolated && this.wheelhouse ? ['--offline', '--no-index', '--find-links', this.wheelhouse] : [...(this.wheelhouse ? ['--find-links', this.wheelhouse] : []), '--default-index', this.config.indexUrl]
    if (!this.active) this.phase = this.wheelhouse ? 'installing' : 'downloading'
    await this.command(this.uv(), ['pip', 'install', '--no-config', '--python', paths.executable, '--no-python-downloads', '--require-hashes', '--only-binary', ':all:', ...source, '-r', lockPath])
    if (!this.active) this.phase = 'verifying'
    await this.command(this.uv(), ['pip', 'check', '--no-config', '--python', paths.executable])
    if (!isolated) await this.probe(paths, payload.imports)
    const receipt: Receipt = { schema: 1, identity: this.identity, directory, requirements: [...requirements], isolated, lockSha256: hash(await readFile(lockPath)) }
    if (topic === 'active') {
      const previous = await this.readReceipt('active')
      if (previous?.identity === this.identity) await this.writeReceipt('previous', previous)
    }
    await this.writeReceipt(topic, receipt)
    return paths
    } catch (error) {
      await rm(root, { recursive: true, force: true })
      throw error
    }
  }

  private async writeReceipt(topic: string, receipt: Receipt): Promise<void> {
    this.controller.signal.throwIfAborted()
    await mkdir(this.config.environmentRoot, { recursive: true })
    const temporary = join(this.config.environmentRoot, `receipt-${randomUUID()}.tmp`)
    try {
      await writeFile(temporary, JSON.stringify(receipt) + '\n', { flag: 'wx', mode: 0o600 })
      this.controller.signal.throwIfAborted()
      await rename(temporary, this.pointer(topic))
    } finally { await rm(temporary, { force: true }) }
  }

  private async compile(requirements: readonly string[], isolated: boolean): Promise<string> {
    const input = join(this.config.environmentRoot, `requirements-${randomUUID()}.in`)
    await writeFile(input, requirements.join('\n') + '\n', { flag: 'wx' })
    try {
      return await this.command(this.uv(), ['pip', 'compile', '--no-config', '--python', this.base, '--no-python-downloads', '--generate-hashes', '--no-annotate', '--no-header', '--only-binary', ':all:', '--default-index', this.config.indexUrl, ...(!isolated ? ['--constraint', this.asset(this.payload!.requirements), this.asset('core.in')] : []), input])
    } finally { await rm(input, { force: true }) }
  }

  /** Resolve an installed topic without downloading or installing dependencies. */
  async resolveCapability(id: string): Promise<PythonRuntimePaths> {
    this.controller.signal.throwIfAborted()
    if (this.pending) await this.pending
    if (!this.active) throw new Error('SKILL_DEPENDENCIES_MISSING: prepare Python dependencies in Python settings before enabling this topic.')
    if (id === 'skill-core') return this.active!
    this.validateTopic(id)
    const paths = await this.readEnvironment(id)
    if (!paths) throw new Error('SKILL_DEPENDENCIES_MISSING: prepare this topic in Skills settings before enabling it.')
    return paths
  }

  /** Explicit topic enabling prepares a separate, hash-locked environment. */
  ensureCapability(id: string, requirements: readonly string[]): Promise<PythonRuntimePaths> {
    this.validateTopic(id); this.validateRequirements(requirements)
    return this.serial(async () => {
      await this.prepare()
      if (!requirements.length || id === 'skill-core') return this.active!
      const receipt = await this.readReceipt(id)
      if (receipt?.identity === this.identity && JSON.stringify(receipt.requirements) === JSON.stringify(requirements)) return (await this.readEnvironment(id))!
      return this.withWriter(() => this.createEnvironment(id, requirements, true))
    })
  }

  /** Shared additions compile against core pins and commit a new generation after validation. */
  install(requirements: readonly string[], dryRun = false): Promise<string> {
    this.validateRequirements(requirements)
    return this.serial(async () => {
      await this.prepare()
      return this.withWriter(async () => {
        const receipt = await this.readReceipt('active')
        const requested = [...new Set([...(receipt?.identity === this.identity ? receipt.requirements : []), ...requirements])]
        const lock = await this.compile(requested, false)
        if (dryRun) return lock
        const paths = await this.createEnvironment('active', requested, false, lock)
        this.publish(paths)
        return lock
      })
    })
  }

  /** Apply exactly the resolution shown in a preview, rejecting stale shared state. */
  installLocked(requirements: readonly string[], lock: string, expectedRoot: string): Promise<void> {
    this.validateRequirements(requirements)
    return this.serial(async () => {
      if ((await this.prepare()).root !== expectedRoot) throw new Error('Dependency plan is stale; preview it again.')
      const paths = await this.withWriter(async () => {
        if ((await this.readEnvironment('active'))?.root !== expectedRoot) throw new Error('Another Host changed the dependency environment; preview again.')
        const receipt = await this.readReceipt('active')
        return this.createEnvironment('active', [...new Set([...(receipt?.requirements ?? []), ...requirements])], false, lock)
      })
      this.publish(paths)
    })
  }

  /** Restore the saved preceding generation; repeated rollback retains that target until another installation. */
  rollback(): Promise<PythonRuntimePaths> {
    return this.serial(async () => {
      await this.prepare()
      return this.withWriter(async () => {
        const previous = await this.readReceipt('previous')
        const paths = await this.readEnvironment('previous')
        if (!previous || !paths) throw new Error('No previous environment is available.')
        await this.probe(paths, this.payload!.imports)
        await this.writeReceipt('active', previous)
        this.publish(paths)
        return paths
      })
    })
  }

  private validateTopic(id: string): void { if (!/^skill-[a-z0-9][a-z0-9-]*$/u.test(id)) throw new Error('Invalid Python capability identifier.') }
  private validateRequirements(values: readonly string[]): void {
    if (!values.every(value => /^[A-Za-z0-9][A-Za-z0-9_.-]*(?:\[[A-Za-z0-9_,.-]+\])?(?:[<>=!~]=?[A-Za-z0-9*+!.,<>=~_-]+)?$/u.test(value))) throw new Error('Invalid Python dependency specification.')
  }
  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.running.then(() => { this.controller.signal.throwIfAborted(); return operation() })
    this.running = run.then(() => undefined, () => undefined)
    return run
  }
  private async withWriter<T>(operation: () => Promise<T>): Promise<T> {
    this.controller.signal.throwIfAborted()
    await mkdir(this.config.environmentRoot, { recursive: true })
    const path = join(this.config.environmentRoot, 'writer.lock')
    const acquire = () => open(path, 'wx')
    const lock = await acquire().catch(async error => {
      if (error.code !== 'EEXIST') throw error
      const recoveryPath = join(this.config.environmentRoot, 'writer-recovery.lock')
      const recovery = await open(recoveryPath, 'wx', 0o600).catch(failure => {
        if (failure.code === 'EEXIST') throw new Error('Python dependency preparation is running in another Host. Retry after it finishes.')
        throw failure
      })
      try {
        let saved: { pid: number }
        try { saved = z.object({ pid: z.number().int().positive() }).parse(JSON.parse(await readFile(path, 'utf8'))) }
        catch (failure) {
          if (failure instanceof Error && 'code' in failure && failure.code === 'ENOENT') return acquire()
          throw new Error('Python dependency writer metadata is unavailable. Retry after the other Host finishes; inspect writer.lock if the problem persists.')
        }
        try { process.kill(saved.pid, 0) }
        catch (failure) {
          if (failure instanceof Error && 'code' in failure && failure.code === 'ESRCH') { await rm(path); return acquire() }
          throw failure
        }
        throw new Error('Python dependency preparation is running in another Host. Retry after it finishes.')
      } finally {
        await recovery.close(); await rm(recoveryPath, { force: true })
      }
    })
    try { await lock.writeFile(JSON.stringify({ pid: process.pid })); this.controller.signal.throwIfAborted(); return await operation() }
    finally { await lock.close(); await rm(path, { force: true }) }
  }
  private async probe(paths: PythonRuntimePaths, imports: readonly string[]): Promise<void> {
    await this.command(paths.executable, ['-I', '-B', '-c', imports.map(name => `__import__(${JSON.stringify(name)})`).join(';')])
  }
  private publish(paths: PythonRuntimePaths): void {
    const environment = pythonRuntimeEnvironment(paths)
    for (const key of ['PYTHONHOME', 'PYTHONPATH', 'CONDA_PREFIX', 'CONDA_DEFAULT_ENV', 'ZEROWALL_PYTHON_ROOT', 'ZEROWALL_PYTHON_RUNTIME_ROOT', 'ZEROWALL_PYTHON_MANAGEMENT_ROOT', 'ZEROWALL_MCP_ENVIRONMENT_ROOT']) delete process.env[key]
    Object.assign(process.env, environment)
    this.active = paths; this.phase = 'ready'
  }

  /** Execute bounded children with explicit cancellation, platform and package-source isolation. */
  command(executable: string, args: string[], downloads = false): Promise<string> {
    this.controller.signal.throwIfAborted()
    const operation = new Promise<string>((resolveResult, reject) => {
      const env: NodeJS.ProcessEnv = { ...process.env }
      for (const key of Object.keys(env)) if (/^(?:UV_|PIP_|PYTHON|CONDA|VIRTUAL_ENV$)/u.test(key) || /KEY|SECRET|TOKEN|PASSWORD/iu.test(key)) delete env[key]
      Object.assign(env, { PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8', UV_PYTHON_DOWNLOADS: downloads ? 'automatic' : 'never', UV_HTTP_RETRIES: String(this.config.downloadAttempts ?? 3), UV_NO_PROGRESS: '1', UV_NO_CONFIG: '1', UV_CACHE_DIR: join(this.config.environmentRoot, 'cache'), UV_PYTHON_INSTALL_DIR: join(this.config.environmentRoot, 'interpreters') })
      const child = spawn(executable, args, { windowsHide: true, env, stdio: ['ignore', 'pipe', 'pipe'] })
      let output = ''; let errors = ''; let timedOut = false; let failure: Error | undefined
      const kill = () => { if (process.platform === 'win32' && child.pid) { const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); killer.on('error', () => child.kill()) } else child.kill('SIGKILL') }
      const abort = () => kill()
      this.controller.signal.addEventListener('abort', abort, { once: true })
      const timer = setTimeout(() => { timedOut = true; kill() }, this.config.timeoutMs)
      child.stdout.on('data', chunk => { output = (output + String(chunk)).slice(-2_000_000) })
      child.stderr.on('data', chunk => { errors = (errors + String(chunk)).slice(-20_000) })
      child.once('error', error => { failure = error })
      child.once('close', code => {
        clearTimeout(timer); this.controller.signal.removeEventListener('abort', abort)
        if (this.controller.signal.aborted) reject(new Error('Python dependency preparation was cancelled.'))
        else if (timedOut) reject(new Error('Python dependency preparation timed out. Retry in Python settings.'))
        else if (failure) reject(new Error('Unable to start the Python dependency command. Check the configured executable in Python settings.'))
        else if (code === 0) resolveResult(output || errors)
        else reject(new Error(`Python dependency operation failed (exit ${code}). Check the package specification and index in Python settings, then retry.`))
      })
      if (this.controller.signal.aborted) kill()
    })
    this.commands.add(operation)
    void operation.then(() => this.commands.delete(operation), () => this.commands.delete(operation))
    return operation
  }

  /** Stop dependent work before releasing the plugin. */
  async dispose(): Promise<void> { this.controller.abort(); await Promise.allSettled([this.pending, this.running, ...this.commands]) }
}

/** Resolve package assets or the carrier's separately supplied target resources. */
export function defaultAssetsRoot(): string { return fileURLToPath(new URL('../resources/runtime/', import.meta.url)).replace(/\.asar([\\/])/u, '.asar.unpacked$1') }
