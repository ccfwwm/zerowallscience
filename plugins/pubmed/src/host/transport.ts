import { setTimeout as delay } from 'node:timers/promises'
import { EnvHttpProxyAgent, fetch as proxyFetch } from 'undici'
import { DEFAULTS, type PubmedConfig, type KeyName, type ServiceId } from '../shared/types.js'

export type Credentials = Record<KeyName, string>
const ENDPOINTS: Record<ServiceId, keyof PubmedConfig> = { pubmed: 'EUTILS_BASE_URL', europepmc: 'EPMC_BASE_URL', pubtator: 'PUBTATOR_BASE_URL', s2: 'S2_BASE_URL', openalex: 'OPENALEX_BASE_URL' }
export class LiteratureHttpError extends Error { constructor(public readonly status: number, public readonly service: ServiceId) { super(service + ' HTTP ' + status) } }
export const pause = (ms: number, signal: AbortSignal) => delay(ms, undefined, { signal })
export function enabled(config: PubmedConfig, service: ServiceId): boolean {
  return config.enabled && (service === 'pubmed' || config[({ europepmc: 'EUROPEPMC_ENABLED', pubtator: 'PUBTATOR', s2: 'S2_ENABLED', openalex: 'OPENALEX_ENABLED' } as const)[service]])
}
export class LiteratureTransport {
  private readonly queues = new Map<string, Promise<void>>()
  private readonly last = new Map<string, number>()
  private agent?: EnvHttpProxyAgent
  constructor(private readonly fetcher: typeof fetch = fetch, private readonly environment: NodeJS.ProcessEnv = process.env) {}
  async close(): Promise<void> { await this.agent?.close() }
  private async schedule(service: string, gap: number, signal: AbortSignal): Promise<void> {
    const previous = this.queues.get(service) ?? Promise.resolve()
    const next = previous.catch(() => {}).then(async () => {
      signal.throwIfAborted()
      await pause(Math.max(0, (this.last.get(service) ?? 0) + gap - Date.now()), signal)
      this.last.set(service, Date.now())
    })
    this.queues.set(service, next.catch(() => {}))
    await Promise.race([next, new Promise<never>((_, reject) => {
      const abort = () => reject(signal.reason)
      if (signal.aborted) abort()
      else { signal.addEventListener('abort', abort, { once: true }); void next.finally(() => signal.removeEventListener('abort', abort)).catch(() => {}) }
    })])
  }
  async get(input: string, config: PubmedConfig, credentials: Credentials, caller: AbortSignal, timeoutMs = 30000): Promise<{ status: number; body: string }> {
    caller.throwIfAborted()
    const signal = AbortSignal.any([caller, AbortSignal.timeout(Math.min(timeoutMs || 30000, 60000))])
    const original = new URL(input)
    let service: ServiceId | undefined
    let url = new URL(input)
    for (const [id, field] of Object.entries(ENDPOINTS) as [ServiceId, keyof PubmedConfig][]) {
      const official = new URL(String(DEFAULTS[field])); const configured = new URL(String(config[field]))
      const root = [official, configured].find(base => original.origin === base.origin && (original.pathname === base.pathname || original.pathname.startsWith(base.pathname.replace(/\/$/, '') + '/')))
      if (root) { service = id; url = new URL(configured.toString().replace(/\/$/, '') + original.pathname.slice(root.pathname.replace(/\/$/, '').length) + original.search); break }
    }
    // PMC's auxiliary endpoints do not receive E-utilities credentials.
    if (!service && ['www.ncbi.nlm.nih.gov', 'pmc.ncbi.nlm.nih.gov'].includes(original.hostname)) service = 'pubmed'
    if (!service) throw new Error('Unrecognized literature endpoint.')
    if (!enabled(config, service)) throw new Error(service + ' is disabled')
    const headers: Record<string, string> = { accept: 'application/json, application/xml, text/plain', 'user-agent': 'ZeroWallScience-PubMed/0.4.1' }
    url.searchParams.delete('api_key')
    const configured = new URL(String(config[ENDPOINTS[service]]))
    if (url.origin === configured.origin && (url.pathname === configured.pathname || url.pathname.startsWith(configured.pathname.replace(/\/$/, '') + '/'))) {
      if (service === 'pubmed' && credentials.NCBI_API_KEY) url.searchParams.set('api_key', credentials.NCBI_API_KEY)
      if (service === 's2' && credentials.S2_API_KEY) headers['x-api-key'] = credentials.S2_API_KEY
      if (service === 'openalex' && credentials.OPENALEX_API_KEY) headers.authorization = 'Bearer ' + credentials.OPENALEX_API_KEY
    }
    const gap = service === 'pubmed' ? credentials.NCBI_API_KEY ? 120 : 350 : service === 's2' ? credentials.S2_API_KEY ? 1100 : 3000 : 350
    for (let attempt = 0; attempt < 5; attempt++) {
      await this.schedule(service, gap, signal)
      let retryMs = Math.min(8000, 500 * 2 ** attempt)
      try {
        let response: Response
        const options: RequestInit = { headers, signal, redirect: 'manual' }
        if (this.fetcher === fetch && (this.environment.HTTPS_PROXY || this.environment.HTTP_PROXY || this.environment.https_proxy || this.environment.http_proxy)) {
          this.agent ??= new EnvHttpProxyAgent()
          response = await proxyFetch(url, { ...options, dispatcher: this.agent } as any) as unknown as Response
        } else response = await this.fetcher(url, options)
        // Never forward keys through redirects. A caller may explicitly configure the final endpoint.
        if (response.status >= 300 && response.status < 400) { await response.body?.cancel(); throw new LiteratureHttpError(response.status, service) }
        if (response.ok) {
          const reader = response.body?.getReader(); const chunks: Uint8Array[] = []; let bytes = 0
          if (reader) { try { for (;;) { signal.throwIfAborted(); const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.length; if (bytes > 32 * 1024 * 1024) throw new Error('Response too large'); chunks.push(chunk.value) } } finally { await reader.cancel().catch(() => {}) } }
          return { status: response.status, body: Buffer.concat(chunks).toString('utf8') }
        }
        const retry = response.headers.get('retry-after')
        if (retry) retryMs = Math.max(retryMs, /^\d+$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - Date.now())
        await response.body?.cancel()
        if (response.status !== 429 && response.status < 500 || attempt === 4) throw new LiteratureHttpError(response.status, service)
      } catch (error) {
        signal.throwIfAborted()
        if (error instanceof LiteratureHttpError) throw error
        if (attempt === 4) throw new Error(service + ' network request failed')
      }
      await pause(retryMs, signal)
    }
    throw new Error(service + ' request failed')
  }
}
