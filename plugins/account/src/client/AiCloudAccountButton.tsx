import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import QRCode from 'qrcode/lib/browser.js'
import { CheckCircle2, Cloud, CreditCard, ExternalLink, LogOut, RefreshCw, Send, ShieldCheck, X } from 'lucide-react'
import type { SidebarFooterActionOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { PropsLocale, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from '@zerowallscience/plugin-base/client-helpers'
import { accountSurface } from './account-surface.js'
import css from './AiCloudAccountButton.module.css'

export interface AiCloudModelView { providerId: string; groupId: string; groupName: string; modelId: string; baseUrl: string }
export interface AiCloudAccountView { status: 'signedOut' | 'signedIn' | 'authExpired'; email?: string; balance?: number; currency?: string; balanceFreshness: 'current' | 'stale'; rechargeUrl?: string; lowBalance: boolean; gatewayBaseUrl?: string; models: AiCloudModelView[] }
export interface AiCloudGatewayView { baseUrl: string; label: string; preferred: boolean }
export interface AiCloudPublicView { registrationEnabled: boolean; emailVerifyEnabled: boolean; invitationCodeEnabled: boolean; captchaEnabled: boolean; passwordResetEnabled?: boolean; rechargeUrl?: string; lowBalanceThreshold?: number }
export interface AiCloudCheckoutView { enabled: boolean; minimumAmount: number; paymentTypes: string[]; rechargeUrl?: string }
export interface AiCloudOrderView { id: number; outTradeNo: string; status: string; amount: number; paymentType: string; paymentUrl?: string; qrCode?: string; createdAt?: string }

interface Actions {
  getAccount: () => Promise<AiCloudAccountView>
  forgetLogin: () => Promise<void>
  savedLogin: () => Promise<{ email: string; password: string; baseUrl: string; rememberPassword: true } | undefined>
  getPublicConfig: (gatewayBaseUrl?: string) => Promise<AiCloudPublicView>
  gateways: () => Promise<AiCloudGatewayView[]>
  selectGateway: (baseUrl: string) => Promise<AiCloudAccountView>
  login: (email: string, password: string, rememberPassword: boolean) => Promise<AiCloudAccountView>
  register: (email: string, password: string, verificationCode: string, rememberPassword: boolean, gatewayBaseUrl?: string) => Promise<AiCloudAccountView>
  sendCode: (email: string, gatewayBaseUrl?: string) => Promise<{ countdown: number; gatewayBaseUrl: string }>
  forgotPassword: (email: string, gatewayBaseUrl?: string) => Promise<void>
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
  const target = useSyncExternalStore(accountSurface.subscribe, accountSurface.getSnapshot)
  const firstCheck = useRef(false)
  const [open, setOpen] = useState(false)
  const [account, setAccount] = useState<AiCloudAccountView>()
  const [config, setConfig] = useState<AiCloudPublicView>()
  const [gateways, setGateways] = useState<AiCloudGatewayView[]>([])
  const [checkout, setCheckout] = useState<AiCloudCheckoutView>()
  const [registering, setRegistering] = useState(false)
  const [forgotMode, setForgotMode] = useState(false)
  const [syncingModels, setSyncingModels] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberPassword, setRememberPassword] = useState(true)
  const [code, setCode] = useState('')
  const [codeCooldown, setCodeCooldown] = useState(0)
  const [sendingCode, setSendingCode] = useState(false)
  const [resetCooldown, setResetCooldown] = useState(0)
  const authPending = useRef(false)
  const refreshPending = useRef(false)
  const formEdited = useRef(false)
  const configRequest = useRef(0)
  const [codeNotice, setCodeNotice] = useState<string>()
  const [orders, setOrders] = useState<AiCloudOrderView[]>([])
  const [activeOrder, setActiveOrder] = useState<AiCloudOrderView>()
  const [amount, setAmount] = useState('100')
  const [paymentType, setPaymentType] = useState('alipay')
  const [busy, setBusy] = useState(false)
  const [polling, setPolling] = useState(false)
  const [error, setError] = useState<string>()
  const [success, setSuccess] = useState<string>()
  const [verificationGateway, setVerificationGateway] = useState<string>()
  const [qrImage, setQrImage] = useState<string>()
  const [balancePrompt, setBalancePrompt] = useState(false)
  const balanceDialog = useRef<HTMLDialogElement>(null)
  const balancePrompted = useRef(false)
  useEffect(() => {
    if (codeCooldown <= 0 && resetCooldown <= 0) return
    const codeUntil = Date.now() + codeCooldown * 1000
    const resetUntil = Date.now() + resetCooldown * 1000
    const timer = window.setInterval(() => {
      setCodeCooldown(Math.max(0, Math.ceil((codeUntil - Date.now()) / 1000)))
      setResetCooldown(Math.max(0, Math.ceil((resetUntil - Date.now()) / 1000)))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [codeCooldown, resetCooldown])

  useEffect(() => {
    if (account?.status !== 'signedIn' || account.balanceFreshness !== 'current') {
      setBalancePrompt(false)
      return
    }
    if (account.balance !== undefined && Number.isFinite(account.balance) && account.balance <= 0 && !balancePrompted.current) {
      balancePrompted.current = true
      setBalancePrompt(true)
    } else if (account.balance !== undefined && account.balance > 0) setBalancePrompt(false)
  }, [account])
  useEffect(() => {
    if (!balancePrompt) return
    const previous = document.activeElement as HTMLElement | null
    balanceDialog.current?.showModal()
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      setBalancePrompt(false)
    }
    window.addEventListener('keydown', escape, true)
    return () => { window.removeEventListener('keydown', escape, true); previous?.focus() }
  }, [balancePrompt])

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
    if (authPending.current || refreshPending.current) return
    refreshPending.current = true
    setBusy(true)
    setError(undefined)
    const requestId = ++configRequest.current
    void props.getPublicConfig().then(value => { if (requestId === configRequest.current) setConfig(value) }).catch(() => { if (requestId === configRequest.current) setConfig(undefined) })
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
      refreshPending.current = false
      setBusy(false)
    }
  }, [loadBilling, props.getAccount, props.getPublicConfig])

  useEffect(() => {
    if (firstCheck.current) return
    firstCheck.current = true
    // Account setup is optional; users can configure their own model provider.
    // Keep a signed-out first launch on the conversation surface.
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!open && !target) return
    let active = true
    if (account?.status !== 'signedOut' && account?.status !== 'authExpired') return
    void props.savedLogin?.().then(saved => {
      if (!active || saved === undefined || formEdited.current) return
      setEmail(saved.email)
      setPassword(saved.password)
      setRememberPassword(true)
    }).catch(() => undefined)
    return () => { active = false }
  }, [account?.status, props.savedLogin, open, target])

  useEffect(() => {
    if (!open || target) return
    const close = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || balancePrompt) return
      event.preventDefault()
      event.stopImmediatePropagation()
      setOpen(false)
    }
    window.addEventListener('keydown', close, true)
    return () => window.removeEventListener('keydown', close, true)
  }, [open, target, balancePrompt])

  useEffect(() => {
    if ((!open && !target) || activeOrder === undefined || TERMINAL.has(activeOrder.status.toUpperCase())) return
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
  }, [activeOrder?.id, activeOrder?.outTradeNo, activeOrder?.status, open, target])

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
    if (authPending.current || busy) return
    if (forgotMode && !resetAvailable) { setError(props.t('account.resetUnavailable')); return }
    if (registering && !registrationAvailable) { setError(props.t('account.registrationUnavailable')); return }
    if (!validEmail(email)) { setError(props.t('account.invalidEmail')); return }
    if (!forgotMode && password === '') return
    if (forgotMode && resetCooldown > 0) return
    if (!forgotMode && registering && password.length < 6) { setError(props.t('account.passwordHint')); return }
    if (!forgotMode && registering && !/^[0-9]{6}$/.test(code.trim())) { setError(props.t('account.invalidCode')); return }
    authPending.current = true
    setSuccess(undefined)
    setBusy(true)
    setError(undefined)
    try {
      if (forgotMode) {
        await props.forgotPassword(email.trim().toLowerCase(), selectedGateway)
        setResetCooldown(60)
        setPassword('')
        setSuccess(props.t('account.resetSent'))
        return
      }
      const next = registering
        ? await props.register(email.trim().toLowerCase(), password, code.trim(), rememberPassword, verificationGateway ?? selectedGateway)
        : await props.login(email.trim().toLowerCase(), password, rememberPassword)
      setAccount(next)
      setCode('')
      // Host login performs discovery as part of the authenticated operation.
      // A catalog outage must not turn a valid login into a failed UI flow;
      // the signed-in panel exposes the explicit retry action below.
      await loadBilling()
      setOpen(false)
    } catch (reason) {
      setError(message(reason))
    } finally {
      authPending.current = false
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
    if (codeCooldown > 0 || busy || authPending.current) return
    if (!registrationAvailable) { setError(props.t('account.registrationUnavailable')); return }
    if (!validEmail(email)) { setError(props.t('account.invalidEmail')); return }
    authPending.current = true
    setSendingCode(true)
    setBusy(true)
    setError(undefined)
    setSuccess(undefined)
    setCodeNotice(undefined)
    try {
      const result = await props.sendCode(email.trim().toLowerCase(), selectedGateway)
      setVerificationGateway(result.gatewayBaseUrl)
      setCodeCooldown(result.countdown)
      setCode('')
      setCodeNotice(props.t('account.codeSent', { email: email.trim().toLowerCase() }))
    } catch (reason) { setError(message(reason)) } finally { authPending.current = false; setSendingCode(false); setBusy(false) }
  }

  const logout = async () => {
    setBusy(true)
    setError(undefined)
    try {
      await props.logout()
      setAccount({ status: 'signedOut', balanceFreshness: 'current', lowBalance: false, models: [] })
      setOrders([])
      setActiveOrder(undefined)
      const saved = await props.savedLogin?.()
      setRegistering(false)
      setEmail(saved?.email ?? '')
      setPassword(saved?.password ?? '')
      setTimeout(() => document.querySelector<HTMLInputElement>('input[autocomplete="current-password"]')?.focus(), 0)
    } catch (reason) {
      setError(message(reason))
    } finally {
      setBusy(false)
    }
  }

  const switchGateway = async (baseUrl: string) => {
    if (authPending.current) return
    formEdited.current = true
    ++configRequest.current
    setConfig(undefined)
    clearVerification()
    setSuccess(undefined)
    setBusy(true)
    setError(undefined)
    try {
      const next = await props.selectGateway(baseUrl)
      setAccount(next)
      setGateways(current => current.map(gateway => ({ ...gateway, preferred: gateway.baseUrl === baseUrl })))
      setConfig(await props.getPublicConfig(baseUrl))
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

  const clearVerification = () => { setCode(''); setVerificationGateway(undefined); setCodeNotice(undefined) }
  const changeMode = (mode: 'login' | 'register' | 'reset') => {
    formEdited.current = true
    setForgotMode(mode === 'reset'); setRegistering(mode === 'register')
    setError(undefined); setSuccess(undefined)
    if (mode !== 'register') setCodeNotice(undefined)
    if (mode === 'reset') setPassword('')
  }
  const continueOrder = (order: AiCloudOrderView) => { setActiveOrder(order) }
  const signedIn = account?.status === 'signedIn'
  const selectedGateway = account?.gatewayBaseUrl ?? gateways.find(gateway => gateway.preferred)?.baseUrl ?? gateways[0]?.baseUrl
  const registrationAvailable = config?.registrationEnabled === true && config.emailVerifyEnabled && !config.captchaEnabled && !config.invitationCodeEnabled
  const resetAvailable = config?.passwordResetEnabled === true && !config.captchaEnabled
  const minimumAmount = checkout?.minimumAmount ?? 10
  const paymentTypes = [...new Set((checkout?.paymentTypes ?? ['alipay', 'wxpay']).map(displayPaymentType))]
  const paymentUrl = activeOrder?.paymentUrl ?? checkout?.rechargeUrl ?? account?.rechargeUrl ?? config?.rechargeUrl
  const orderComplete = activeOrder?.status.toUpperCase() === 'COMPLETED'
  const activePaymentLabel = useMemo(
    () => paymentLabel(displayPaymentType(activeOrder?.paymentType || paymentType), props.t),
    [activeOrder?.paymentType, paymentType, props.t],
  )
  const usageUrl = signedIn ? usagePageUrl(account?.gatewayBaseUrl) : undefined
  const statusTone = signedIn ? 'ok' : 'error'
  const accountStatusText = signedIn ? props.t('account.status.connected') : props.t('account.status.signedOut')

  return <>
    <button className={css.trigger} type="button" onClick={() => { setOpen(true); void refresh() }} title={`${props.t('account.trigger')} · ${accountStatusText}`} aria-label={props.t('account.trigger')} data-status={statusTone}>
      <span className={css.triggerIcon}><Cloud size={18} aria-hidden="true" /><i className={css.statusDot} aria-hidden="true" /></span>{props.wide && <span>{props.t('account.nav')}</span>}
    </button>
    {(open || target) && createPortal(<div className={target ? css.embedded : css.backdrop} role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false) }}>
      <section className={css.panel} data-auth={!signedIn} role={target ? undefined : "dialog"} aria-modal={target ? undefined : true} aria-labelledby="zerowall-account-title">
        <header className={css.header}>
          <div><p>ZeroWall Science</p><h2 id="zerowall-account-title">{signedIn ? props.t('account.centerTitle') : forgotMode ? props.t('account.resetTitle') : props.t('account.title')}</h2></div>
          {!target && <button className={css.iconButton} type="button" onClick={() => setOpen(false)} title={props.t('common.close')} aria-label={props.t('common.close')}><X size={18} /></button>}
        </header>
        {error && <p className={css.error} role="alert">{accountError(error, props.t)}</p>}
        {success && <p className={css.success} role="status">{success}</p>}
        {!signedIn ? <form className={css.auth} noValidate onSubmit={event => { event.preventDefault(); void authenticate() }}>
          {account?.status === 'authExpired' && <p className={css.notice}>{props.t('account.authExpired')}</p>}
          {!forgotMode && <section className={css.capabilities} aria-label={props.t('account.capabilities')}>
            <strong>{props.t('account.capabilities')}</strong>
            <span>{props.t('account.capabilitiesNote')}</span>
          </section>}
          <p className={css.authLead}>{props.t(forgotMode ? 'account.resetLead' : registering ? 'account.registerLead' : 'account.authLead')}</p>
          <GatewaySelector gateways={gateways} selected={selectedGateway} disabled={busy} onChange={switchGateway} t={props.t} />
          {!forgotMode && <div className={css.segmented} role="group" aria-label={props.t('account.actions')}>
            <button type="button" aria-pressed={!registering} disabled={busy} onClick={() => changeMode('login')}>{props.t('account.login')}</button>
            <button type="button" aria-pressed={registering} disabled={busy || !registrationAvailable} onClick={() => changeMode('register')}>{props.t('account.register')}</button>
          </div>}
          <label>{props.t('account.email')}<input type="email" value={email} disabled={busy} onChange={event => { formEdited.current = true; setEmail(event.target.value); clearVerification(); setSuccess(undefined); setError(undefined) }} autoComplete="username" autoCapitalize="none" spellCheck={false} /></label>
          {!forgotMode && <>
            <label>{props.t('account.password')}<input type="password" value={password} disabled={busy} onChange={event => { formEdited.current = true; setPassword(event.target.value) }} autoComplete={registering ? 'new-password' : 'current-password'} /></label>
            {registering && <p className={css.authLead}>{props.t('account.passwordHint')}</p>}
            <label className={css.remember}><input type="checkbox" disabled={busy} checked={rememberPassword} onChange={event => { const checked = event.target.checked; setRememberPassword(checked); if (!checked) void props.forgetLogin().then(() => undefined).catch(reason => setError(message(reason))) }} />{props.t('account.rememberPassword')}</label>
          </>}
          {registering && !forgotMode && <div className={css.codeGroup}>
            <label htmlFor="zerowall-verification-code">{props.t('account.code')}</label>
            <div className={css.codeRow}>
              <input id="zerowall-verification-code" disabled={busy} value={code} onChange={event => setCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={6} aria-describedby="zerowall-code-help" />
              <button type="button" onClick={() => void sendCode()} disabled={busy || !registrationAvailable || !validEmail(email) || codeCooldown > 0}>
                {sendingCode ? <RefreshCw className={css.spin} size={15} aria-hidden="true" /> : <Send size={15} aria-hidden="true" />}
                {sendingCode ? props.t('account.sendingCode') : codeCooldown > 0 ? props.t('account.codeResend', { seconds: codeCooldown }) : props.t('account.sendCode')}
              </button>
            </div>
            <p id="zerowall-code-help" className={codeNotice ? css.codeNotice : css.authLead} role={codeNotice ? 'status' : undefined}>{codeNotice ?? props.t('account.codeHelp')}</p>
          </div>}
          {!registering && !forgotMode && <button className={css.textButton} type="button" disabled={busy} onClick={() => changeMode('reset')}>{props.t('account.forgotPassword')}</button>}
          {!forgotMode && <p className={css.savedHint}>{props.t(rememberPassword ? 'account.savedHint' : 'account.unsavedHint')}</p>}
          {forgotMode && (config?.passwordResetEnabled === false || config?.captchaEnabled) && <p className={css.notice}>{props.t('account.resetUnavailable')}</p>}
          <div className={css.authActions}>
            {!target && <button className={css.secondary} type="button" onClick={() => setOpen(false)}>{props.t('account.skip')}</button>}
            <button className={css.primary} type="submit" disabled={busy || !validEmail(email) || (forgotMode ? resetCooldown > 0 || !resetAvailable : password === '' || (registering && (!registrationAvailable || password.length < 6 || !/^[0-9]{6}$/.test(code.trim()))))}>{busy && !sendingCode ? props.t('account.working') : forgotMode ? (resetCooldown > 0 ? props.t('account.codeResend', { seconds: resetCooldown }) : props.t('account.sendReset')) : registering ? props.t('account.registerConfigure') : props.t('account.loginConfigure')}</button>
          </div>
          {forgotMode && <button className={css.textButton} type="button" disabled={busy} onClick={() => changeMode('login')}>{props.t('account.backToLogin')}</button>}
        </form> : <div className={css.content}>
          <GatewaySelector gateways={gateways} selected={account?.gatewayBaseUrl} disabled={busy} onChange={switchGateway} t={props.t} />
          <div className={css.accountCard}>
            <div className={css.identity}><span>{props.t('account.currentAccount')}</span><strong>{account.email}</strong><small><CheckCircle2 size={13} />{account.balanceFreshness === 'stale' ? props.t('account.lastBalance') : props.t('account.signedIn')}</small></div>
            <div className={css.balance}><span>{props.t('account.balance')}</span><strong>{formatBalance(account)}</strong></div>
            <button className={css.logoutButton} type="button" onClick={() => void logout()} disabled={busy}><LogOut size={16} />{props.t('account.logout')}</button>
          </div>
          <div className={css.externalActions}>
            {usageUrl !== undefined && <button className={css.externalButton} type="button" onClick={() => openExternal(usageUrl)}><ExternalLink size={15} />{props.t('account.usageDetails')}</button>}
            <button className={css.externalButton} type="button" onClick={() => openExternal(modelPricingUrl)}><ExternalLink size={15} />{props.t('account.modelPricing')}</button>
          </div>
          <section className={css.modelSync} aria-live="polite">
            <div><h3>{props.t('account.modelsTitle')}</h3><p>{props.t('account.modelsDescription')}</p></div>
            <button className={css.secondary} type="button" onClick={() => void syncModels()} disabled={busy || syncingModels}>
              <RefreshCw size={15} className={syncingModels ? css.spin : undefined} />
              {syncingModels ? props.t('account.modelsSyncing') : props.t('account.modelsSync')}
            </button>
          </section>
          {(account.lowBalance || (account.balance !== undefined && account.balance <= 0)) && <p className={css.warning} role="alert">{account.balance !== undefined && account.balance <= 0 ? props.t('account.balanceEmpty') : props.t('account.lowBalance')}</p>}
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
    </div>, target ?? document.body)}
    {balancePrompt && createPortal(<dialog ref={balanceDialog} className={css.balancePrompt} aria-labelledby="zerowall-balance-prompt-title" onCancel={() => setBalancePrompt(false)}>
      <button className={css.promptClose} type="button" aria-label={props.t('common.close')} onClick={() => setBalancePrompt(false)}><X size={16} /></button>
      <div className={css.balancePromptIcon}><CreditCard size={28} /></div>
      <h3 id="zerowall-balance-prompt-title">{props.t('account.balancePromptTitle')}</h3>
      <p>{props.t('account.balancePrompt')}</p>
      <div className={css.authActions}><button className={css.secondary} type="button" onClick={() => setBalancePrompt(false)}>{props.t('account.later')}</button><button className={css.primary} type="button" onClick={() => { setBalancePrompt(false); setOpen(true); void refresh() }}>{props.t('account.rechargeTitle')}</button></div>
    </dialog>, document.body)}
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
function usagePageUrl(baseUrl?: string): string | undefined {
  const raw = (baseUrl ?? 'https://hkcode.aicodeme.xyz').replace(/\/$/u, '')
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' || !['hkcode.aicodeme.xyz', 'code.aicodeme.xyz', 'code.aicodeme.cn'].includes(url.hostname)) return undefined
    return `${url.origin}/usage`
  } catch { return undefined }
}
const modelPricingUrl = 'https://hkcode.aicodeme.xyz/model-plaza?embedded=1'
function openExternal(url: string): void { window.open(url, '_blank', 'noopener,noreferrer') }
function message(reason: unknown): string {
  const raw = reason instanceof Error ? reason.message : String(reason)
  return raw.replace(/^zerowall\.[\w.]+ failed:\s*(?:internal:\s*)?/i, '').trim()
}

