import type { Context } from '@deepseek-ai/cordis'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { opencodeUserAgent } from './ids.ts'

export const ZEN_BASE_URL = 'https://opencode.ai/zen'
export const MODELS_DEV_URL = 'https://models.dev/api.json'

export interface OpenCodeCatalogModel {
  id: string
  name: string
  description?: string
  contextWindow: number
  maxTokens: number
  supportsImages: boolean
}

const DEFAULT_CONTEXT_WINDOW = 262_144
const DEFAULT_MAX_TOKENS = 32_768

export const STATIC_FREE_MODELS: readonly OpenCodeCatalogModel[] = [
  { id: 'big-pickle', name: 'Big Pickle', contextWindow: 1_000_000, maxTokens: 128_000, supportsImages: false },
  { id: 'mimo-v2.5-free', name: 'MiMo V2.5 Free', contextWindow: 262_000, maxTokens: 128_000, supportsImages: true },
  { id: 'ling-3.0-flash-fin-free', name: 'Ling 3.0 Flash Fin Free', contextWindow: DEFAULT_CONTEXT_WINDOW, maxTokens: DEFAULT_MAX_TOKENS, supportsImages: false },
  { id: 'nemotron-3.5-lightning-free', name: 'Nemotron 3.5 Lightning Free', contextWindow: DEFAULT_CONTEXT_WINDOW, maxTokens: DEFAULT_MAX_TOKENS, supportsImages: false },
  { id: 'nemotron-3-ultra-free', name: 'Nemotron 3 Ultra Free', contextWindow: DEFAULT_CONTEXT_WINDOW, maxTokens: DEFAULT_MAX_TOKENS, supportsImages: false },
  { id: 'muse-spark-1.2-contributor-free', name: 'Muse Spark 1.2 Free', contextWindow: DEFAULT_CONTEXT_WINDOW, maxTokens: DEFAULT_MAX_TOKENS, supportsImages: true },
]

interface ModelMetadata extends OpenCodeCatalogModel {
  inputCost?: number
  outputCost?: number
  deprecated: boolean
}

interface MetadataCache {
  updatedAt: number
  models: ModelMetadata[]
}

export interface CatalogSnapshot {
  status: 'pending' | 'ready' | 'stale'
  total: number
  exposed: number
  lastRefresh?: string
  lastError: string
}

export interface ModelCatalogOptions {
  refreshSeconds?: number
  startupRetryMs?: number
  cachePath?: string
  statusPath?: string
  zenBaseUrl?: string
  metadataUrl?: string
  fetchImpl?: typeof fetch
  now?: () => number
  logger?: Pick<Context['logger'], 'warn'>
  onRefresh?: () => void
}

export function isFreeModelName(id: string): boolean {
  return id === 'big-pickle' || /(?:^|[-_])free(?:$|[-_])/iu.test(id)
}

export function decodeModelsDev(data: unknown): Map<string, ModelMetadata> {
  const result = new Map<string, ModelMetadata>()
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return result
  const providers = data as Record<string, unknown>
  const provider = providers.opencode
  if (typeof provider !== 'object' || provider === null || Array.isArray(provider)) return result
  const models = (provider as { models?: unknown }).models
  if (typeof models !== 'object' || models === null || Array.isArray(models)) return result
  for (const [key, value] of Object.entries(models)) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) continue
    const raw = value as Record<string, unknown>
    const id = typeof raw.id === 'string' && raw.id.length > 0 ? raw.id : key
    const cost = objectOf(raw.cost)
    const limit = objectOf(raw.limit)
    const modalities = objectOf(raw.modalities)
    const input = Array.isArray(modalities.input) ? modalities.input : []
    const inputCost = finiteNumber(cost.input)
    const outputCost = finiteNumber(cost.output)
    result.set(id, {
      id,
      name: typeof raw.name === 'string' && raw.name.trim() !== '' ? raw.name : id,
      ...(typeof raw.description === 'string' ? { description: raw.description } : {}),
      contextWindow: positiveInteger(limit.context) ?? DEFAULT_CONTEXT_WINDOW,
      maxTokens: positiveInteger(limit.output) ?? DEFAULT_MAX_TOKENS,
      supportsImages: raw.attachment === true || input.includes('image'),
      ...(inputCost === undefined ? {} : { inputCost }),
      ...(outputCost === undefined ? {} : { outputCost }),
      deprecated: raw.deprecated === true
        || ['deprecated', 'retired', 'disabled'].includes(String(raw.status ?? raw.lifecycle ?? '').toLowerCase())
        || raw.deprecated_at != null || raw.retirement_date != null,
    })
  }
  return result
}

