import { renameFile } from './atomic-file.js'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { PythonUpdaterService } from './python-updater-service.js'
import type { PackageInstallFailure, StoredPackagePlan } from './python-packages.js'
import { assertManifestWheels, dependencyManifestSha256, fetchPythonDependencyManifest, parsePythonDependencyManifest, PythonManifestUnavailableError, type PythonDependencyManifest } from './python-dependency-manifest.js'
import type { PythonDependencyLayer } from '../shared/contracts.js'

type Updater = Pick<PythonUpdaterService, 'pythonInfo' | 'previewDependencyManifest' | 'applyPackagePlan'> & Partial<Pick<PythonUpdaterService, 'pythonPackages'>>
export interface PythonSyncProgress {
  stage: string
  message: string
  progress?: number
  completedPackages?: number
  totalPackages?: number
  currentPackage?: string
  logLine?: string
}
export type ReportPythonSyncProgress = (progress: PythonSyncProgress) => void | Promise<void>
interface Options {
  updater: Updater
  root: string
  keys: Record<string, string>
  applicationVersion: string
  feedUrl: string
  /** Optional feed dedicated to the small core dependency manifest. */
  coreFeedUrl?: string
  fetcher?: typeof fetch
  bundledManifestPath?: string
  bundledCoreManifestPath?: string
}
type ManifestSource = 'remote' | 'bundled' | 'cache'

/** Signed dependency updates share the durable updater queue, but manifest
 * checks and previews are read-only with respect to the active interpreter. */
