export type AiCloudAccountStatus = 'signedOut' | 'signedIn' | 'authExpired'
export type AiCloudBalanceFreshness = 'current' | 'stale'
export type ImageProtocol = 'openai' | 'gemini'
export type ImageProtocolSource = 'group-type' | 'model-prefix' | 'openai-default'

/** Public group information returned by the account's selected gateway. */
export interface AiCloudGroup {
  groupId: string
  groupName: string
  /** Group protocol plus its provenance; a default is not an explicit group type. */
  protocol?: ImageProtocol
  protocolSource?: ImageProtocolSource
  platform?: string
  description?: string
  rateMultiplier?: number
}

export interface AiCloudGroupCatalog {
  gatewayBaseUrl?: string
  groups: AiCloudGroup[]
  routes: Array<{ providerId: string; groupId: string; modelId: string }>
}

/** Old snapshots can still name groups, without inventing a price or description. */
export function accountGroupCatalog(account: Pick<AiCloudAccountSnapshot, 'status' | 'gatewayBaseUrl' | 'groups' | 'models' | 'mediaModels'>): AiCloudGroupCatalog {
  if (account.status !== 'signedIn') return { groups: [], routes: [] }
  const groups = new Map((account.groups ?? []).map(group => [group.groupId, group]))
  for (const model of [...account.models, ...(account.mediaModels ?? [])]) {
    if (!groups.has(model.groupId)) groups.set(model.groupId, { groupId: model.groupId, groupName: model.groupName, ...(model.imageProtocol ? { protocol: model.imageProtocol } : {}), ...(model.imageProtocolSource ? { protocolSource: model.imageProtocolSource } : {}) })
  }
  return {
    ...(account.gatewayBaseUrl ? { gatewayBaseUrl: account.gatewayBaseUrl } : {}),
    groups: [...groups.values()],
    routes: account.models.map(({ providerId, groupId, modelId }) => ({ providerId, groupId, modelId })),
  }
}

export function normalizeImageProtocol(value: unknown): ImageProtocol {
  return recognizedImageProtocol(value) ?? 'openai'
}

export function recognizedImageProtocol(value: unknown): ImageProtocol | undefined {
  if (typeof value !== 'string') return undefined
  const protocol = value.trim().toLowerCase()
  if (['gemini', 'gemini-native', 'google-gemini'].includes(protocol)) return 'gemini'
  if (['openai', 'openai-compatible', 'openai_images'].includes(protocol)) return 'openai'
  return undefined
}

type ImageGroupProtocolMetadata = { protocol?: ImageProtocol | undefined; protocolSource?: ImageProtocolSource | undefined; platform?: string | undefined }

export function explicitGroupImageProtocol(group: ImageGroupProtocolMetadata | undefined): ImageProtocol | undefined {
  if (!group) return undefined
  if (group.protocolSource === 'group-type') return recognizedImageProtocol(group.protocol) ?? recognizedImageProtocol(group.platform)
  // Old defaults must not override a recognized platform or the model fallback.
  return recognizedImageProtocol(group.platform) ?? (group.protocolSource === undefined ? recognizedImageProtocol(group.protocol) : undefined)
}

/** Explicit group type wins; otherwise use the model prefix, then OpenAI. */
export function resolveImageProtocol(modelId: string, group?: ImageGroupProtocolMetadata): { imageProtocol: ImageProtocol; imageProtocolSource: ImageProtocolSource } {
  const explicit = explicitGroupImageProtocol(group)
  if (explicit) return { imageProtocol: explicit, imageProtocolSource: 'group-type' }
  if (/^gemini/iu.test(modelId.trim())) return { imageProtocol: 'gemini', imageProtocolSource: 'model-prefix' }
  if (/^gpt/iu.test(modelId.trim())) return { imageProtocol: 'openai', imageProtocolSource: 'model-prefix' }
  return { imageProtocol: 'openai', imageProtocolSource: 'openai-default' }
}

export function imageQualityChoices(_modelId: string, declared: string[], _groupName?: string): string[] { return declared }

export function mediaModelIdentity(model: Pick<AiCloudMediaModel, 'providerId' | 'groupId' | 'modelId' | 'profileId'>): string {
  return JSON.stringify([model.providerId, model.groupId, model.modelId, model.profileId])
}

/** Repeated catalog rows must not create repeated choices; distinct profiles remain distinct. */
export function uniqueMediaModels<T extends AiCloudMediaModel>(models: T[]): T[] {
  return [...new Map(models.map(model => [mediaModelIdentity(model), model])).values()]
}

