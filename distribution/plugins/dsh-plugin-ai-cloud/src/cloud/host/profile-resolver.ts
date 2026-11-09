import { createProvider } from '@earendil-works/pi-ai'
import type { Api, Model, ProviderStreams } from '@earendil-works/pi-ai'
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy'
import { openAIResponsesApi } from '@earendil-works/pi-ai/api/openai-responses.lazy'
import { anthropicMessagesApi } from '@earendil-works/pi-ai/api/anthropic-messages.lazy'
import { googleGenerativeAIApi } from '@earendil-works/pi-ai/api/google-generative-ai.lazy'
import { resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import type { PiAiProviderProfile, ResolvedPiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai'
import { managedRetryPolicy } from './managed-adapter.js'
import type { ManagedWireApi } from './session-compatibility.js'

const DEFAULT_CONTEXT_WINDOW = 1_000_000
const DEFAULT_MAX_TOKENS = 128_000
const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 300_000
const DEFAULT_MAX_REQUEST_IMAGE_BYTES = 20 * 1024 * 1024
const DEFAULT_REQUEST_IMAGE_PIXEL_BUDGET = 2048 * 2048
const DEFAULT_REQUEST_IMAGE_MAX_BYTES = 1024 * 1024

type ManagedModelProfile = NonNullable<PiAiProviderProfile['models']>[number]
type ManagedApi = ManagedWireApi

interface ManagedRoute {
  displayName: string
  api: ManagedApi
  baseURL: string
  compat: NonNullable<PiAiProviderProfile['compat']>
  defaultInput: ['text', 'image']
  models: ManagedModelProfile[]
}

/** Build the minimal validated profile shape consumed by the public PiAiAdapter. */
export function resolveManagedProfiles(
  routes: Readonly<Record<string, PiAiProviderProfile>>,
): Map<string, ResolvedPiAiProviderProfile> {
  const profiles = new Map<string, ResolvedPiAiProviderProfile>()
  for (const [provider, route] of Object.entries(routes)) {
    if (provider.length === 0) throw new Error('Managed AI Cloud provider names must not be empty.')
    if (!route.api || !route.baseURL || !route.models?.length) throw new Error(`Managed AI Cloud route "${provider}" is incomplete.`)
    const maxRequestImages = route.maxRequestImages ?? 50
    const imageOffloadCountQuantum = route.imageOffloadCountQuantum ?? Math.min(10, maxRequestImages)
    if (!Number.isSafeInteger(maxRequestImages) || maxRequestImages <= 0) {
      throw new Error(`Managed AI Cloud route "${provider}" maxRequestImages must be a positive safe integer.`)
    }
    if (!Number.isSafeInteger(imageOffloadCountQuantum) || imageOffloadCountQuantum <= 0 || imageOffloadCountQuantum > maxRequestImages) {
      throw new Error(`Managed AI Cloud route "${provider}" imageOffloadCountQuantum exceeds maxRequestImages.`)
    }
    const baseUrl = route.baseURL
    for (const profile of route.models) {
      if (!profile.id.trim()) throw new Error(`Managed AI Cloud route "${provider}" contains an empty model id.`)
    }
    const api = route.api as ManagedApi
    const models = route.models.map(profile => toPiModel(provider, baseUrl, api, profile))
    const displayName = route.displayName ?? provider
    const piProvider = createProvider<Api>({
      id: provider,
      name: displayName,
      baseUrl,
      auth: {
        apiKey: {
          name: 'ZeroWall AI Cloud',
          resolve: async ({ credential }) => credential?.key
            ? { auth: { apiKey: credential.key }, source: 'ZeroWall AI Cloud' }
            : { auth: {} },
        },
      },
      models,
      api: apiFor(api),
    })
    const configuredMaxTokens = new Map<string, number>()
    for (const profile of route.models) if (profile.maxTokens !== undefined) configuredMaxTokens.set(profile.id, profile.maxTokens)
    const resolved: ResolvedPiAiProviderProfile = {
      provider,
      displayName,
      api,
      baseURL: baseUrl,
      ...(route.compat === undefined ? {} : { compat: route.compat }),
      defaultInput: route.defaultInput ?? ['text', 'image'],
      streamIdleTimeoutMs: DEFAULT_STREAM_IDLE_TIMEOUT_MS,
      maxRequestImageBytes: DEFAULT_MAX_REQUEST_IMAGE_BYTES,
      maxRequestImages,
      imageOffloadCountQuantum,
      requestImagePixelBudget: DEFAULT_REQUEST_IMAGE_PIXEL_BUDGET,
      requestImageMaxBytes: DEFAULT_REQUEST_IMAGE_MAX_BYTES,
      retryPolicy: resolveRetryPolicy(route.retryPolicy ?? managedRetryPolicy, `ZeroWall AI Cloud route "${provider}"`),
      configuredMaxTokens,
      modelErrors: new Map(),
      piProvider,
    }
    profiles.set(provider, resolved)
  }
  return profiles
}

function toPiModel(provider: string, baseUrl: string, api: ManagedApi, profile: ManagedModelProfile): Model<Api> {
  const efforts = profile.reasoningEfforts === false ? undefined : profile.reasoningEfforts
  const thinkingLevelMap = efforts ? { ...efforts } : undefined
  return {
    id: profile.id,
    name: profile.name ?? profile.id,
    api,
    provider,
    baseUrl,
    input: profile.input?.length ? [...profile.input] : ['text', 'image'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    reasoning: efforts !== undefined && Object.keys(efforts).some(level => level !== 'off'),
    ...(thinkingLevelMap ? { thinkingLevelMap } : {}),
    contextWindow: profile.contextWindow ?? DEFAULT_CONTEXT_WINDOW,
    maxTokens: profile.maxTokens ?? DEFAULT_MAX_TOKENS,
    compat: profile.compat ?? undefined,
  } as unknown as Model<Api>
}

function apiFor(api: ManagedApi): ProviderStreams {
  switch (api as ManagedWireApi) {
    case 'anthropic-messages': return anthropicMessagesApi()
    case 'openai-responses': return openAIResponsesApi()
    case 'openai-completions': return openAICompletionsApi()
    case 'google-generative-ai': return googleGenerativeAIApi()
    default: throw new Error(`Unsupported ZeroWall AI Cloud protocol "${api}".`)
  }
}
