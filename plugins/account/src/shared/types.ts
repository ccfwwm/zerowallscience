export type AiCloudAccountStatus = 'signedOut' | 'signedIn' | 'authExpired'
export type AiCloudBalanceFreshness = 'current' | 'stale'

/** Managed image groups are named by the account, not a fixed group id/name. */
export function isImageGenerationGroup(name: string): boolean { return /生图|图片/u.test(name.trim()) }

/** Quality support belongs to a route, not just a model name. */
export function imageQualityChoices(modelId: string, declared: string[], groupName: string): string[] {
  return declared.length || !/^gpt-image-2\.5(?:-|$)/u.test(modelId) || groupName.trim() !== '生图分组-gpt逆向'
    ? declared
    : ['auto', 'low', 'medium', 'high', 'xhigh', 'max']
}

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
  /** Explicit image quality choices for this group/model route. Empty means omit quality. */
  qualities?: string[]
  stale?: boolean
  contextWindow?: number
  maxOutputTokens?: number
  capacitySource?: 'gateway'
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
  requestFormat?: 'legacy' | 'yunfei_multimodal' | 'v6k_url'
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
  email?: string
  balance?: number
  currency?: string
  balanceFreshness: AiCloudBalanceFreshness
  rechargeUrl?: string
  lowBalance: boolean
  /** Gateway selected for this account session. Public endpoint metadata only. */
  gatewayBaseUrl?: string
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