export interface AiCloudPublicConfig {
  registrationEnabled: boolean
  emailVerifyEnabled: boolean
  invitationCodeEnabled: boolean
  captchaEnabled: boolean
  passwordResetEnabled?: boolean
  rechargeUrl?: string
  lowBalanceThreshold?: number
}

export interface AiCloudManagedModel {
  providerId: string
  groupId: string
  groupName: string
  modelId: string
  baseUrl: string
  /** Capability exposed by the managed group. Image routes never enter chat. */
  capability?: 'chat' | 'image-generation' | 'media'
  imageProtocol?: ImageProtocol
  imageProtocolSource?: ImageProtocolSource
  resolutions?: string[]
  aspectRatios?: string[]
  imageSizes?: string[]
  supportsImageEdit?: boolean
  supportsImageReferences?: boolean
  supportsImageMask?: boolean
  /** Response formats explicitly declared by the upstream capability catalog. */
  imageResponseFormats?: Array<'url' | 'b64_json'>
  /** Explicit image quality choices for this group/model route. Empty means omit quality. */
  qualities?: string[]
  stale?: boolean
  contextWindow?: number
  maxOutputTokens?: number
  capacitySource?: 'gateway' | 'models-dev'
}
export interface AiCloudModelSync {
  checkedAt: string
  status: 'succeeded' | 'partial' | 'failed'
  groups: Array<{ groupId: string; groupName: string; status: 'succeeded' | 'failed'; count: number; checkedAt: string; error?: string }>
}

export interface AiCloudMediaModel extends AiCloudManagedModel {
  capability: 'media'
  profileId: string
  version: string
  mediaType: 'image' | 'video' | 'audio'
  operations: string[]
  referenceField?: string
  referenceShape?: string
  requestFormat?: 'legacy' | 'yunfei_multimodal' | 'v6k_url' | 'unified'
  duration: { mode?: string; values?: number[]; min?: number | null; max?: number | null; default?: number | null; required?: boolean }
  sizes: string[]
  resolutions: string[]
  aspectRatios: string[]
  qualities: string[]
  formats: string[]
  materials: Record<string, { formats?: string[]; reference_field?: string; max_count?: number | null; max_file_bytes?: number | null; max_duration_seconds?: string | null }>
  pollSeconds: number
  maxRequestBytes?: number
  observationSeconds?: number
}

export interface AiCloudAccountSnapshot {
  status: AiCloudAccountStatus
  /** A transient restore failure may be retried in the background; explicit logout and rejected credentials never opt in. */
  autoLoginRetryable?: boolean
  email?: string
  balance?: number
  currency?: string
  balanceFreshness: AiCloudBalanceFreshness
  rechargeUrl?: string
  lowBalance: boolean
  /** Gateway selected for this account session. Public endpoint metadata only. */
  gatewayBaseUrl?: string
  groups?: AiCloudGroup[]
  models: AiCloudManagedModel[]
  modelSync?: AiCloudModelSync
  mediaModels?: AiCloudMediaModel[]
  mediaSync?: AiCloudModelSync
}

export interface AiCloudGateway {
  baseUrl: string
  label: string
  preferred: boolean
}

export interface AiCloudLoginRequest { email: string; password: string; rememberPassword?: boolean }
export interface AiCloudSavedLogin { email: string; password: string; baseUrl: string; rememberPassword: true }
export interface AiCloudRegisterRequest { email: string; password: string; verificationCode: string; rememberPassword?: boolean; gatewayBaseUrl?: string }
export interface AiCloudSendCodeRequest { email: string; gatewayBaseUrl?: string }
export interface AiCloudSendCodeResult { countdown: number; gatewayBaseUrl: string }
export interface AiCloudForgotPasswordRequest { email: string; gatewayBaseUrl?: string }

export interface AiCloudPaymentOrder {
  id: number
  outTradeNo: string
  status: string
  amount: number
  paymentType: string
  paymentUrl?: string
  qrCode?: string
  createdAt?: string
}

export interface AiCloudCreateOrderRequest { amount: number; paymentType: string }
export interface AiCloudGetOrderRequest { orderId: number }
export interface AiCloudVerifyOrderRequest { outTradeNo: string }

export interface AiCloudCheckoutInfo {
  enabled: boolean
  minimumAmount: number
  paymentTypes: string[]
  rechargeUrl?: string
}
