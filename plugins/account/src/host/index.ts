import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { SecretBrokerClient } from '@zerowallscience/plugin-secrets'
import type {
  AiCloudAccountSnapshot, AiCloudCreateOrderRequest, AiCloudGateway, AiCloudLoginRequest, AiCloudManagedModel,
  AiCloudCheckoutInfo, AiCloudGetOrderRequest, AiCloudPaymentOrder, AiCloudPublicConfig,
  AiCloudRegisterRequest, AiCloudSendCodeRequest, AiCloudVerifyOrderRequest,
} from '../shared/types.js'
import type {} from 'zod'

export type {
  AiCloudAccountSnapshot, AiCloudCheckoutInfo, AiCloudCreateOrderRequest, AiCloudGateway, AiCloudGetOrderRequest,
  AiCloudLoginRequest, AiCloudManagedModel, AiCloudPaymentOrder, AiCloudPublicConfig,
  AiCloudRegisterRequest, AiCloudSendCodeRequest, AiCloudVerifyOrderRequest,
} from '../shared/types.js'

const PRIMARY_BASE = 'https://hkcode.aicodeme.xyz'
const BACKUP_BASES = ['https://code.aicodeme.xyz', 'https://code.aicodeme.cn'] as const
const DEFAULT_BASES = [PRIMARY_BASE, ...BACKUP_BASES] as const
const SESSION_KEY = 'zerowall.ai-cloud.session'
const LOGIN_KEY = 'zerowall.ai-cloud.login'
const PREFERRED_BASE_KEY = 'zerowall.ai-cloud.preferred-base'
const KEY_PREFIX = 'zerowall.ai-cloud.group.'
const KEYS_PATH = '/keys?page=1&page_size=1000&sort_by=created_at&sort_order=desc'

interface StoredSession {
  baseUrl: string
  email: string
  accessToken: string
  balance: number
  currency: string
  rechargeUrl?: string
  lowBalanceThreshold?: number
  models: AiCloudManagedModel[]
  groupIds: string[]
}

interface StoredLogin {
  baseUrl: string
  email: string
  password: string
}

interface AvailableGroup { id: number; name: string }
interface ExistingKey { groupId?: number; key: string }

export interface AccountSecretStore {
  get(key: string): Promise<string | undefined>
  set(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
}

export interface AiCloudClientOptions {
  secrets?: AccountSecretStore
  fetch?: typeof fetch
  bases?: string[]
}

export class AiCloudClient {
  private readonly secrets: AccountSecretStore
  private readonly fetcher: typeof fetch
  private readonly bases: string[]

  constructor(options: AiCloudClientOptions = {}) {
    this.secrets = options.secrets ?? new SecretBrokerClient()
    this.fetcher = options.fetch ?? fetch
    this.bases = options.bases ?? [...DEFAULT_BASES]
  }

  async gateways(): Promise<AiCloudGateway[]> {
    const preferred = await this.preferredBase()
    return this.bases.map((baseUrl) => ({
      baseUrl,
      label: gatewayLabel(baseUrl),
      preferred: baseUrl === preferred,
    }))
  }

  /** Persist a selected supported endpoint without exposing account credentials. */
  async selectGateway(baseUrl: string): Promise<AiCloudAccountSnapshot> {
    const selected = this.requireBase(baseUrl)
    await this.secrets.set(PREFERRED_BASE_KEY, selected)
    const login = await this.loadLogin()
    if (login === undefined) return signedOut(selected)
    const authenticated = await this.authenticate(login.email, login.password, [selected])
    const account = await this.finishAuthentication(authenticated.baseUrl, login.email, login.password, authenticated.accessToken)
    try {
      return await this.discoverModels()
    } catch {
      return account
    }
  }

  async publicConfig(): Promise<AiCloudPublicConfig> {
    const { body } = await this.withFailover((base) => this.request(base, '/settings/public'))
    return parsePublicConfig(body)
  }

