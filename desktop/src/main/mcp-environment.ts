import { randomUUID, verify } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { access, appendFile, cp, lstat, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { delimiter, dirname, join, resolve } from 'node:path'
import { downloadArchive, extractArchive, requireFreeSpace } from './python-archive.js'
import { collectSnapshots } from './python-snapshots.js'
import { preparePackagePlan, applyPackagePlanFiles, applyIsolatedProfile, replayCustomizations, type StoredPackagePlan } from './python-packages.js'
import type { McpEnvironmentStatus, McpPythonInfo, McpPythonPackage, McpSkillAudit, PythonPackagePlan } from '../shared/contracts.js'

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
  coordinateHost?: boolean
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

/** Small durable diagnostic projection; full skill inventories stay in current.json and IPC. */
export function mcpEnvironmentDiagnostic(status: McpEnvironmentStatus): Record<string, unknown> {
  return {
    phase: status.phase,
    environmentVersion: status.environmentVersion,
    contentRevision: status.contentRevision,
    currentSlot: status.currentSlot,
    updated: status.updated,
    rollbackAvailable: status.rollbackAvailable,
    progress: status.progress,
    message: status.message,
    onlineEnvironmentVersion: status.onlineEnvironmentVersion,
    onlineContentRevision: status.onlineContentRevision,
    updateAvailable: status.updateAvailable,
    updateRequired: status.updateRequired,
    lastCheckedAt: status.lastCheckedAt,
    lastUpdateError: status.lastUpdateError,
    python: status.python,
    skillAuditSummary: status.skillAudit?.summary,
  }
}

export const MCP_ENVIRONMENT_KEYRING: Record<string, string> = {
  'stable-1': `-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAu8wAGfgRWqQBdIGcbkwPlBq01SjgEMybgNh3xVv0ej4=\n-----END PUBLIC KEY-----`,
  'stable-2': `-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAUvKwSI31zGGut3nRi4kRqZGg8eBJskIrfa8Xmp/7VJw=\n-----END PUBLIC KEY-----`,
  'stable-3': `-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA9DJ9yg3F5f67/cEE54AdIDtQshvLP0SF5gVe3F3X+wA=\n-----END PUBLIC KEY-----`,
}

export class McpEnvironmentController {
  private status: McpEnvironmentStatus = { phase: 'idle' }
  private operation?: Promise<McpEnvironmentStatus>
  private manifestCache = new Map<string, { stamp: string; value: Promise<McpEnvironmentManifest> }>()

  constructor(private readonly options: McpEnvironmentControllerOptions) {}

  async localStatus(): Promise<McpEnvironmentStatus> {
    const record = await readCurrent(this.options.root)
    if (!record?.root || record.health !== 'ready') return this.current()
    const manifest = await this.readInstalledManifest(record.root)
    return this.set({ ...environmentStatus('ready', manifest, record.root, record.slot ?? 'manual', false, record.rollbackAvailable === true), lastUpdateError: this.status.lastUpdateError,
      activeEnvironment: { snapshotId: record.root, environmentVersion: environmentVersion(manifest), contentRevision: contentRevision(manifest), pythonVersion: manifest.python.version, localRevision: record.localRevision } })
  }

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
      const overlayPath = current.overlayPath ?? pythonOverlayPath(this.options.root, manifest)
      await mkdir(overlayPath, { recursive: true })
      const versionResult = await execute(executable, ['--version'], current.root, undefined, { PYTHONPATH: [overlayPath, sitePackages].join(';'), PYTHONNOUSERSITE: '1' }, 20_000)
      const env = pythonEnvironment(overlayPath, sitePackages)
      const script = 'import importlib.metadata,json,sys\nrows=[]\nfor source,path in (("overlay",sys.argv[1]),("core",sys.argv[2])):\n for d in importlib.metadata.distributions(path=[path]):\n  rows.append({"name":d.metadata.get("Name") or d.name,"version":d.version,"location":str(d.locate_file("")),"source":source,"dependencies":d.requires or []})\nprint(json.dumps(rows))'
      const listed = await execute(executable, ['-c', script, overlayPath, sitePackages], current.root, undefined, env, 30_000)
      const required = new Map((manifest.dependencies?.corePackages ?? []).map(pkg => [pkg.name.toLowerCase().replace(/[-_.]+/gu, '-'), pkg.requiredVersion]))
      const raw = JSON.parse(listed.stdout.trim()) as Array<{ name: string; version: string; location?: string; source: 'core' | 'overlay' }>
      const history = await readFile(join(current.root, 'customization.json'), 'utf8').then(JSON.parse, () => undefined)
      const packages: McpPythonPackage[] = []
      for (const pkg of raw) {
        const key = pkg.name.toLowerCase().replace(/[-_.]+/gu, '-')
        const existing = packages.find(existing => pythonPackageName(existing.name) === key)
        if (existing) { existing.shadowedVersion = pkg.version; continue }
        const requiredVersion = required.get(key)
        packages.push({ ...pkg, upgradeHistory: history?.history?.filter((entry: { name: string }) => pythonPackageName(entry.name) === key), verificationMessage: history?.verifiedAt && current.customizations?.[key] ? `pip check、导入与相关功能验证通过（${history.verifiedAt}）` : undefined, previousVersion: history?.changes?.find((change: { name: string }) => pythonPackageName(change.name) === key)?.from, ...(current.extensionNames?.includes(key) ? { source: 'overlay' as const } : {}), ...(requiredVersion === undefined ? {} : { requiredVersion }), customized: current.customizations?.[key] !== undefined, health: pkg.source === 'core' ? 'locked' : 'healthy' })
      }
      packages.sort((a, b) => a.name.localeCompare(b.name))
      const needle = query.trim().toLowerCase()
      const profiles: NonNullable<McpPythonInfo['profiles']> = []
      for (const entry of await readdir(join(this.options.root, 'profiles'), { withFileTypes: true }).catch(() => [])) {
        if (!entry.isDirectory()) continue
        const record = await readFile(join(this.options.root, 'profiles', entry.name, 'current.json'), 'utf8').then(JSON.parse, () => undefined)
        if (record) profiles.push({ name: entry.name, status: record.snapshotId === current.root ? 'ready' : 'stale', sitePackages: record.sitePackages, packages: (record.wheels ?? []).map((wheel: { name: string; version: string }) => ({ name: wheel.name, version: wheel.version })) })
      }
      return { profiles, snapshotId: current.root, environmentVersion: environmentVersion(manifest), contentRevision: contentRevision(manifest), localRevision: current.localRevision, scannedAt: new Date().toISOString(), officialPackageCount: manifest.dependencies?.corePackages.length ?? 0, ready: true, version: `${versionResult.stdout}\n${versionResult.stderr}`.trim().replace(/^Python\s+/u, ''), executable, sitePackages, overlayPath, packageCount: packages.length, corePackageCount: packages.filter(pkg => pkg.source === 'core').length, overlayPackageCount: packages.filter(pkg => pkg.source === 'overlay').length, packages: needle === '' ? packages : packages.filter(pkg => pkg.name.toLowerCase().includes(needle)), skillAudit: manifest.skillsAudit ? { summary: manifest.skillsAudit.summary, skills: [] } : undefined }
    } catch (error) { return { ready: false, packages: [], message: sanitizeError(error) } }
  }

  async installPythonPackage(spec: string): Promise<McpPythonInfo> {
    const plan = await this.previewPackages([spec])
    if (plan.error) throw new Error(plan.error)
    return this.applyPackagePlan(plan.planId)
  }

  async checkPythonPackageUpdates(names: string[] = []): Promise<McpPythonInfo> {
    const info = await this.pythonInfo()
    const wanted = new Set(names.map(pythonPackageName))
    const pending = info.packages.filter(pkg => !wanted.size || wanted.has(pythonPackageName(pkg.name)))
    // Four bounded workers; checking one package never checks all 387 packages.
    await Promise.all(Array.from({ length: Math.min(4, pending.length) }, async () => {
      while (pending.length) {
        const pkg = pending.shift()!
        try {
          const response = await (this.options.fetcher ?? fetch)(`https://pypi.org/pypi/${encodeURIComponent(pkg.name)}/json`, { signal: AbortSignal.timeout(15_000) })
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          const data = await response.json() as { info: { version: string } }
          pkg.latestVersion = data.info.version
        } catch (error) { pkg.latestError = sanitizeError(error) }
      }
    }))
    if (info.executable && info.snapshotId) {
      const checked = info.packages.filter(pkg => pkg.latestVersion)
      const result = await execute(info.executable, ['-I', '-c', 'import json,sys; from packaging.version import Version; print(json.dumps([Version(latest)>Version(current) for current,latest in json.loads(sys.argv[1])]))', JSON.stringify(checked.map(pkg => [pkg.version, pkg.latestVersion]))], info.snapshotId)
      const available = JSON.parse(result.stdout) as boolean[]
      checked.forEach((pkg, index) => { pkg.updateAvailable = available[index]; if (pkg.updateAvailable) pkg.health = 'update-available' })
    }
    return info
  }

  async previewPackages(names: string[], profile?: string): Promise<PythonPackagePlan> {
    if (!Array.isArray(names) || !names.length || names.length > 50 || names.some(name => typeof name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]*(?:\[[A-Za-z0-9_,.-]+\])?(?:[=<>!~]=?[A-Za-z0-9.*+!<>=~.-]+)?$/u.test(name))) throw new Error('包名格式不安全，仅支持包名及版本约束。')
    const context = await this.pythonContext()
    if (profile && !/^[a-z][a-z0-9-]{0,39}$/u.test(profile)) throw new Error('Invalid dependency profile')
    const baseline = profile === 'sbol' ? ['numpy', 'biopython', 'sbol3>=1.0', 'tyto>=1.4'] : profile === 'circuit' ? ['numpy', 'biopython', 'biocrnpyler', 'bioscrape'] : []
    return preparePackagePlan(this.options.root, context, [...new Set([...names, ...baseline])], profile ? { ready: true, packages: [] } : await this.pythonInfo(), profile)
  }

  async previewUninstall(names: string[]): Promise<StoredPackagePlan> {
    if (!Array.isArray(names) || !names.length || names.length > 50 || names.some(name => typeof name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/u.test(name))) throw new Error('卸载只接受包名。')
    const context = await this.pythonContext()
    const info = await this.pythonInfo()
    const removals = [...new Set(names.map(pythonPackageName))]
    const required = new Set(['pip', 'packaging', 'setuptools', 'wheel', 'mcp', ...(context.manifest.dependencies?.corePackages.map(pkg => pythonPackageName(pkg.name)) ?? [])])
    for (const name of removals) {
      if (required.has(name)) throw new Error(`不能卸载必需依赖：${name}`)
      if (!info.packages.some(pkg => pythonPackageName(pkg.name) === name)) throw new Error(`依赖未安装：${name}`)
    }
    const code = `import sys,json,re,importlib.metadata as m\nfrom packaging.requirements import Requirement\nsys.path[:0]=json.loads(sys.argv[2])\nremoved=set(json.loads(sys.argv[1]));norm=lambda s:re.sub(r'[-_.]+','-',s).lower()\nblocked=[]\nfor d in m.distributions():\n if norm(d.metadata['Name']) in removed: continue\n for raw in d.requires or []:\n  r=Requirement(raw)\n  if norm(r.name) in removed and (r.marker is None or r.marker.evaluate()): blocked.append(d.metadata['Name']+' requires '+raw)\nprint(json.dumps(blocked))`
    const checked = await execute(context.executable, ['-I', '-B', '-c', code, JSON.stringify(removals), JSON.stringify([context.overlayPath, context.sitePackages])], context.root)
    const blockers = JSON.parse(checked.stdout) as string[]
    if (blockers.length) throw new Error(`仍有依赖使用这些包：${blockers.join('; ')}`)
    const plan: StoredPackagePlan = { planId: randomUUID(), snapshotId: context.root, requested: removals, changes: removals.map(name => ({ name, from: info.packages.find(pkg => pythonPackageName(pkg.name) === name)!.version, to: '(removed)' })), wheels: [], removals }
    await mkdir(join(this.options.root, 'plans'), { recursive: true })
    await writeFile(join(this.options.root, 'plans', `${plan.planId}.json`), JSON.stringify(plan))
    return plan
  }

  async updatePythonPackages(names: string[] = []): Promise<McpPythonInfo> {
    if (!names.length) throw new Error('请先选择要升级的依赖。')
    const plan = await this.previewPackages(names)
    if (plan.error) throw new Error(plan.error)
    return this.applyPackagePlan(plan.planId)
  }

  async applyPackagePlan(planId: string): Promise<McpPythonInfo> {
    if (!/^[a-f0-9-]{36}$/u.test(planId)) throw new Error('无效升级计划。')
    const current = await readCurrent(this.options.root)
    const plan = JSON.parse(await readFile(join(this.options.root, 'plans', `${planId}.json`), 'utf8')) as StoredPackagePlan
    if (current?.root && plan.snapshotId !== current.root && !plan.error) {
      const applied = await readFile(join(current.root, 'customization.json'), 'utf8').then(JSON.parse, () => undefined)
      if (applied?.planId === planId) return this.pythonInfo()
    }
    if (!current?.root || plan.snapshotId !== current.root || plan.error) throw new Error('环境已变化，请重新检查升级计划。')
    const context = await this.pythonContext()
    const inventory = await this.pythonInfo()
    if (plan.profile) {
      this.set({ ...this.status, phase: 'installing', progress: 15, message: `正在准备独立依赖目录：${plan.profile}` })
      await applyIsolatedProfile(this.options.root, context, plan)
      await this.localStatus()
      return this.pythonInfo()
    }
    const target = join(this.options.root, 'slots', `local-${randomUUID()}`)
    await requireFreeSpace(this.options.root, 5 * 1024 ** 3)
    this.set({ ...this.status, phase: 'installing', lastUpdateError: undefined, updateJob: { taskId: planId, kind: 'applyPackagePlan', stage: 'installing', canPause: false, packageNames: plan.changes.map(change => change.name) }, progress: 15, message: '正在准备独立依赖副本，当前任务继续使用原环境。' })
    try {
      let copied = 0; let lastCopyEvent = 0
      await cp(current.root, target, { recursive: true, filter: source => {
        if (source.includes('__pycache__')) return false
        copied++
        if (Date.now() - lastCopyEvent > 1000) { lastCopyEvent = Date.now(); this.set({ ...this.status, phase: 'installing', progress: 15, message: `正在准备依赖副本：已处理 ${copied} 个条目` }) }
        return true
      } })
      await applyPackagePlanFiles(this.options.root, context, target, plan)
      await this.verifyHealth(target, context.manifest)
      const localRevision = (current.localRevision ?? 0) + 1
      const overlayPath = join(target, 'user-overlay')
      await mkdir(overlayPath, { recursive: true })
      const customizations = { ...(current.customizations ?? {}) }
      for (const change of plan.changes) {
        if (plan.removals?.includes(pythonPackageName(change.name))) delete customizations[pythonPackageName(change.name)]
        else customizations[pythonPackageName(change.name)] = change.to
      }
      const removedPackages = [...new Set([...(current.removedPackages ?? []), ...(plan.removals ?? [])])].filter(name => !plan.wheels.some(wheel => pythonPackageName(wheel.name) === name))
      const verifiedAt = new Date().toISOString()
      const prior = await readFile(join(current.root, 'customization.json'), 'utf8').then(JSON.parse, () => undefined)
      const history = [...(prior?.history ?? []), ...plan.changes.map(change => ({ ...change, verifiedAt }))]
      await writeFile(join(target, 'customization.json'), JSON.stringify({ planId, localRevision, customizations, changes: plan.changes, history, verifiedAt }))
      await this.writeCurrent(current as unknown as Record<string, unknown>, 'rollback.json')
      const extensionNames = [...new Set([...inventory.packages.filter(pkg => pkg.source === 'overlay').map(pkg => pythonPackageName(pkg.name)), ...plan.changes.filter(change => !context.manifest.dependencies?.corePackages.some(pkg => pythonPackageName(pkg.name) === pythonPackageName(change.name))).map(change => pythonPackageName(change.name))])]
      await this.writeCurrent({ ...current, root: target, overlayPath, localRevision, customizations, removedPackages, extensionNames: extensionNames.filter(name => !removedPackages.includes(name)), rollbackAvailable: true, installedAt: new Date().toISOString(), manifest: context.manifest })
      await this.localStatus()
      const info = await this.pythonInfo()
      info.verification = { imports: true, pipCheck: true, message: '独立副本的依赖、导入和科研服务验证通过。' }
      return info
    } catch (error) { await rm(target, { recursive: true, force: true }).catch(() => undefined); throw error }
  }

  async rollback(): Promise<McpEnvironmentStatus> {
    const previous = JSON.parse(await readFile(join(this.options.root, 'rollback.json'), 'utf8')) as CurrentEnvironmentRecord
    if (!previous.root) throw new Error('没有可恢复的环境。')
    const manifest = await this.readInstalledManifest(previous.root)
    await this.verifyHealth(previous.root, manifest)
    await this.writeCurrent({ ...previous, manifest })
    return this.localStatus()
  }

  private async pythonContext(): Promise<{ root: string; executable: string; sitePackages: string; overlayPath: string; manifest: McpEnvironmentManifest }> {
    const current = await readCurrent(this.options.root)
    if (!current?.root || current.health !== 'ready') throw new Error('ZeroWall Python 尚未就绪。')
    const manifest = await this.readInstalledManifest(current.root)
    const overlayPath = current.overlayPath ?? pythonOverlayPath(this.options.root, manifest)
    await mkdir(overlayPath, { recursive: true })
    return { root: current.root, manifest, executable: join(current.root, manifest.python.relativeExecutable), sitePackages: join(current.root, manifest.python.relativeSitePackages), overlayPath }
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
      await this.localStatus()
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
      this.set({ phase: 'downloading', environmentVersion: environmentVersion(manifest), version: environmentVersion(manifest), progress: 5, message: '正在同步 ZeroWall Python' })
      const current = await readCurrent(this.options.root)
      const currentSlot = current?.slot === 'a' || current?.slot === 'b' ? current.slot : undefined
      const targetSlot: 'a' | 'b' = currentSlot === 'a' ? 'b' : 'a'
      const target = join(this.options.root, 'slots', `${targetSlot}-${randomUUID()}`)
      const temporary = `${target}.tmp-${process.pid}-${Date.now()}`
      const archivePath = join(this.options.root, 'downloads', `${manifest.archiveSha256}.part`)
      await requireFreeSpace(this.options.root, manifest.archiveSize * 5 + 512 * 1024 ** 2)
      try {
        let lastDownloadEvent = 0
        await downloadArchive({ url: manifest.archiveUrl, size: manifest.archiveSize, sha256: manifest.archiveSha256, path: archivePath, fetcher: this.options.fetcher, progress: (received, speed) => {
          if (Date.now() - lastDownloadEvent < 500 && received < manifest.archiveSize) return
          lastDownloadEvent = Date.now()
          this.set({ phase: 'downloading', progress: Math.round(received / manifest.archiveSize * 65), environmentVersion: environmentVersion(manifest), message: `正在下载 ${(received / 1024 ** 2).toFixed(1)} / ${(manifest.archiveSize / 1024 ** 2).toFixed(1)} MiB`, updateJob: { taskId: manifest.archiveSha256, kind: 'initialize', stage: 'downloading', canPause: true, receivedBytes: received, totalBytes: manifest.archiveSize, bytesPerSecond: speed } })
        } })
        this.set({ phase: 'verifying', environmentVersion: environmentVersion(manifest), version: environmentVersion(manifest), contentRevision: contentRevision(manifest), progress: 70, message: '正在验证 ZeroWall Python' })
        await rm(temporary, { recursive: true, force: true })
        await mkdir(temporary, { recursive: true })
        this.set({ phase: 'installing', environmentVersion: environmentVersion(manifest), version: environmentVersion(manifest), contentRevision: contentRevision(manifest), currentSlot: targetSlot, progress: 80, message: '正在安装 ZeroWall Python' })
        let lastInstallProgress = 0
        await extractZipInWorker(archivePath, temporary, (completed, total) => {
          const progress = total === 0 ? 91 : Math.min(91, 80 + Math.floor((completed / total) * 11))
          if (Date.now() - lastInstallProgress < 500 && completed < total) return
          lastInstallProgress = Date.now()
          this.set({ phase: 'installing', environmentVersion: environmentVersion(manifest), version: environmentVersion(manifest), contentRevision: contentRevision(manifest), currentSlot: targetSlot, progress, message: `正在解压 ${completed} / ${total} 个文件`, updateJob: { taskId: manifest.archiveSha256, kind: 'initialize', stage: 'installing', canPause: true, completedFiles: completed, totalFiles: total } })
        })
        this.set({ phase: 'installing', environmentVersion: environmentVersion(manifest), version: environmentVersion(manifest), contentRevision: contentRevision(manifest), currentSlot: targetSlot, progress: 92, message: '正在校验 Python 与科研服务' })
        await this.verifyHealth(temporary, manifest)
        await writeFile(join(temporary, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
        await mkdir(dirname(target), { recursive: true })
        await renameWithRetry(temporary, target)
      } catch (error) {
        await rm(temporary, { recursive: true, force: true })
        throw error
      }
      await mkdir(this.options.root, { recursive: true })
      if (current !== undefined && current.root && current.health === 'ready' && (current.slot === 'a' || current.slot === 'b')) {
        await this.writeCurrent({ ...current, root: current.root, slot: current.slot, rollbackAvailable: true, rollbackAt: new Date().toISOString() }, 'rollback.json')
      }
      const overlayPath = join(target, 'user-overlay')
      const previousOverlay = current?.overlayPath ?? pythonOverlayPath(this.options.root, manifest)
      await mkdir(overlayPath, { recursive: true })
      if (await pathExists(previousOverlay)) await cp(previousOverlay, overlayPath, { recursive: true })
      if (!this.options.healthCheck) await replayCustomizations(target, manifest, overlayPath, current?.customizations ?? {}, current?.removedPackages ?? [])
      if (current?.root && current.customizations) {
        const previousHistory = await readFile(join(current.root, 'customization.json'), 'utf8').then(JSON.parse, () => undefined)
        await writeFile(join(target, 'customization.json'), JSON.stringify({ ...previousHistory, customizations: current.customizations, verifiedAt: new Date().toISOString() }))
      }
      await this.writeCurrent({ mode: 'managed', environmentVersion: environmentVersion(manifest), contentRevision: contentRevision(manifest), archiveSha256: manifest.archiveSha256, root: target, overlayPath, customizations: current?.customizations, removedPackages: current?.removedPackages, extensionNames: current?.extensionNames, localRevision: current?.localRevision, slot: targetSlot, manifest, health: 'ready', installedAt: new Date().toISOString(), rollbackAvailable: current?.health === 'ready' && current.slot !== 'manual' })
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

  private async migrateLegacyCurrent(manifest: McpEnvironmentManifest): Promise<void> {
    const record = await readCurrent(this.options.root)
    if (record === undefined || typeof record.root !== 'string' || record.slot === 'a' || record.slot === 'b' || record.slot === 'manual') return
    const legacyRoot = resolve(record.root)
    try {
      const installed = await this.readInstalledManifest(legacyRoot)
      await this.verifyHealth(legacyRoot, installed)
      // Adopt metadata only: older processes may still be using the legacy directory.
      await this.writeCurrent({ ...record, mode: 'managed', root: legacyRoot, slot: 'a', environmentVersion: environmentVersion(installed), contentRevision: contentRevision(installed), archiveSha256: installed.archiveSha256, manifest: installed, health: 'ready', rollbackAvailable: false })
    } catch {
      // Leave the legacy directory untouched; the normal installer will create a fresh slot.
    }
  }

  private async readInstalledManifest(root: string, expectedVersion?: string): Promise<McpEnvironmentManifest> {
    const file = join(root, 'manifest.json')
    const info = await stat(file).catch(() => undefined)
    const stamp = info ? `${info.mtimeMs}:${info.size}:${expectedVersion ?? ''}` : ''
    const cached = this.manifestCache.get(root)
    if (stamp && cached?.stamp === stamp) return cached.value
    const value = (async () => {
      const embedded = await readFile(file, 'utf8').then(value => JSON.parse(value) as unknown, () => undefined)
      const acceptable = (candidate: unknown): McpEnvironmentManifest | undefined => {
        if (candidate === undefined) return undefined
        const manifest = validateManifest(candidate)
        return (expectedVersion === undefined || environmentVersion(manifest) === expectedVersion || manifest.version === expectedVersion) && verifyManifestWithKeyring(manifest, this.options.publicKey, this.options.publicKeys) ? manifest : undefined
      }
      const installed = acceptable(embedded)
      if (installed) return installed
      // Only legacy installations without a valid standalone manifest need the
      // large embedded record. Normal scans never parse both copies.
      const record = await readFile(join(this.options.root, 'current.json'), 'utf8').then(JSON.parse, () => ({}))
      const legacy = typeof record.root === 'string' && resolve(record.root) === resolve(root) ? acceptable(record.manifest) : undefined
      if (legacy) return legacy
      throw new Error('The selected MCP environment has no signed schema 2 manifest. Select a managed environment installed by ZeroWall Science.')
    })()
    if (stamp) {
      if (this.manifestCache.size >= 2) this.manifestCache.delete(this.manifestCache.keys().next().value!)
      this.manifestCache.set(root, { stamp, value })
      value.catch(() => { if (this.manifestCache.get(root)?.value === value) this.manifestCache.delete(root) })
    }
    return value
  }

  private async verifyHealth(root: string, manifest: McpEnvironmentManifest): Promise<void> {
    await assertEnvironmentFiles(root, manifest)
    await (this.options.healthCheck ?? verifyMcpEnvironmentHealth)(root, manifest)
  }

  private set(status: McpEnvironmentStatus): McpEnvironmentStatus {
    const active = status.activeEnvironment ?? ((status.phase === 'ready' || status.phase === 'manual') && status.python?.ready && status.message && !status.message.startsWith('发现')
      ? { snapshotId: status.message, environmentVersion: status.environmentVersion ?? '', contentRevision: status.contentRevision ?? 1, pythonVersion: status.python.version ?? '3.12.10' }
      : this.status.activeEnvironment)
    const working = ['checking', 'downloading', 'verifying', 'installing'].includes(status.phase)
    const job = working ? { taskId: this.status.updateJob?.taskId ?? randomUUID(), kind: 'initialize', stage: status.phase, canPause: status.phase !== 'verifying', ...status.updateJob, targetVersion: status.environmentVersion ?? this.status.updateJob?.targetVersion } : status.updateJob
    this.status = { ...status, activeEnvironment: active, updateJob: job,
      ...(active ? { environmentVersion: active.environmentVersion, contentRevision: active.contentRevision } : {}) }
    this.options.publish(this.current()); return this.current()
  }

  private async writeCurrent(record: Record<string, unknown>, fileName = 'current.json'): Promise<void> {
    await mkdir(this.options.root, { recursive: true })
    const current = join(this.options.root, fileName)
    const temporary = `${current}.tmp-${process.pid}-${Date.now()}`
    const manifest = record.manifest as McpEnvironmentManifest | undefined
    const compact = { ...record, ...(manifest ? { manifest: { environmentVersion: manifest.environmentVersion, python: manifest.python }, manifestPath: 'manifest.json' } : {}) }
    if (fileName === 'current.json' && this.options.coordinateHost) {
      const transactionId = randomUUID()
      const transaction = join(this.options.root, 'activation.json')
      const staging = `${transaction}.tmp`
      await writeFile(staging, JSON.stringify({ transactionId, candidate: compact, state: 'prepare', createdAt: Date.now() }))
      await renameWithRetry(staging, transaction)
      this.set({ ...this.status, phase: 'verifying', progress: 97, message: '正在准备科研服务切换，原任务继续运行。' })
      const deadline = Date.now() + 180_000
      let ready = false
      while (Date.now() < deadline) {
        const reply = await readFile(join(this.options.root, 'activation-ready.json'), 'utf8').then(JSON.parse, () => undefined)
        if (reply?.transactionId === transactionId) {
          if (reply.error) throw new Error(`新服务验证失败：${reply.error}`)
          ready = true; break
        }
        await new Promise(resolve => setTimeout(resolve, 200))
      }
      if (!ready) throw new Error('科研服务切换准备超时，保留当前环境。')
    }
    await writeFile(temporary, `${JSON.stringify(compact)}\n`, 'utf8')
    await replaceFileWithRetry(temporary, current)
    if (fileName === 'current.json') this.status.lastUpdateError = undefined
    if (fileName === 'current.json') await collectSnapshots(this.options.root).catch(() => undefined)
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
  return { phase, activeEnvironment: root ? { snapshotId: root, environmentVersion: environmentVersion(manifest), contentRevision: contentRevision(manifest), pythonVersion: manifest.python.version } : undefined, environmentVersion: environmentVersion(manifest), contentRevision: contentRevision(manifest), currentSlot: slot, updated, rollbackAvailable, version: environmentVersion(manifest), progress: phase === 'ready' || phase === 'manual' ? 100 : undefined, message: root, python: pythonStatus(manifest, root), skillAudit: manifest.skillsAudit ? { summary: manifest.skillsAudit.summary, skills: [] } : undefined }
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
  return spec.trim().match(/^[A-Za-z0-9][A-Za-z0-9_.-]*/u)?.[0]?.toLowerCase().replace(/[-_.]+/gu, '-') ?? ''
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
  extensionNames?: string[]
  overlayPath?: string
  localRevision?: number
  customizations?: Record<string, string>
  removedPackages?: string[]
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

const pointerCache = new Map<string, { stamp: string; value: Promise<CurrentEnvironmentRecord> }>()
async function readCurrent(root: string): Promise<CurrentEnvironmentRecord | undefined> {
  try {
    const path = join(root, 'current.json'); const info = await stat(path)
    const stamp = `${info.mtimeMs}:${info.size}`
    const cached = pointerCache.get(path)
    if (cached?.stamp === stamp) return await cached.value
    const value = readFile(path, 'utf8').then(text => {
      const record = JSON.parse(text) as CurrentEnvironmentRecord
      const manifest = record.manifest as McpEnvironmentManifest | undefined
      if (manifest) record.manifest = { environmentVersion: manifest.environmentVersion, python: manifest.python }
      return record
    })
    if (pointerCache.size >= 16) pointerCache.delete(pointerCache.keys().next().value!)
    pointerCache.set(path, { stamp, value })
    return await value
  } catch { pointerCache.delete(join(root, 'current.json')); return undefined }
}

async function pathExists(path: string): Promise<boolean> {
  try { await access(path); return true } catch { return false }
}

// Kept for existing consumers; execution occurs in the dedicated updater process.
export const extractZipInWorker = extractArchive
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
  await renameWithRetry(temporary, destination)
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
    const timer = setTimeout(() => finish(new Error(`MCP server health check timed out: ${args.at(-1) ?? command}`)), 120_000)
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
  const expected = manifest.python.version
  if (!new RegExp(`Python ${expected.replaceAll('.', '\\.')}(${expected.split('.').length === 3 ? '\\s|$' : '\\.|\\s|$'})`, 'u').test(reported)) throw new Error(`Managed Python version does not match ${manifest.python.version}.`)
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