export class PythonSyncService {
  constructor(private options: Options) {}
  private get directory(): string { return join(this.options.root, 'dependency-sync') }
  private async save(name: string, value: unknown): Promise<void> {
    await mkdir(this.directory, { recursive: true })
    const temporary = join(this.directory, `${name}.${randomUUID()}.tmp`)
    await writeFile(temporary, JSON.stringify(value))
    await renameFile(temporary, join(this.directory, name))
  }
  private manifestFile(layer: PythonDependencyLayer): string {
    return layer === 'core' ? 'core-manifest.json' : 'manifest.json'
  }
  private async cached(layer: PythonDependencyLayer = 'science'): Promise<PythonDependencyManifest> {
    const value = JSON.parse(await readFile(join(this.directory, this.manifestFile(layer)), 'utf8'))
    const manifest = parsePythonDependencyManifest(value, this.options.keys, this.options.applicationVersion)
    const declaredLayer = manifest.layer ?? 'science'
    if (declaredLayer !== layer && !(layer === 'capability' && declaredLayer === 'science')) throw new Error(`缓存清单层级不匹配：需要 ${layer}。`)
    return manifest
  }
  private async bundled(layer: PythonDependencyLayer): Promise<PythonDependencyManifest | undefined> {
    const path = layer === 'core' ? this.options.bundledCoreManifestPath : this.options.bundledManifestPath
    if (!path) return undefined
    try {
      const manifest = parsePythonDependencyManifest(JSON.parse(await readFile(path, 'utf8')), this.options.keys, this.options.applicationVersion)
      // A resource file with the wrong layer must never be used as the core
      // contract. This also prevents an old science manifest from masquerading
      // as the 42-package startup set.
      const declaredLayer = manifest.layer ?? 'science'
      if (declaredLayer !== layer && !(layer === 'capability' && declaredLayer === 'science')) return undefined
      return manifest
    } catch { return undefined }
  }
  async importManifest(file: string): Promise<void> {
    const manifest = parsePythonDependencyManifest(JSON.parse(await readFile(file, 'utf8')), this.options.keys, this.options.applicationVersion)
    const layer = manifest.layer ?? 'science'
    const previous = await this.cached(layer).catch(() => undefined)
    if (previous && compareRevision(previous.revision, manifest.revision) > 0) throw new Error('依赖清单降级必须通过回滚完成。')
    await this.save(this.manifestFile(layer), manifest)
  }
  async checkManifest(layer: PythonDependencyLayer = 'science', capabilityId?: string, report?: ReportPythonSyncProgress) {
    await report?.({ stage: 'manifest', progress: 5, message: '正在读取并验签依赖清单。' })
    const candidates: Array<{ manifest: PythonDependencyManifest; source: ManifestSource }> = []
    const bundled = await this.bundled(layer)
    const cached = await this.cached(layer).catch(() => undefined)
    if (bundled) candidates.push({ manifest: bundled, source: 'bundled' })
    if (cached) candidates.push({ manifest: cached, source: 'cache' })
    let remoteError: string | undefined
    try {
      await report?.({ stage: 'remote-catalog', progress: 15, message: '正在检查签名资源目录。' })
      const remote = await fetchPythonDependencyManifest(layer === 'core' ? (this.options.coreFeedUrl ?? this.options.feedUrl) : this.options.feedUrl, this.options.keys, { fetcher: this.options.fetcher, applicationVersion: this.options.applicationVersion })
      const declaredLayer = remote.layer ?? 'science'
      if (declaredLayer === layer || (layer === 'capability' && declaredLayer === 'science')) candidates.push({ manifest: remote, source: 'remote' })
      else remoteError = `远程清单层级不匹配：需要 ${layer}，收到 ${remote.layer ?? 'science'}`
    } catch (error) {
      // Invalid signatures and malformed documents are hard failures. Network
      // and publication gaps may use a verified local candidate, but remain
      // visible in the status so the user knows the feed was not trusted.
      if (!(error instanceof PythonManifestUnavailableError)) throw error
      remoteError = error instanceof Error ? error.message : String(error)
    }
    if (!candidates.length) throw new Error(remoteError ?? '未找到可用的已签名 Python 依赖清单。')
    const priority: Record<ManifestSource, number> = { remote: 3, bundled: 2, cache: 1 }
    candidates.sort((a, b) => compareRevision(b.manifest.revision, a.manifest.revision) || priority[b.source] - priority[a.source])
    const selectedCandidate = candidates[0]!
    const manifest = selectedCandidate.manifest
    const source = selectedCandidate.source
    const selected = selectLayer(manifest, layer, capabilityId)
    await report?.({ stage: 'inventory', progress: 35, message: '正在读取当前 Python 包清单。' })
    const info = await this.packageInfo(selected.packages.map(pkg => pkg.name))
    if (info.ready && info.version && info.version !== manifest.pythonVersion) throw new Error('依赖清单需要不同的 Python 版本，请先更新运行环境。')
    await report?.({ stage: 'compare', progress: 80, message: `正在比较 ${manifest.packages.length} 个依赖版本。`, totalPackages: manifest.packages.length, completedPackages: 0 })
    await this.save(this.manifestFile(layer), manifest)
    const installed = new Map(info.packages.map(item => [normalizeName(item.name), item.version]))
    const changes: Array<{ name: string; from?: string; to: string; required: boolean; capabilities: string[] }> = []
    for (let index = 0; index < selected.packages.length; index++) {
      const pkg = selected.packages[index]!
      const current = installed.get(normalizeName(pkg.name))
      if (current !== pkg.version) changes.push({ name: pkg.name, ...(current ? { from: current } : {}), to: pkg.version, required: pkg.required, capabilities: pkg.capabilities })
      if ((index + 1) % 25 === 0 || index + 1 === selected.packages.length) {
        await report?.({ stage: 'compare', progress: 80 + Math.floor((index + 1) / Math.max(1, selected.packages.length) * 15), message: `正在比较依赖版本 ${index + 1}/${selected.packages.length}。`, totalPackages: selected.packages.length, completedPackages: index + 1 })
      }
    }
    const installedPackageCount = selected.packages.filter(pkg => installed.get(normalizeName(pkg.name)) === pkg.version).length
    const capabilityCounts = layer === 'core' ? undefined : Object.fromEntries([...new Set(selected.packages.flatMap(pkg => pkg.capabilities))].sort().map(capability => {
      const packages = selected.packages.filter(pkg => pkg.capabilities.includes(capability))
      const pending = packages.filter(pkg => installed.get(normalizeName(pkg.name)) !== pkg.version)
      return [capability, {
        packageCount: packages.length,
        installedPackageCount: packages.length - pending.length,
        pendingPackageCount: pending.length,
        changes: pending.map(pkg => ({ name: pkg.name, ...(installed.has(normalizeName(pkg.name)) ? { from: installed.get(normalizeName(pkg.name)) } : {}), to: pkg.version, required: pkg.required, capabilities: pkg.capabilities })),
      }]
    }))
    const result = { revision: manifest.revision, manifestRevision: manifest.revision, manifestSha256: dependencyManifestSha256(JSON.stringify(manifest)), layer, ...(capabilityId ? { capabilityId } : {}), packageCount: selected.packages.length, installedPackageCount, pendingPackageCount: Math.max(0, selected.packages.length - installedPackageCount), ...(capabilityCounts ? { capabilityCounts } : {}), pythonVersion: manifest.pythonVersion, environmentVersion: manifest.environmentVersion, changes, checkedAt: new Date().toISOString(), needsRuntime: !info.ready, scienceInstalled: layer === 'science' && selected.packages.length > 0 && changes.length === 0, available: selected.packages.length > 0, resourceAvailability: { layer, available: selected.packages.length > 0, source, packageCount: selected.packages.length, reason: remoteError }, remoteError, lastSyncError: undefined, source }
    await this.save('status.json', result)
    await report?.({ stage: 'complete', progress: 99, message: `依赖检查完成：${installedPackageCount}/${selected.packages.length} 已安装，${result.pendingPackageCount} 待安装。`, completedPackages: selected.packages.length, totalPackages: selected.packages.length })
    return result
  }
  async previewSync(layer: PythonDependencyLayer = 'science', capabilityId?: string, taskId?: string, report?: ReportPythonSyncProgress): Promise<StoredPackagePlan & { manifestRevision: string; manifestSha256: string }> {
    // `checkManifest` normally runs immediately before preview. Keep this
    // method usable on its own too: a fresh profile has no cached manifest yet,
    // so resolve and persist the signed catalog before building the plan.
    const manifest = await this.cached(layer).catch(async () => await this.checkManifest(layer, capabilityId, report).then(value => {
      if (!value || typeof value !== 'object' || !('revision' in value)) throw new Error('依赖清单检查未返回有效清单。')
      // checkManifest returns a summary; reload the verified persisted manifest
      // so the preview remains bound to the exact signed bytes.
      return this.cached(layer)
    }))
    const selected = selectLayer(manifest, layer, capabilityId)
    if (selected.packages.length === 0) throw new Error(`未找到 ${layer}${capabilityId ? `:${capabilityId}` : ''} 的已签名依赖资源。`)
    await report?.({ stage: 'preflight', progress: 0, message: `正在预检 ${selected.packages.length} 个 ${layer} 依赖的镜像、版本和安装兼容性。`, totalPackages: selected.packages.length })
    const plan = await this.options.updater.previewDependencyManifest(selected, taskId)
    if (plan.error) throw new Error(plan.error)
    assertManifestWheels(selected, plan.wheels, plan.manifestInstalled, (plan.preparationFailures ?? []).map(failure => failure.name))
    const bound = { ...plan, dependencyManifest: selected, manifestRevision: manifest.revision, manifestSha256: dependencyManifestSha256(JSON.stringify(selected)) }
    await this.save(`${plan.planId}.json`, bound)
    return bound
  }
  async applySync(planId: string, revision: string, confirm: boolean): Promise<{ taskId?: string; partial?: boolean; skippedPackages?: PackageInstallFailure[]; noInstallablePackages?: boolean }> {
    if (confirm !== true) throw new Error('请先确认依赖变更，再应用更新。')
    if (!/^[a-f0-9-]{36}$/u.test(planId)) throw new Error('依赖同步计划无效。')
    const plan = JSON.parse(await readFile(join(this.directory, `${planId}.json`), 'utf8')) as StoredPackagePlan & { manifestRevision: string; manifestSha256: string }
    const layer = plan.dependencyManifest?.layer ?? 'science'
    const manifest = await this.cached(layer)
    if (manifest.revision !== revision || plan.manifestRevision !== revision) throw new Error('依赖清单已改变，请重新预览并确认。')
    // Read the updater's actual plan too: a changed on-disk plan must not
    // inherit the approval of the previously reviewed file.
    const stored = JSON.parse(await readFile(join(this.options.root, 'plans', `${planId}.json`), 'utf8')) as StoredPackagePlan
    if (JSON.stringify(stored.wheels) !== JSON.stringify(plan.wheels) || JSON.stringify(stored.preparationFailures ?? []) !== JSON.stringify(plan.preparationFailures ?? []) || JSON.stringify(stored.changes) !== JSON.stringify(plan.changes) || stored.snapshotId !== plan.snapshotId || !stored.dependencyManifest || stored.dependencyManifest.revision !== revision || dependencyManifestSha256(JSON.stringify(stored.dependencyManifest)) !== plan.manifestSha256) throw new Error('依赖安装计划已改变，请重新预览。')
    const installed = await this.packageInfo((stored.dependencyManifest?.packages ?? []).map(pkg => pkg.name))
    const manifestInstalled = stored.dependencyManifest?.layer === 'core'
      ? installed.packages.filter(pkg => !stored.dependencyManifest?.packages.some(expected => normalizeName(expected.name) === normalizeName(pkg.name) && expected.version !== pkg.version))
      : installed.packages
    assertManifestWheels(stored.dependencyManifest, stored.wheels, manifestInstalled, (stored.preparationFailures ?? []).map(failure => failure.name))
    if (stored.wheels.length === 0 && (stored.preparationFailures?.length ?? 0) > 0) {
      if (layer === 'core') throw new Error(`基础运行层有 ${stored.preparationFailures!.length} 个必需依赖没有可安装资源，不能跳过。`)
      const skippedPackages = stored.preparationFailures ?? []
      const previousStatus = JSON.parse(await readFile(join(this.directory, 'status.json'), 'utf8').catch(() => '{}')) as Record<string, unknown>
      await this.save('status.json', { ...previousStatus, layer, manifestRevision: revision, manifestSha256: plan.manifestSha256, skippedPackages, partial: true, lastSyncError: undefined, checkedAt: new Date().toISOString() })
      return { partial: true, skippedPackages, noInstallablePackages: true }
    }
    return this.options.updater.applyPackagePlan(planId)
  }