  async sendCode(input: AiCloudSendCodeRequest): Promise<void> {
    const email = required(input.email, 'Email')
    await this.withFailover((base) => this.request(base, '/auth/send-verify-code', {
      method: 'POST', body: { email },
    }))
  }

  async login(input: AiCloudLoginRequest): Promise<AiCloudAccountSnapshot> {
    const email = required(input.email, 'Email')
    const password = required(input.password, 'Password')
    const authenticated = await this.authenticate(email, password)
    const account = await this.finishAuthentication(authenticated.baseUrl, email, password, authenticated.accessToken)
    // Model discovery is part of signing in, not a UI follow-up. This keeps
    // every caller (desktop, restored sessions, and automation) on the same
    // contract while retaining a valid login when the catalog endpoint is
    // temporarily unavailable.
    try {
      return await this.discoverModels()
    } catch {
      return account
    }
  }

  async register(input: AiCloudRegisterRequest): Promise<AiCloudAccountSnapshot> {
    const config = await this.publicConfig()
    if (!config.registrationEnabled || !config.emailVerifyEnabled || config.captchaEnabled || config.invitationCodeEnabled) {
      throw new Error('AI Cloud native registration is not available with the current server policy.')
    }
    const email = required(input.email, 'Email')
    const password = required(input.password, 'Password')
    const verificationCode = required(input.verificationCode, 'Verification code')
    const registered = await this.withFailover((base) => this.request(base, '/auth/register', {
      method: 'POST', body: { email, password, verify_code: verificationCode },
    }))
    let token = optionalAccessToken(registered.body)
    if (token === undefined) {
      const login = await this.request(registered.base, '/auth/login', { method: 'POST', body: { email, password } })
      token = accessToken(login.body)
    }
    const account = await this.finishAuthentication(registered.base, email, password, token, config)
    try {
      return await this.discoverModels()
    } catch {
      return account
    }
  }

  async current(): Promise<AiCloudAccountSnapshot> {
    const session = await this.loadSession()
    if (session === undefined) return await this.restoreSavedLogin('signedOut')
    try {
      const { body } = await this.request(session.baseUrl, '/auth/me', { token: session.accessToken })
      const funds = accountFunds(body)
      const refreshed = { ...session, ...funds }
      await this.storeSession(refreshed)
      return snapshot(refreshed, 'current')
    } catch (error) {
      if (error instanceof GatewayHttpError && (error.status === 401 || error.status === 403)) {
        await this.clearSession(session, false)
        return await this.restoreSavedLogin('authExpired')
      }
      return snapshot(session, 'stale')
    }
  }

  async logout(): Promise<void> {
    const session = await this.loadSession()
    if (session !== undefined) await this.clearSession(session, true)
    else await Promise.all([this.secrets.delete(SESSION_KEY), this.secrets.delete(LOGIN_KEY)])
  }

  async discoverModels(): Promise<AiCloudAccountSnapshot> {
    const session = await this.requireSession()
    const groupsReply = await this.request(session.baseUrl, '/groups/available', { token: session.accessToken })
    const keysReply = await this.request(session.baseUrl, KEYS_PATH, { token: session.accessToken })
    const groups = availableGroups(groupsReply.body)
    const keys = existingKeys(keysReply.body)
    const models: AiCloudManagedModel[] = []
    const groupIds: string[] = []
    for (const group of groups) {
      let apiKey = keys.find((candidate) => candidate.groupId === group.id)?.key
      if (apiKey === undefined) {
        const created = await this.request(session.baseUrl, '/keys', {
          method: 'POST', token: session.accessToken, body: { name: 'ZeroWall Science', group_id: group.id },
        })
        apiKey = createdKey(created.body)
      }
      const modelReply = await this.rawRequest(`${session.baseUrl}/v1/models`, { token: apiKey })
      const groupId = String(group.id)
      await this.secrets.set(`${KEY_PREFIX}${groupId}`, apiKey)
      groupIds.push(groupId)
      for (const modelId of modelIds(modelReply)) {
        models.push({
          // pi-ai owns one streaming implementation per provider route. A
          // managed group can expose OpenAI, Anthropic, and compatibility
          // models together, so make the route protocol-homogeneous instead
          // of letting its first model decide every request's wire format.
          providerId: managedProviderId(groupId, modelId),
          groupId,
          groupName: group.name,
          modelId,
          // OpenAI-compatible transports append their resource path to a
          // `/v1` base URL, while the Anthropic SDK appends `/v1/messages`
          // itself. Keeping the protocol-specific base here avoids the
          // erroneous `/v1/v1/messages` URL for Claude routes.
          baseUrl: modelBaseUrl(session.baseUrl, modelId),
        })
      }
    }
    const updated = { ...session, models, groupIds }
    await this.storeSession(updated)
    return snapshot(updated, 'current')
  }

