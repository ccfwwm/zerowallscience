import type { Context } from '@deepseek-ai/cordis'
import type { AdapterRegistrationHandle, LlmAdapter } from '@deepseek-ai/dsh-llm'
import type { ModelSelection } from '@deepseek-ai/dsh-agent'
import {
  PiAiAdapter,
  type PiAiAdapterOptions,
  type PiAiProviderProfile,
  type ResolvedPiAiProviderProfile,
} from '@deepseek-ai/dsh-llm-pi-ai'
import { resolveProfiles } from '@deepseek-ai/dsh-llm-pi-ai/src/config.ts'
import type { AccountSecretStore } from '@zerowallscience/plugin-account'
import type { AiCloudAccountSnapshot, AiCloudManagedModel } from '@zerowallscience/plugin-account/types'
import { SecretBrokerClient } from '@zerowallscience/plugin-secrets'

const KEY_PREFIX = 'zerowall.ai-cloud.group.'
const ROUTE_PREFIX = 'zerowall-ai-cloud-'

interface AgentDefaultModelService {
  currentSelection(): ModelSelection
  saveSelection(next: ModelSelection): Promise<void>
}

declare module '@deepseek-ai/cordis' {
  interface Context { agentDefaultModel: AgentDefaultModelService }
}

export interface AiCloudLlmControllerOptions {
  secrets?: AccountSecretStore
  createAdapter?: (options: PiAiAdapterOptions) => LlmAdapter
}

export class AiCloudLlmController {
  private readonly secrets: AccountSecretStore
  private readonly adapter: LlmAdapter
  private profiles: ReadonlyMap<string, ResolvedPiAiProviderProfile> = new Map()
  private registration?: AdapterRegistrationHandle

  constructor(private readonly ctx: Context, options: AiCloudLlmControllerOptions = {}) {
    this.secrets = options.secrets ?? new SecretBrokerClient()
    this.adapter = (options.createAdapter ?? ((adapterOptions) => new PiAiAdapter(adapterOptions)))({
      profiles: () => this.profiles,
      resolveApiKey: async (provider) => {
        const groupId = groupIdOf(provider)
        const key = await this.secrets.get(`${KEY_PREFIX}${groupId}`)
        if (key === undefined || key.trim().length === 0) {
          throw new Error(`ZeroWall AI Cloud has no credential for managed route "${provider}". Refresh the account model list.`)
        }
        return key.trim()
      },
      // Managed routes are hand-declared API-key routes. Their only credential
      // source is the broker above; provider-native login and ambient discovery
      // must not bypass the account boundary.
      auth: {
        credentials: {
          read: async () => undefined,
          list: async () => [],
          modify: async () => { throw new Error('ZeroWall AI Cloud routes do not support provider-native login.') },
          delete: async () => {},
        },
        authContext: {
          env: async () => undefined,
          fileExists: async () => false,
        },
      },
      resolveAttachments: () => this.ctx.get('attachments'),
    })
  }

  async update(snapshot: AiCloudAccountSnapshot): Promise<void> {
    const chatModels = snapshot.models.filter(model => model.capability !== 'image-generation')
    const next = snapshot.status === 'signedIn' ? managedProfiles(chatModels) : new Map<string, ResolvedPiAiProviderProfile>()
    this.profiles = next
    const routes = [...next.keys()]
    if (this.registration === undefined) {
      if (routes.length === 0) return
      this.registration = this.ctx.llm.registerAdapter(routes, this.adapter)
    } else {
      this.registration.replace(routes)
    }
    await this.selectManagedDefault(chatModels, routes)
  }

