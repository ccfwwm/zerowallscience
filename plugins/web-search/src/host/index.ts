import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import { WebError, type WebSearchProvider, type WebSearchRequest, type WebSearchResult } from '@deepseek-ai/dsh-web'
import { DeepSeekSearchProvider, type DeepSeekSearchProviderOptions } from '@deepseek-ai/dsh-web-search-deepseek'
import type { AiCloudAccountSnapshot, AiCloudManagedModel } from '@zerowallscience/plugin-account/types'
import { AiCloudClient, type AccountSecretStore } from '@zerowallscience/plugin-account'
import { SecretBrokerClient } from '@zerowallscience/plugin-secrets'

const KEY_PREFIX = 'zerowall.ai-cloud.group.'
const ROUTE_PREFIX = 'zerowall-ai-cloud-'

export type ZeroWallSearchProtocol = 'anthropic-messages' | 'openai-completions' | 'openai-responses'

export interface ZeroWallSearchRoute {
  readonly provider: string
  readonly model: string
  readonly supportsWebSearch: boolean
  readonly searchProtocol: ZeroWallSearchProtocol
  readonly searchEndpoint: string
  resolveApiKey(): Promise<string | undefined>
}

export interface ZeroWallWebSearchService {
  currentRoute(): ZeroWallSearchRoute | undefined
}

export interface OpenAIResponsesSearchOptions {
  resolveApiKey: () => Promise<string | undefined>
  baseURL: string
  model: string
  fetcher?: typeof fetch
}

export interface OpenAIChatSearchOptions {
  resolveApiKey: () => Promise<string | undefined>
  baseURL: string
  model: string
  fetcher?: typeof fetch
}

/** Adapter for the OpenAI Responses native web search tool. */
export class OpenAIResponsesSearchProvider implements WebSearchProvider {
  readonly id = 'zerowall-ai-cloud-openai-search'
  constructor(private readonly resolveOptions: () => OpenAIResponsesSearchOptions) {}
  available(): boolean { const options = this.resolveOptions(); return URL.canParse(options.baseURL) && options.model.length > 0 }
  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    if (signal?.aborted === true) throw new WebError('Web search was cancelled.', 'WEB_ABORTED')
    const options = this.resolveOptions()
    const key = await options.resolveApiKey()
    if (!key?.trim()) throw new WebError('OpenAI web search credential is missing.', 'WEB_PROVIDER_CREDENTIAL_MISSING')
    const endpoint = `${options.baseURL.replace(/\/$/u, '')}/responses`
    let response: Response | undefined
    for (const toolType of ['web_search', 'web_search_preview'] as const) {
      try {
        response = await (options.fetcher ?? fetch)(endpoint, {
          method: 'POST',
          headers: { authorization: `Bearer ${key.trim()}`, 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ model: options.model, tools: [{ type: toolType }], input: `Search the web for: ${request.query}` }),
          ...(signal === undefined ? {} : { signal }),
        })
      } catch (error) {
        if (signal !== undefined && signal.aborted) throw new WebError('Web search was cancelled.', 'WEB_ABORTED', { cause: error })
        throw new WebError(`OpenAI Responses web search request failed: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
      }
      if (response.ok || (response.status !== 400 && response.status !== 404)) break
    }
    if (response === undefined) throw new WebError('OpenAI Responses web search did not dispatch.', 'WEB_PROVIDER_ERROR')
    if (!response.ok) throw new WebError(`OpenAI Responses web search returned HTTP ${response.status}.`, `WEB_HTTP_${response.status}`)
    let payload: unknown
    try { payload = await response.json() } catch (error) { throw new WebError('OpenAI Responses returned invalid JSON.', 'WEB_PROVIDER_ERROR', { cause: error }) }
    const result = mapOpenAIResponsesResult(payload)
    if (result.sources.length === 0) throw new WebError('OpenAI Responses returned no web search results.', 'WEB_NO_RESULTS')
    return result
  }
}

/** Compatibility adapter for gateways that expose chat-completions but not Responses. */
export class OpenAIChatSearchProvider implements WebSearchProvider {
  readonly id = 'zerowall-ai-cloud-openai-chat-search'
  constructor(private readonly resolveOptions: () => OpenAIChatSearchOptions) {}
  available(): boolean { const options = this.resolveOptions(); return URL.canParse(options.baseURL) && options.model.length > 0 }
  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    const options = this.resolveOptions()
    const key = await options.resolveApiKey()
    if (!key?.trim()) throw new WebError('OpenAI web search credential is missing.', 'WEB_PROVIDER_CREDENTIAL_MISSING')
    const endpoint = `${options.baseURL.replace(/\/$/u, '')}/chat/completions`
    let response: Response
    try {
      response = await (options.fetcher ?? fetch)(endpoint, {
        method: 'POST',
        headers: { authorization: `Bearer ${key.trim()}`, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          model: options.model,
          messages: [{ role: 'user', content: `Search the web for: ${request.query}` }],
          web_search_options: { search_context_size: 'medium' },
        }),
        ...(signal === undefined ? {} : { signal }),
      })
    } catch (error) {
      if (signal?.aborted === true) throw new WebError('Web search was cancelled.', 'WEB_ABORTED', { cause: error })
      throw new WebError(`OpenAI Chat Completions web search request failed: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
    }
    if (!response.ok) throw new WebError(`OpenAI Chat Completions web search returned HTTP ${response.status}.`, `WEB_HTTP_${response.status}`)
    let payload: unknown
    try { payload = await response.json() } catch (error) { throw new WebError('OpenAI Chat Completions returned invalid JSON.', 'WEB_PROVIDER_ERROR', { cause: error }) }
    const result = mapOpenAIChatResult(payload)
    if (result.sources.length === 0) throw new WebError('OpenAI Chat Completions returned no web search results.', 'WEB_NO_RESULTS')
    return result
  }
}