  async listOrders(): Promise<AiCloudPaymentOrder[]> {
    const session = await this.requireSession()
    const { body } = await this.request(session.baseUrl, '/payment/orders/my?page=1&page_size=10', { token: session.accessToken })
    return paymentOrders(body)
  }

  async checkoutInfo(): Promise<AiCloudCheckoutInfo> {
    const session = await this.requireSession()
    const { body } = await this.request(session.baseUrl, '/payment/checkout-info', { token: session.accessToken })
    return checkoutInfo(body, session.rechargeUrl)
  }

  async createOrder(input: AiCloudCreateOrderRequest): Promise<AiCloudPaymentOrder> {
    if (!Number.isFinite(input.amount) || input.amount < 10) throw new Error('Recharge amount must be at least 10.')
    const paymentType = normalizePaymentType(input.paymentType)
    const session = await this.requireSession()
    const { body } = await this.request(session.baseUrl, '/payment/orders', {
      method: 'POST', token: session.accessToken,
      body: { amount: input.amount, payment_type: paymentType, order_type: 'balance', payment_source: 'zerowallscience-desktop', is_mobile: false },
    })
    return paymentOrder(paymentOrderPayload(JSON.parse(body) as unknown))
  }

  async getOrder(input: AiCloudGetOrderRequest): Promise<AiCloudPaymentOrder> {
    if (!Number.isSafeInteger(input.orderId) || input.orderId <= 0) throw new Error('Invalid payment order id.')
    const session = await this.requireSession()
    const { body } = await this.request(session.baseUrl, `/payment/orders/${input.orderId}`, { token: session.accessToken })
    return paymentOrder(paymentOrderPayload(JSON.parse(body) as unknown))
  }

  async verifyOrder(input: AiCloudVerifyOrderRequest): Promise<AiCloudPaymentOrder> {
    const outTradeNo = required(input.outTradeNo, 'Payment order number')
    if (outTradeNo.length > 160) throw new Error('Invalid payment order number.')
    const session = await this.requireSession()
    const { body } = await this.request(session.baseUrl, '/payment/orders/verify', {
      method: 'POST', token: session.accessToken, body: { out_trade_no: outTradeNo },
    })
    const payload = paymentOrderPayload(JSON.parse(body) as unknown)
    try {
      return paymentOrder(payload)
    } catch {
      const existing = (await this.listOrders()).find(order => order.outTradeNo === outTradeNo)
      if (existing === undefined) throw new Error('AI Cloud returned an invalid payment order.')
      return paymentOrder({
        id: existing.id,
        out_trade_no: existing.outTradeNo,
        amount: existing.amount,
        payment_type: existing.paymentType,
        ...(existing.paymentUrl === undefined ? {} : { payment_url: existing.paymentUrl }),
        ...(existing.qrCode === undefined ? {} : { qr_code: existing.qrCode }),
        ...(existing.createdAt === undefined ? {} : { created_at: existing.createdAt }),
        ...payload,
      })
    }
  }

