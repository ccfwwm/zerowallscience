/** Qiniu-backed plugin and skill discovery with explicit, profile-local mutations. */
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import semver from 'semver'
import { z } from 'zod'
import type { Context } from '@deepseek-ai/cordis'
import configSchema from '@deepseek-ai/schemastery'
import { parseMarketIndex, marketInstallTarget, type MarketIndex, type MarketPlugin, type MarketVersion } from '@deepseek-ai/dsh-plugin-market-index'
import type { BundleInfo, ChangeResult, PluginInstallRequestId, PluginUpdateResult } from '@deepseek-ai/dsh-plugin-manager/types'
import type {} from '@deepseek-ai/dsh-plugin-manager'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { evaluatePluginCompatibility } from '@deepseek-ai/dsh-app-boot'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { SkillsManagement } from '@zerowall/dsh-plugin-skills'
import type { OnlineEntry, OnlineFailure, OnlineReadResult, OnlineRequest, OnlineResult, OnlineSkill, OnlineSnapshot } from '../shared/types.js'
import { httpsUrl, parseSkills, readObject, requestSchema } from './catalog.js'

const DEFAULT_PLUGIN_INDEX = 'https://zerowall.chengxunkeji.cn/stable/catalog/plugins.json'
const DEFAULT_SKILL_INDEX = 'https://zerowall.chengxunkeji.cn/stable/catalog/skills.json'
const DEFAULT_FETCH_TIMEOUT_MS = 15_000
const DEFAULT_MAX_CATALOG_BYTES = 4 * 1024 * 1024
const DEFAULT_MAX_SKILL_BYTES = 64 * 1024 * 1024

/** Online catalog endpoints and bounded download budgets. */
export const Config = configSchema.object({
  pluginIndexUrl: configSchema.string().default(DEFAULT_PLUGIN_INDEX),
  skillIndexUrl: configSchema.string().default(DEFAULT_SKILL_INDEX),
  home: configSchema.string(),
  fetchTimeoutMs: configSchema.natural().min(1).default(DEFAULT_FETCH_TIMEOUT_MS),
  maxCatalogBytes: configSchema.natural().min(1).default(DEFAULT_MAX_CATALOG_BYTES),
  maxSkillBytes: configSchema.natural().min(1).default(DEFAULT_MAX_SKILL_BYTES),
})

/** Optional configuration supplied by a profile. */
export interface Config {
  pluginIndexUrl?: string
  skillIndexUrl?: string
  home?: string
  fetchTimeoutMs?: number
  maxCatalogBytes?: number
  maxSkillBytes?: number
}

declare module '@deepseek-ai/cordis' {
  interface Context { zerowallOnlineCatalog: OnlineCatalog }
}

function localized(value: unknown): Record<string, string> {
  if (typeof value === 'string') return { en: value }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return { en: '' }
  return Object.fromEntries(Object.entries(value).filter((row): row is [string, string] => typeof row[1] === 'string'))
}

function failure(code: OnlineFailure['code'], error: unknown): OnlineFailure {
  return { code, diagnostic: error instanceof Error ? error.message : String(error) }
}

function latestVersion(plugin: MarketPlugin): MarketVersion | undefined { return plugin.versions[0] }

function operationResult(result: ChangeResult | PluginUpdateResult): OnlineResult {
  const change = 'result' in result ? result.result : result
  if (change.application === 'failed' || change.application === 'cancelled') {
    return { ok: false, error: { ...failure('install', JSON.stringify(result)), pluginResult: result } }
  }
  return { ok: true, restartRequired: change.application === 'restart-required' }
}

function requestId(): PluginInstallRequestId { return randomUUID() as PluginInstallRequestId }

/** Owns the last valid online snapshot and delegates mutations to existing managers. */
export class OnlineCatalog extends TypertRemoteService {
  static inject = ['pluginManager', 'zerowallSkills']
  private readonly root: string
  private readonly pluginIndexUrl: string
  private readonly skillIndexUrl: string
  private readonly fetchTimeoutMs: number
  private readonly maxCatalogBytes: number
  private readonly maxSkillBytes: number
  private readonly abort = new AbortController()
  private readonly receiptsReady: Promise<void>
  private snapshotState: OnlineSnapshot = { fetchedAt: '', plugins: [], skills: [] }
  private pluginIndex?: MarketIndex
  private skillsIndex: OnlineSkill[] = []
  private readonly installedSkillVersions = new Map<string, string>()
  private pending: Promise<unknown> = Promise.resolve()
  private disposed = false