export function mapOpenAIChatResult(payload: unknown): WebSearchResult {
  if (payload === null || typeof payload !== 'object') throw new WebError('OpenAI Chat Completions payload is invalid.', 'WEB_PROVIDER_ERROR')
  const choices = (payload as { choices?: unknown }).choices
  const sources = new Map<string, { url: string; title?: string; snippet?: string; publishedAt?: string }>()
  if (Array.isArray(choices)) for (const choice of choices) {
    if (choice === null || typeof choice !== 'object') continue
    const message = (choice as { message?: unknown }).message
    if (message === null || typeof message !== 'object') continue
    const value = message as { annotations?: unknown; tool_calls?: unknown; content?: unknown }
    const annotations = value.annotations
    if (Array.isArray(annotations)) for (const annotation of annotations) {
      if (annotation === null || typeof annotation !== 'object') continue
      const item = annotation as { type?: unknown; url?: unknown; title?: unknown; snippet?: unknown; publishedAt?: unknown }
      if (typeof item.url === 'string' && item.url.length > 0 && !sources.has(item.url)) sources.set(item.url, {
        url: item.url,
        ...(typeof item.title === 'string' ? { title: item.title } : {}),
        ...(typeof item.snippet === 'string' ? { snippet: item.snippet } : {}),
        ...(typeof item.publishedAt === 'string' ? { publishedAt: item.publishedAt } : {}),
      })
    }
    if (Array.isArray(value.tool_calls)) for (const call of value.tool_calls) {
      if (call === null || typeof call !== 'object') continue
      const raw = (call as { function?: { arguments?: unknown } }).function?.arguments
      if (typeof raw !== 'string') continue
      try {
        const parsed = JSON.parse(raw) as { results?: unknown; sources?: unknown }
        const list = Array.isArray(parsed.results) ? parsed.results : parsed.sources
        if (!Array.isArray(list)) continue
        for (const item of list) {
          if (item === null || typeof item !== 'object') continue
          const source = item as { url?: unknown; title?: unknown; snippet?: unknown; publishedAt?: unknown }
          if (typeof source.url === 'string' && source.url.length > 0 && !sources.has(source.url)) sources.set(source.url, {
            url: source.url,
            ...(typeof source.title === 'string' ? { title: source.title } : {}),
            ...(typeof source.snippet === 'string' ? { snippet: source.snippet } : {}),
            ...(typeof source.publishedAt === 'string' ? { publishedAt: source.publishedAt } : {}),
          })
        }
      } catch { /* provider-specific tool arguments are optional */ }
    }
  }
  return { sources: [...sources.values()], truncated: false }
}