  private async finishAuthentication(baseUrl: string, email: string, password: string, accessToken: string, config?: AiCloudPublicConfig): Promise<AiCloudAccountSnapshot> {
    let balance = 0
    let currency = 'CNY'
    try {
      const me = await this.request(baseUrl, '/auth/me', { token: accessToken })
      ;({ balance, currency } = accountFunds(me.body))
    } catch {
      // A billing outage must not discard a valid login.
    }
    const session: StoredSession = {
      baseUrl, email, accessToken, balance, currency, models: [], groupIds: [],
      ...(config?.rechargeUrl === undefined ? {} : { rechargeUrl: config.rechargeUrl }),
      ...(config?.lowBalanceThreshold === undefined ? {} : { lowBalanceThreshold: config.lowBalanceThreshold }),
    }
    await Promise.all([
      this.storeSession(session),
      this.storeLogin({ baseUrl, email, password }),
    ])
    return snapshot(session, 'current')
  }

  private async authenticate(email: string, password: string, bases?: readonly string[]): Promise<{ baseUrl: string; accessToken: string }> {
    const authenticated = await this.withFailover(async (base) => {
      const { body } = await this.request(base, '/auth/login', { method: 'POST', body: { email, password } })
      return { body: accessToken(body) }
    }, bases)
    return { baseUrl: authenticated.base, accessToken: authenticated.body }
  }

  private async restoreSavedLogin(fallback: 'signedOut' | 'authExpired'): Promise<AiCloudAccountSnapshot> {
    const login = await this.loadLogin()
    if (login === undefined) return fallback === 'authExpired' ? { ...signedOut(), status: 'authExpired' } : signedOut()
    try {
      // Existing installs retain their working gateway on startup. New logins
      // still default to the primary node through orderedBases().
      const authenticated = await this.authenticate(login.email, login.password, [
        login.baseUrl,
        ...this.bases.filter((base) => base !== login.baseUrl),
      ])
      const account = await this.finishAuthentication(
        authenticated.baseUrl, login.email, login.password, authenticated.accessToken,
      )
      try {
        return await this.discoverModels()
      } catch {
        return account
      }
    } catch (error) {
      if (error instanceof GatewayHttpError && (error.status === 401 || error.status === 403)) {
        await this.secrets.delete(LOGIN_KEY)
        return { ...signedOut(), status: 'authExpired' }
      }
      return fallback === 'authExpired' ? { ...signedOut(), status: 'authExpired' } : signedOut()
    }
  }

  private async loadSession(): Promise<StoredSession | undefined> {
    const raw = await this.secrets.get(SESSION_KEY)
    if (raw === undefined) return undefined
    const parsed = JSON.parse(raw) as StoredSession
    if (!this.bases.includes(parsed.baseUrl) || typeof parsed.accessToken !== 'string' || parsed.accessToken.length === 0) {
      throw new Error('Stored AI Cloud session is invalid.')
    }
    return { ...parsed, models: parsed.models.map(model => ({ ...model, providerId: managedProviderId(model.groupId, model.modelId) })) }
  }

  private async loadLogin(): Promise<StoredLogin | undefined> {
    const raw = await this.secrets.get(LOGIN_KEY)
    if (raw === undefined) return undefined
    const parsed = JSON.parse(raw) as Partial<StoredLogin>
    if (!this.bases.includes(parsed.baseUrl ?? '') || typeof parsed.email !== 'string' || !parsed.email.trim()
      || typeof parsed.password !== 'string' || parsed.password.length === 0) {
      await this.secrets.delete(LOGIN_KEY)
      return undefined
    }
    return { baseUrl: parsed.baseUrl!, email: parsed.email.trim(), password: parsed.password }
  }

  private async requireSession(): Promise<StoredSession> {
    const session = await this.loadSession()
    if (session === undefined) throw new Error('Sign in to AI Cloud first.')
    return session
  }

  private async storeSession(session: StoredSession): Promise<void> {
    await this.secrets.set(SESSION_KEY, JSON.stringify(session))
  }

  private async storeLogin(login: StoredLogin): Promise<void> {
    await this.secrets.set(LOGIN_KEY, JSON.stringify(login))
  }

  private async clearSession(session: StoredSession, clearLogin: boolean): Promise<void> {
    await Promise.all([
      this.secrets.delete(SESSION_KEY),
      ...session.groupIds.map((id) => this.secrets.delete(`${KEY_PREFIX}${id}`)),
      ...(clearLogin ? [this.secrets.delete(LOGIN_KEY), this.secrets.delete(PREFERRED_BASE_KEY)] : []),
    ])
  }

