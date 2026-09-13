import { createHash, verify } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { createInterface } from 'node:readline'
import { access, appendFile, cp, lstat, mkdir, open, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { delimiter, dirname, join, resolve } from 'node:path'
import { Worker } from 'node:worker_threads'
import type { McpEnvironmentStatus, McpPythonInfo, McpPythonPackage, McpSkillAudit } from '../shared/contracts.js'

export interface McpEnvironmentManifest {
  schema: 2
  /** Stable MCP runtime identity, independent of the desktop app version. */
  environmentVersion?: string
  /** @deprecated old releases used the desktop app version here. */
  version?: string
  contentRevision?: number
  environmentId: 'claude-science-mcp' | 'zerowall-python'
  platform: 'win32'
  architecture: 'x64'
  archiveUrl: string
  archiveSha256: string
  archiveSize: number
  python: { version: string; relativeExecutable: string; relativeSitePackages: string; modules: string[]; supportsZeroWallTool: boolean; layers?: string[]; dependencyManifests?: string[] }
  pythonHealth: { imports: string[]; bioServer: string; ketcherServer: string }
  skillsRoot: string
  sci: { version: string; nodeMinimum: string; cli: string; mcp: string }
  mcp: { bioToolsVersion: string; ketcherChemistryVersion: string; sciMasterVersion: string; publicToolCount: number; internalToolCount: number; servers: string[] }
  source: { claudeScienceRuntime: string; sourceHashes: Record<string, string> }
  dependencies?: { corePackages: Array<{ name: string; requiredVersion: string }>; userOverlay: { enabled: boolean; path: string; requirementsFile: string } }
  skillsAudit?: McpSkillAudit
  updatePolicy?: { required: boolean; reason?: string }
  signature: { algorithm: 'ed25519'; keyId: string; value: string }
}

export interface McpEnvironmentControllerOptions {
  root: string
  manifestUrl: string
  publicKey: string
  /** Trusted verification keys by manifest key id. */
  publicKeys?: Record<string, string>
  fetcher?: typeof fetch
  healthCheck?(root: string, manifest: McpEnvironmentManifest): Promise<void>
  /** Optional durable diagnostic log. Failures must remain inspectable after the UI closes. */
  diagnosticPath?: string
  publish(status: McpEnvironmentStatus): void
}

export const MCP_ENVIRONMENT_KEYRING: Record<string, string> = {
  'stable-1': `-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAu8wAGfgRWqQBdIGcbkwPlBq01SjgEMybgNh3xVv0ej4=\n-----END PUBLIC KEY-----`,
  'stable-2': `-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAUvKwSI31zGGut3nRi4kRqZGg8eBJskIrfa8Xmp/7VJw=\n-----END PUBLIC KEY-----`,
  'stable-3': `-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA9DJ9yg3F5f67/cEE54AdIDtQshvLP0SF5gVe3F3X+wA=\n-----END PUBLIC KEY-----`,
}

export class McpEnvironmentController {
  private status: McpEnvironmentStatus = { phase: 'idle' }
  private operation?: Promise<McpEnvironmentStatus>

  constructor(private readonly options: McpEnvironmentControllerOptions) {}

  current(): McpEnvironmentStatus { return { ...this.status } }

  initialize(): Promise<McpEnvironmentStatus> {
    if (this.operation !== undefined) return this.operation
    this.operation = this.install().finally(() => { this.operation = undefined })
    return this.operation
  }

  retry(): Promise<McpEnvironmentStatus> { return this.initialize() }

  /** Check the signed feed without downloading an archive. */
  async checkForUpdates(): Promise<McpEnvironmentStatus> {
    // A foreground refresh must never replace downloading/installing progress
    // with the still-active slot's ready state.
    if (this.operation !== undefined) return this.current()
    try {
      const manifest = await this.fetchManifest()
      const record = await readCurrent(this.options.root)
      const currentManifest = record?.root && record.health === 'ready' ? await this.readInstalledManifest(record.root).catch(() => undefined) : undefined
      const root = record?.root ?? ''
      const slot = record?.slot === 'a' || record?.slot === 'b' || record?.slot === 'manual' ? record.slot : undefined
      const status = environmentStatus(currentManifest ? 'ready' : 'checking', currentManifest ?? manifest, root, slot ?? 'manual', false, record?.rollbackAvailable === true)
      status.onlineEnvironmentVersion = environmentVersion(manifest)
      status.onlineContentRevision = contentRevision(manifest)
      status.updateAvailable = currentManifest === undefined || environmentVersion(currentManifest) !== environmentVersion(manifest) || contentRevision(currentManifest) !== contentRevision(manifest) || currentManifest.archiveSha256 !== manifest.archiveSha256
      status.updateRequired = status.updateAvailable && manifest.updatePolicy?.required === true
      status.lastCheckedAt = new Date().toISOString()
      if (status.updateAvailable) status.message = `发现科研环境 ${environmentVersion(manifest)}（内容修订 ${contentRevision(manifest)}）可更新`
      return this.set(status)
    } catch (error) {
      return this.set({ ...this.status, phase: this.status.phase === 'ready' ? 'ready' : 'failed', message: sanitizeError(error), lastCheckedAt: new Date().toISOString() })
    }
  }

  /** Start an update and return immediately; progress is published as events. */
  updateForUser(): McpEnvironmentStatus {
    if (this.operation !== undefined) return this.current()
    this.set({ ...this.status, phase: 'checking', progress: 0, message: '科研环境更新任务已启动', lastUpdateError: undefined })
    void this.initialize()
    return this.current()
  }

  /** Check and install the latest signed environment without blocking startup. */
  async autoUpdate(): Promise<McpEnvironmentStatus> {
    return await this.initialize()
  }

  async pythonInfo(query = ''): Promise<McpPythonInfo> {
    const current = await readCurrent(this.options.root)
    if (!current?.root || current.health !== 'ready') return { ready: false, packages: [], message: 'ZeroWall Python 尚未就绪。' }
    try {
      const manifest = await this.readInstalledManifest(current.root)
      const executable = join(current.root, manifest.python.relativeExecutable)
      const sitePackages = join(current.root, manifest.python.relativeSitePackages)
      const overlayPath = pythonOverlayPath(this.options.root, manifest)
      await mkdir(overlayPath, { recursive: true })
      const versionResult = await execute(executable, ['--version'], current.root, undefined, { PYTHONPATH: [overlayPath, sitePackages].join(';'), PYTHONNOUSERSITE: '1' }, 20_000)
      const env = pythonEnvironment(overlayPath, sitePackages)
      const script = 'import importlib.metadata,json,sys\nrows=[]\nfor source,path in (("overlay",sys.argv[1]),("core",sys.argv[2])):\n for d in importlib.metadata.distributions(path=[path]):\n  rows.append({"name":d.metadata.get("Name") or d.name,"version":d.version,"location":str(d.locate_file("")),"source":source})\nprint(json.dumps(rows))'
      const listed = await execute(executable, ['-c', script, overlayPath, sitePackages], current.root, undefined, env, 30_000)
      const required = new Map((manifest.dependencies?.corePackages ?? []).map(pkg => [pkg.name.toLowerCase().replaceAll('_', '-'), pkg.requiredVersion]))
      const raw = JSON.parse(listed.stdout.trim()) as Array<{ name: string; version: string; location?: string; source: 'core' | 'overlay' }>
      const packages: McpPythonPackage[] = []
      for (const pkg of raw) {
        const key = pkg.name.toLowerCase().replaceAll('_', '-')
        if (packages.some(existing => existing.name.toLowerCase().replaceAll('_', '-') === key)) continue
        const requiredVersion = required.get(key)
        packages.push({ ...pkg, ...(requiredVersion === undefined ? {} : { requiredVersion }), health: pkg.source === 'core' ? 'locked' : 'healthy' })
      }
      packages.sort((a, b) => a.name.localeCompare(b.name))
      const needle = query.trim().toLowerCase()
      return { ready: true, version: `${versionResult.stdout}\n${versionResult.stderr}`.trim().replace(/^Python\s+/u, ''), executable, sitePackages, overlayPath, packageCount: packages.length, corePackageCount: packages.filter(pkg => pkg.source === 'core').length, overlayPackageCount: packages.filter(pkg => pkg.source === 'overlay').length, packages: needle === '' ? packages : packages.filter(pkg => pkg.name.toLowerCase().includes(needle)), skillAudit: manifest.skillsAudit }
    } catch (error) { return { ready: false, packages: [], message: sanitizeError(error) } }
  }

  async installPythonPackage(spec: string): Promise<McpPythonInfo> {
    const normalized = spec.trim()
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*(?:\[[A-Za-z0-9_,.-]+\])?(?:[=<>!~]=?[A-Za-z0-9.*+!<>=~.-]+)?$/u.test(normalized)) throw new Error('包名格式不安全，仅支持 PyPI 包名及版本约束。')
    const current = await readCurrent(this.options.root)
    if (!current?.root || current.health !== 'ready') throw new Error('ZeroWall Python 尚未就绪。')
    const manifest = await this.readInstalledManifest(current.root)
    const requestedName = pythonPackageName(normalized)
    const core = new Set((manifest.dependencies?.corePackages ?? []).map(pkg => pkg.name.toLowerCase().replaceAll('_', '-')))
    if (core.has(requestedName)) throw new Error('该包属于签名核心环境，不能单独覆盖；请通过科研环境更新。')
    const executable = join(current.root, manifest.python.relativeExecutable)
    const sitePackages = join(current.root, manifest.python.relativeSitePackages)
    const overlayPath = pythonOverlayPath(this.options.root, manifest)
    await this.mutateOverlay(overlayPath, async () => {
      await execute(executable, ['-m', 'pip', 'install', '--disable-pip-version-check', '--no-input', '--upgrade', '--target', overlayPath, normalized], current.root!, undefined, pythonEnvironment(overlayPath, sitePackages), 180_000)
      const validation = 'import importlib,importlib.metadata,sys\nd=importlib.metadata.distribution(sys.argv[1])\ntops=[x.strip() for x in (d.read_text("top_level.txt") or "").splitlines() if x.strip() and not x.startswith("_")]\nif tops: importlib.import_module(tops[0])'
      await execute(executable, ['-c', validation, requestedName], current.root!, undefined, pythonEnvironment(overlayPath, sitePackages), 30_000)
      await execute(executable, ['-m', 'pip', 'check'], current.root!, undefined, pythonEnvironment(overlayPath, sitePackages), 60_000)
    })
    await saveRequestedPackage(this.options.root, normalized)
    const info = await this.pythonInfo()
    info.verification = { imports: true, pipCheck: true, message: '安装包导入与 pip check 均通过。' }
    return info
  }

  async checkPythonPackageUpdates(): Promise<McpPythonInfo> {
    const context = await this.pythonContext()
    const result = await execute(context.executable, ['-m', 'pip', 'list', '--outdated', '--format=json', '--path', context.overlayPath], context.root, undefined, pythonEnvironment(context.overlayPath, context.sitePackages), 120_000)
    const updates = new Map((JSON.parse(result.stdout || '[]') as Array<{ name: string; latest_version: string }>).map(item => [item.name.toLowerCase().replaceAll('_', '-'), item.latest_version]))
    const info = await this.pythonInfo()
    info.packages = info.packages.map(pkg => {
      const latestVersion = pkg.source === 'overlay' ? updates.get(pkg.name.toLowerCase().replaceAll('_', '-')) : undefined
      return { ...pkg, ...(latestVersion ? { latestVersion, updateAvailable: true, health: 'update-available' as const } : {}) }
    })
    return info
  }

  async updatePythonPackages(names: string[] = []): Promise<McpPythonInfo> {
    const context = await this.pythonContext()
    const info = await this.checkPythonPackageUpdates()
    const available = info.packages.filter(pkg => pkg.source === 'overlay' && pkg.updateAvailable === true)
    const requested = names.length === 0 ? available.map(pkg => pkg.name) : names
    if (requested.length === 0) return info
    const overlayNames = new Set(info.packages.filter(pkg => pkg.source === 'overlay').map(pkg => pkg.name.toLowerCase().replaceAll('_', '-')))
    for (const name of requested) if (!overlayNames.has(pythonPackageName(name))) throw new Error(`只能更新用户扩展包：${name}`)
    await this.mutateOverlay(context.overlayPath, async () => {
      await execute(context.executable, ['-m', 'pip', 'install', '--disable-pip-version-check', '--no-input', '--upgrade', '--target', context.overlayPath, ...requested], context.root, undefined, pythonEnvironment(context.overlayPath, context.sitePackages), 180_000)
      await execute(context.executable, ['-m', 'pip', 'check'], context.root, undefined, pythonEnvironment(context.overlayPath, context.sitePackages), 60_000)
    })
    const updated = await this.pythonInfo()
    updated.verification = { imports: true, pipCheck: true, message: '用户扩展包更新与 pip check 均通过。' }
    return updated
  }

  private async pythonContext(): Promise<{ root: string; executable: string; sitePackages: string; overlayPath: string; manifest: McpEnvironmentManifest }> {
    const current = await readCurrent(this.options.root)
    if (!current?.root || current.health !== 'ready') throw new Error('ZeroWall Python 尚未就绪。')
    const manifest = await this.readInstalledManifest(current.root)
    const overlayPath = pythonOverlayPath(this.options.root, manifest)
    await mkdir(overlayPath, { recursive: true })
    return { root: current.root, manifest, executable: join(current.root, manifest.python.relativeExecutable), sitePackages: join(current.root, manifest.python.relativeSitePackages), overlayPath }
  }

  private async mutateOverlay(overlayPath: string, action: () => Promise<void>): Promise<void> {
    const backup = `${overlayPath}.rollback`
    const existed = await pathExists(overlayPath)
    await rm(backup, { recursive: true, force: true })
    if (existed) await rename(overlayPath, backup)
    await mkdir(overlayPath, { recursive: true })
    if (existed) await cp(backup, overlayPath, { recursive: true })
    try { await action(); await rm(backup, { recursive: true, force: true }) }
    catch (error) { await rm(overlayPath, { recursive: true, force: true }); if (existed) await rename(backup, overlayPath); throw error }
  }

  async selectManual(root: string): Promise<McpEnvironmentStatus> {
    const selected = resolve(root)
    const manifest = await this.readInstalledManifest(selected)
    await this.verifyHealth(selected, manifest)
    await mkdir(this.options.root, { recursive: true })
    await this.writeCurrent({ mode: 'manual', environmentVersion: environmentVersion(manifest), contentRevision: contentRevision(manifest), root: selected, slot: 'manual', health: 'ready', manifest, installedAt: new Date().toISOString() })
    return this.set(environmentStatus('manual', manifest, selected, 'manual', false, false))
  }

  private async install(): Promise<McpEnvironmentStatus> {
    let requestedManifest: McpEnvironmentManifest | undefined
    try {
      if (process.platform !== 'win32' || process.arch !== 'x64') return this.set({ phase: 'unavailable', message: 'ZeroWall Python 当前仅支持 Windows x64。' })
      if (this.options.publicKey.trim() === '') throw new Error('The ZeroWall Python verification key is not configured.')
      await this.cleanupTemporaryInstallations()
      this.set({ phase: 'checking', progress: 0, message: '正在检查 ZeroWall Python' })
      const manifest = await this.fetchManifest()
      requestedManifest = manifest
      await this.migrateLegacyCurrent(manifest)
      const installed = await this.installedRoot(manifest)
      if (installed !== undefined) {
        const status = environmentStatus('ready', manifest, installed.root, installed.slot, false, installed.rollbackAvailable)
        status.onlineEnvironmentVersion = environmentVersion(manifest); status.onlineContentRevision = contentRevision(manifest); status.updateAvailable = false; status.lastCheckedAt = new Date().toISOString()
        return this.set(status)
      }
      const recovered = await this.recoverInstalledRoot(manifest)
      if (recovered !== undefined) {
        const current = await readCurrent(this.options.root)
        if (current?.root && current.health === 'ready' && (current.slot === 'a' || current.slot === 'b') && resolve(current.root) !== resolve(recovered.root)) {
          await this.writeCurrent({ ...current, rollbackAvailable: true, rollbackAt: new Date().toISOString() }, 'rollback.json')
        }
        await this.writeCurrent({ mode: 'managed', environmentVersion: environmentVersion(manifest), contentRevision: contentRevision(manifest), archiveSha256: manifest.archiveSha256, root: recovered.root, slot: recovered.slot, manifest, health: 'ready', installedAt: new Date().toISOString(), rollbackAvailable: current?.health === 'ready' && current.slot !== 'manual' })
        await this.recordDiagnostic({ event: 'recovered_installed_slot', root: recovered.root, slot: recovered.slot, environmentVersion: environmentVersion(manifest), contentRevision: contentRevision(manifest) })
        const status = environmentStatus('ready', manifest, recovered.root, recovered.slot, true, current?.health === 'ready' && current.slot !== 'manual')
        status.onlineEnvironmentVersion = environmentVersion(manifest); status.onlineContentRevision = contentRevision(manifest); status.updateAvailable = false; status.lastCheckedAt = new Date().toISOString()
        return this.set(status)
      }
      this.set({ phase: 'downloading', environmentVersion: environmentVersion(manifest), version: environmentVersion(manifest), progress: 5, message: '正在同步 ZeroWall Python' })
      const fetcher = this.options.fetcher ?? fetch
      const archiveResponse = await fetcher(manifest.archiveUrl, { cache: 'no-store' })
      if (!archiveResponse.ok) throw new Error(`ZeroWall Python archive returned HTTP ${archiveResponse.status}.`)
      const current = await readCurrent(this.options.root)
      const currentSlot = current?.slot === 'a' || current?.slot === 'b' ? current.slot : undefined
      const targetSlot: 'a' | 'b' = currentSlot === 'a' ? 'b' : 'a'
      let target = join(this.options.root, 'slots', targetSlot)
      const temporary = `${target}.tmp-${process.pid}-${Date.now()}`
      const archivePath = join(this.options.root, `.download-${process.pid}-${Date.now()}.zip`)
      try {
        const downloaded = await this.downloadArchiveWithProgress(archiveResponse, manifest, archivePath)
        this.set({ phase: 'verifying', environmentVersion: environmentVersion(manifest), version: environmentVersion(manifest), contentRevision: contentRevision(manifest), progress: 70, message: '正在验证 ZeroWall Python' })
        if (downloaded.byteLength !== manifest.archiveSize || downloaded.sha256 !== manifest.archiveSha256) throw new Error('ZeroWall Python archive hash or size is invalid.')
        await rm(temporary, { recursive: true, force: true })
        await mkdir(temporary, { recursive: true })
        this.set({ phase: 'installing', environmentVersion: environmentVersion(manifest), version: environmentVersion(manifest), contentRevision: contentRevision(manifest), currentSlot: targetSlot, progress: 80, message: '正在安装 ZeroWall Python' })
        let lastInstallProgress = 80
        await extractZipInWorker(archivePath, temporary, (completed, total) => {
          const progress = total === 0 ? 91 : Math.min(91, 80 + Math.floor((completed / total) * 11))
          if (progress <= lastInstallProgress) return
          lastInstallProgress = progress
          this.set({ phase: 'installing', environmentVersion: environmentVersion(manifest), version: environmentVersion(manifest), contentRevision: contentRevision(manifest), currentSlot: targetSlot, progress, message: `正在安装 ZeroWall Python ${completed} / ${total}` })
        })
        this.set({ phase: 'installing', environmentVersion: environmentVersion(manifest), version: environmentVersion(manifest), contentRevision: contentRevision(manifest), currentSlot: targetSlot, progress: 92, message: '正在校验 Python 与科研服务' })
        await this.verifyHealth(temporary, manifest)
        await writeFile(join(temporary, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
        await mkdir(dirname(target), { recursive: true })
        // The inactive slot may still be held by a stale Python/MCP process
        // from a previous desktop instance. Prefer the stable A/B path, but
        // never let a Windows sharing violation prevent a fresh installation.
        try {
          await removePathWithRetry(target)
        } catch (error) {
          await this.recordDiagnostic({ event: 'slot_replace_fallback', target, error: describeError(error) })
          target = join(this.options.root, 'slots', `${targetSlot}-${environmentVersion(manifest)}-${Date.now()}`)
          await mkdir(dirname(target), { recursive: true })
        }
        await renameWithRetry(temporary, target)
      } catch (error) {
        await rm(temporary, { recursive: true, force: true })
        throw error
      } finally {
        await rm(archivePath, { force: true }).catch(() => undefined)
      }
      await mkdir(this.options.root, { recursive: true })
      if (current !== undefined && current.root && current.health === 'ready' && (current.slot === 'a' || current.slot === 'b')) {
        await this.writeCurrent({ ...current, root: current.root, slot: current.slot, rollbackAvailable: true, rollbackAt: new Date().toISOString() }, 'rollback.json')
      }
      await this.writeCurrent({ mode: 'managed', environmentVersion: environmentVersion(manifest), contentRevision: contentRevision(manifest), archiveSha256: manifest.archiveSha256, root: target, slot: targetSlot, manifest, health: 'ready', installedAt: new Date().toISOString(), rollbackAvailable: current?.health === 'ready' && current.slot !== 'manual' })
      const status = environmentStatus('ready', manifest, target, targetSlot, true, current?.health === 'ready' && current.slot !== 'manual')
      status.onlineEnvironmentVersion = environmentVersion(manifest); status.onlineContentRevision = contentRevision(manifest); status.updateAvailable = false; status.lastCheckedAt = new Date().toISOString()
      return this.set(status)
    } catch (error) {
      await this.recordDiagnostic({ event: 'install_failed', error: describeError(error), requestedManifest: requestedManifest === undefined ? undefined : { environmentVersion: environmentVersion(requestedManifest), contentRevision: contentRevision(requestedManifest), archiveSha256: requestedManifest.archiveSha256 } })
      const retained = await this.currentHealthyRoot()
      if (retained !== undefined) {
        const status = environmentStatus('ready', retained.manifest, retained.root, retained.slot, false, retained.rollbackAvailable)
        status.lastUpdateError = sanitizeError(error)
        if (requestedManifest !== undefined) {
          status.onlineEnvironmentVersion = environmentVersion(requestedManifest)
          status.onlineContentRevision = contentRevision(requestedManifest)
          status.updateAvailable = true
        }
        return this.set(status)
      }
      return this.set({ phase: 'failed', message: sanitizeError(error) })
    }
  }

  private async downloadArchiveWithProgress(response: Response, manifest: McpEnvironmentManifest, archivePath: string): Promise<{ byteLength: number; sha256: string }> {
    await mkdir(dirname(archivePath), { recursive: true })
    const file = await open(archivePath, 'wx')
    const hash = createHash('sha256')
    let received = 0
    let lastProgress = 5
    try {
      if (response.body === null) {
        const chunk = new Uint8Array(await response.arrayBuffer())
        await file.write(chunk)
        hash.update(chunk)
        received = chunk.byteLength
      } else {
        const reader = response.body.getReader()
        while (true) {
          const result = await reader.read()
          if (result.done) break
          await file.write(result.value)
          hash.update(result.value)
          received += result.value.byteLength
          const ratio = manifest.archiveSize > 0 ? Math.min(received / manifest.archiveSize, 1) : 0
          const progress = Math.min(68, 5 + Math.floor(ratio * 63))
          if (progress > lastProgress) {
            lastProgress = progress
            const receivedMb = (received / 1024 / 1024).toFixed(1)
            const totalMb = (manifest.archiveSize / 1024 / 1024).toFixed(1)
            this.set({ phase: 'downloading', environmentVersion: environmentVersion(manifest), version: environmentVersion(manifest), contentRevision: contentRevision(manifest), progress, message: `正在下载 ZeroWall Python ${receivedMb} MB / ${totalMb} MB` })
          }
        }
      }
    } finally {
      await file.close()
    }
    return { byteLength: received, sha256: hash.digest('hex') }
  }

  private async fetchManifest(): Promise<McpEnvironmentManifest> {
    if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('ZeroWall Python 仅支持 Windows x64。')
    if (this.options.publicKey.trim() === '') throw new Error('ZeroWall Python verification key is not configured.')
    const response = await (this.options.fetcher ?? fetch)(this.options.manifestUrl, { cache: 'no-store' })
    if (!response.ok) throw new Error(`MCP environment manifest returned HTTP ${response.status}.`)
    const manifest = validateManifest(await response.json())
    if (!verifyManifestWithKeyring(manifest, this.options.publicKey, this.options.publicKeys)) throw new Error('MCP environment manifest signature is invalid.')
    return manifest
  }

  private async cleanupTemporaryInstallations(): Promise<void> {
    for (const directory of [join(this.options.root, 'slots'), join(this.options.root, 'versions')]) {
      let entries
      try { entries = await readdir(directory, { withFileTypes: true }) } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
        throw error
      }
      for (const entry of entries.filter(entry => entry.isDirectory() && entry.name.includes('.tmp-'))) {
        try { await removePathWithRetry(join(directory, entry.name)) }
        catch (error) { await this.recordDiagnostic({ event: 'temporary_cleanup_failed', path: join(directory, entry.name), error: describeError(error) }) }
      }
    }
  }

  private async currentHealthyRoot(): Promise<{ root: string; slot: 'a' | 'b' | 'manual'; manifest: McpEnvironmentManifest; rollbackAvailable: boolean } | undefined> {
    try {
      const record = await readCurrent(this.options.root)
      if (typeof record?.root !== 'string' || record.health !== 'ready') return undefined
      const manifest = await this.readInstalledManifest(record.root)
      await this.verifyHealth(record.root, manifest)
      const slot = record.slot === 'a' || record.slot === 'b' ? record.slot : 'manual'
      return { root: record.root, slot, manifest, rollbackAvailable: record.rollbackAvailable === true }
    } catch { return undefined }
  }

  private async installedRoot(manifest: McpEnvironmentManifest): Promise<{ root: string; slot: 'a' | 'b' | 'manual'; rollbackAvailable: boolean } | undefined> {
    try {
      const record = await readCurrent(this.options.root)
      if (typeof record?.root !== 'string' || record.health !== 'ready') return undefined
      const installed = await this.readInstalledManifest(record.root)
      if (environmentVersion(installed) !== environmentVersion(manifest) || contentRevision(installed) !== contentRevision(manifest) || installed.archiveSha256 !== manifest.archiveSha256) return undefined
      await this.verifyHealth(record.root, installed)
      const slot = record.slot === 'a' || record.slot === 'b' ? record.slot : 'manual'
      return { root: record.root, slot, rollbackAvailable: record.rollbackAvailable === true }
    } catch { return undefined }
  }

  private async recoverInstalledRoot(manifest: McpEnvironmentManifest): Promise<{ root: string; slot: 'a' | 'b' } | undefined> {
    const slots = join(this.options.root, 'slots')
    let entries
    try { entries = await readdir(slots, { withFileTypes: true }) } catch { return undefined }
    const candidates = entries
      .filter(entry => entry.isDirectory() && /^(?:a|b)(?:-|$)/u.test(entry.name) && !entry.name.includes('.tmp-'))
      .sort((left, right) => right.name.localeCompare(left.name))
    for (const entry of candidates) {
      const root = join(slots, entry.name)
      try {
        const candidate = await readFile(join(root, 'manifest.json'), 'utf8').then(value => validateManifest(JSON.parse(value) as unknown))
        if (environmentVersion(candidate) !== environmentVersion(manifest) || contentRevision(candidate) !== contentRevision(manifest) || candidate.archiveSha256 !== manifest.archiveSha256) continue
        if (!verifyManifestWithKeyring(candidate, this.options.publicKey, this.options.publicKeys)) continue
        await this.verifyHealth(root, candidate)
        return { root, slot: entry.name.startsWith('a') ? 'a' : 'b' }
      } catch {
        // A partial or unhealthy orphan is ignored; normal installation follows.
      }
    }
    return undefined
  }

  private async migrateLegacyCurrent(manifest: McpEnvironmentManifest): Promise<void> {
    const record = await readCurrent(this.options.root)
    if (record === undefined || typeof record.root !== 'string' || record.slot === 'a' || record.slot === 'b' || record.slot === 'manual') return
    const legacyRoot = resolve(record.root)
    try {
      const installed = await this.readInstalledManifest(legacyRoot)
      await this.verifyHealth(legacyRoot, installed)
      const target = join(this.options.root, 'slots', 'a')
      await mkdir(dirname(target), { recursive: true })
      if (!(await pathExists(target))) await rename(legacyRoot, target)
      await this.writeCurrent({ ...record, mode: 'managed', root: target, slot: 'a', environmentVersion: environmentVersion(installed), contentRevision: contentRevision(installed), archiveSha256: installed.archiveSha256, manifest: installed, health: 'ready', rollbackAvailable: false })
      await rm(join(this.options.root, 'versions'), { recursive: true, force: true })
    } catch {
      // Leave the legacy directory untouched; the normal installer will create a fresh slot.
    }
  }

  private async readInstalledManifest(root: string, expectedVersion?: string): Promise<McpEnvironmentManifest> {
    const record = await readFile(join(this.options.root, 'current.json'), 'utf8')
      .then(value => JSON.parse(value) as { manifest?: unknown })
      .catch((): { manifest?: unknown } => ({}))
    const embedded = await readFile(join(root, 'manifest.json'), 'utf8').then(value => JSON.parse(value) as unknown, () => undefined)
    for (const candidate of [record.manifest, embedded]) if (candidate !== undefined) {
      const manifest = validateManifest(candidate)
      if ((expectedVersion === undefined || environmentVersion(manifest) === expectedVersion || manifest.version === expectedVersion) && verifyManifestWithKeyring(manifest, this.options.publicKey, this.options.publicKeys)) return manifest
    }
    throw new Error('The selected MCP environment has no signed schema 2 manifest. Select a managed environment installed by ZeroWall Science.')
  }

  private async verifyHealth(root: string, manifest: McpEnvironmentManifest): Promise<void> {
    await assertEnvironmentFiles(root, manifest)
    await (this.options.healthCheck ?? verifyMcpEnvironmentHealth)(root, manifest)
  }

  private set(status: McpEnvironmentStatus): McpEnvironmentStatus { this.status = status; this.options.publish(this.current()); return this.current() }

  private async writeCurrent(record: Record<string, unknown>, fileName = 'current.json'): Promise<void> {
    await mkdir(this.options.root, { recursive: true })
    const current = join(this.options.root, fileName)
    const temporary = `${current}.tmp-${process.pid}-${Date.now()}`
    await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, 'utf8')
    await replaceFileWithRetry(temporary, current)
  }

  private async recordDiagnostic(event: Record<string, unknown>): Promise<void> {
    const path = this.options.diagnosticPath ?? join(this.options.root, '..', 'mcp-environment.log')
    try {
      await mkdir(dirname(path), { recursive: true })
      await appendFile(path, `${JSON.stringify({ timestamp: new Date().toISOString(), ...event })}\n`, 'utf8')
    } catch {
      // Diagnostics must never make an otherwise recoverable update fail.
    }
  }
}