export function mapOpenAIResponsesResult(payload: unknown): WebSearchResult {
  if (payload === null || typeof payload !== 'object') throw new WebError('OpenAI Responses payload is invalid.', 'WEB_PROVIDER_ERROR')
  const output = (payload as { output?: unknown }).output
  const sources = new Map<string, { url: string; title?: string }>()
  if (Array.isArray(output)) for (const item of output) {
    if (item === null || typeof item !== 'object') continue
    const content = (item as { content?: unknown }).content
    if (!Array.isArray(content)) continue
    for (const block of content) {
      if (block === null || typeof block !== 'object') continue
      const annotations = (block as { annotations?: unknown }).annotations
      if (!Array.isArray(annotations)) continue
      for (const annotation of annotations) {
        if (annotation === null || typeof annotation !== 'object') continue
        const value = annotation as { type?: unknown; url?: unknown; title?: unknown }
        if (value.type === 'url_citation' && typeof value.url === 'string' && value.url.length > 0 && !sources.has(value.url)) sources.set(value.url, { url: value.url, ...(typeof value.title === 'string' ? { title: value.title } : {}) })
      }
    }
  }
  return { sources: [...sources.values()], truncated: false }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    zerowallWebSearch: ZeroWallWebSearchService
  }
}

export interface ZeroWallWebSearchControllerOptions {
  readonly secrets?: AccountSecretStore
}

/**
 * Resolves search capability from the initiating Agent's managed AI Cloud
 * route. Route metadata is deliberately separate from DSH chat-provider
 * metadata because native web search has a different wire protocol.
 */
export class ZeroWallWebSearchController implements ZeroWallWebSearchService {
  private readonly secrets: AccountSecretStore
  private readonly models = new Map<string, AiCloudManagedModel>()

  constructor(private readonly ctx: Context, options: ZeroWallWebSearchControllerOptions = {}) {
    this.secrets = options.secrets ?? new SecretBrokerClient()
  }

  update(snapshot: AiCloudAccountSnapshot): void {
    this.models.clear()
    if (snapshot.status !== 'signedIn') return
    for (const model of snapshot.models) this.models.set(`${model.providerId}\0${model.modelId}`, model)
  }

  currentRoute(): ZeroWallSearchRoute | undefined {
    const initiator = this.ctx.get('agents')?.currentInitiator()
    const provider = initiator?.options.provider
    const model = initiator?.options.model
    if (provider === undefined || model === undefined || !provider.startsWith(ROUTE_PREFIX)) return undefined
    const managed = this.models.get(`${provider}\0${model}`)
    if (managed === undefined || !/^deepseek(?:[-_]|$)/iu.test(managed.modelId)) return undefined
    const groupId = managed.groupId
    return {
      provider: managed.providerId,
      model: managed.modelId,
      supportsWebSearch: true,
      searchProtocol: 'anthropic-messages',
      // DeepSeek search uses the Anthropic-compatible gateway endpoint, not
      // the chat model's protocol-specific base. Claude model metadata may
      // intentionally be rooted at the host, so normalize search to `/v1`.
      searchEndpoint: managed.baseUrl.endsWith('/v1') ? managed.baseUrl : `${managed.baseUrl}/v1`,
      resolveApiKey: async () => {
        const value = await this.secrets.get(`${KEY_PREFIX}${groupId}`)
        return value?.trim() || undefined
      },
    }
  }