  private async selectManagedDefault(models: readonly AiCloudManagedModel[], routes: readonly string[]): Promise<void> {
    const defaults = this.ctx.get('agentDefaultModel')
    if (defaults === undefined) return
    const current = defaults.currentSelection()
    if (models.length === 0) {
      if (current.provider.startsWith(ROUTE_PREFIX)) {
        await defaults.saveSelection({ provider: 'opencode-zen', model: 'big-pickle' })
      }
      return
    }
    if (routes.includes(current.provider)) {
      // rc8 no longer exposes a provider availability probe. The account
      // snapshot is the authoritative catalog for managed routes, so retain
      // a route only when its provider and model are still advertised.
      const stillAdvertised = models.some(model => model.providerId === current.provider && model.modelId === current.model)
      if (stillAdvertised || !current.provider.startsWith(ROUTE_PREFIX)) return
    }
    if (current.provider.startsWith(ROUTE_PREFIX) && !routes.includes(current.provider)) {
      const replacement = models.find(model => routes.includes(model.providerId))
      if (replacement !== undefined) {
        await defaults.saveSelection({ provider: replacement.providerId, model: replacement.modelId })
        return
      }
      await defaults.saveSelection({ provider: 'opencode-zen', model: 'big-pickle' })
      return
    }
    const preferred = [...models]
      .filter(model => /deepseek/i.test(model.modelId))
      .sort((left, right) => left.modelId.localeCompare(right.modelId))[0]
    if (preferred === undefined) return
    await defaults.saveSelection({ provider: preferred.providerId, model: preferred.modelId })
  }
}

export const name = 'zerowall-ai-cloud-llm'
// The account service owns credential-backed model discovery. Declaring it as
// an injected dependency guarantees the restore call runs after the account
// face is mounted, instead of racing the first `llm.models()` request from
// the settings page.
export const inject = ['llm', 'zerowallAccount']

export function apply(ctx: Context): void {
  const secrets = new SecretBrokerClient()
  const controller = new AiCloudLlmController(ctx, { secrets })
  ctx.on('zerowall/account-updated', (snapshot) => { void controller.update(snapshot) })
  const account = ctx.get('zerowallAccount') as { current(): Promise<AiCloudAccountSnapshot> }
  void account.current()
    .then((snapshot) => controller.update(snapshot))
    .catch((error: unknown) => {
      ctx.logger.warn('ZeroWall AI Cloud model routes could not be restored.')
      ctx.logger.warn(error)
    })
}

function managedProfiles(models: readonly AiCloudManagedModel[]): Map<string, ResolvedPiAiProviderProfile> {
  const grouped = new Map<string, { groupName: string; baseURL: string; models: Map<string, AiCloudManagedModel> }>()
  for (const model of models) {
    const groupId = groupIdOf(model.providerId)
    if (model.groupId !== groupId) throw new Error(`Managed route "${model.providerId}" does not match group "${model.groupId}".`)
    const api = managedApi(model.modelId)
    // The SDKs use different path conventions: Anthropic's client appends
    // `/v1/messages`, whereas OpenAI-compatible clients append `/responses`
    // or `/chat/completions` to the supplied base URL. Normalize both fresh
    // metadata and older persisted snapshots before registering the route.
    const baseURL = trustedBaseUrl(model.baseUrl, api)
    const current = grouped.get(model.providerId)
    if (current !== undefined && (current.baseURL !== baseURL || current.groupName !== model.groupName)) {
      throw new Error(`Managed route "${model.providerId}" has inconsistent metadata.`)
    }
    const entry = current ?? { groupName: model.groupName, baseURL, models: new Map() }
    if (model.modelId.trim().length === 0) throw new Error(`Managed route "${model.providerId}" contains an empty model id.`)
    entry.models.set(model.modelId, model)
    grouped.set(model.providerId, entry)
  }

  const providers: Record<string, PiAiProviderProfile> = {}
  for (const [provider, entry] of grouped) {
    // Managed routes expose one gateway protocol per provider. Model-level
    // metadata is retained for catalog display, while the provider-level
    // value is required to construct the corresponding pi-ai transport.
    const api = managedApi([...entry.models.keys()][0] ?? '')
    providers[provider] = {
      displayName: `ZeroWall AI Cloud - ${entry.groupName}`,
      api,
      baseURL: entry.baseURL,
      compat: managedCompat(api),
      defaultInput: ['text', 'image'],
      models: [...entry.models.keys()].map(id => ({
        id,
        name: id,
        api: managedApi(id),
        ...managedInput(id),
        ...managedReasoning(id),
      })),
    }
  }
  return resolveProfiles(providers)
}