export function validateManifest(value: unknown): McpEnvironmentManifest {
  if (value === null || typeof value !== 'object') throw new Error('MCP environment manifest must be an object.')
  const item = value as Record<string, unknown>
  if (item.schema !== 2 || !['claude-science-mcp', 'zerowall-python'].includes(String(item.environmentId)) || item.platform !== 'win32' || item.architecture !== 'x64') throw new Error('ZeroWall Python manifest identity or target is invalid.')
  if ((typeof item.environmentVersion !== 'string' || item.environmentVersion.trim() === '') && (typeof item.version !== 'string' || item.version.trim() === '')) throw new Error('MCP environment manifest field environmentVersion is required.')
  for (const key of ['archiveUrl', 'archiveSha256']) if (typeof item[key] !== 'string' || item[key] === '') throw new Error(`MCP environment manifest field ${key} is required.`)
  if (!String(item.archiveUrl).startsWith('https://')) throw new Error('MCP environment archive URL must use HTTPS.')
  if (!/^[a-f0-9]{64}$/u.test(String(item.archiveSha256)) || !Number.isSafeInteger(item.archiveSize) || Number(item.archiveSize) <= 0) throw new Error('MCP environment archive metadata is invalid.')
  const signature = item.signature as Record<string, unknown> | undefined
  if (signature?.algorithm !== 'ed25519' || typeof signature.value !== 'string' || signature.value.length === 0 || typeof signature.keyId !== 'string' || signature.keyId.length === 0) throw new Error('MCP environment signature is invalid.')
  const pythonHealth = item.pythonHealth as Record<string, unknown> | undefined
  const sci = item.sci as Record<string, unknown> | undefined
  const mcp = item.mcp as Record<string, unknown> | undefined
  if (!Array.isArray(pythonHealth?.imports) || !pythonHealth.imports.every(item => typeof item === 'string') || typeof pythonHealth.bioServer !== 'string' || typeof pythonHealth.ketcherServer !== 'string') throw new Error('MCP environment Python health metadata is invalid.')
  const python = item.python as Record<string, unknown> | undefined
  if (typeof python?.version !== 'string' || typeof python.relativeExecutable !== 'string' || typeof python.relativeSitePackages !== 'string' || !Array.isArray(python.modules) || !python.modules.every(value => typeof value === 'string') || python.supportsZeroWallTool !== true) throw new Error('MCP environment Python runtime metadata is invalid.')
  if (typeof item.skillsRoot !== 'string' || item.skillsRoot.trim() === '' || typeof sci?.version !== 'string' || typeof sci.nodeMinimum !== 'string' || typeof sci.cli !== 'string' || typeof sci.mcp !== 'string') throw new Error('MCP environment SciMaster metadata is invalid.')
  if (item.contentRevision !== undefined && (!Number.isSafeInteger(item.contentRevision) || Number(item.contentRevision) < 1)) throw new Error('MCP environment content revision is invalid.')
  if (typeof mcp?.sciMasterVersion !== 'string' || !Array.isArray(mcp.servers) || !mcp.servers.every(item => typeof item === 'string')) throw new Error('MCP environment server metadata is invalid.')
  if (item.dependencies !== undefined) {
    const dependencies = item.dependencies as Record<string, unknown>
    if (!Array.isArray(dependencies.corePackages) || !dependencies.corePackages.every(pkg => typeof pkg === 'object' && pkg !== null && typeof (pkg as Record<string, unknown>).name === 'string' && typeof (pkg as Record<string, unknown>).requiredVersion === 'string')) throw new Error('MCP environment dependency metadata is invalid.')
  }
  if (item.skillsAudit !== undefined) {
    const audit = item.skillsAudit as Record<string, unknown>
    if (!Array.isArray(audit.skills) || typeof audit.summary !== 'object' || audit.summary === null) throw new Error('MCP environment Skills audit metadata is invalid.')
  }
  return value as McpEnvironmentManifest
}

