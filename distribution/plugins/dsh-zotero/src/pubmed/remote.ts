/** Shared, JSON-only literature configuration invocations for Host and Client. */
import { z } from 'zod'
import type { InvocationDescriptor, RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import type { TypertContribution } from '@deepseek-ai/dsh-typert-registry/types'
import { KEY_NAMES, SERVICES, SOURCES, type PubmedConfig, type PubmedStatus, type ProbeResult, type ServiceId } from './shared/types.js'

const PACKAGE = '@zerowall/dsh-zotero/pubmed'
const config = z.object({
  enabled: z.boolean(), defaultSources: z.array(z.enum(SOURCES)), AUTO_GRAPH: z.boolean(), PUBTATOR: z.boolean(),
  EUROPEPMC_ENABLED: z.boolean(), S2_ENABLED: z.boolean(), OPENALEX_ENABLED: z.boolean(), PUBTATOR_EDGE_EVIDENCE: z.boolean(),
  PUBTATOR_RELATION_PROBE: z.number().int(), PUBTATOR_RELATION_PROBE_ARTICLES: z.number().int(), NCBI_ADMIN_EMAIL: z.string(),
  EUTILS_BASE_URL: z.string(), EPMC_BASE_URL: z.string(), PUBTATOR_BASE_URL: z.string(), S2_BASE_URL: z.string(), OPENALEX_BASE_URL: z.string(),
}).strict()
const status = z.object({ config, keys: z.array(z.object({ name: z.enum(KEY_NAMES), configured: z.boolean(), source: z.enum(['dedicated', 'variable', 'environment', 'none']) }).strict()) }).strict()
const probe = z.object({ service: z.enum(SERVICES.map(service => service.id)), state: z.enum(['available', 'anonymous', 'authentication-failed', 'rate-limited', 'network-failed', 'disabled']), message: z.string() }).strict()
const methods = [
  { method: 'getConfigStatus', result: status },
  { method: 'updateConfig', parameter: 'changes', input: config.partial(), result: status },
  { method: 'setKey', parameter: 'input', input: z.object({ name: z.enum(KEY_NAMES), value: z.string().max(8192) }).strict(), result: status },
  { method: 'clearKey', parameter: 'name', input: z.enum(KEY_NAMES), result: status },
  { method: 'testConnection', parameter: 'service', input: z.enum(SERVICES.map(service => service.id)), result: probe },
] as const
const codec = (name: string, value: z.ZodType): InvocationDescriptor['result'] => ({ mode: 'strict', typeSymbol: PACKAGE + ':' + name, create: () => value })
const descriptors: InvocationDescriptor[] = methods.map(method => ({
  id: PACKAGE + ':zerowallPubmed/' + method.method,
  service: 'zerowallPubmed', namespace: 'zerowallPubmed', method: method.method,
  invocation: { kind: 'direct' },
  parameters: 'parameter' in method ? [{ name: method.parameter, wire: method.parameter, source: 'json', codec: codec(method.method + '.input', method.input) }] : [],
  result: codec(method.method + '.result', method.result),
}))

/** Host declarations register independently from Zotero's library declarations. */
export const PUBMED_MANIFEST: TypertContribution = {
  package: PACKAGE, face: 'host', schemas: [],
  model: { services: [{ key: 'zerowallPubmed', exportName: 'ZeroWallPubmedService', description: 'Literature service configuration and connectivity.', tags: [], members: methods.map(method => ({ kind: 'method', name: method.method, signature: method.method + '()' })), types: [] }], events: [], objects: [] },
  invocations: descriptors,
}
/** Mount the literature namespace whenever the Zotero browser plugin is loaded. */
export const PUBMED_REMOTE: TypertRemoteContribution = { package: PACKAGE, descriptors }

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespaceMap {
    zerowallPubmed: {
      getConfigStatus(): Promise<RemoteResult<PubmedStatus>>
      updateConfig(changes: Partial<PubmedConfig>): Promise<RemoteResult<PubmedStatus>>
      setKey(input: { name: string; value: string }): Promise<RemoteResult<PubmedStatus>>
      clearKey(name: string): Promise<RemoteResult<PubmedStatus>>
      testConnection(service: ServiceId): Promise<RemoteResult<ProbeResult>>
    }
  }
}
