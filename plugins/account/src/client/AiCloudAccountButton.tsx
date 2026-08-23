import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import QRCode from 'qrcode/lib/browser.js'
import { CheckCircle2, Cloud, CreditCard, ExternalLink, LogOut, RefreshCw, Send, ShieldCheck, X } from 'lucide-react'
import type { SidebarFooterActionOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { PropsLocale, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from '@zerowallscience/plugin-base/client-helpers'
import css from './AiCloudAccountButton.module.css'

export interface AiCloudModelView { providerId: string; groupId: string; groupName: string; modelId: string; baseUrl: string }
export interface AiCloudAccountView { status: 'signedOut' | 'signedIn' | 'authExpired'; email?: string; balance?: number; currency?: string; balanceFreshness: 'current' | 'stale'; rechargeUrl?: string; lowBalance: boolean; gatewayBaseUrl?: string; models: AiCloudModelView[] }
export interface AiCloudGatewayView { baseUrl: string; label: string; preferred: boolean }
export interface AiCloudPublicView { registrationEnabled: boolean; emailVerifyEnabled: boolean; invitationCodeEnabled: boolean; captchaEnabled: boolean; rechargeUrl?: string; lowBalanceThreshold?: number }
export interface AiCloudCheckoutView { enabled: boolean; minimumAmount: number; paymentTypes: string[]; rechargeUrl?: string }
export interface AiCloudOrderView { id: number; outTradeNo: string; status: string; amount: number; paymentType: string; paymentUrl?: string; qrCode?: string; createdAt?: string }

interface Actions {
  getAccount: () => Promise<AiCloudAccountView>
  getPublicConfig: () => Promise<AiCloudPublicView>
  gateways: () => Promise<AiCloudGatewayView[]>
  selectGateway: (baseUrl: string) => Promise<AiCloudAccountView>
  login: (email: string, password: string) => Promise<AiCloudAccountView>
  register: (email: string, password: string, verificationCode: string) => Promise<AiCloudAccountView>
  sendCode: (email: string) => Promise<void>
  logout: () => Promise<void>
  discoverModels: () => Promise<AiCloudAccountView>
  checkoutInfo: () => Promise<AiCloudCheckoutView>
  listOrders: () => Promise<AiCloudOrderView[]>
  createOrder: (amount: number, paymentType: string) => Promise<AiCloudOrderView>
  getOrder: (orderId: number) => Promise<AiCloudOrderView>
  verifyOrder: (outTradeNo: string) => Promise<AiCloudOrderView>
}

type Props = SidebarFooterActionOwnerProps & Actions & PropsLocale<typeof NS>
const TERMINAL = new Set(['COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED', 'REFUNDED'])

export function AiCloudAccountButton(props: Props) {
  const firstCheck = useRef(false)
  const [open, setOpen] = useState(false)
  const [account, setAccount] = useState<AiCloudAccountView>()
  const [config, setConfig] = useState<AiCloudPublicView>()
  const [gateways, setGateways] = useState<AiCloudGatewayView[]>([])
  const [checkout, setCheckout] = useState<AiCloudCheckoutView>()
  const [registering, setRegistering] = useState(false)
  const [syncingModels, setSyncingModels] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [orders, setOrders] = useState<AiCloudOrderView[]>([])
  const [activeOrder, setActiveOrder] = useState<AiCloudOrderView>()
  const [amount, setAmount] = useState('100')
  const [paymentType, setPaymentType] = useState('alipay')
  const [busy, setBusy] = useState(false)
  const [polling, setPolling] = useState(false)
  const [error, setError] = useState<string>()
  const [qrImage, setQrImage] = useState<string>()

  const loadBilling = useCallback(async () => {
    const [checkoutResult, ordersResult] = await Promise.allSettled([props.checkoutInfo(), props.listOrders()])
    if (checkoutResult.status === 'fulfilled') {
      setCheckout(checkoutResult.value)
      setAmount(current => Number(current) < checkoutResult.value.minimumAmount ? String(checkoutResult.value.minimumAmount) : current)
      const supported = checkoutResult.value.paymentTypes.map(displayPaymentType)
      if (supported.length > 0 && !supported.includes(paymentType)) setPaymentType(supported[0] ?? 'alipay')
    }
    if (ordersResult.status === 'fulfilled' && Array.isArray(ordersResult.value)) setOrders(ordersResult.value)
  }, [paymentType, props.checkoutInfo, props.listOrders])

  const refresh = useCallback(async () => {
    setBusy(true)
    setError(undefined)
    void props.getPublicConfig().then(setConfig).catch(() => undefined)
    void props.gateways().then(setGateways).catch(() => undefined)
    try {
      const nextAccount = await props.getAccount()
      setAccount(nextAccount)
      if (nextAccount.status === 'signedIn') await loadBilling()
      return nextAccount
    } catch (reason) {
      setError(message(reason))
      return undefined
    } finally {
      setBusy(false)
    }
  }, [loadBilling, props.getAccount, props.getPublicConfig])

  useEffect(() => {
    if (firstCheck.current) return
    firstCheck.current = true
    void refresh().then(next => { if (next?.status !== 'signedIn') setOpen(true) })
  }, [refresh])

  useEffect(() => {
    if (!open) return
    const close = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      setOpen(false)
    }
    window.addEventListener('keydown', close, true)
    return () => window.removeEventListener('keydown', close, true)
  }, [open])

  useEffect(() => {
    if (!open || activeOrder === undefined || TERMINAL.has(activeOrder.status.toUpperCase())) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = async () => {
      if (cancelled) return
      setPolling(true)
      try {
        const next = activeOrder.outTradeNo
          ? await props.verifyOrder(activeOrder.outTradeNo)
          : await props.getOrder(activeOrder.id)
        if (cancelled) return
        const updated = mergePaymentOrder(activeOrder, next)
        setActiveOrder(updated)
        setOrders(current => [updated, ...current.filter(order => order.id !== updated.id)])
        if (updated.status.toUpperCase() === 'COMPLETED') await refresh()
        else if (!TERMINAL.has(updated.status.toUpperCase())) timer = setTimeout(() => { void poll() }, 2500)
      } catch {
        if (!cancelled) timer = setTimeout(() => { void poll() }, 5000)
      } finally {
        if (!cancelled) setPolling(false)
      }
    }
    timer = setTimeout(() => { void poll() }, 1800)
    return () => { cancelled = true; if (timer !== undefined) clearTimeout(timer) }
  }, [activeOrder?.id, activeOrder?.outTradeNo, activeOrder?.status, open])

  useEffect(() => {
    let cancelled = false
    setQrImage(undefined)
    if (!activeOrder?.qrCode) return
    void QRCode.toDataURL(activeOrder.qrCode, {
      errorCorrectionLevel: 'M', margin: 2, width: 220,
      color: { dark: '#17212b', light: '#ffffff' },
    }).then(value => { if (!cancelled) setQrImage(value) }).catch(() => {})
    return () => { cancelled = true }
  }, [activeOrder?.qrCode])

  const authenticate = async () => {
    setBusy(true)
    setError(undefined)
    try {
      const next = registering ? await props.register(email, password, code) : await props.login(email, password)
      setAccount(next)
      setPassword('')
      setCode('')
      // Host login performs discovery as part of the authenticated operation.
      // A catalog outage must not turn a valid login into a failed UI flow;
      // the signed-in panel exposes the explicit retry action below.
      await loadBilling()
      setOpen(false)
    } catch (reason) {
      setError(message(reason))
    } finally {
      setBusy(false)
    }
  }

  const syncModels = async () => {
    if (syncingModels || account?.status !== 'signedIn') return
    setSyncingModels(true)
    setError(undefined)
    try {
      setAccount(await props.discoverModels())
    } catch (reason) {
      setError(message(reason))
    } finally {
      setSyncingModels(false)
    }
  }

  const sendCode = async () => {
    setBusy(true)
    setError(undefined)
    try { await props.sendCode(email) } catch (reason) { setError(message(reason)) } finally { setBusy(false) }
  }

  const logout = async () => {
    setBusy(true)
    setError(undefined)
    try {
      await props.logout()
      setAccount({ status: 'signedOut', balanceFreshness: 'current', lowBalance: false, models: [] })
      setOrders([])
      setActiveOrder(undefined)
    } catch (reason) {
      setError(message(reason))
    } finally {
      setBusy(false)
    }
  }

  const switchGateway = async (baseUrl: string) => {
    setBusy(true)
    setError(undefined)
    try {
      const next = await props.selectGateway(baseUrl)
      setAccount(next)
      setGateways(current => current.map(gateway => ({ ...gateway, preferred: gateway.baseUrl === baseUrl })))
      if (next.status === 'signedIn') await loadBilling()
    } catch (reason) {
      setError(message(reason))
    } finally {
      setBusy(false)
    }
  }

  const createOrder = async () => {
    setBusy(true)
    setError(undefined)
    try {
      const order = await props.createOrder(Number(amount), paymentType)
      setActiveOrder(order)
      setOrders(current => [order, ...current.filter(item => item.id !== order.id)])
    } catch (reason) {
      setError(message(reason))
    } finally {
      setBusy(false)
    }
  }

  const continueOrder = (order: AiCloudOrderView) => { setActiveOrder(order) }
  const signedIn = account?.status === 'signedIn'
  const registrationAvailable = config?.registrationEnabled === true && config.emailVerifyEnabled && !config.captchaEnabled && !config.invitationCodeEnabled
  const minimumAmount = checkout?.minimumAmount ?? 10
  const paymentTypes = [...new Set((checkout?.paymentTypes ?? ['alipay', 'wxpay']).map(displayPaymentType))]
  const paymentUrl = activeOrder?.paymentUrl ?? checkout?.rechargeUrl ?? account?.rechargeUrl ?? config?.rechargeUrl
  const orderComplete = activeOrder?.status.toUpperCase() === 'COMPLETED'
  const activePaymentLabel = useMemo(
    () => paymentLabel(displayPaymentType(activeOrder?.paymentType || paymentType), props.t),
    [activeOrder?.paymentType, paymentType, props.t],
  )

  return <>
    <button className={css.trigger} type="button" onClick={() => { setOpen(true); void refresh() }} title={props.t('account.trigger')} aria-label={props.t('account.trigger')}>
      <Cloud size={18} aria-hidden="true" />{props.wide && <span>{props.t('account.nav')}</span>}
    </button>
    {open && createPortal(<div className={css.backdrop} role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false) }}>
      <section className={css.panel} role="dialog" aria-modal="true" aria-labelledby="zerowall-account-title">
        <header className={css.header}>
          <div><p>ZeroWall Science</p><h2 id="zerowall-account-title">{signedIn ? props.t('account.centerTitle') : props.t('account.title')}</h2></div>
          <button className={css.iconButton} type="button" onClick={() => setOpen(false)} title={props.t('common.close')} aria-label={props.t('common.close')}><X size={18} /></button>
        </header>
        {error && <p className={css.error} role="alert">{error}</p>}
        {!signedIn ? <div className={css.auth}>
          {account?.status === 'authExpired' && <p className={css.notice}>{props.t('account.authExpired')}</p>}
          <p className={css.authLead}>{props.t('account.authLead')}</p>
          <GatewaySelector gateways={gateways} selected={account?.gatewayBaseUrl} disabled={busy} onChange={switchGateway} t={props.t} />
          <div className={css.segmented} role="group" aria-label={props.t('account.actions')}>
            <button type="button" aria-pressed={!registering} onClick={() => setRegistering(false)}>{props.t('account.login')}</button>
            <button type="button" aria-pressed={registering} disabled={!registrationAvailable} onClick={() => setRegistering(true)}>{props.t('account.register')}</button>
          </div>
          <label>{props.t('account.email')}<input type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="username" /></label>
          <label>{props.t('account.password')}<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete={registering ? 'new-password' : 'current-password'} /></label>
          {registering && <label>{props.t('account.code')}<span className={css.codeRow}><input value={code} onChange={event => setCode(event.target.value)} /><button type="button" onClick={() => void sendCode()} disabled={busy || email.trim() === ''} title={props.t('account.sendCode')} aria-label={props.t('account.sendCode')}><Send size={16} /></button></span></label>}
          <p className={css.savedHint}>{props.t('account.savedHint')}</p>
          <div className={css.authActions}>
            <button className={css.secondary} type="button" onClick={() => setOpen(false)}>{props.t('account.skip')}</button>
            <button className={css.primary} type="button" onClick={() => void authenticate()} disabled={busy || email.trim() === '' || password === '' || (registering && code.trim() === '')}>{registering ? props.t('account.registerConfigure') : props.t('account.loginConfigure')}</button>
          </div>
        </div> : <div className={css.content}>
          <GatewaySelector gateways={gateways} selected={account?.gatewayBaseUrl} disabled={busy} onChange={switchGateway} t={props.t} />
          <div className={css.accountCard}>
            <div className={css.identity}><span>{props.t('account.currentAccount')}</span><strong>{account.email}</strong><small><CheckCircle2 size={13} />{account.balanceFreshness === 'stale' ? props.t('account.lastBalance') : props.t('account.signedIn')}</small></div>
            <div className={css.balance}><span>{props.t('account.balance')}</span><strong>{formatBalance(account)}</strong></div>
            <button className={css.logoutButton} type="button" onClick={() => void logout()} disabled={busy}><LogOut size={16} />{props.t('account.logout')}</button>
          </div>
          <section className={css.modelSync} aria-live="polite">
            <div><h3>{props.t('account.modelsTitle')}</h3><p>{props.t('account.modelsDescription')}</p></div>
            <button className={css.secondary} type="button" onClick={() => void syncModels()} disabled={busy || syncingModels}>
              <RefreshCw size={15} className={syncingModels ? css.spin : undefined} />
              {syncingModels ? props.t('account.modelsSyncing') : props.t('account.modelsSync')}
            </button>
          </section>
          {account.lowBalance && <p className={css.warning}>{props.t('account.lowBalance')}</p>}
          <div className={css.billingGrid}>
            <section className={css.rechargeCard}>
              <div className={css.sectionHeading}><div><h3>{props.t('account.rechargeTitle')}</h3><p>{props.t('account.rechargeDescription')}</p></div><CreditCard size={19} /></div>
              <div className={css.amountChoices}>{[50, 100, 200, 500].map(value => <button key={value} type="button" data-active={Number(amount) === value} onClick={() => setAmount(String(value))}>{value}</button>)}</div>
              <label>{props.t('account.customAmount')}<input type="number" min={minimumAmount} step="1" inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} /><small>{props.t('account.minimumAmount', { amount: minimumAmount })}</small></label>
              <div className={css.paymentChoices} role="group" aria-label={props.t('account.payment')}>
                {paymentTypes.map(type => <button key={type} type="button" data-active={paymentType === type} onClick={() => setPaymentType(type)}>{paymentLabel(type, props.t)}</button>)}
              </div>
              <button className={css.primary} type="button" onClick={() => void createOrder()} disabled={busy || checkout?.enabled === false || Number(amount) < minimumAmount}><CreditCard size={16} />{props.t('account.createPayment')}</button>
              <p className={css.securityNote}><ShieldCheck size={14} />{props.t('account.paymentSecurity')}</p>
            </section>
            <section className={css.paymentCard}>
              {activeOrder === undefined ? <div className={css.paymentEmpty}><CreditCard size={28} /><h3>{props.t('account.paymentEmptyTitle')}</h3><p>{props.t('account.paymentEmptyDescription')}</p></div> : <>
                <div className={css.sectionHeading}><div><h3>{props.t('account.orderNumber', { id: activeOrder.outTradeNo || String(activeOrder.id) })}</h3><p>{props.t('account.paymentLive')}</p></div><span className={css.status} data-status={activeOrder.status.toLowerCase()}>{statusLabel(activeOrder.status, props.t)}</span></div>
                <div className={css.orderAmount}>{activeOrder.amount.toFixed(2)} {account.currency ?? 'CNY'}<small>{activePaymentLabel}</small></div>
                {qrImage && !orderComplete && <div className={css.qrFrame}><img src={qrImage} alt={props.t('account.paymentQr')} /><span>{props.t('account.scanPayment')}</span></div>}
                {paymentUrl && <a className={css.payLink} href={withSelection(paymentUrl, amount, paymentType)} target="_blank" rel="noreferrer"><ExternalLink size={16} />{props.t('account.openPayment')}</a>}
                <div className={css.polling}>{polling ? props.t('account.checkingPayment') : TERMINAL.has(activeOrder.status.toUpperCase()) ? statusLabel(activeOrder.status, props.t) : props.t('account.waitingPayment')}</div>
              </>}
            </section>
          </div>
          <div className={css.ordersHeader}><div><h3>{props.t('account.recentOrders')}</h3><p>{props.t('account.ordersDescription')}</p></div><button className={css.iconButton} type="button" onClick={() => void loadBilling()} disabled={busy} title={props.t('common.refresh')} aria-label={props.t('common.refresh')}><RefreshCw size={17} /></button></div>
          <div className={css.orders}>{orders.length === 0 ? <p className={css.emptyOrders}>{props.t('account.noOrders')}</p> : orders.map(order => <div className={css.orderRow} key={order.id}>
            <div><strong>{order.outTradeNo || `#${order.id}`}</strong><small>{formatDate(order.createdAt)}</small></div>
            <span>{order.amount.toFixed(2)} {account.currency ?? 'CNY'}</span>
            <span className={css.status} data-status={order.status.toLowerCase()}>{statusLabel(order.status, props.t)}</span>
            {!TERMINAL.has(order.status.toUpperCase()) && <button type="button" onClick={() => continueOrder(order)}>{props.t('account.continuePayment')}</button>}
          </div>)}</div>
        </div>}
      </section>
    </div>, document.body)}
  </>
}