export function canonicalManifest(manifest: McpEnvironmentManifest): Buffer {
  const { signature: _signature, ...unsigned } = manifest
  return Buffer.from(JSON.stringify(unsigned))
}

export function verifyManifest(manifest: McpEnvironmentManifest, publicKey: string): boolean {
  return verify(null, canonicalManifest(manifest), publicKey, Buffer.from(manifest.signature.value, 'base64'))
}

export function verifyManifestWithKeyring(manifest: McpEnvironmentManifest, currentKey: string, keyring: Record<string, string> = {}): boolean {
  const key = keyring[manifest.signature.keyId] ?? (manifest.signature.keyId === 'stable-1' ? currentKey : undefined)
  return key !== undefined && verifyManifest(manifest, key)
}

function environmentVersion(manifest: McpEnvironmentManifest): string {
  return manifest.environmentVersion ?? manifest.version ?? 'legacy'
}

function environmentStatus(phase: McpEnvironmentStatus['phase'], manifest: McpEnvironmentManifest, root: string, slot: 'a' | 'b' | 'manual', updated: boolean, rollbackAvailable: boolean): McpEnvironmentStatus {
  return { phase, environmentVersion: environmentVersion(manifest), contentRevision: contentRevision(manifest), currentSlot: slot, updated, rollbackAvailable, version: environmentVersion(manifest), progress: phase === 'ready' || phase === 'manual' ? 100 : undefined, message: root, python: pythonStatus(manifest, root), skillAudit: manifest.skillsAudit }
}