  constructor(private readonly host: Context, config: Config) {
    super(host, 'zerowallOnlineCatalog')
    this.pluginIndexUrl = httpsUrl.parse(config.pluginIndexUrl ?? DEFAULT_PLUGIN_INDEX)
    this.skillIndexUrl = httpsUrl.parse(config.skillIndexUrl ?? DEFAULT_SKILL_INDEX)
    this.fetchTimeoutMs = config.fetchTimeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS
    this.maxCatalogBytes = config.maxCatalogBytes ?? DEFAULT_MAX_CATALOG_BYTES
    this.maxSkillBytes = config.maxSkillBytes ?? DEFAULT_MAX_SKILL_BYTES
    this.root = join(resolve(config.home ?? resolveDshHome()), 'zerowall-online-catalog')
    this.receiptsReady = this.loadSkillReceipts()
    host.effect(() => async () => {
      this.disposed = true
      this.abort.abort(new Error('Online catalog disposed'))
      await this.pending
    })
  }

  /** @param refresh - Fetch both manifests when true; otherwise reuse a valid cache. @returns Listings and any refresh failure. */
  @Remote('read')
  async read(refresh: boolean): Promise<OnlineReadResult> {
    return this.enqueue(async () => {
      await this.receiptsReady
      if (this.disposed) return { snapshot: this.snapshotState, error: failure('disposed', 'Online catalog is shutting down.') }
      if (!refresh && this.snapshotState.fetchedAt !== '') return { snapshot: await this.decorate() }
      return this.refresh()
    })
  }

  /** @param request - Exact item selected by the user. @returns Manager diagnostics or committed skill status; a partial skill failure requires inspection before retry. */
  @Remote('operate')
  async operate(request: OnlineRequest): Promise<OnlineResult> {
    const input = requestSchema.parse(request)
    return this.enqueue(async () => {
      await this.receiptsReady
      if (this.disposed) return { ok: false as const, error: failure('disposed', 'Online catalog is shutting down.') }
      const current = await this.refresh()
      if (current.error !== undefined) return { ok: false as const, error: current.error }
      if (input.action === 'install-skill') return await this.installSkill(input)
      const plugin = this.pluginIndex?.plugins.find(row => row.name === input.id)
      const version = plugin?.versions.find(row => row.version === input.version)
      if (plugin === undefined || version === undefined) return { ok: false as const, error: failure('changed', 'The online listing changed. Refresh and retry.') }
      if (!compatible(plugin.name, version)) return { ok: false as const, error: failure('changed', 'This version requires another Host runtime.') }
      const target = marketInstallTarget(plugin.name, version)
      try {
        if (input.action === 'update-plugin') {
          if (version.source.type !== 'npm') return { ok: false as const, error: failure('changed', 'Git sources require an explicit reinstall from the plugin manager.') }
          return operationResult(await this.host.pluginManager.updateBundle(plugin.name, version.version, { registry: target.registry, requestId: requestId() }))
        }
        return operationResult(await this.host.pluginManager.installBundle(target.spec, { registry: target.registry, saveExact: true, enabled: true, requestId: requestId() }))
      } catch (error) { return { ok: false as const, error: failure('install', error) } }
    })
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const operation = this.pending.then(task)
    this.pending = operation.catch(() => undefined)
    return operation
  }

