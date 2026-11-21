/** Validated models.dev capacity snapshots with optional startup refresh and offline reuse. */
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { MODELS_DEV_CONTEXT, MODELS_DEV_SOURCE } from './models-dev-context.js'

export interface ModelCapacity { context: number; output?: number }
type Capacities = Readonly<Record<string, ModelCapacity>>
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0

/** Read capacities from an untrusted models.dev response; empty or malformed catalogs are rejected. */
export function parseModelCapacities(value: unknown): Capacities {
  if (!record(value)) throw new Error('Invalid model metadata catalog')
  const result: Record<string, ModelCapacity> = {}
  const preferred = new Set(['anthropic', 'openai', 'google', 'deepseek', 'xai', 'mistral', 'cohere', 'moonshotai', 'zai', 'minimax', 'alibaba'])
  const providers = Object.entries(value).sort(([a], [b]) => Number(preferred.has(a)) - Number(preferred.has(b)))
  for (const [provider, entry] of providers) {
    if (!record(entry) || !record(entry.models)) continue
    for (const [id, model] of Object.entries(entry.models)) {
      if (!record(model) || !record(model.limit) || !positive(model.limit.context)) continue
      const prior = result[id]
      const direct = preferred.has(provider)
      const context = direct ? model.limit.context : Math.min(prior?.context ?? model.limit.context, model.limit.context)
      const output = positive(model.limit.output) ? direct ? model.limit.output : Math.min(prior?.output ?? model.limit.output, model.limit.output) : prior?.output
      result[id] = { context, ...(output === undefined ? {} : { output }) }
    }
  }
  if (Object.keys(result).length === 0) throw new Error('Model metadata contains no capacities')
  return result
}

/** One account service owns the snapshot; failed I/O leaves its previous complete snapshot intact. */
export class ModelMetadata {
  private capacities: Capacities = MODELS_DEV_CONTEXT

  /** @param id - Gateway model ID or provider-prefixed alias. @returns Known context and output limits. */
  get(id: string): ModelCapacity | undefined {
    const normalized = id.toLowerCase().replace(/^(?:anthropic|openai)\//u, '')
    return this.capacities[id] ?? this.capacities[normalized]
      ?? this.capacities[normalized.replace(/(\d)\.(\d)/gu, '$1-$2')]
  }

  /** Load a complete cached catalog without delaying application boot. Invalid caches retain the bundled snapshot. */
  async load(path: string, signal: AbortSignal): Promise<void> {
    try {
      const cached: unknown = JSON.parse(await readFile(path, 'utf8'))
      if (!record(cached) || !record(cached.capacities)) return
      const validated: Record<string, ModelCapacity> = {}
      for (const [id, value] of Object.entries(cached.capacities)) {
        if (!record(value) || !positive(value.context) || value.output !== undefined && !positive(value.output)) throw new Error('Invalid capacity cache')
        validated[id] = { context: value.context, ...(positive(value.output) ? { output: value.output } : {}) }
      }
      if (!signal.aborted && Object.keys(validated).length > 0) this.capacities = validated
    } catch (_error) { /* An absent or invalid optional cache does not prevent offline use. */ }
  }

  /** Fetch and atomically cache a complete snapshot; cancellation publishes no metadata. */
  async refresh(path: string, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<void> {
    const response = await fetcher(MODELS_DEV_SOURCE, { signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]), redirect: 'error' })
    if (!response.ok) throw new Error(`Model metadata HTTP ${response.status}`)
    const chunks: Uint8Array[] = []
    let bytes = 0
    if (!response.body) throw new Error('Model metadata response is empty')
    for await (const chunk of response.body) {
      bytes += chunk.length
      if (bytes > 16 * 1024 * 1024) throw new Error('Model metadata response exceeds 16 MiB')
      chunks.push(chunk)
    }
    const body = Buffer.concat(chunks)
    const capacities = parseModelCapacities(JSON.parse(body.toString('utf8')))
    signal.throwIfAborted()
    const temporary = path + '.' + randomUUID() + '.tmp'
    try {
      await mkdir(dirname(path), { recursive: true })
      await writeFile(temporary, JSON.stringify({ source: MODELS_DEV_SOURCE, fetchedAt: new Date().toISOString(),
        sha256: createHash('sha256').update(body).digest('hex'), capacities }) + '\n', { flag: 'wx' })
      signal.throwIfAborted()
      await rename(temporary, path)
      if (!signal.aborted) this.capacities = capacities
    } finally { await rm(temporary, { force: true }) }
  }
}