function pythonStatus(manifest: McpEnvironmentManifest, root: string): NonNullable<McpEnvironmentStatus['python']> {
  return { ready: true, version: manifest.python.version, executable: root ? join(root, manifest.python.relativeExecutable) : undefined, sitePackages: manifest.python.relativeSitePackages }
}

function contentRevision(manifest: McpEnvironmentManifest): number { return manifest.contentRevision ?? 1 }
function pythonOverlayPath(root: string, manifest: McpEnvironmentManifest): string {
  const runtime = manifest.python.version.match(/^\d+\.\d+/u)?.[0] ?? manifest.python.version
  return join(root, 'python-overlay', `python-${runtime.replace(/[^A-Za-z0-9.-]/gu, '-')}`)
}

function pythonEnvironment(overlayPath: string, sitePackages: string): Record<string, string> {
  return { PYTHONPATH: [overlayPath, sitePackages].join(delimiter), PYTHONNOUSERSITE: '1' }
}

function pythonPackageName(spec: string): string {
  return spec.trim().match(/^[A-Za-z0-9][A-Za-z0-9_.-]*/u)?.[0]?.toLowerCase().replaceAll('_', '-') ?? ''
}

async function saveRequestedPackage(root: string, spec: string): Promise<void> {
  const path = join(root, 'python-overlay', 'requirements-user.txt')
  await mkdir(dirname(path), { recursive: true })
  const requested = await readFile(path, 'utf8').then(text => text.split(/\r?\n/u).filter(Boolean), () => [])
  const name = pythonPackageName(spec)
  const rows = [...requested.filter(row => pythonPackageName(row) !== name), spec].sort((a, b) => a.localeCompare(b))
  await writeFile(path, `${rows.join('\n')}\n`, 'utf8')
}