  async installFailures(planId: string): Promise<PackageInstallFailure[]> {
    if (!/^[a-f0-9-]{36}$/u.test(planId)) throw new Error('依赖安装计划无效。')
    const plan = JSON.parse(await readFile(join(this.options.root, 'plans', `${planId}.json`), 'utf8')) as StoredPackagePlan
    const failures = [...(plan.preparationFailures ?? []), ...(plan.installOutcome?.skipped ?? [])]
    return [...new Map(failures.map(failure => [normalizeName(failure.name), failure])).values()]
  }

  async verifyInstalled(layer: PythonDependencyLayer, capabilityId?: string, report?: ReportPythonSyncProgress, knownFailures: PackageInstallFailure[] = []) {
    await report?.({ stage: 'verifying', progress: 97, message: '正在读取已安装包并核对签名清单。' })
    const manifest = selectLayer(await this.cached(layer), layer, capabilityId)
    const info = await this.packageInfo(manifest.packages.map(pkg => pkg.name))
    const installed = new Map(info.packages.map(item => [normalizeName(item.name), item.version]))
    const skippedByName = new Map(knownFailures.map(failure => [normalizeName(failure.name), failure]))
    const changes = manifest.packages.filter(pkg => installed.get(normalizeName(pkg.name)) !== pkg.version)
      .map(pkg => ({ name: pkg.name, ...(installed.get(normalizeName(pkg.name)) ? { from: installed.get(normalizeName(pkg.name)) } : {}), to: pkg.version, required: pkg.required, capabilities: pkg.capabilities }))
    const installedPackageCount = manifest.packages.length - changes.length
    const skippedPackages = changes.flatMap(change => {
      const failure = skippedByName.get(normalizeName(change.name))
      return failure ? [failure] : []
    })
    const unresolvedPackageCount = changes.length - skippedPackages.length
    const result = {
      layer, capabilityId, revision: manifest.revision,
      manifestSha256: dependencyManifestSha256(JSON.stringify(manifest)),
      packageCount: manifest.packages.length, installedPackageCount,
      pendingPackageCount: changes.length, unresolvedPackageCount, skippedPackages, changes,
      scienceInstalled: layer === 'science' && manifest.packages.length > 0 && changes.length === 0,
      checkedAt: new Date().toISOString(),
    }
    await this.save('status.json', { ...result, partial: skippedPackages.length > 0, source: 'cache', resourceAvailability: { layer, available: manifest.packages.length > 0, source: 'cache', packageCount: manifest.packages.length } })
    const suffix = skippedPackages.length ? `，${skippedPackages.length} 个失败项已保留，可单独指定版本重试` : ''
    await report?.({ stage: 'verified', progress: 99, message: `依赖核验完成：${installedPackageCount}/${manifest.packages.length} 已达到清单版本${suffix}。`, completedPackages: manifest.packages.length - unresolvedPackageCount, totalPackages: manifest.packages.length })
    return result
  }