function GatewaySelector({ gateways, selected, disabled, onChange, t }: { gateways: readonly AiCloudGatewayView[]; selected?: string | undefined; disabled: boolean; onChange: (baseUrl: string) => void; t: TranslateNS<typeof NS> }) {
  if (gateways.length === 0) return null
  const value = selected ?? gateways.find(gateway => gateway.preferred)?.baseUrl ?? gateways[0]?.baseUrl
  return <label className={css.gateway}><span>{t('account.gateway')}</span><select aria-label={t('account.gateway')} value={value} disabled={disabled} onChange={event => onChange(event.target.value)}>{gateways.map(gateway => <option value={gateway.baseUrl} key={gateway.baseUrl}>{gateway.label} ({gateway.baseUrl.replace('https://', '')})</option>)}</select></label>
}

function displayPaymentType(value: string): string { return ['wechat', 'wechat_pay', 'wxpay', 'wxpay_direct'].includes(value.toLowerCase()) ? 'wechat' : 'alipay' }
export function mergePaymentOrder(previous: AiCloudOrderView, next: AiCloudOrderView): AiCloudOrderView {
  if (previous.id !== next.id) return next
  const paymentUrl = next.paymentUrl ?? previous.paymentUrl
  const qrCode = next.qrCode ?? previous.qrCode
  const createdAt = next.createdAt ?? previous.createdAt
  return {
    ...previous,
    ...next,
    outTradeNo: next.outTradeNo || previous.outTradeNo,
    paymentType: next.paymentType || previous.paymentType,
    ...(paymentUrl === undefined ? {} : { paymentUrl }),
    ...(qrCode === undefined ? {} : { qrCode }),
    ...(createdAt === undefined ? {} : { createdAt }),
  }
}
function paymentLabel(value: string, t: TranslateNS<typeof NS>): string { return value === 'wechat' ? t('account.wechat') : t('account.alipay') }
function statusLabel(status: string, t: TranslateNS<typeof NS>): string {
  const key = ({ PENDING: 'pending', PAID: 'paid', RECHARGING: 'paid', COMPLETED: 'completed', FAILED: 'failed', CANCELLED: 'cancelled', EXPIRED: 'expired', REFUNDED: 'refunded' } as const)[status.toUpperCase() as 'PENDING'] ?? 'pending'
  return t(`account.status.${key}`)
}
function withSelection(raw: string, amount: string, paymentType: string): string {
  try { const url = new URL(raw); if (!url.searchParams.has('amount')) url.searchParams.set('amount', amount); if (!url.searchParams.has('payment_type')) url.searchParams.set('payment_type', paymentType); return url.toString() } catch { return raw }
}
function formatBalance(account: AiCloudAccountView): string { return account.balance === undefined ? '--' : `${account.balance.toFixed(2)} ${account.currency ?? 'CNY'}` }
function formatDate(value?: string): string { if (!value) return ''; const date = new Date(value); return Number.isNaN(date.valueOf()) ? value : date.toLocaleString() }
function message(reason: unknown): string {
  const raw = reason instanceof Error ? reason.message : String(reason)
  return raw.replace(/^zerowall\.[\w.]+ failed:\s*(?:internal:\s*)?/i, '').trim()
}