interface CurrentEnvironmentRecord {
  mode?: string
  environmentVersion?: string
  version?: string
  contentRevision?: number
  archiveSha256?: string
  root?: string
  slot?: 'a' | 'b' | 'manual'
  health?: string
  manifest?: unknown
  rollbackAvailable?: boolean
  installedAt?: string
}

async function readCurrent(root: string): Promise<CurrentEnvironmentRecord | undefined> {
  try { return JSON.parse(await readFile(join(root, 'current.json'), 'utf8')) as CurrentEnvironmentRecord } catch { return undefined }
}

async function pathExists(path: string): Promise<boolean> {
  try { await access(path); return true } catch { return false }
}

const ZIP_EXTRACTION_WORKER = String.raw`
const { parentPort, workerData } = require('node:worker_threads')
const fs = require('node:fs/promises')
const path = require('node:path')
const imported = require(workerData.jsZipPath)
const JSZip = imported.default || imported

async function run() {
  const zip = await JSZip.loadAsync(await fs.readFile(workerData.archivePath))
  const entries = Object.values(zip.files).filter(entry => !entry.dir)
  let completed = 0
  const progressStep = Math.max(1, Math.floor(entries.length / 100))
  for (const entry of entries) {
    const name = path.normalize(entry.name.replaceAll('/', path.sep))
    if (path.isAbsolute(name) || name === '..' || name.startsWith('..' + path.sep)) throw new Error('MCP environment archive contains an unsafe path.')
    const destination = path.resolve(workerData.target, name)
    const relation = path.relative(workerData.target, destination)
    if (relation === '..' || relation.startsWith('..' + path.sep) || path.isAbsolute(relation)) throw new Error('MCP environment archive escapes its installation directory.')
    await fs.mkdir(path.dirname(destination), { recursive: true })
    await fs.writeFile(destination, await entry.async('nodebuffer'), { flag: 'wx' })
    completed += 1
    if (completed === entries.length || completed % progressStep === 0) parentPort.postMessage({ type: 'progress', completed, total: entries.length })
  }
  parentPort.postMessage({ type: 'done' })
}

run().catch(error => parentPort.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) }))
`

