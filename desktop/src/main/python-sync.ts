import { renameFile } from './atomic-file.js'
import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { PythonUpdaterService } from './python-updater-service.js'
import type { StoredPackagePlan } from './python-packages.js'
import { assertManifestWheels, dependencyManifestChanges, dependencyManifestSha256, fetchPythonDependencyManifest, parsePythonDependencyManifest, PythonManifestUnavailableError, type PythonDependencyManifest } from './python-dependency-manifest.js'
import type { PythonDependencyLayer } from '../shared/contracts.js'

type Updater = Pick<PythonUpdaterService, 'pythonInfo' | 'previewDependencyManifest' | 'applyPackagePlan'>
interface Options { updater: Updater; root: string; keys: Record<string, string>; applicationVersion: string; feedUrl: string; fetcher?: typeof fetch; bundledManifestPath?: string }

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
  private async cached(): Promise<PythonDependencyManifest> {
    const value = JSON.parse(await readFile(join(this.directory, 'manifest.json'), 'utf8'))
    return parsePythonDependencyManifest(value, this.options.keys, this.options.applicationVersion)
  }
  async importManifest(file: string): Promise<void> {
    const manifest = parsePythonDependencyManifest(JSON.parse(await readFile(file, 'utf8')), this.options.keys, this.options.applicationVersion)
    const previous = await this.cached().catch(() => undefined)
    if (previous && compareRevision(previous.revision, manifest.revision) > 0) throw new Error('依赖清单降级必须通过回滚完成。')
    await this.save('manifest.json', manifest)
  }
  async checkManifest(layer: PythonDependencyLayer = 'science', capabilityId?: string) {
    let manifest: PythonDependencyManifest
    let source: 'remote' | 'bundled' | 'cache' = 'remote'
    try { manifest = await fetchPythonDependencyManifest(this.options.feedUrl, this.options.keys, { fetcher: this.options.fetcher, applicationVersion: this.options.applicationVersion }) }
    catch (error) {
      // Only an unavailable feed may fall back. Invalid signatures, hashes,
      // compatibility or malformed payloads must remain visible failures.
      if (!(error instanceof PythonManifestUnavailableError)) throw error
      const cached = await this.cached().catch(() => undefined)
      const bundled = this.options.bundledManifestPath ? await readFile(this.options.bundledManifestPath, 'utf8').then(text => parsePythonDependencyManifest(JSON.parse(text), this.options.keys, this.options.applicationVersion)).catch(() => undefined) : undefined
      if (!cached && !bundled) throw error
      manifest = cached && (!bundled || compareRevision(cached.revision, bundled.revision) >= 0) ? cached : bundled!
      source = manifest === cached ? 'cache' : 'bundled'
    }
    const previous = await this.cached().catch(() => undefined)
    if (previous && compareRevision(previous.revision, manifest.revision) > 0) { manifest = previous; source = 'cache' }
    const info = await this.options.updater.pythonInfo()
    if (info.ready && info.version && info.version !== manifest.pythonVersion) throw new Error('依赖清单需要不同的 Python 版本，请先更新运行环境。')
    await this.save('manifest.json', manifest)
    const selected = selectLayer(manifest, layer, capabilityId)
    const changes = dependencyManifestChanges(selected, info.packages)
    const result = { revision: manifest.revision, manifestRevision: manifest.revision, manifestSha256: dependencyManifestSha256(JSON.stringify(selected)), layer, ...(capabilityId ? { capabilityId } : {}), packageCount: selected.packages.length, pythonVersion: manifest.pythonVersion, environmentVersion: manifest.environmentVersion, changes, checkedAt: new Date().toISOString(), needsRuntime: !info.ready, scienceInstalled: layer === 'science' && selected.packages.length > 0 && changes.length === 0, available: selected.packages.length > 0, resourceAvailability: { layer, available: selected.packages.length > 0, source, packageCount: selected.packages.length }, source }
    await this.save('status.json', result)
    return result
  }
  async previewSync(layer: PythonDependencyLayer = 'science', capabilityId?: string): Promise<StoredPackagePlan & { manifestRevision: string; manifestSha256: string }> {
    const manifest = await this.cached()
    const selected = selectLayer(manifest, layer, capabilityId)
    if (selected.packages.length === 0) throw new Error(`未找到 ${layer}${capabilityId ? `:${capabilityId}` : ''} 的已签名依赖资源。`)
    const plan = await this.options.updater.previewDependencyManifest(selected)
    if (plan.error) throw new Error(plan.error)
    assertManifestWheels(selected, plan.wheels, plan.manifestInstalled, (plan.preparationFailures ?? []).map(failure => failure.name))
    if (plan.preparationFailures?.length) {
      await rm(join(this.options.root, 'plans', `${plan.planId}.json`), { force: true }).catch(() => undefined)
      throw new Error(`依赖资源预检失败，未创建安装任务：${plan.preparationFailures.map(failure => `${failure.name}: ${failure.message}`).join('; ')}`)
    }
    const bound = { ...plan, dependencyManifest: selected, manifestRevision: manifest.revision, manifestSha256: dependencyManifestSha256(JSON.stringify(selected)) }
    await this.save(`${plan.planId}.json`, bound)
    return bound
  }
  async applySync(planId: string, revision: string, confirm: boolean): Promise<{ taskId: string }> {
    if (confirm !== true) throw new Error('请先确认依赖变更，再应用更新。')
    if (!/^[a-f0-9-]{36}$/u.test(planId)) throw new Error('依赖同步计划无效。')
    const manifest = await this.cached()
    const plan = JSON.parse(await readFile(join(this.directory, `${planId}.json`), 'utf8')) as StoredPackagePlan & { manifestRevision: string; manifestSha256: string }
    if (manifest.revision !== revision || plan.manifestRevision !== revision) throw new Error('依赖清单已改变，请重新预览并确认。')
    // Read the updater's actual plan too: a changed on-disk plan must not
    // inherit the approval of the previously reviewed file.
    const stored = JSON.parse(await readFile(join(this.options.root, 'plans', `${planId}.json`), 'utf8')) as StoredPackagePlan
    if (JSON.stringify(stored.wheels) !== JSON.stringify(plan.wheels) || JSON.stringify(stored.preparationFailures ?? []) !== JSON.stringify(plan.preparationFailures ?? []) || JSON.stringify(stored.changes) !== JSON.stringify(plan.changes) || stored.snapshotId !== plan.snapshotId || !stored.dependencyManifest || stored.dependencyManifest.revision !== revision || dependencyManifestSha256(JSON.stringify(stored.dependencyManifest)) !== plan.manifestSha256) throw new Error('依赖安装计划已改变，请重新预览。')
    assertManifestWheels(stored.dependencyManifest, stored.wheels, (await this.options.updater.pythonInfo()).packages, (stored.preparationFailures ?? []).map(failure => failure.name))
    return this.options.updater.applyPackagePlan(planId)
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