  private async refresh(): Promise<OnlineReadResult> {
    const signal = AbortSignal.any([this.abort.signal, AbortSignal.timeout(this.fetchTimeoutMs)])
    const errors: OnlineFailure[] = []
    try {
      const bytes = await readObject(this.pluginIndexUrl, this.maxCatalogBytes, signal)
      this.pluginIndex = parseMarketIndex(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)), this.pluginIndexUrl)
    } catch (error) { errors.push(failure('catalog', error)) }
    try {
      const bytes = await readObject(this.skillIndexUrl, this.maxCatalogBytes, signal)
      this.skillsIndex = parseSkills(bytes)
    } catch (error) { errors.push(failure('catalog', error)) }
    this.snapshotState = { ...await this.decorate(), ...errors.length ? {} : { fetchedAt: new Date().toISOString() } }
    return { snapshot: this.snapshotState, ...errors.length ? { error: failure('catalog', errors.map(item => item.diagnostic).join('\n')) } : {} }
  }

  private async decorate(): Promise<OnlineSnapshot> {
    const bundles = await this.host.pluginManager.listBundles()
    const plugins = (this.pluginIndex?.plugins ?? []).flatMap(plugin => {
      const version = latestVersion(plugin)
      if (version === undefined) return []
      const bundle = bundles.find(candidate => candidate.name === plugin.name)
      return [{
        id: plugin.name, version: version.version, title: localized(plugin.title ?? plugin.name), description: localized(plugin.description ?? ''),
        ...bundle?.version === undefined ? {} : { installedVersion: bundle.version },
        status: compatible(plugin.name, version) ? pluginStatus(bundle, version.version) : 'incompatible' as const,
        installable: bundle?.readOnlyReason === undefined && compatible(plugin.name, version) && (bundle === undefined || pluginStatus(bundle, version.version) === 'available' || (version.source.type === 'npm' && bundle.update === 'registry')),
      }]
    })
    const inventory = (await this.host.zerowallSkills.request({ action: 'list' })).entries ?? []
    const skills = this.skillsIndex.map(skill => ({
      id: skill.id, version: skill.version, title: skill.title, description: skill.description,
      ...this.installedSkillVersions.get(skill.id) === undefined ? {} : { installedVersion: this.installedSkillVersions.get(skill.id) },
      status: skill.names.every(name => inventory.some(row => row.name === name && row.removable)) ? this.skillStatus(skill) : 'available' as const, installable: true,
    }))
    return { fetchedAt: this.snapshotState.fetchedAt, plugins, skills }
  }

  private async installSkill(request: OnlineRequest): Promise<OnlineResult> {
    const skill = this.skillsIndex.find(row => row.id === request.id && row.version === request.version)
    if (skill === undefined) return { ok: false, error: failure('changed', 'The online skill listing changed. Refresh and retry.') }
    await mkdir(this.root, { recursive: true })
    const path = join(this.root, `${skill.id}-${skill.version}-${randomUUID()}.zip`)
    let committed = false
    try {
      const bytes = await readObject(skill.url, this.maxSkillBytes, AbortSignal.any([this.abort.signal, AbortSignal.timeout(this.fetchTimeoutMs)]))
      if (bytes.byteLength !== skill.bytes) return { ok: false, error: failure('integrity', `Skill archive length mismatch: expected ${String(skill.bytes)}, got ${String(bytes.byteLength)}`) }
      const hash = createHash('sha256').update(bytes).digest('hex')
      if (hash !== skill.sha256) return { ok: false, error: failure('integrity', `Skill archive SHA-256 mismatch: expected ${skill.sha256}, got ${hash}`) }
      await writeFile(path, bytes, { mode: 0o600, flag: 'wx' })
      const before = new Map(((await this.host.zerowallSkills.request({ action: 'list' })).entries ?? []).filter(row => row.effective).map(row => [row.name, row.enabled]))
      const preview = (await this.host.zerowallSkills.request({ action: 'preview', source: path })).preview
      if (preview === undefined) return { ok: false, error: failure('install', 'The skill archive produced no preview.') }
      if (preview.skills.length !== skill.names.length || !skill.names.every(name => preview.skills.some(row => row.name === name))) return { ok: false, error: failure('conflict', 'The archive skill names do not match the manifest.') }
      await this.host.zerowallSkills.request({ action: 'install', id: preview.id, replace: true, scope: 'global' })
      committed = true
      for (const row of preview.skills) {
        await this.host.zerowallSkills.request({ action: 'set-enabled', name: row.name, enabled: before.get(row.name) ?? true, scope: 'global' })
      }
      const next = new Map(this.installedSkillVersions).set(skill.id, skill.version)
      await writeFileAtomic(join(this.root, 'skills.json'), JSON.stringify(Object.fromEntries(next), null, 2) + '\n', { mode: 0o600 })
      this.installedSkillVersions.set(skill.id, skill.version)
      return { ok: true, restartRequired: false }
    } catch (error) { return { ok: false, error: failure(committed ? 'partial' : 'install', error) } }
    finally { await rm(path, { force: true }) }
  }

  private skillStatus(skill: OnlineSkill): OnlineEntry['status'] {
    const installed = this.installedSkillVersions.get(skill.id)
    if (installed === undefined) return 'available'
    return semver.valid(installed) !== null && semver.gt(skill.version, installed) ? 'update' : 'installed'
  }

  private async loadSkillReceipts(): Promise<void> {
    try {
      const value = z.record(z.string(), z.string()).parse(JSON.parse(await readFile(join(this.root, 'skills.json'), 'utf8')))
      for (const [id, version] of Object.entries(value)) this.installedSkillVersions.set(id, version)
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) this.host.logger.warn(`Online skill receipts could not be read: ${String(error)}`)
    }
  }
}

function pluginStatus(bundle: BundleInfo | undefined, listed: string): OnlineEntry['status'] {
  if (bundle === undefined || (!bundle.installed && bundle.availability !== 'installation')) return 'available'
  if (bundle.version !== undefined && semver.valid(bundle.version) && semver.gt(listed, bundle.version)) return 'update'
  return bundle.installed ? 'installed' : 'provided'
}

function compatible(name: string, version: MarketVersion): boolean {
  return evaluatePluginCompatibility({ name, version: version.version, engines: version.engines }) === undefined
}

/** @param ctx - Profile context. @param config - Validated download settings. @returns void after mounting the catalog service. */
export function apply(ctx: Context, config: Config): void {
  ctx.plugin(OnlineCatalog, config)
}
