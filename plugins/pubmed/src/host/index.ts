import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import { SecretBrokerClient } from '@zerowallscience/plugin-secrets'
import type { LiteratureGraph, JsonObject } from '@zerowallscience/research-store/types'
import { registerPubmedTools } from './core.js'
import { nlpAvailable, nlpExtractKeywords, nlpExtractRelations, RELATION_VERB_STEMS, STOPWORDS } from './nlp.js'
import { ConfigSchema, keyName, resolveKey, secretRef, validateConfig } from './config.js'
import { LiteratureTransport, LiteratureHttpError, enabled, pause, type Credentials } from './transport.js'
import { mermaid } from './export.js'
import { DEFAULTS, KEY_NAMES, SERVICES, type PubmedConfig, type PubmedStatus, type ProbeResult, type ServiceId } from '../shared/types.js'
export type * from '../shared/types.js'

export const name = 'zerowall-pubmed'
export const inject = ['settings', 'tools', 'sessions']
export const Config = ConfigSchema.volatile()
declare module '@deepseek-ai/cordis' { interface Context { zerowallPubmed: ZeroWallPubmedService } }
const jsonOutput = { schema: { type: 'json' as const }, render: (_args: unknown, result: unknown) => [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }

export class ZeroWallPubmedService extends TypertRemoteService {
  static inject = inject
  static Config = ConfigSchema
  private settings: PubmedConfig
  private readonly secrets = new SecretBrokerClient()
  private readonly startupEnvironment: NodeJS.ProcessEnv = { ...process.env }
  private readonly transport = new LiteratureTransport()
  private readonly graphs = new Map<string, any>()
  private readonly graphChains = new Map<string, Promise<unknown>>()
  private readonly operations = new Map<string, Promise<unknown>>()
  private readonly disposers: (() => void)[] = []

  constructor(private readonly host: Context, config: PubmedConfig) {
    super(host, 'zerowallPubmed')
    this.settings = config
    host.on('settings/document-updated', (ns) => {
      if (ns !== ('zerowall-pubmed' as SettingsNamespace)) return
      const value = host.settings.describe().find(row => row.ns === 'zerowall-pubmed')?.value
      if (value !== undefined) this.settings = value as PubmedConfig
    })
    this.registerTools()
    host.effect(() => () => { this.disposers.splice(0).forEach(dispose => dispose()); this.graphs.clear(); void this.transport.close() }, 'pubmed: dispose')
  }

  @Remote('getConfigStatus') async getConfigStatus(): Promise<PubmedStatus> {
    const keys = await Promise.all(KEY_NAMES.map(name => resolveKey(name, ref => this.secrets.get(ref), this.startupEnvironment)))
    return { config: this.config(), keys: keys.map(key => key.status) }
  }
  @Remote('updateConfig') async updateConfig(changes: Partial<PubmedConfig>): Promise<PubmedStatus> {
    const config = validateConfig({ ...this.config(), ...changes })
    this.settings = config
    await this.host.settings.replace('zerowall-pubmed' as SettingsNamespace, config)
    this.registerTools()
    return this.getConfigStatus()
  }
  @Remote('setKey') async setKey(input: { name: string; value: string }): Promise<PubmedStatus> {
    const name = keyName(input.name); const value = input.value.trim()
    if (!value || value.length > 8192 || /[\r\n]/.test(value)) throw new Error('Invalid literature credential.')
    await this.secrets.set(secretRef(name), value)
    return this.getConfigStatus()
  }
  @Remote('clearKey') async clearKey(name: string): Promise<PubmedStatus> {
    await this.secrets.delete(secretRef(keyName(name)))
    return this.getConfigStatus()
  }
  @Remote('testConnection') async testConnection(service: ServiceId): Promise<ProbeResult> {
    if (!SERVICES.some(s => s.id === service)) throw new Error('Unknown literature service.')
    const config = this.config()
    if (!enabled(config, service)) return { service, state: 'disabled', message: 'Service disabled' }
    const credentials = await this.credentials()
    const urls: Record<ServiceId, string> = {
      pubmed: DEFAULTS.EUTILS_BASE_URL + '/esearch.fcgi?db=pubmed&term=metformin&retmax=1&retmode=json',
      europepmc: DEFAULTS.EPMC_BASE_URL + '/search?query=metformin&format=json&pageSize=1',
      pubtator: DEFAULTS.PUBTATOR_BASE_URL + '/entity/autocomplete/?query=metformin',
      s2: DEFAULTS.S2_BASE_URL + '/graph/v1/paper/PMID:23193287?fields=title',
      openalex: DEFAULTS.OPENALEX_BASE_URL + '/works?search=metformin&per-page=1&select=id,title',
    }
    try {
      const response = await this.transport.get(urls[service], config, credentials, AbortSignal.timeout(15000), 15000)
      const data = JSON.parse(response.body)
      if (data.error || data.errors) throw new Error('Provider rejected the query')
      const key = SERVICES.find(s => s.id === service)?.key
      return { service, state: key && !credentials[key] ? 'anonymous' : 'available', message: key && !credentials[key] ? 'Anonymous query succeeded' : 'Service query succeeded' }
    } catch (error) {
      const state = error instanceof LiteratureHttpError && [401, 403].includes(error.status) ? 'authentication-failed' : error instanceof LiteratureHttpError && error.status === 429 ? 'rate-limited' : 'network-failed'
      return { service, state, message: error instanceof LiteratureHttpError ? error.message : 'Connection test failed or timed out' }
    }
  }
  private config(): PubmedConfig { return validateConfig(this.settings) }
  private async credentials(): Promise<Credentials> {
    return Object.fromEntries(await Promise.all(KEY_NAMES.map(async name => [name, (await resolveKey(name, ref => this.secrets.get(ref), this.startupEnvironment)).value]))) as Credentials
  }
  private definitions(config: PubmedConfig, credentials: Credentials, signal: AbortSignal): Map<string, any> {
    const definitions = new Map<string, any>()
    registerPubmedTools(this.host, {
      defineTool: (definition: any) => definition, register: (definition: any) => definitions.set(definition.name, definition),
      managedNetwork: true, httpGet: (url: string, _signal?: AbortSignal, timeout?: number) => this.transport.get(url, config, credentials, signal, timeout),
      sleep: (ms: number) => pause(ms, signal), apiKey: credentials.NCBI_API_KEY, s2ApiKey: credentials.S2_API_KEY,
      eutilsBaseUrl: config.EUTILS_BASE_URL, epmcBaseUrl: config.EPMC_BASE_URL,
      pubtatorBaseUrl: config.PUBTATOR_BASE_URL, s2BaseUrl: config.S2_BASE_URL,
      openalexBaseUrl: config.OPENALEX_BASE_URL, ncbiEmail: config.NCBI_ADMIN_EMAIL,
      autoGraph: config.AUTO_GRAPH, pubtatorEnabled: config.PUBTATOR, europepmcEnabled: config.EUROPEPMC_ENABLED,
      s2Enabled: config.S2_ENABLED, openalexEnabled: config.OPENALEX_ENABLED,
      pubtatorEdgeEvidence: config.PUBTATOR_EDGE_EVIDENCE, pubtatorRelationProbe: config.PUBTATOR_RELATION_PROBE, pubtatorProbeArticles: config.PUBTATOR_RELATION_PROBE_ARTICLES,
      sessionGraphs: this.graphs, graphWriteChains: this.graphChains,
      extractKeywords: nlpAvailable ? nlpExtractKeywords : undefined, extractRelations: nlpAvailable ? nlpExtractRelations : undefined,
      relationVerbStems: RELATION_VERB_STEMS, stopwords: STOPWORDS,
    })
    return definitions
  }
  private registerTools(): void {
    this.disposers.splice(0).forEach(dispose => dispose())
    const config = this.config()
    if (!config.enabled) return
    const defs = this.definitions(config, { NCBI_API_KEY: '', S2_API_KEY: '', OPENALEX_API_KEY: '' }, new AbortController().signal)
    const graphAdd = defs.get('pubmed_graph_add')
    if (graphAdd) graphAdd.description = 'Add retrieved articles to the active conversation literature graph. The graph is scoped to this conversation and is discarded when reset.'
    defs.delete('pubmed_graph_commit')
    const graphGet = defs.get('pubmed_graph_get')
    if (graphGet) {
      graphGet.description = 'Get the active conversation literature graph as nodes and edges, or as a Mermaid flowchart.'
      graphGet.parameters = { format: { type: 'string', enum: ['json', 'mermaid'] } }
      graphGet.output = jsonOutput
    }
    const graphReset = defs.get('pubmed_graph_reset')
    if (graphReset) {
      graphReset.description = 'Clear the active conversation literature graph.'
      graphReset.parameters = {}
    }
    for (const [tool, definition] of defs) {
      if (!config.PUBTATOR && tool.startsWith('pubmed_pubtator_')) continue
      const description = String(definition.description).replace(/persistent USER|persistent user|personal|user knowledge/gi, 'project').replace(/~\/.dsh\/dsh-pubmed-graph.json/g, 'the ZeroWall research store')
      this.disposers.push(this.host.tools.register(defineTool({ ...definition, description, timeoutMs: definition.timeoutMs ?? 60000,
        execute: (args: any, exec: any) => this.invoke(tool, args, exec),
      })))
    }
  }
  private draft(sessionId: string): LiteratureGraph {
    const graph = this.graphs.get(sessionId)
    return { nodes: graph ? Object.values(graph.nodes) : [], edges: graph ? Object.values(graph.edges) : [] }
  }
  private async invoke(tool: string, args: any, exec: any): Promise<any> {
    const sessionId = String(exec.agent?.session.id ?? exec.agent?.id ?? '')
    if (!sessionId) throw new Error('Literature tools require a conversation context.')
    const config = this.config(); const credentials = await this.credentials()
    exec.signal.throwIfAborted()
    if (!config.enabled) throw new Error('Literature tools are disabled.')
    const work = async () => {
      exec.signal.throwIfAborted()
      if (tool === 'pubmed_graph_get') {
        const graph = this.draft(sessionId)
        return args.format === 'mermaid' ? { scope: 'session', mermaid: mermaid(graph) } : { scope: 'session', ...graph }
      }
      if (tool === 'pubmed_graph_reset') {
        this.graphs.delete(sessionId)
        return { cleared: 'session' }
      }
      const definitions = this.definitions(config, credentials, exec.signal)
      const definition = definitions.get(tool)
      if (!definition) throw new Error('Literature tool is disabled.')
      const input = tool === 'pubmed_search_papers' && !args.sources ? { ...args, sources: config.defaultSources } : args
      const value = await definition.execute(input, exec)
      exec.signal.throwIfAborted()
      return value
    }
    // Serialize only mutations/reads of a session draft; search calls remain parallel.
    if (tool.startsWith('pubmed_graph_') || tool === 'pubmed_fetch_articles') {
      const previous = this.operations.get(sessionId) ?? Promise.resolve()
      const next = previous.catch(() => {}).then(work)
      this.operations.set(sessionId, next)
      try { return await next } finally { if (this.operations.get(sessionId) === next) this.operations.delete(sessionId) }
    }
    return work()
  }
}
export function apply(ctx: Context): void { ctx.plugin(ZeroWallPubmedService) }
export default { name, inject, Config, apply: (ctx: Context, config: { get(): PubmedConfig }) => { ctx.plugin(ZeroWallPubmedService, config.get()) } }
