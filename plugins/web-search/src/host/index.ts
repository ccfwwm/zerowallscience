import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type { AiCloudAccountSnapshot, AiCloudManagedModel } from '@zerowallscience/plugin-account/types'
import { AiCloudClient, type AccountSecretStore } from '@zerowallscience/plugin-account'
import { SecretBrokerClient } from '@zerowallscience/plugin-secrets'

const KEY_PREFIX = 'zerowall.ai-cloud.group.'
const ROUTE_PREFIX = 'zerowall-ai-cloud-'

export type ZeroWallSearchProtocol = 'anthropic-messages' | 'openai-completions'

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
    if (managed === undefined) return undefined
    const groupId = managed.providerId.slice(ROUTE_PREFIX.length)
    return {
      provider: managed.providerId,
      model: managed.modelId,
      supportsWebSearch: false,
      searchProtocol: 'openai-completions',
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
}

export const name = 'zerowall-web-search'
export const inject = ['agents']

export function apply(ctx: Context): void {
  const secrets = new SecretBrokerClient()
  const controller = new ZeroWallWebSearchController(ctx, { secrets })
  ctx.provide('zerowallWebSearch', controller)
  ctx.on('zerowall/account-updated', snapshot => controller.update(snapshot))
  const account = new AiCloudClient({ secrets })
  void account.current().then(snapshot => controller.update(snapshot)).catch((error: unknown) => {
    ctx.logger.warn('ZeroWall web-search route metadata could not be restored.')
    ctx.logger.warn(error)
  })
}

export default { name, inject, apply }
