import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const sourceUrl = 'https://models.dev/api.json'
const root = resolve(import.meta.dirname, '../..')
const response = await fetch(sourceUrl)
if (!response.ok) throw new Error(`models.dev returned HTTP ${response.status}`)
const source = await response.json()
const fetchedAt = new Date().toISOString()
const models = []
const firstParty = new Map()
const observations = new Map()
for (const [provider, value] of Object.entries(source)) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) continue
  for (const [key, model] of Object.entries(value.models ?? {})) {
    if (model === null || typeof model !== 'object' || Array.isArray(model)) continue
    const limit = model.limit
    const context = limit?.context
    const output = limit?.output
    if (!Number.isSafeInteger(context) || context <= 0) continue
    const id = typeof model.id === 'string' && model.id ? model.id : key
    const canonical = typeof model.canonical_model_id === 'string' && model.canonical_model_id ? model.canonical_model_id : undefined
    models.push({ provider, id, ...(canonical ? { canonical } : {}), context, ...(Number.isSafeInteger(output) && output > 0 ? { output } : {}) })
    const values = observations.get(id) ?? { contexts: new Set(), outputs: new Set() }
    values.contexts.add(context)
    if (Number.isSafeInteger(output) && output > 0) values.outputs.add(output)
    observations.set(id, values)
    // Official provider records take precedence over copies published by
    // gateways. This keeps Claude/DeepSeek/OpenAI capacities stable even
    // when an aggregator reports a different limit for the same id.
    if (['openai', 'anthropic', 'deepseek'].includes(provider) && !firstParty.has(id)) firstParty.set(id, { context, ...(Number.isSafeInteger(output) && output > 0 ? { output } : {}) })
  }
}
models.sort((a, b) => `${a.provider}/${a.id}`.localeCompare(`${b.provider}/${b.id}`))
const snapshot = { source: sourceUrl, fetchedAt, providerCount: Object.keys(source).length, modelCount: models.length, models }
const fallback = new Map(firstParty)
for (const [id, values] of observations) {
  if (fallback.has(id) || values.contexts.size !== 1) continue
  const context = values.contexts.values().next().value
  const output = values.outputs.size === 1 ? values.outputs.values().next().value : undefined
  fallback.set(id, { context, ...(output === undefined ? {} : { output }) })
}
const reference = `/** Generated from models.dev; gateway metadata always wins over this fallback. */\nexport const MODELS_DEV_SOURCE = ${JSON.stringify(sourceUrl)} as const\nexport const MODELS_DEV_FETCHED_AT = ${JSON.stringify(fetchedAt)} as const\nexport const MODELS_DEV_CONTEXT: Readonly<Record<string, { context: number; output?: number }>> = ${JSON.stringify(Object.fromEntries([...fallback.entries()].sort(([a], [b]) => a.localeCompare(b))), null, 2)}\n`
await mkdir(dirname(resolve(root, 'config/catalogs/models-dev-context.json')), { recursive: true })
await writeFile(resolve(root, 'config/catalogs/models-dev-context.json'), `${JSON.stringify(snapshot, null, 2)}\n`)
await writeFile(resolve(root, 'plugins/account/src/host/models-dev-context.ts'), reference)
console.log(JSON.stringify({ source: sourceUrl, fetchedAt, providerCount: snapshot.providerCount, modelCount: snapshot.modelCount, referenceCount: fallback.size }))