  private async packageInfo(names: string[]) {
    // Production uses a lightweight targeted lookup. Keep the full-inventory
    // fallback for older workers and focused tests until their updater is
    // upgraded in lockstep with the desktop bridge.
    return this.options.updater.pythonPackages
      ? this.options.updater.pythonPackages(names)
      : this.options.updater.pythonInfo()
  }
}

function selectLayer(manifest: PythonDependencyManifest, layer: PythonDependencyLayer, capabilityId?: string): PythonDependencyManifest {
  // Releases before 8.0.4 did not declare a layer and represented the large
  // science inventory. Never treat that legacy inventory as the core layer.
  const declared = manifest.layer ?? 'science'
  if (layer === 'core' && declared !== 'core') return { ...manifest, packages: [] }
  if (declared !== layer && !(layer === 'capability' && declared === 'science')) return { ...manifest, packages: [] }
  const packages = layer === 'capability' && capabilityId
    ? manifest.packages.filter(pkg => pkg.capabilities.includes(capabilityId))
    : manifest.packages
  return { ...manifest, layer, ...(capabilityId ? { capabilityId } : {}), packages }
}

function compareRevision(a: string, b: string): number {
  const aa = a.match(/\d+/gu)?.map(Number) ?? []; const bb = b.match(/\d+/gu)?.map(Number) ?? []
  for (let i = 0; i < Math.max(aa.length, bb.length); i++) { const diff = (aa[i] ?? 0) - (bb[i] ?? 0); if (diff) return diff }
  return a.localeCompare(b)
}

function normalizeName(name: string): string { return name.toLowerCase().replace(/[-_.]+/gu, '-') }