export async function extractZipInWorker(archivePath: string, target: string, onProgress: (completed: number, total: number) => void = () => undefined): Promise<void> {
  const jsZipPath = createRequire(import.meta.url).resolve('jszip')
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const worker = new Worker(ZIP_EXTRACTION_WORKER, { eval: true, workerData: { archivePath, target, jsZipPath } })
    let settled = false
    const finish = (error?: Error): void => {
      if (settled) return
      settled = true
      void worker.terminate()
      if (error === undefined) resolvePromise()
      else rejectPromise(error)
    }
    worker.on('message', (message: { type?: unknown; completed?: unknown; total?: unknown; message?: unknown }) => {
      if (message.type === 'progress' && typeof message.completed === 'number' && typeof message.total === 'number') onProgress(message.completed, message.total)
      else if (message.type === 'done') finish()
      else if (message.type === 'error') finish(new Error(typeof message.message === 'string' ? message.message : 'MCP environment extraction failed.'))
    })
    worker.once('error', finish)
    worker.once('exit', code => { if (!settled) finish(new Error(`MCP environment extraction worker exited with code ${code}.`)) })
  })
}
function describeError(error: unknown): { message: string; code?: string; path?: string; syscall?: string } {
  const item = error as NodeJS.ErrnoException
  return { message: sanitizeError(error), ...(typeof item?.code === 'string' ? { code: item.code } : {}), ...(typeof item?.path === 'string' ? { path: item.path } : {}), ...(typeof item?.syscall === 'string' ? { syscall: item.syscall } : {}) }
}