function objectOf(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function positiveInteger(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : undefined
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function metadataAllows(model: ModelMetadata | undefined): boolean | undefined {
  if (model === undefined) return undefined
  if (model.deprecated) return false
  if (model.inputCost === undefined || model.outputCost === undefined) return undefined
  return model.inputCost === 0 && model.outputCost === 0
}

export class ModelCatalog {
  private liveIds = new Set<string>()
  private metadata = new Map<string, ModelMetadata>()
  private metadataReady = false
  private updatedAt = 0
  private lastError = ''
  private stopped = false
  private timer: ReturnType<typeof setInterval> | undefined
  private readonly options: Required<Pick<ModelCatalogOptions, 'refreshSeconds' | 'startupRetryMs' | 'zenBaseUrl' | 'metadataUrl' | 'fetchImpl' | 'now'>> & ModelCatalogOptions

  constructor(options: ModelCatalogOptions = {}) {
    this.options = {
      ...options,
      refreshSeconds: options.refreshSeconds ?? 300,
      startupRetryMs: options.startupRetryMs ?? 15_000,
      zenBaseUrl: options.zenBaseUrl ?? ZEN_BASE_URL,
      metadataUrl: options.metadataUrl ?? MODELS_DEV_URL,
      fetchImpl: options.fetchImpl ?? fetch,
      now: options.now ?? Date.now,
    }
  }

  async start(): Promise<void> {
    await this.refreshOnce()
    for (let attempt = 0; this.liveIds.size === 0 && attempt < 4 && !this.stopped; attempt += 1) {
      await delay(this.options.startupRetryMs)
      if (!this.stopped) await this.refreshOnce()
    }
    if (this.stopped) return
    this.timer = setInterval(() => { void this.refreshOnce() }, this.options.refreshSeconds * 1000)
    this.timer.unref?.()
  }

  stop(): void {
    this.stopped = true
    if (this.timer !== undefined) clearInterval(this.timer)
  }

  async refreshOnce(): Promise<void> {
    const failures: string[] = []
    await Promise.all([
      this.refreshLive().catch(error => failures.push(safeMessage(error))),
      this.refreshMetadata().catch(error => failures.push(safeMessage(error))),
    ])
    this.lastError = failures.join('; ').slice(0, 500)
    if (this.lastError !== '') this.options.logger?.warn(`opencode2dsh catalog refresh: ${this.lastError}`)
    await this.writeStatus()
    this.options.onRefresh?.()
  }

  list(): OpenCodeCatalogModel[] {
    const staticById = new Map(STATIC_FREE_MODELS.map(model => [model.id, model]))
    const ids = this.liveIds.size === 0 ? STATIC_FREE_MODELS.map(model => model.id) : [...this.liveIds]
    const result: OpenCodeCatalogModel[] = []
    for (const id of ids) {
      const metadata = this.metadata.get(id)
      const allowed = metadataAllows(metadata)
      const verifiedStatic = staticById.has(id)
      if (allowed === false && !(verifiedStatic && metadata?.deprecated === true)) continue
      if (allowed !== true && !verifiedStatic && !isFreeModelName(id)) continue
      const fallback = staticById.get(id)
      result.push(metadata === undefined ? fallback ?? {
        id,
        name: id,
        contextWindow: DEFAULT_CONTEXT_WINDOW,
        maxTokens: DEFAULT_MAX_TOKENS,
        supportsImages: /(?:vision|multimodal|mimo|[-_.]vl)/iu.test(id),
      } : {
        id: metadata.id,
        name: metadata.name,
        ...(metadata.description === undefined ? {} : { description: metadata.description }),
        contextWindow: metadata.contextWindow,
        maxTokens: metadata.maxTokens,
        supportsImages: metadata.supportsImages,
      })
    }
    return result.sort((left, right) => left.id.localeCompare(right.id))
  }

  model(id: string): OpenCodeCatalogModel | undefined {
    return this.list().find(model => model.id === id)
  }

  snapshot(): CatalogSnapshot {
    const stale = this.updatedAt !== 0 && this.options.now() - this.updatedAt > 10 * 60 * 1000
    return {
      status: this.updatedAt === 0 ? 'pending' : stale ? 'stale' : 'ready',
      total: this.liveIds.size,
      exposed: this.list().length,
      ...(this.updatedAt === 0 ? {} : { lastRefresh: new Date(this.updatedAt).toISOString() }),
      lastError: this.lastError,
    }
  }

  private async refreshLive(): Promise<void> {
    const response = await fetchWithTimeout(this.options.fetchImpl, `${this.options.zenBaseUrl.replace(/\/+$/u, '')}/v1/models`, {
      headers: { authorization: 'Bearer public', accept: 'application/json', 'user-agent': opencodeUserAgent(), 'x-opencode-client': 'cli' },
    })
    if (!response.ok) throw new Error(`models endpoint returned HTTP ${response.status}`)
    const body = await response.json() as { data?: Array<{ id?: unknown }> }
    const ids = (body.data ?? []).flatMap(item => typeof item.id === 'string' && item.id.length > 0 ? [item.id] : [])
    if (ids.length === 0) throw new Error('models endpoint returned an empty list')
    this.liveIds = new Set(ids)
    this.updatedAt = this.options.now()
  }

  private async refreshMetadata(): Promise<void> {
    try {
      const response = await fetchWithTimeout(this.options.fetchImpl, this.options.metadataUrl, { headers: { accept: 'application/json' } })
      if (!response.ok) throw new Error(`models.dev returned HTTP ${response.status}`)
      const models = decodeModelsDev(await response.json())
      if (models.size === 0) throw new Error('models.dev contains no OpenCode metadata')
      this.metadata = models
      this.metadataReady = true
      if (this.options.cachePath !== undefined) await writeJsonAtomic(this.options.cachePath, { updatedAt: this.options.now(), models: [...models.values()] } satisfies MetadataCache)
    } catch (error) {
      if (!this.metadataReady && this.options.cachePath !== undefined) {
        const cached = await readCache(this.options.cachePath, this.options.now()).catch(() => undefined)
        if (cached !== undefined) {
          this.metadata = new Map(cached.models.map(model => [model.id, model]))
          this.metadataReady = true
          return
        }
      }
      throw error
    }
  }

  private async writeStatus(): Promise<void> {
    if (this.options.statusPath === undefined) return
    await writeJsonAtomic(this.options.statusPath, { ...this.snapshot(), writtenAt: new Date(this.options.now()).toISOString() }).catch(() => {})
  }
}

async function fetchWithTimeout(fetchImpl: typeof fetch, url: string, init: RequestInit, timeoutMs = 30_000): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try { return await fetchImpl(url, { ...init, signal: controller.signal }) } finally { clearTimeout(timer) }
}

async function readCache(path: string, now: number): Promise<MetadataCache | undefined> {
  const value = JSON.parse(await readFile(path, 'utf8')) as MetadataCache
  if (!Number.isFinite(value.updatedAt) || now - value.updatedAt > 7 * 24 * 60 * 60 * 1000 || !Array.isArray(value.models)) return undefined
  return value
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  const temporary = `${path}.${process.pid}.tmp`
  await mkdir(dirname(path), { recursive: true })
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await rm(path, { force: true })
  await rename(temporary, path)
}

function safeMessage(error: unknown): string { return error instanceof Error ? error.message : String(error) }
function delay(ms: number): Promise<void> { return new Promise(resolve => setTimeout(resolve, ms)) }
