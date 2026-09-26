import { mkdir, readFile, writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { PythonUpdaterService } from './python-updater-service.js'
import type { StoredPackagePlan } from './python-packages.js'
import { assertManifestWheels, dependencyManifestChanges, dependencyManifestSha256, fetchPythonDependencyManifest, parsePythonDependencyManifest, PythonManifestUnavailableError, type PythonDependencyManifest } from './python-dependency-manifest.js'

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
    await rename(temporary, join(this.directory, name))
  }
  private async cached(): Promise<PythonDependencyManifest> {
    const value = JSON.parse(await readFile(join(this.directory, 'manifest.json'), 'utf8'))
    return parsePythonDependencyManifest(value, this.options.keys, this.options.applicationVersion)
  }
  async checkManifest() {
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
    const result = { revision: manifest.revision, manifestRevision: manifest.revision, manifestSha256: dependencyManifestSha256(JSON.stringify(manifest)), packageCount: manifest.packages.length, pythonVersion: manifest.pythonVersion, environmentVersion: manifest.environmentVersion, changes: dependencyManifestChanges(manifest, info.packages), checkedAt: new Date().toISOString(), needsRuntime: !info.ready, source }
    await this.save('status.json', result)
    return result
  }
  async previewSync(): Promise<StoredPackagePlan & { manifestRevision: string; manifestSha256: string }> {
    const manifest = await this.cached()
    const plan = await this.options.updater.previewDependencyManifest(manifest)
    if (plan.error) throw new Error(plan.error)
    assertManifestWheels(manifest, plan.wheels, plan.manifestInstalled, (plan.preparationFailures ?? []).map(failure => failure.name))
    const bound = { ...plan, manifestRevision: manifest.revision, manifestSha256: dependencyManifestSha256(JSON.stringify(manifest)) }
    await this.save(`${plan.planId}.json`, bound)
    return bound
  }
  async applySync(planId: string, revision: string, confirm: boolean): Promise<{ taskId: string }> {
    if (confirm !== true) throw new Error('请先确认依赖变更，再应用更新。')
    if (!/^[a-f0-9-]{36}$/u.test(planId)) throw new Error('依赖同步计划无效。')
    const manifest = await this.cached()
    const plan = JSON.parse(await readFile(join(this.directory, `${planId}.json`), 'utf8')) as StoredPackagePlan & { manifestRevision: string; manifestSha256: string }
    if (manifest.revision !== revision || plan.manifestRevision !== revision || plan.manifestSha256 !== dependencyManifestSha256(JSON.stringify(manifest))) throw new Error('依赖清单已改变，请重新预览并确认。')
    // Read the updater's actual plan too: a changed on-disk plan must not
    // inherit the approval of the previously reviewed file.
    const stored = JSON.parse(await readFile(join(this.options.root, 'plans', `${planId}.json`), 'utf8')) as StoredPackagePlan
    if (JSON.stringify(stored.wheels) !== JSON.stringify(plan.wheels) || JSON.stringify(stored.preparationFailures ?? []) !== JSON.stringify(plan.preparationFailures ?? []) || JSON.stringify(stored.changes) !== JSON.stringify(plan.changes) || stored.snapshotId !== plan.snapshotId || !stored.dependencyManifest || dependencyManifestSha256(JSON.stringify(stored.dependencyManifest)) !== plan.manifestSha256) throw new Error('依赖安装计划已改变，请重新预览。')
    assertManifestWheels(manifest, stored.wheels, (await this.options.updater.pythonInfo()).packages, (stored.preparationFailures ?? []).map(failure => failure.name))
    return this.options.updater.applyPackagePlan(planId)
  }
}

function compareRevision(a: string, b: string): number {
  const aa = a.match(/\d+/gu)?.map(Number) ?? []; const bb = b.match(/\d+/gu)?.map(Number) ?? []
  for (let i = 0; i < Math.max(aa.length, bb.length); i++) { const diff = (aa[i] ?? 0) - (bb[i] ?? 0); if (diff) return diff }
  return a.localeCompare(b)
}