  private async preferredBase(): Promise<string> {
    const stored = await this.secrets.get(PREFERRED_BASE_KEY)
    return stored === undefined ? this.bases[0]! : this.requireBase(stored)
  }

  private requireBase(value: string): string {
    const base = value.trim().replace(/\/$/, '')
    if (!this.bases.includes(base)) throw new Error('Unsupported AI Cloud gateway.')
    return base
  }

  private async orderedBases(): Promise<readonly string[]> {
    const preferred = await this.preferredBase()
    return [preferred, ...this.bases.filter((base) => base !== preferred)]
  }

  private async withFailover<T extends { body: string }>(operation: (base: string) => Promise<T>, bases?: readonly string[]): Promise<T & { base: string }> {
    let lastError: unknown
    for (const base of bases ?? await this.orderedBases()) {
      try { return { ...await operation(base), base } } catch (error) {
        if (error instanceof GatewayHttpError) throw error
        lastError = error
      }
    }
    throw lastError instanceof Error ? lastError : new Error('AI Cloud is unreachable.')
  }

  private async request(base: string, path: string, options: RequestOptions = {}): Promise<{ body: string }> {
    return { body: await this.rawRequest(`${base}/api/v1${path}`, options) }
  }

  private async rawRequest(url: string, options: RequestOptions = {}): Promise<string> {
    const response = await this.fetcher(url, {
      method: options.method ?? 'GET',
      headers: {
        ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(options.token === undefined ? {} : { authorization: `Bearer ${options.token}` }),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      signal: AbortSignal.timeout(20_000),
    })
    const body = await response.text()
    if (!response.ok) throw new GatewayHttpError(response.status, errorMessage(response.status, body))
    return body
  }
}

interface RequestOptions { method?: 'POST'; body?: Record<string, unknown>; token?: string }
class GatewayHttpError extends Error { constructor(readonly status: number, message: string) { super(message) } }

declare module '@deepseek-ai/cordis' {
  interface Context { zerowallAccount: ZeroWallAccountService }
  interface Events {
    'zerowall/account-updated'(snapshot: AiCloudAccountSnapshot): void
  }
}

export class ZeroWallAccountService extends TypertRemoteService {
  private readonly client = new AiCloudClient()
  constructor(private readonly runtimeCtx: Context) { super(runtimeCtx, 'zerowallAccount') }
  @Remote('publicConfig') publicConfig(): Promise<AiCloudPublicConfig> { return this.client.publicConfig() }
  @Remote('gateways') gateways(): Promise<AiCloudGateway[]> { return this.client.gateways() }
  @Remote('selectGateway') async selectGateway(baseUrl: string): Promise<AiCloudAccountSnapshot> { return this.publish(await this.client.selectGateway(baseUrl)) }
  @Remote('sendCode') sendCode(input: AiCloudSendCodeRequest): Promise<void> { return this.client.sendCode(input) }
  @Remote('login') async login(input: AiCloudLoginRequest): Promise<AiCloudAccountSnapshot> { return this.publish(await this.client.login(input)) }
  @Remote('register') async register(input: AiCloudRegisterRequest): Promise<AiCloudAccountSnapshot> { return this.publish(await this.client.register(input)) }
  @Remote('current') async current(): Promise<AiCloudAccountSnapshot> { return this.publish(await this.client.current()) }
  @Remote('logout') async logout(): Promise<void> { await this.client.logout(); this.publish(signedOut()) }
  @Remote('discoverModels') async discoverModels(): Promise<AiCloudAccountSnapshot> { return this.publish(await this.client.discoverModels()) }
  @Remote('listOrders') listOrders(): Promise<AiCloudPaymentOrder[]> { return this.client.listOrders() }
  @Remote('checkoutInfo') checkoutInfo(): Promise<AiCloudCheckoutInfo> { return this.client.checkoutInfo() }
  @Remote('createOrder') createOrder(input: AiCloudCreateOrderRequest): Promise<AiCloudPaymentOrder> { return this.client.createOrder(input) }
  @Remote('getOrder') getOrder(input: AiCloudGetOrderRequest): Promise<AiCloudPaymentOrder> { return this.client.getOrder(input) }
  @Remote('verifyOrder') verifyOrder(input: AiCloudVerifyOrderRequest): Promise<AiCloudPaymentOrder> { return this.client.verifyOrder(input) }

