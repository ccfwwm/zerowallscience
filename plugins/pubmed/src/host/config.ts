import z from '@deepseek-ai/schemastery'
import { DEFAULTS, KEY_NAMES, SOURCES, type PubmedConfig, type KeyName, type KeyStatus } from '../shared/types.js'

export const ConfigSchema: z<PubmedConfig> = z.object({
  enabled: z.boolean().default(true), defaultSources: z.array(z.union(SOURCES)).default(DEFAULTS.defaultSources),
  AUTO_GRAPH: z.boolean().default(true), PUBTATOR: z.boolean().default(true), EUROPEPMC_ENABLED: z.boolean().default(true),
  S2_ENABLED: z.boolean().default(true), OPENALEX_ENABLED: z.boolean().default(true), PUBTATOR_EDGE_EVIDENCE: z.boolean().default(true),
  PUBTATOR_RELATION_PROBE: z.number().default(3), PUBTATOR_RELATION_PROBE_ARTICLES: z.number().default(8),
  NCBI_ADMIN_EMAIL: z.string().default(''), EUTILS_BASE_URL: z.string().default(DEFAULTS.EUTILS_BASE_URL),
  EPMC_BASE_URL: z.string().default(DEFAULTS.EPMC_BASE_URL), PUBTATOR_BASE_URL: z.string().default(DEFAULTS.PUBTATOR_BASE_URL),
  S2_BASE_URL: z.string().default(DEFAULTS.S2_BASE_URL), OPENALEX_BASE_URL: z.string().default(DEFAULTS.OPENALEX_BASE_URL),
})
export function validateConfig(input: PubmedConfig): PubmedConfig {
  const value = { ...input, defaultSources: [...input.defaultSources] }
  for (const key of Object.keys(value)) if (!(key in DEFAULTS)) throw new Error('Unknown literature setting: ' + key)
  for (const [key, fallback] of Object.entries(DEFAULTS)) {
    const item = value[key as keyof PubmedConfig]
    if (typeof fallback === 'boolean' && typeof item !== 'boolean') throw new Error('Invalid boolean: ' + key)
    if (typeof fallback === 'string' && typeof item !== 'string') throw new Error('Invalid text: ' + key)
    if (key.endsWith('_BASE_URL')) {
      const url = new URL(String(item))
      if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) throw new Error('API endpoint must use HTTPS (HTTP is allowed only for loopback), without credentials, query or fragment.')
    }
  }
  if (!Array.isArray(value.defaultSources) || !value.defaultSources.length || value.defaultSources.some(s => !SOURCES.includes(s))) throw new Error('Choose valid search sources.')
  value.defaultSources = [...new Set(value.defaultSources)]
  for (const [key, max] of [['PUBTATOR_RELATION_PROBE', 6], ['PUBTATOR_RELATION_PROBE_ARTICLES', 50]] as const) if (!Number.isInteger(value[key]) || value[key] < 1 || value[key] > max) throw new Error('Invalid probe budget: ' + key)
  if (value.NCBI_ADMIN_EMAIL && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.NCBI_ADMIN_EMAIL)) throw new Error('Invalid contact email.')
  return value
}
export function keyName(name: string): KeyName { if (!KEY_NAMES.includes(name as KeyName)) throw new Error('Unknown literature credential.'); return name as KeyName }
export function secretRef(name: KeyName): string { return 'zerowall.environment.pubmed.' + name.toLowerCase() }
export async function resolveKey(name: KeyName, get: (ref: string) => Promise<string | undefined>, environment: NodeJS.ProcessEnv): Promise<{ value: string; status: KeyStatus }> {
  for (const [source, ref] of [['dedicated', secretRef(name)], ['variable', 'zerowall.environment.var.' + name.toLowerCase()]] as const) {
    const value = await get(ref)
    if (value?.trim()) return { value: value.trim(), status: { name, configured: true, source } }
  }
  const value = environment[name]?.trim() ?? ''
  return { value, status: { name, configured: !!value, source: value ? 'environment' : 'none' } }
}