function sanitizeError(error: unknown): string {
  const item = error as NodeJS.ErrnoException
  const message = (error instanceof Error ? error.message : String(error)).replace(/https?:\/\/[^\s]+/gu, '[download-url]').slice(0, 500)
  const details = [typeof item?.code === 'string' ? `code=${item.code}` : '', typeof item?.path === 'string' ? `path=${item.path}` : ''].filter(Boolean)
  return details.length === 0 ? message : `${message} (${details.join(', ')})`
}

async function removePathWithRetry(path: string, attempts = 8): Promise<void> {
  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await rm(path, { recursive: true, force: true, maxRetries: 2, retryDelay: 250 })
      return
    } catch (error) {
      lastError = error
      const code = (error as NodeJS.ErrnoException)?.code
      if (code !== 'EACCES' && code !== 'EPERM' && code !== 'EBUSY' && code !== 'ENOTEMPTY') throw error
      await new Promise(resolvePromise => setTimeout(resolvePromise, 250 * Math.min(attempt + 1, 4)))
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Unable to remove ${path}`)
}

async function renameWithRetry(from: string, to: string, attempts = 8): Promise<void> {
  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try { await rename(from, to); return }
    catch (error) {
      lastError = error
      const code = (error as NodeJS.ErrnoException)?.code
      if (code !== 'EACCES' && code !== 'EPERM' && code !== 'EBUSY' && code !== 'ENOTEMPTY') throw error
      await new Promise(resolvePromise => setTimeout(resolvePromise, 250 * Math.min(attempt + 1, 4)))
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Unable to rename ${from} to ${to}`)
}

async function replaceFileWithRetry(temporary: string, destination: string): Promise<void> {
  const backup = `${destination}.replace-${process.pid}-${Date.now()}`
  let movedExisting = false
  try {
    if (await pathExists(destination)) {
      await renameWithRetry(destination, backup)
      movedExisting = true
    }
    await renameWithRetry(temporary, destination)
    if (movedExisting) await removePathWithRetry(backup)
  } catch (error) {
    if (!(await pathExists(destination)) && movedExisting && await pathExists(backup)) {
      await renameWithRetry(backup, destination).catch(() => undefined)
    }
    throw error
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined)
  }
}