/**
 * Wire switches every managed route needs stated.
 *
 * The AI Cloud gateway is a private endpoint, so pi-ai's baseURL detection
 * recognizes nothing and answers as though the route were OpenAI itself. That
 * default sends the system prompt as `role: "developer"` to reasoning models,
 * which the gateway rejects, and attaches `strict` to every tool definition,
 * after which the gateway demands `required` on schemas that legitimately have
 * no required property (`get_goal` takes none). Both are stated here rather
 * than inferred. A route default no model on the route could read fails
 * resolution, and each managed route carries one protocol, so the block is
 * chosen per protocol: `anthropic-messages` states its own strict-tool switch,
 * while the OpenAI-shaped protocols take the developer-role and strict pair.
 */
function managedCompat(api: ReturnType<typeof managedApi>): NonNullable<PiAiProviderProfile['compat']> {
  if (api === 'anthropic-messages') return { supportsStrictTools: false }
  return { supportsDeveloperRole: false, supportsStrictMode: false }
}

/** Select the wire family exposed by common managed model gateways. */
function managedApi(modelId: string): 'openai-responses' | 'anthropic-messages' | 'openai-completions' {
  if (/^(?:gpt|o[1-9]|o3|o4|chatgpt)/iu.test(modelId)) return 'openai-responses'
  if (/^(?:claude|anthropic)/iu.test(modelId)) return 'anthropic-messages'
  return 'openai-completions'
}

function managedReasoning(modelId: string): Pick<NonNullable<PiAiProviderProfile['models']>[number], 'reasoningEfforts'> | Record<string, never> {
  const isGpt5 = /^gpt-5\.(?:5|6)(?:[-_].*)?$/iu.test(modelId)
  const isDeepSeek = /(?:deepseek.*(?:reasoner|r1|v4)|(?:reasoner|r1).*deepseek)/iu.test(modelId)
  // Modern Claude routes expose Anthropic adaptive-thinking effort levels.
  // Compatibility gateways commonly publish aliases such as claude-sonnet-5;
  // capability is tied to the modern family, not to one exact vendor name.
  const isModernClaude = /^claude-(?:3-(?:7|8)|4|sonnet-5|opus-4|haiku-4)/iu.test(modelId)
  if (!isGpt5 && !isDeepSeek && !isModernClaude) return {}
  if (isModernClaude) {
    return {
      reasoningEfforts: { off: null, low: 'low', medium: 'medium', high: 'high', max: 'max' },
    }
  }
  if (isDeepSeek) {
    return {
      reasoningEfforts: { off: null, low: 'low', medium: 'medium', high: 'high', max: 'max' },
    }
  }
  return {
    reasoningEfforts: {
      off: null,
      minimal: 'minimal',
      low: 'low',
      medium: 'medium',
      high: 'high',
      xhigh: 'xhigh',
      max: 'max',
    },
  }
}

function managedInput(modelId: string): Pick<NonNullable<PiAiProviderProfile['models']>[number], 'input'> | Record<string, never> {
  // Managed routes are verified by the Host's active visual probe. Model
  // names are not capability evidence: gateways may expose vision variants
  // under vendor-specific or compatibility aliases.
  void modelId
  return { input: ['text', 'image'] }
}

function groupIdOf(provider: string): string {
  if (!provider.startsWith(ROUTE_PREFIX)) throw new Error(`ZeroWall AI Cloud does not own provider route "${provider}".`)
  const match = /^zerowall-ai-cloud-([1-9]\d*)(?:-(?:responses|messages|completions))?$/u.exec(provider)
  if (match?.[1] === undefined) throw new Error(`Invalid ZeroWall AI Cloud provider route "${provider}".`)
  return match[1]
}

function trustedBaseUrl(raw: string, api: 'openai-responses' | 'anthropic-messages' | 'openai-completions'): string {
  const url = new URL(raw)
  const trustedHost = ['hkcode.aicodeme.xyz', 'code.aicodeme.xyz', 'code.aicodeme.cn'].includes(url.hostname)
  const path = url.pathname.replace(/\/+$/u, '')
  if (url.protocol !== 'https:' || !trustedHost || url.username || url.password || url.port || url.search || url.hash || !['', '/v1'].includes(path)) {
    throw new Error(`Managed model endpoint is not a trusted ZeroWall AI Cloud URL: ${raw}`)
  }
  const root = `${url.protocol}//${url.host}`
  return api === 'anthropic-messages' ? root : `${root}/v1`
}

export default { name, inject, apply }