function validEmail(value: string): boolean { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) }
function accountError(error: string, t: TranslateNS<typeof NS>): string {
  if (/credential IPC is unavailable/i.test(error)) return t('account.desktopRequired')
  if (/invalid or expired verification code|INVALID_VERIFY_CODE/i.test(error)) return t('account.codeInvalid')
  if (/too many.*attempt|VERIFY_CODE_MAX_ATTEMPTS/i.test(error)) return t('account.codeAttempts')
  if (/too frequent|too many requests|HTTP 429|rate.limit/i.test(error)) return t('account.tooFrequent')
  if (/email.*(?:already|exists)|EMAIL_EXISTS/i.test(error)) return t('account.emailExists')
  if (/invalid.*credentials|incorrect.*password|HTTP 401/i.test(error)) return t('account.loginInvalid')
  if (/ACCOUNT_INVALID_EMAIL|email.*required/i.test(error)) return t('account.invalidEmail')
  if (/password reset is not|PASSWORD_RESET_DISABLED/i.test(error)) return t('account.resetUnavailable')
  if (/native registration is not available/i.test(error)) return t('account.registrationUnavailable')
  if (/fetch failed|failed to fetch|network|timeout|timed out|unreachable/i.test(error)) return t('account.networkError')
  return error.replace(/^.*?gateway\/internal:\s*/i, '').replace(/^zerowall\.account\.[^:]+ failed:\s*[^:]+:\s*/i, '')
}