async function assertRegularFile(path: string): Promise<void> {
  await access(path)
  const info = await lstat(path)
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`MCP environment entry must be a regular file: ${path}`)
}

export async function assertEnvironmentFiles(root: string, manifest: McpEnvironmentManifest): Promise<void> {
  const paths = [
    manifest.python.relativeExecutable,
    'bio-tools/run_server.py',
    'ketcher-chemistry/server.js',
    manifest.sci.cli,
    manifest.sci.mcp,
  ].map(path => join(root, path))
  await Promise.all(paths.map(assertRegularFile))
  const sitePackages = await lstat(join(root, manifest.python.relativeSitePackages))
  if (!sitePackages.isDirectory() || sitePackages.isSymbolicLink()) throw new Error(`MCP environment Python site-packages directory is invalid: ${join(root, manifest.python.relativeSitePackages)}`)
  const skills = join(root, manifest.skillsRoot)
  const info = await lstat(skills)
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`MCP environment Skills directory is invalid: ${skills}`)
}

interface ProcessResult { stdout: string; stderr: string }

function execute(command: string, args: string[], cwd: string, input?: string, extraEnv: Record<string, string> = {}, timeoutMs = 15_000): Promise<ProcessResult> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(command, args, { cwd, windowsHide: true, env: { ...process.env, ...extraEnv, ELECTRON_RUN_AS_NODE: '1' }, stdio: 'pipe' })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => { child.kill(); reject(new Error(`MCP process timed out: ${args.at(-1) ?? command}`)) }, timeoutMs)
    child.stdout.setEncoding('utf8').on('data', value => { stdout += value })
    child.stderr.setEncoding('utf8').on('data', value => { stderr += value })
    child.once('error', error => { clearTimeout(timer); reject(error) })
    child.once('exit', code => { clearTimeout(timer); code === 0 ? resolveResult({ stdout, stderr }) : reject(new Error((stderr || stdout || `process exited ${code}`).trim().slice(0, 500))) })
    if (input !== undefined) child.stdin.end(input)
  })
}

async function checkMcpServer(command: string, args: string[], cwd: string): Promise<void> {
  const initialize = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'zerowall-health', version: '1' } } })
  const initialized = JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })
  const tools = JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
  await new Promise<void>((resolveCheck, reject) => {
    const child = spawn(command, args, { cwd, windowsHide: true, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: 'pipe' })
    const lines = createInterface({ input: child.stdout })
    let phase: 'initialize' | 'tools' = 'initialize'
    let finishing = false
    let settled = false
    const settle = (error?: Error) => { if (settled) return; settled = true; error === undefined ? resolveCheck() : reject(error) }
    const finish = (error?: Error) => {
      if (finishing) return
      finishing = true; clearTimeout(timer); lines.close()
      if (child.exitCode !== null) return settle(error)
      child.once('exit', () => settle(error))
      child.kill()
      const exitTimer = setTimeout(() => settle(error), 2_000); exitTimer.unref()
    }
    const timer = setTimeout(() => finish(new Error(`MCP server health check timed out: ${args.at(-1) ?? command}`)), 15_000)
    child.once('error', error => finish(error))
    child.once('exit', code => { if (!finishing) finish(new Error(`MCP server exited before health check completed (${code ?? 'unknown'}): ${args.at(-1) ?? command}`)) })
    child.stderr.resume()
    lines.on('line', line => {
      let reply: { id?: number; result?: unknown; error?: unknown }
      try { reply = JSON.parse(line) as typeof reply } catch { return }
      if (phase === 'initialize' && reply.id === 1) {
        if (reply.error !== undefined || reply.result === undefined) return finish(new Error(`MCP initialize failed: ${args.at(-1) ?? command}`))
        phase = 'tools'
        child.stdin.write(`${initialized}\n${tools}\n`)
      } else if (phase === 'tools' && reply.id === 2) {
        const result = reply.result as { tools?: unknown } | undefined
        if (reply.error !== undefined || result === undefined || !Array.isArray(result.tools)) return finish(new Error(`MCP tools/list failed: ${args.at(-1) ?? command}`))
        finish()
      }
    })
    child.stdin.write(`${initialize}\n`)
  })
}

export async function verifyMcpEnvironmentHealth(root: string, manifest: McpEnvironmentManifest): Promise<void> {
  const python = join(root, manifest.python.relativeExecutable)
  const node = process.execPath
  const pythonVersion = await execute(python, ['--version'], root)
  const reported = `${pythonVersion.stdout}\n${pythonVersion.stderr}`
  const expected = manifest.python.version.match(/^\d+\.\d+/u)?.[0] ?? manifest.python.version
  if (!new RegExp(`Python ${expected.replace('.', '\\.')}(?:\\.|\\s|$)`, 'u').test(reported)) throw new Error(`Managed Python version does not match ${manifest.python.version}.`)
  // Importing the full scientific stack can take minutes on a cold Windows
  // machine. Three representative, lightweight imports are sufficient here;
  // the complete package inventory remains visible in the Python panel.
  const healthImports = selectPythonHealthImports([...manifest.pythonHealth.imports, ...manifest.python.modules])
  if (healthImports.length > 0) {
    await execute(python, ['-c', `import ${healthImports.join(', ')}`], root, undefined, { PYTHONPATH: join(root, manifest.python.relativeSitePackages), PYTHONNOUSERSITE: '1' }, 30_000)
  }
  await checkMcpServer(python, [join(root, 'bio-tools', 'run_server.py'), 'mcp_bio'], join(root, 'bio-tools'))
  await checkMcpServer(node, [join(root, 'ketcher-chemistry', 'server.js')], join(root, 'ketcher-chemistry'))
  await checkMcpServer(node, [join(root, manifest.sci.mcp)], join(root, 'sci'))
}

export function selectPythonHealthImports(imports: string[]): string[] {
  const preferred = ['mcp', 'numpy', 'pandas']
  const declared = imports.filter(name => /^[A-Za-z_][A-Za-z0-9_.]*$/u.test(name))
  return [...preferred.filter(name => declared.includes(name)), ...declared]
    .filter((name, index, values) => values.indexOf(name) === index)
    .slice(0, 3)
}