  preferredRoute(): ZeroWallSearchRoute | undefined {
    const model = [...this.models.values()].find(candidate => candidate.groupName === 'codex-企业分组' && candidate.modelId === 'gpt-5.6-sol')
    if (model === undefined) return undefined
    return {
      provider: model.providerId,
      model: model.modelId,
      supportsWebSearch: true,
      searchProtocol: 'openai-responses',
      searchEndpoint: model.baseUrl.endsWith('/v1') ? model.baseUrl : `${model.baseUrl}/v1`,
      resolveApiKey: async () => {
        const value = await this.secrets.get(`${KEY_PREFIX}${model.groupId}`)
        return value?.trim() || undefined
      },
    }
  }
}

export const name = 'zerowall-web-search'
export const inject = ['agents', 'web']

export function apply(ctx: Context): void {
  const secrets = new SecretBrokerClient()
  const controller = new ZeroWallWebSearchController(ctx, { secrets })
  const protocolCache = new Map<string, 'responses' | 'chat'>()
  ctx.provide('zerowallWebSearch', controller)
  const provider: WebSearchProvider = {
    id: 'zerowall-ai-cloud-search',
    available: () => controller.preferredRoute()?.supportsWebSearch === true || controller.currentRoute()?.supportsWebSearch === true,
    search: (request, signal) => {
      const preferred = controller.preferredRoute()
      const fallback = controller.currentRoute()
      if (preferred !== undefined) {
        const responses = new OpenAIResponsesSearchProvider(() => ({ resolveApiKey: preferred.resolveApiKey, baseURL: preferred.searchEndpoint, model: preferred.model }))
        const chat = new OpenAIChatSearchProvider(() => ({ resolveApiKey: preferred.resolveApiKey, baseURL: preferred.searchEndpoint, model: preferred.model }))
        const routeKey = `${preferred.searchEndpoint}\0${preferred.model}`
        const cached = protocolCache.get(routeKey)
        const preferredSearch = cached === 'chat'
          ? chat.search(request, signal)
          : responses.search(request, signal).then(result => { protocolCache.set(routeKey, 'responses'); return result })
            .catch(error => {
              if (signal?.aborted === true) throw error
              return chat.search(request, signal).then(result => { protocolCache.set(routeKey, 'chat'); return result })
            })
        return preferredSearch
          .catch(error => {
            if (signal?.aborted === true) throw error
            if (fallback === undefined) throw error
            return new DeepSeekSearchProvider((): DeepSeekSearchProviderOptions => ({ resolveApiKey: fallback.resolveApiKey, baseURL: fallback.searchEndpoint, model: fallback.model, apiVersion: '2023-06-01', maxTokens: 4096, maxUses: 5 })).search(request, signal)
          })
      }
      if (fallback === undefined) throw new Error('No AI Cloud web-search route is available.')
      return new DeepSeekSearchProvider((): DeepSeekSearchProviderOptions => ({ resolveApiKey: fallback.resolveApiKey, baseURL: fallback.searchEndpoint, model: fallback.model, apiVersion: '2023-06-01', maxTokens: 4096, maxUses: 5 })).search(request, signal)
    },
  }
  ctx.get('web')?.registerSearchProvider(provider)
  ctx.on('zerowall/account-updated', snapshot => { protocolCache.clear(); controller.update(snapshot) })
  const account = new AiCloudClient({ secrets })
  void account.current().then(snapshot => controller.update(snapshot)).catch((error: unknown) => {
    ctx.logger.warn('ZeroWall web-search route metadata could not be restored.')
    ctx.logger.warn(error)
  })
}

export default { name, inject, apply }