  private publish(snapshot: AiCloudAccountSnapshot): AiCloudAccountSnapshot {
    this.runtimeCtx.emit('zerowall/account-updated', snapshot)
    return snapshot
  }
}

function required(value: string, label: string): string { const out = value.trim(); if (!out) throw new Error(`${label} is required.`); return out }
function managedProviderId(groupId: string, modelId: string): string { return `zerowall-ai-cloud-${groupId}-${managedProtocol(modelId)}` }
function managedProtocol(modelId: string): 'responses' | 'messages' | 'completions' {
  if (/^(?:gpt|o[1-9]|o3|o4|chatgpt)/iu.test(modelId)) return 'responses'
  if (/^(?:claude|anthropic)/iu.test(modelId)) return 'messages'
  return 'completions'
}
function modelBaseUrl(baseUrl: string, modelId: string): string {
  return managedProtocol(modelId) === 'messages' ? baseUrl : `${baseUrl}/v1`
}
function envelope(body: string): Record<string, unknown> { const root = JSON.parse(body) as Record<string, unknown>; return isRecord(root.data) ? root.data : root }
function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value) }
function stringField(value: Record<string, unknown>, names: string[]): string | undefined { for (const name of names) { const hit = value[name]; if (typeof hit === 'string' && hit.trim()) return hit.trim() } return undefined }
function numberField(value: Record<string, unknown>, names: string[]): number | undefined { const hit = stringField(value, names) ?? names.map((name) => value[name]).find((item) => typeof item === 'number'); const parsed = Number(hit); return Number.isFinite(parsed) ? parsed : undefined }
function booleanField(value: Record<string, unknown>, names: string[]): boolean { for (const name of names) { const hit = value[name]; if (typeof hit === 'boolean') return hit; if (hit === 1 || hit === '1' || hit === 'true') return true } return false }
function optionalAccessToken(body: string): string | undefined { return stringField(envelope(body), ['access_token', 'accessToken', 'token']) }
function accessToken(body: string): string { const token = optionalAccessToken(body); if (!token) throw new Error('AI Cloud returned no access token.'); return token }
function accountFunds(body: string): { balance: number; currency: string } { const data = envelope(body); const account = isRecord(data.user) ? data.user : isRecord(data.account) ? data.account : data; return { balance: numberField(account, ['balance', 'credit', 'amount']) ?? 0, currency: stringField(account, ['currency', 'currency_code', 'unit']) ?? 'CNY' } }
function parsePublicConfig(body: string): AiCloudPublicConfig { const data = envelope(body); const recharge = stringField(data, ['rechargeUrl', 'recharge_url']); const lowBalanceThreshold = numberField(data, ['lowBalanceThreshold', 'low_balance_threshold']); return { registrationEnabled: booleanField(data, ['registrationEnabled', 'registration_enabled']), emailVerifyEnabled: booleanField(data, ['emailVerifyEnabled', 'email_verify_enabled']), invitationCodeEnabled: booleanField(data, ['invitationCodeEnabled', 'invitation_code_enabled']), captchaEnabled: booleanField(data, ['captchaEnabled', 'captcha_enabled']), ...(recharge === undefined ? {} : { rechargeUrl: validateRechargeUrl(recharge) }), ...(lowBalanceThreshold === undefined ? {} : { lowBalanceThreshold }) } }
function validateRechargeUrl(raw: string): string { const url = new URL(raw); if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || !['aicodeme.cn', 'aicodeme.xyz'].some((root) => url.hostname === root || url.hostname.endsWith(`.${root}`))) throw new Error('AI Cloud returned an unsafe recharge URL.'); return raw }
function list(body: string): unknown[] {
  const root = JSON.parse(body) as unknown
  if (Array.isArray(root)) return root
  if (!isRecord(root)) return []
  const data = root.data
  if (Array.isArray(data)) return data
  if (isRecord(data) && Array.isArray(data.items)) return data.items
  return Array.isArray(root.items) ? root.items : []
}
function availableGroups(body: string): AvailableGroup[] { return list(body).flatMap((item) => { if (!isRecord(item)) return []; const id = Number(item.id); const name = typeof item.name === 'string' ? item.name.trim() : ''; const disabled = [item.visible, item.available, item.enabled, item.is_visible, item.is_available].includes(false) || ['disabled', 'inactive', 'unavailable', 'closed'].includes(String(item.status ?? '').toLowerCase()); return Number.isInteger(id) && id > 0 && name && !disabled ? [{ id, name }] : [] }) }
function existingKeys(body: string): ExistingKey[] { return list(body).flatMap((item) => { if (!isRecord(item) || item.enabled === false) return []; const key = stringField(item, ['key', 'token', 'api_key']); const groupId = Number(item.group_id ?? (isRecord(item.group) ? item.group.id : undefined)); return key === undefined ? [] : [{ key, ...(Number.isInteger(groupId) ? { groupId } : {}) }] }) }
function createdKey(body: string): string { const key = stringField(envelope(body), ['key', 'token', 'api_key']); if (!key) throw new Error('AI Cloud created a key but returned no credential.'); return key }
function modelIds(body: string): string[] { const root = JSON.parse(body) as Record<string, unknown>; const values = Array.isArray(root.data) ? root.data : Array.isArray(root) ? root : []; const ids = values.flatMap((item) => isRecord(item) && typeof item.id === 'string' && item.id ? [item.id] : []); if (ids.length === 0) throw new Error('AI Cloud listed no models for a managed group.'); return ids }
function signedOut(gatewayBaseUrl?: string): AiCloudAccountSnapshot { return { status: 'signedOut', balanceFreshness: 'current', lowBalance: false, ...(gatewayBaseUrl === undefined ? {} : { gatewayBaseUrl }), models: [] } }
function snapshot(session: StoredSession, freshness: 'current' | 'stale'): AiCloudAccountSnapshot { return { status: 'signedIn', email: session.email, balance: session.balance, currency: session.currency, balanceFreshness: freshness, gatewayBaseUrl: session.baseUrl, ...(session.rechargeUrl === undefined ? {} : { rechargeUrl: session.rechargeUrl }), lowBalance: session.lowBalanceThreshold !== undefined && session.balance <= session.lowBalanceThreshold, models: session.models } }
function gatewayLabel(baseUrl: string): string { return baseUrl === PRIMARY_BASE ? 'Hong Kong (default)' : baseUrl.includes('.xyz') ? 'Global XYZ backup' : 'Global CN backup' }
function normalizePaymentType(value: string): string { const normalized = value.trim().toLowerCase(); if (normalized === 'wechat' || normalized === 'wechat_pay') return 'wxpay'; if (['alipay', 'alipay_direct', 'wxpay', 'wxpay_direct'].includes(normalized)) return normalized; throw new Error('Unsupported payment type.') }
function paymentOrderPayload(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error('AI Cloud returned an invalid payment order.')
  const data = isRecord(value.data) ? value.data : undefined
  for (const candidate of [data?.order, data?.payment_order, data, value.order, value.payment_order, value]) {
    if (isRecord(candidate)) return candidate
  }
  throw new Error('AI Cloud returned an invalid payment order.')
}
function paymentOrder(value: Record<string, unknown>): AiCloudPaymentOrder {
  const id = Number(value.order_id ?? value.orderId ?? value.id)
  const amount = Number(value.amount ?? value.pay_amount ?? value.actual_amount ?? value.payment_amount)
  if (!Number.isSafeInteger(id) || id <= 0 || !Number.isFinite(amount)) throw new Error('AI Cloud returned an invalid payment order.')
  const outTradeNo = stringField(value, ['out_trade_no', 'outTradeNo']) ?? ''
  const status = (stringField(value, ['status', 'payment_status']) ?? 'PENDING').toUpperCase()
  const paymentType = stringField(value, ['payment_type', 'paymentType', 'channel']) ?? ''
  const rawPaymentUrl = stringField(value, ['payment_url', 'paymentUrl', 'pay_url', 'payUrl'])
  const paymentUrl = rawPaymentUrl === undefined ? undefined : validatePaymentUrl(rawPaymentUrl)
  const qrCode = stringField(value, ['qr_code', 'qrCode', 'code_url', 'codeUrl'])
  const createdAt = stringField(value, ['created_at', 'createdAt'])
  return { id, outTradeNo, status, amount, paymentType, ...(paymentUrl === undefined ? {} : { paymentUrl }), ...(qrCode === undefined ? {} : { qrCode }), ...(createdAt === undefined ? {} : { createdAt }) }
}
function paymentOrders(body: string): AiCloudPaymentOrder[] {
  const root = JSON.parse(body) as unknown
  const candidates = paymentOrderList(root)
  return candidates.flatMap((item) => { try { return isRecord(item) ? [paymentOrder(paymentOrderPayload(item))] : [] } catch { return [] } })
}
function paymentOrderList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (!isRecord(value)) return []
  for (const candidate of [value.data, value.orders, value.items, value.list]) {
    if (Array.isArray(candidate)) return candidate
    if (isRecord(candidate)) {
      for (const nested of [candidate.orders, candidate.items, candidate.list, candidate.records]) {
        if (Array.isArray(nested)) return nested
      }
    }
  }
  return []
}
function checkoutInfo(body: string, fallbackUrl?: string): AiCloudCheckoutInfo {
  const data = envelope(body)
  const methods = isRecord(data.methods) ? data.methods : undefined
  const methodMinimums = methods === undefined ? [] : Object.values(methods).flatMap((entry) => {
    if (!isRecord(entry)) return []
    const minimum = numberField(entry, ['single_min', 'singleMin', 'minimum_amount', 'minimumAmount'])
    return minimum === undefined || minimum <= 0 ? [] : [minimum]
  })
  const configuredMinimum = numberField(data, ['global_min', 'globalMin', 'minimum_amount', 'minimumAmount', 'min_amount', 'minAmount'])
  const minimumAmount = Math.max(10, configuredMinimum ?? 0, ...methodMinimums)
  const rawTypes = data.payment_types ?? data.paymentTypes ?? data.channels ?? (methods === undefined ? undefined : Object.keys(methods))
  const paymentTypes = Array.isArray(rawTypes)
    ? rawTypes.flatMap((entry) => typeof entry === 'string' && entry.trim() ? [normalizePaymentType(entry)] : [])
    : ['alipay', 'wxpay']
  const rawRechargeUrl = stringField(data, ['recharge_url', 'rechargeUrl']) ?? fallbackUrl
  return {
    enabled: data.enabled !== false && data.available !== false && data.balance_disabled !== true && data.balanceDisabled !== true,
    minimumAmount,
    paymentTypes: [...new Set(paymentTypes)],
    ...(rawRechargeUrl === undefined ? {} : { rechargeUrl: validateRechargeUrl(rawRechargeUrl) }),
  }
}
function validatePaymentUrl(raw: string): string | undefined {
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' || url.username || url.password) return undefined
    return raw
  } catch {
    return undefined
  }
}
function errorMessage(status: number, body: string): string { try { const value = JSON.parse(body) as Record<string, unknown>; return stringField(value, ['message', 'error']) ?? `AI Cloud returned HTTP ${status}.` } catch { return body.trim() ? `HTTP ${status}: ${body.trim()}` : `AI Cloud returned HTTP ${status}.` } }

export function apply(ctx: Context): void {
  ctx.plugin(ZeroWallAccountService)
}

export default { apply }
