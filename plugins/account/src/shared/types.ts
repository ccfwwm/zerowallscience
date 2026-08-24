export type AiCloudAccountStatus = 'signedOut' | 'signedIn' | 'authExpired'
export type AiCloudBalanceFreshness = 'current' | 'stale'

export interface AiCloudPublicConfig {
  registrationEnabled: boolean
  emailVerifyEnabled: boolean
  invitationCodeEnabled: boolean
  captchaEnabled: boolean
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
  capability?: 'chat' | 'image-generation'
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
}

export interface AiCloudGateway {
  baseUrl: string
  label: string
  preferred: boolean
}

export interface AiCloudLoginRequest { email: string; password: string }
export interface AiCloudRegisterRequest { email: string; password: string; verificationCode: string }
export interface AiCloudSendCodeRequest { email: string }

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
