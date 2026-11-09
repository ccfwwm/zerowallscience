import type { AiCloudGroup, AiCloudModelSync } from '../shared/types.js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import QRCode from 'qrcode/lib/browser.js'
import { CreditCard, ExternalLink, Eye, EyeOff, LogOut, RefreshCw, Search, Send, ShieldCheck, X } from 'lucide-react'
import type { SidebarFooterActionOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { PropsLocale, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from '../../base-client-helpers.js'
import brandIcon from './assets/zerowall-science-icon.png'
import type { AccountSurface, AccountSurfaceSnapshot, AccountTab } from './account-surface.js'
import type { AiCloudGroupCatalog } from '../shared/types.js'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import { useAccountData } from './account-surface.js'
import { useModalLayer, Menu, MenuItemButton } from '@deepseek-ai/dsh-client-ui-primitives'
import { accountConnection, gatewayPlatformUrl } from './platform.js'
import css from './AiCloudAccountButton.module.css'
import { GroupInfo, RateBadge } from './GroupInfo.js'
import { defaultModelText, type ModelText } from './model-locales.js'
import type { GroupCatalogStore } from './group-catalog.js'

export interface AiCloudModelView { providerId: string; groupId: string; groupName: string; modelId: string; baseUrl: string; capability?: string; stale?: boolean }
export interface AiCloudAccountView { status: 'signedOut' | 'signedIn' | 'authExpired'; autoLoginRetryable?: boolean; email?: string; balance?: number; currency?: string; balanceFreshness: 'current' | 'stale'; rechargeUrl?: string; lowBalance: boolean; gatewayBaseUrl?: string; groups?: AiCloudGroup[]; models: AiCloudModelView[]; modelSync?: AiCloudModelSync; mediaModels?: Array<{providerId?:string;groupId?:string;modelId:string;profileId:string;groupName:string;mediaType:string;stale?:boolean}>; mediaSync?: AiCloudModelSync }
export interface AiCloudGatewayView { baseUrl: string; label: string; preferred: boolean }
export interface AiCloudPublicView { registrationEnabled: boolean; emailVerifyEnabled: boolean; invitationCodeEnabled: boolean; captchaEnabled: boolean; passwordResetEnabled?: boolean; rechargeUrl?: string; lowBalanceThreshold?: number }
export interface AiCloudCheckoutView { enabled: boolean; minimumAmount: number; paymentTypes: string[]; rechargeUrl?: string }
export interface AiCloudOrderView { id: number; outTradeNo: string; status: string; amount: number; paymentType: string; paymentUrl?: string; qrCode?: string; createdAt?: string }

export interface Actions {
  /** Standalone embeddings may prompt themselves; product first-run steps use the settings coordinator. */
  automaticPrompt?: boolean
  catalog?: GroupCatalogStore
  surface?: AccountSurface
  openSettings?: () => void
  useSurface?: SnapshotSelectorHook<AccountSurfaceSnapshot>
  useCatalog?: SnapshotSelectorHook<AiCloudGroupCatalog>
  modelText?: ModelText
  getAccount: () => Promise<AiCloudAccountView>
  forgetLogin: () => Promise<void>
  savedLogin: () => Promise<{ email: string; password: string; baseUrl: string; rememberPassword: true } | undefined>
  relogin: () => Promise<AiCloudAccountView>
  getPublicConfig: (gatewayBaseUrl?: string) => Promise<AiCloudPublicView>
  gateways: () => Promise<AiCloudGatewayView[]>
  selectGateway: (baseUrl: string) => Promise<AiCloudAccountView>
  login: (email: string, password: string, rememberPassword: boolean) => Promise<AiCloudAccountView>
  register: (email: string, password: string, verificationCode: string, rememberPassword: boolean, gatewayBaseUrl?: string) => Promise<AiCloudAccountView>
  sendCode: (email: string, gatewayBaseUrl?: string) => Promise<{ countdown: number; gatewayBaseUrl: string }>
  forgotPassword: (email: string, gatewayBaseUrl?: string) => Promise<void>
  logout: () => Promise<void>
  discoverModels: () => Promise<AiCloudAccountView>
  /** Refresh the shared model directory after the account has replaced its routes. */
  refreshModelCatalog?: () => Promise<void>
  checkoutInfo: () => Promise<AiCloudCheckoutView>
  listOrders: () => Promise<AiCloudOrderView[]>
  createOrder: (amount: number, paymentType: string) => Promise<AiCloudOrderView>
  getOrder: (orderId: number) => Promise<AiCloudOrderView>
  verifyOrder: (outTradeNo: string) => Promise<AiCloudOrderView>
}

type Props = SidebarFooterActionOwnerProps & Actions & PropsLocale<typeof NS>
const TERMINAL = new Set(['COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED', 'REFUNDED'])

export function AiCloudAccountButton(props: Props) {
  const tModels = props.modelText ?? defaultModelText
  const groupCatalog = props.useCatalog?.(value => value)
  const surface = props.useSurface?.(value => value)
  const accountTarget = surface?.target ?? null
  const [tab, setTab] = useState<AccountTab>('overview')
  const authPanel = useRef<HTMLElement>(null)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [fieldError, setFieldError] = useState<{ field: 'email' | 'password' | 'code'; text: string }>()
  const [connectionExpanded, setConnectionExpanded] = useState(false)
  const formRevision = useRef(0)
  const orderPending = useRef(false)
  const firstCheck = useRef(false)
  const startupPrompted = useRef(false)
  const [open, setOpen] = useState(false)
  useEffect(() => { props.surface?.update('authenticationOpen', open) }, [open, props.surface])
  const [account, setAccount] = useAccountData(props.surface, surface, 'account', undefined)
  const target = account?.status === 'signedIn' ? accountTarget : null
  const identityRevision = useRef(0)
  useEffect(() => () => {
    ++identityRevision.current
    ++formRevision.current
    ++configRequest.current
    ++modelSyncRequest.current
  }, [])
  const [config, setConfig] = useState<AiCloudPublicView>()
  const [gateways, setGateways] = useState<AiCloudGatewayView[]>([])
  const [checkout, setCheckout] = useAccountData(props.surface, surface, 'checkout', undefined)
  const [registering, setRegistering] = useState(false)
  const [forgotMode, setForgotMode] = useState(false)
  const [syncingModels, setSyncingModels] = useState(false)
  const modelSyncRequest = useRef(0)
  const [modelQuery, setModelQuery] = useState('')
  useEffect(() => {
    if (!surface?.request) return
    setTab(surface.tab)
    if (account?.status === 'signedIn' && props.openSettings) props.openSettings()
    else setOpen(true)
  }, [surface?.request])
  useModalLayer(authPanel, open && !target, () => setOpen(false))
  useEffect(() => {
    if (open) return
    ++formRevision.current
    setPassword(''); setCode(''); setPasswordVisible(false)
  }, [open])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [savedLoginAvailable, setSavedLoginAvailable] = useState(false)
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [rememberPassword, setRememberPassword] = useState(true)
  const [code, setCode] = useState('')
  const [codeCooldown, setCodeCooldown] = useState(0)
  const [sendingCode, setSendingCode] = useState(false)
  const [resetCooldown, setResetCooldown] = useState(0)
  const authPending = useRef(false)
  const refreshPending = useRef(false)
  const restoreAttempts = useRef(0)
  const cancelAutoRestore = useRef(() => {})
  const formEdited = useRef(false)
  const configRequest = useRef(0)
  const [codeNotice, setCodeNotice] = useState<string>()
  const [orders, setOrders] = useAccountData(props.surface, surface, 'orders', [])
  const [activeOrder, setActiveOrder] = useAccountData(props.surface, surface, 'activeOrder', undefined)
  const [amount, setAmount] = useState('100')
  const [paymentType, setPaymentType] = useState('alipay')
  const [busy, setBusy] = useState(false)
  const [relogging, setRelogging] = useState(false)
  const [polling, setPolling] = useState(false)
  const [error, setError] = useState<string>()
  const [success, setSuccess] = useState<string>()
  const [verificationGateway, setVerificationGateway] = useState<string>()
  const [qrImage, setQrImage] = useState<string>()
  const [balancePrompt, setBalancePrompt] = useState(false)
  const balanceDialog = useRef<HTMLDialogElement>(null)
  const balancePrompted = useRef<string>()
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
    const identity = JSON.stringify([account.gatewayBaseUrl, account.email])
    if (account.balance !== undefined && Number.isFinite(account.balance) && account.balance < 5 && balancePrompted.current !== identity) {
      balancePrompted.current = identity
      setBalancePrompt(true)
    } else if (account.balance !== undefined && account.balance >= 5) {
      balancePrompted.current = undefined
      setBalancePrompt(false)
    }
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
    const identity = identityRevision.current
    const [checkoutResult, ordersResult] = await Promise.allSettled([props.checkoutInfo(), props.listOrders()])
    if (identity !== identityRevision.current) return
    if (checkoutResult.status === 'fulfilled') {
      setCheckout(checkoutResult.value)
      setAmount(current => Number(current) < checkoutResult.value.minimumAmount ? String(checkoutResult.value.minimumAmount) : current)
      const supported = checkoutResult.value.paymentTypes.map(displayPaymentType)
      if (supported.length > 0 && !supported.includes(paymentType)) setPaymentType(supported[0] ?? 'alipay')
    }
    if (ordersResult.status === 'fulfilled' && Array.isArray(ordersResult.value)) setOrders(ordersResult.value)
    const failed = checkoutResult.status === 'rejected' ? checkoutResult.reason : ordersResult.status === 'rejected' ? ordersResult.reason : undefined
    if (failed !== undefined) setError(message(failed))
  }, [paymentType, props.checkoutInfo, props.listOrders])

  const refresh = useCallback(async () => {
    if (authPending.current || refreshPending.current) return
    refreshPending.current = true
    setBusy(true)
    setError(undefined)
    const identity = identityRevision.current
    const requestId = ++configRequest.current
    void props.getPublicConfig().then(value => { if (requestId === configRequest.current) setConfig(value) }).catch(() => { if (requestId === configRequest.current) setConfig(undefined) })
    void props.gateways().then(value => { if (requestId === configRequest.current) setGateways(value) }).catch(() => undefined)
    try {
      const nextAccount = await props.getAccount()
      if (identity !== identityRevision.current) return
      setAccount({ ...nextAccount })
      if (nextAccount.status === 'signedIn') await loadBilling()
      return nextAccount
    } catch (reason) {
      if (identity === identityRevision.current) setError(message(reason))
      return undefined
    } finally {
      refreshPending.current = false
      setBusy(false)
    }
  }, [loadBilling, props.getAccount, props.getPublicConfig])

  useEffect(() => {
    if (firstCheck.current) return
    firstCheck.current = true
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (props.automaticPrompt === false) return
    if (startupPrompted.current || busy || (account === undefined && error === undefined)) return
    if (account?.status === 'signedIn' || open) { startupPrompted.current = true; return }
    const prompt = () => {
      if (document.querySelector('[role="dialog"][aria-modal="true"], dialog[open]')) return
      startupPrompted.current = true
      observer.disconnect()
      setOpen(true)
    }
    const observer = new MutationObserver(prompt)
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['open', 'aria-modal'] })
    prompt()
    return () => observer.disconnect()
  }, [account, busy, error, open, props.automaticPrompt])

  useEffect(() => {
    if (props.automaticPrompt === false && account?.status === 'signedIn') setOpen(false)
  }, [account?.status, props.automaticPrompt])

  useEffect(() => {
    if (account?.status !== 'signedIn') return
    const update = () => { if (document.visibilityState === 'visible') void refresh() }
    const timer = window.setInterval(update, 60_000)
    window.addEventListener('focus', update)
    window.addEventListener('online', update)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', update)
      window.removeEventListener('online', update)
    }
  }, [account?.status, refresh])

  useEffect(() => {
    if (account?.autoLoginRetryable !== true || restoreAttempts.current >= 3) return
    let active = true
    let started = false
    const retry = () => {
      if (!active || started || authPending.current || refreshPending.current) return
      started = true
      ++restoreAttempts.current
      void refresh()
    }
    const timer = window.setTimeout(retry, [2_000, 8_000, 30_000][restoreAttempts.current])
    window.addEventListener('online', retry)
    const cancel = () => { active = false; window.clearTimeout(timer); window.removeEventListener('online', retry) }
    cancelAutoRestore.current = () => { restoreAttempts.current = 3; cancel() }
    return cancel
  }, [account, refresh])

  useEffect(() => {
    if (!open) return
    let active = true
    if (account === undefined) return
    void props.savedLogin?.().then(saved => {
      if (!active) return
      setSavedLoginAvailable(saved !== undefined)
      if (account.status === 'signedIn' || saved === undefined || formEdited.current) return
      setEmail(saved.email)
      setPassword(saved.password)
      setRememberPassword(true)
    }).catch(() => undefined)
    return () => { active = false }
  }, [account?.status, props.savedLogin, open, target])

  useEffect(() => {
    if (activeOrder === undefined || TERMINAL.has(activeOrder.status.toUpperCase())) return
    let cancelled = false
    const identity = identityRevision.current
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = async () => {
      if (cancelled) return
      setPolling(true)
      try {
        const next = activeOrder.outTradeNo
          ? await props.verifyOrder(activeOrder.outTradeNo)
          : await props.getOrder(activeOrder.id)
        if (cancelled || identity !== identityRevision.current) return
        const updated = mergePaymentOrder(activeOrder, next)
        setActiveOrder(updated)
        setOrders(current => [updated, ...current.filter(order => order.id !== updated.id)])
        if (updated.status.toUpperCase() === 'COMPLETED') await refresh()
        else if (!TERMINAL.has(updated.status.toUpperCase())) timer = setTimeout(() => { void poll() }, 2500)
      } catch (reason) {
        if (!cancelled && identity === identityRevision.current) {
          setError(message(reason))
          timer = setTimeout(() => { void poll() }, 5000)
        }
      } finally {
        if (!cancelled) setPolling(false)
      }
    }
    timer = setTimeout(() => { void poll() }, 1800)
    return () => { cancelled = true; if (timer !== undefined) clearTimeout(timer) }
  }, [activeOrder?.id, activeOrder?.outTradeNo, activeOrder?.status, account?.email, account?.gatewayBaseUrl])

  useEffect(() => {
    let cancelled = false
    setQrImage(undefined)
    if (!activeOrder?.qrCode) return
    void QRCode.toDataURL(activeOrder.qrCode, {
      errorCorrectionLevel: 'M', margin: 2, width: 220,
      color: { dark: '#17212b', light: '#ffffff' },
    }).then((value: string) => { if (!cancelled) setQrImage(value) }).catch((reason: unknown) => { if (!cancelled) setError(message(reason)) })
    return () => { cancelled = true }
  }, [activeOrder?.qrCode])

  const authenticate = async () => {
    if (authPending.current || busy) return
    if (forgotMode && !resetAvailable) { setError(props.t('account.resetUnavailable')); return }
    if (registering && !registrationAvailable) { setError(props.t('account.registrationUnavailable')); return }
    if (!validEmail(email)) { setFieldError({ field: 'email', text: props.t('account.invalidEmail') }); return }
    if (!forgotMode && password === '') return
    if (forgotMode && resetCooldown > 0) return
    if (!forgotMode && registering && password.length < 6) { setFieldError({ field: 'password', text: props.t('account.passwordHint') }); return }
    if (!forgotMode && registering && !/^[0-9]{6}$/.test(code.trim())) { setFieldError({ field: 'code', text: props.t('account.invalidCode') }); return }
    cancelAutoRestore.current()
    ++identityRevision.current
    const revision = formRevision.current
    authPending.current = true
    setSuccess(undefined)
    setBusy(true)
    setError(undefined)
    try {
      if (forgotMode) {
        await props.forgotPassword(email.trim().toLowerCase(), selectedGateway)
        if (revision !== formRevision.current) return
        setResetCooldown(60)
        setPassword('')
        setSuccess(props.t('account.resetSent'))
        return
      }
      const next = registering
        ? await props.register(email.trim().toLowerCase(), password, code.trim(), rememberPassword, verificationGateway ?? selectedGateway)
        : await props.login(email.trim().toLowerCase(), password, rememberPassword)
      if (revision !== formRevision.current) { void refresh(); return }
      setAccount(next)
      setSavedLoginAvailable(rememberPassword)
      setCode('')
      // Host login performs discovery as part of the authenticated operation.
      // A catalog outage must not turn a valid login into a failed UI flow;
      // the signed-in panel exposes the explicit retry action below.
      await loadBilling()
      if (revision !== formRevision.current) return
      setOpen(false)
    } catch (reason) {
      if (revision === formRevision.current) setError(message(reason))
    } finally {
      authPending.current = false
      setBusy(false)
    }
  }

  const syncModels = async () => {
    if (syncingModels || account?.status !== 'signedIn') return
    const request = ++modelSyncRequest.current
    setSyncingModels(true)
    setError(undefined)
    try {
      const next = await props.discoverModels()
      await props.refreshModelCatalog?.()
      if (request !== modelSyncRequest.current) return
      setAccount(next)
      setSuccess(props.t(hasIncompleteCatalog(next) ? 'account.modelsSyncPartial' : 'account.modelsSynced', { count: next.models.length }))
    } catch (reason) {
      if (request === modelSyncRequest.current) setError(message(reason))
    } finally {
      if (request === modelSyncRequest.current) setSyncingModels(false)
    }
  }

  const sendCode = async () => {
    if (codeCooldown > 0 || busy || authPending.current) return
    if (!registrationAvailable) { setError(props.t('account.registrationUnavailable')); return }
    if (!validEmail(email)) { setError(props.t('account.invalidEmail')); return }
    const revision = formRevision.current
    const recipient = email.trim().toLowerCase()
    authPending.current = true
    setSendingCode(true)
    setBusy(true)
    setError(undefined)
    setSuccess(undefined)
    setCodeNotice(undefined)
    try {
      const result = await props.sendCode(recipient, selectedGateway)
      if (revision !== formRevision.current) return
      setVerificationGateway(result.gatewayBaseUrl)
      setCodeCooldown(result.countdown)
      setCode('')
      setCodeNotice(props.t('account.codeSent', { email: recipient }))
    } catch (reason) { if (revision === formRevision.current) setError(message(reason)) } finally { authPending.current = false; setSendingCode(false); setBusy(false) }
  }

  const logout = async () => {
    ++identityRevision.current
    ++formRevision.current
    cancelAutoRestore.current()
    ++modelSyncRequest.current; setSyncingModels(false)
    setBusy(true)
    setError(undefined)
    try {
      await props.logout()
      setAccount({ status: 'signedOut', balanceFreshness: 'current', lowBalance: false, models: [] })
      setOrders([])
      setActiveOrder(undefined)
      const saved = await props.savedLogin?.()
      setSavedLoginAvailable(saved !== undefined)
      setRegistering(false)
      setPasswordVisible(false)
      setEmail(saved?.email ?? '')
      setPassword('')
      setOpen(true)
      setTimeout(() => document.querySelector<HTMLInputElement>('input[autocomplete="current-password"]')?.focus(), 0)
    } catch (reason) {
      setError(message(reason))
    } finally {
      setBusy(false)
    }
  }

  const relogin = async () => {
    if (busy || relogging || authPending.current) return
    cancelAutoRestore.current()
    const identity = ++identityRevision.current
    const revision = formRevision.current
    authPending.current = true
    setRelogging(true)
    setBusy(true)
    setError(undefined)
    setSuccess(undefined)
    try {
      let next = savedLoginAvailable ? await props.relogin() : await props.getAccount()
      if (next.status === 'signedIn' && !savedLoginAvailable) next = await props.discoverModels()
      if (identity !== identityRevision.current || revision !== formRevision.current) return
      setAccount(next)
      if (next.status !== 'signedIn') throw new Error('Saved AI Cloud login is unavailable or expired.')
      if (next.balanceFreshness === 'stale') throw new Error('Network refresh failed.')
      await props.refreshModelCatalog?.()
      await loadBilling()
      if (identity !== identityRevision.current || revision !== formRevision.current) return
      setSuccess(props.t(hasIncompleteCatalog(next) ? 'account.modelsSyncPartial' : 'account.reloginSuccess'))
      if (!signedIn) setOpen(false)
    } catch (reason) {
      if (identity === identityRevision.current && revision === formRevision.current) setError(message(reason))
    } finally {
      authPending.current = false
      setRelogging(false)
      setBusy(false)
    }
  }

  const switchGateway = async (baseUrl: string) => {
    ++modelSyncRequest.current; setSyncingModels(false)
    if (authPending.current) return
    cancelAutoRestore.current()
    ++identityRevision.current
    const request = ++configRequest.current
    ++formRevision.current
    formEdited.current = true
    setConfig(undefined)
    clearVerification()
    setSuccess(undefined)
    setBusy(true)
    setError(undefined)
    try {
      const next = await props.selectGateway(baseUrl)
      if (request !== configRequest.current) return
      setAccount(next)
      setGateways(current => current.map(gateway => ({ ...gateway, preferred: gateway.baseUrl === baseUrl })))
      const nextConfig = await props.getPublicConfig(baseUrl)
      if (request !== configRequest.current) return
      setConfig(nextConfig)
      if (next.status === 'signedIn') await loadBilling()
    } catch (reason) {
      if (request === configRequest.current) setError(message(reason))
    } finally {
      if (request === configRequest.current) setBusy(false)
    }
  }

  const createOrder = async () => {
    if (orderPending.current || !Number.isFinite(Number(amount)) || Number(amount) < minimumAmount) return
    const identity = identityRevision.current
    orderPending.current = true
    setBusy(true)
    setError(undefined)
    try {
      const order = await props.createOrder(Number(amount), paymentType)
      if (identity !== identityRevision.current) return
      setActiveOrder(order)
      setOrders(current => [order, ...current.filter(item => item.id !== order.id)])
    } catch (reason) {
      if (identity === identityRevision.current) setError(message(reason))
    } finally {
      orderPending.current = false
      setBusy(false)
    }
  }

  const clearVerification = () => { setCode(''); setVerificationGateway(undefined); setCodeNotice(undefined) }
  const changeMode = (mode: 'login' | 'register' | 'reset') => {
    ++formRevision.current
    formEdited.current = true
    clearVerification()
    setForgotMode(mode === 'reset'); setRegistering(mode === 'register')
    setPasswordVisible(false)
    setFieldError(undefined)
    setError(undefined); setSuccess(undefined)
    if (mode !== 'register') setCodeNotice(undefined)
    if (mode === 'reset') setPassword('')
  }
  const continueOrder = (order: AiCloudOrderView) => { setActiveOrder(order); setTab('billing') }
  const openAccount = (nextTab: AccountTab = 'overview') => {
    setTab(nextTab)
    if (signedIn && props.openSettings) props.openSettings()
    else setOpen(true)
    void refresh()
  }
  const signedIn = account?.status === 'signedIn'
  const restoring = account === undefined && error === undefined
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
  const platformUrl = gatewayPlatformUrl(selectedGateway)
  const modelPricingUrl = platformUrl === undefined ? undefined : `${platformUrl}/model-plaza?embedded=1`
  const metadataGroups = groupCatalog?.groups ?? account?.groups ?? []
  const groupMetadata = (groupId?: string) => metadataGroups.find(group => group.groupId === groupId)
  const filteredModels = account?.models.filter(model => `${model.groupName} ${groupMetadata(model.groupId)?.description ?? ''} ${model.modelId} ${model.providerId} ${model.capability ?? 'chat'}`.toLowerCase().includes(modelQuery.trim().toLowerCase())) ?? []
  const modelGroups = groupModels(filteredModels)
  const mediaModelGroups = groupModels(account?.mediaModels?.filter(model => `${model.groupName} ${groupMetadata(model.groupId)?.description ?? ''} ${model.modelId} ${model.mediaType}`.toLowerCase().includes(modelQuery.trim().toLowerCase())) ?? [])
  const connection = accountConnection(account, account === undefined && error !== undefined)
  const accountStatusText = props.t(`account.connection.${connection}`)
  const lowBalance = signedIn && account.balance !== undefined && Number.isFinite(account.balance) && account.balance < 5
  const triggerLabel = props.t(signedIn ? 'account.centerTitle' : 'account.trigger')
  const balanceLabel = signedIn ? `${props.t(account.balanceFreshness === 'stale' ? 'account.lastBalance' : 'account.balance')} ${formatBalance(account)}` : undefined
  const triggerDescription = [triggerLabel, balanceLabel, lowBalance ? props.t('account.recharge') : accountStatusText].filter(Boolean).join(' · ')

  return <>
    {accountTarget && !signedIn && createPortal(<div className={css.signedOut}>
      <img src={brandIcon} width={48} height={48} alt="" /><h2>{props.t('account.title')}</h2>
      <p>{props.t(account?.status === 'authExpired' ? 'account.authExpired' : 'account.brandDescription')}</p>
      <button type="button" className={css.primary} onClick={() => setOpen(true)}>{props.t('account.login')}</button>
    </div>, accountTarget)}
    <button className={css.trigger} data-zerowall-footer-action data-connection={connection} data-low-balance={lowBalance} data-signed-in={signedIn} type="button" onClick={() => openAccount()} title={triggerDescription} aria-label={triggerDescription}>
      <span className={css.triggerIcon} data-zerowall-footer-icon><img src={brandIcon} width={18} height={18} alt="" aria-hidden="true" /><i className={css.statusDot} data-zerowall-footer-status-dot aria-hidden="true" /></span>{props.wide && <span className={css.triggerText}><span>{props.t(signedIn ? 'account.centerTitle' : 'account.nav')}</span>{balanceLabel && <small>{balanceLabel}{lowBalance && <> · {props.t('account.recharge')}</>}</small>}</span>}
    </button>
    {(open || target) && createPortal(<div className={target ? css.embedded : css.backdrop} role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false) }}>
      <section ref={authPanel} tabIndex={-1} className={css.panel} data-auth={!signedIn} role={target ? undefined : "dialog"} aria-modal={target ? undefined : true} aria-labelledby="zerowall-account-title">
        <header className={css.header}>
          <div className={css.headerIdentity}><img className={css.brandIcon} src={brandIcon} alt="" aria-hidden="true" /><div><p>ZeroWall Science</p><h2 id="zerowall-account-title">{restoring ? props.t('account.restoring') : signedIn ? props.t('account.centerTitle') : forgotMode ? props.t('account.resetTitle') : props.t('account.title')}</h2></div></div>
          <div className={css.headerActions}>
            {(signedIn || savedLoginAvailable) && <button className={css.secondary} type="button" disabled={busy || relogging} onClick={() => void relogin()}><RefreshCw size={16} className={relogging ? css.spin : undefined} />{props.t(relogging ? 'account.refreshing' : 'account.refreshAccount')}</button>}
            {platformUrl !== undefined && <button className={css.iconButton} type="button" onClick={() => openExternal(platformUrl)} title={props.t('account.openPlatform')} aria-label={props.t('account.openPlatform')}><ExternalLink size={18} /></button>}
            {!target && <button className={css.iconButton} type="button" onClick={() => setOpen(false)} title={props.t('common.close')} aria-label={props.t('common.close')}><X size={18} /></button>}
          </div>
        </header>
        {error && <p className={css.error} role="alert">{accountError(error, props.t)}</p>}
        {success && <p className={css.success} role="status">{success}</p>}
        {!signedIn && <aside className={css.brandPanel} aria-hidden="true"><img src={brandIcon} alt="" /><p>ZeroWall Science</p><h3>{props.t('account.brandTitle')}</h3><span>{props.t('account.brandDescription')}</span><div className={css.scienceLines}><i /><i /><i /></div></aside>}
        {restoring ? <div className={css.auth} role="status" aria-live="polite" aria-busy="true">
          <RefreshCw size={22} className={css.spin} aria-hidden="true" />
          <p className={css.authLead}>{props.t('account.restoringHint')}</p>
          {!target && <button className={css.secondary} type="button" onClick={() => setOpen(false)}>{props.t('common.close')}</button>}
        </div> : !signedIn ? <form className={css.auth} noValidate onSubmit={event => { event.preventDefault(); void authenticate() }}>
          {account?.status === 'authExpired' && <p className={css.notice}>{props.t('account.authExpired')}</p>}
          {forgotMode && <p className={css.authLead}>{props.t('account.resetLead')}</p>}
          <details className={css.connectionDetails} open={connectionExpanded} onToggle={event => setConnectionExpanded(event.currentTarget.open)}><summary>{props.t('account.connectionSettings')}<span>{(() => { const gateway = gateways.find(gateway => gateway.baseUrl === selectedGateway); return gateway ? gatewayLabel(gateway, props.t) : accountStatusText })()}</span></summary><GatewaySelector gateways={gateways} selected={selectedGateway} disabled={busy} onChange={switchGateway} t={props.t} /><small>{selectedGateway}</small></details>
          {!forgotMode && <div className={css.segmented} role="group" aria-label={props.t('account.actions')}>
            <button type="button" aria-pressed={!registering} disabled={busy} onClick={() => changeMode('login')}>{props.t('account.login')}</button>
            <button type="button" aria-pressed={registering} disabled={busy || !registrationAvailable} onClick={() => changeMode('register')}>{props.t('account.register')}</button>
          </div>}
          <label>{props.t('account.email')}<input type="email" value={email} disabled={busy} onChange={event => { formEdited.current = true; ++formRevision.current; setFieldError(undefined); setEmail(event.target.value); clearVerification(); setSuccess(undefined); setError(undefined) }} aria-invalid={fieldError?.field === "email"} aria-describedby={fieldError?.field === "email" ? "zerowall-email-error" : undefined} autoComplete="username" autoCapitalize="none" spellCheck={false} /></label>{fieldError?.field === "email" && <p id="zerowall-email-error" className={css.error} role="alert">{fieldError.text}</p>}
          {!forgotMode && <>
            <div className={css.passwordField}><label htmlFor="zerowall-account-password">{props.t('account.password')}</label><div><input id="zerowall-account-password" type={passwordVisible ? 'text' : 'password'} value={password} disabled={busy} onChange={event => { formEdited.current = true; setFieldError(undefined); setPassword(event.target.value) }} autoComplete={registering ? 'new-password' : 'current-password'} /><button className={css.iconButton} type="button" disabled={busy} aria-label={props.t(passwordVisible ? 'account.hidePassword' : 'account.showPassword')} title={props.t(passwordVisible ? 'account.hidePassword' : 'account.showPassword')} onClick={() => setPasswordVisible(value => !value)}>{passwordVisible ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></div>
            {fieldError?.field === 'password' && <p className={css.error} role="alert">{fieldError.text}</p>}
            {registering && <p className={css.authLead}>{props.t('account.passwordHint')}</p>}
            <label className={css.remember}><input type="checkbox" disabled={busy} checked={rememberPassword} onChange={event => { const checked = event.target.checked; setRememberPassword(checked); if (!checked) { setSavedLoginAvailable(false); void props.forgetLogin().catch(reason => setError(message(reason))) } }} />{props.t('account.rememberPassword')}</label>
          </>}
          {registering && !forgotMode && <div className={css.codeGroup}>
            <label htmlFor="zerowall-verification-code">{props.t('account.code')}</label>
            <div className={css.codeRow}>
              <input id="zerowall-verification-code" disabled={busy} value={code} onChange={event => { setFieldError(undefined); setCode(event.target.value) }} inputMode="numeric" autoComplete="one-time-code" maxLength={6} aria-describedby="zerowall-code-help" />
              <button type="button" onClick={() => void sendCode()} disabled={busy || !registrationAvailable || !validEmail(email) || codeCooldown > 0}>
                {sendingCode ? <RefreshCw className={css.spin} size={15} aria-hidden="true" /> : <Send size={15} aria-hidden="true" />}
                {sendingCode ? props.t('account.sendingCode') : codeCooldown > 0 ? props.t('account.codeResend', { seconds: codeCooldown }) : props.t('account.sendCode')}
              </button>
            </div>
            {fieldError?.field === 'code' && <p className={css.error} role="alert">{fieldError.text}</p>}
            <p id="zerowall-code-help" className={codeNotice ? css.codeNotice : css.authLead} role={codeNotice ? 'status' : undefined}>{codeNotice ?? props.t('account.codeHelp')}</p>
          </div>}
          {!registering && !forgotMode && <button className={css.textButton} type="button" disabled={busy} onClick={() => changeMode('reset')}>{props.t('account.forgotPassword')}</button>}
          {forgotMode && (config?.passwordResetEnabled === false || config?.captchaEnabled) && <p className={css.notice}>{props.t('account.resetUnavailable')}</p>}
          <div className={css.authActions}>
            {!target && <button className={css.secondary} type="button" onClick={() => setOpen(false)}>{props.t('account.skip')}</button>}
            {savedLoginAvailable && !forgotMode && !registering && <button className={css.secondary} type="button" onClick={() => void relogin()} disabled={busy || relogging}><RefreshCw size={15} className={relogging ? css.spin : undefined} />{relogging ? props.t('account.relogging') : props.t('account.relogin')}</button>}
            <button className={css.primary} type="submit" disabled={busy || !validEmail(email) || (forgotMode ? resetCooldown > 0 || !resetAvailable : password === '' || (registering && (!registrationAvailable || password.length < 6 || !/^[0-9]{6}$/.test(code.trim()))))}>{busy && !sendingCode ? props.t('account.working') : forgotMode ? (resetCooldown > 0 ? props.t('account.codeResend', { seconds: resetCooldown }) : props.t('account.sendReset')) : registering ? props.t('account.registerConfigure') : props.t('account.loginConfigure')}</button>
          </div>
          {forgotMode && <button className={css.textButton} type="button" disabled={busy} onClick={() => changeMode('login')}>{props.t('account.backToLogin')}</button>}
        </form> : <><nav className={css.tabs} aria-label={props.t('account.centerTitle')}>{(['overview', 'billing', 'models'] as const).map(id => <button key={id} type="button" aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>{props.t(`account.tab.${id}`)}</button>)}</nav><div className={css.content}>
          {tab === 'overview' && <><GatewaySelector gateways={gateways} selected={account?.gatewayBaseUrl} disabled={busy} onChange={switchGateway} t={props.t} />
          <div className={css.accountCard}>
            <div className={css.identity}><span>{props.t('account.currentAccount')}</span><strong>{account.email}</strong><small><span className={css.connectionBadge} data-connection={connection}><i aria-hidden="true" />{accountStatusText}</span>{account.balanceFreshness === 'stale' ? props.t('account.lastBalance') : props.t('account.signedIn')}</small></div>
            <div className={css.balance}><span>{props.t('account.balance')}</span><strong>{formatBalance(account)}</strong></div>
            <button className={css.primary} type="button" onClick={() => setTab('billing')}><CreditCard size={16} />{props.t('account.recharge')}</button>
            <Menu open={accountMenuOpen} onClose={() => setAccountMenuOpen(false)} align="end" portal autoFocus
              anchor={<button type="button" className={css.secondary} aria-haspopup="menu" aria-expanded={accountMenuOpen} onClick={() => setAccountMenuOpen(value => !value)}>{props.t('account.actions')}</button>}>
              <MenuItemButton disabled={busy} onSelect={() => { setAccountMenuOpen(false); void logout() }}><LogOut size={16} />{props.t('account.logout')}</MenuItemButton>
            </Menu>
          <div className={css.externalActions}>
            {usageUrl !== undefined && <button className={css.externalButton} type="button" onClick={() => openExternal(usageUrl)}><ExternalLink size={15} />{props.t('account.usageDetails')}</button>}
            {modelPricingUrl !== undefined && <button className={css.externalButton} type="button" onClick={() => openExternal(modelPricingUrl)}><ExternalLink size={15} />{props.t('account.modelPricing')}</button>}
          </div>
          </div>
          {lowBalance && <p className={css.warning} role="status">{props.t('account.lowBalance')}</p>}</>}
          {tab === 'models' && <><section className={css.modelSync} aria-live="polite">
            <div><h3>{props.t('account.modelsTitle')}</h3><p>{props.t('account.modelsDescription')}</p>{(account.modelSync?.checkedAt || account.mediaSync?.checkedAt) && <p>{tModels('updated')}：{formatDate([account.modelSync?.checkedAt, account.mediaSync?.checkedAt].filter(Boolean).sort().at(-1))}</p>}</div>
            <button className={css.syncButton} type="button" onClick={() => void syncModels()} disabled={busy || syncingModels}>
              <RefreshCw size={15} className={syncingModels ? css.spin : undefined} />
              {syncingModels ? props.t('account.modelsSyncing') : props.t('account.modelsSync')}
            </button>
          </section>
          {hasIncompleteCatalog(account) && <p className={css.catalogNotice} role="status">{props.t('account.modelsSyncPartial')}</p>}
          <label className={css.modelSearch}><Search size={16} aria-hidden="true" /><input aria-label={props.t('account.modelsSearch')} placeholder={props.t('account.modelsSearch')} value={modelQuery} onChange={event => setModelQuery(event.target.value)} /></label>
          <details className={css.modelList} open={modelQuery.trim() ? true : undefined}>
            <summary>{props.t('account.mediaModelsList', { count: account.mediaModels?.length ?? 0 })}</summary>
            <div className={css.modelGroups}>{mediaModelGroups.map(group => <details className={css.modelGroup} key={group.key} open={modelQuery.trim() ? true : undefined}>
              <summary><span className={css.groupHeading}>{group.groupName}</span><RateBadge group={groupMetadata(group.key)} t={tModels} /><GroupInfo name={group.groupName} group={groupMetadata(group.key)} media t={tModels} /><small>{group.models.length}</small></summary>
              <div className={css.modelRows}><p className={css.catalogEmpty}>{tModels('mediaBilling')}</p>{group.models.map(model => <div key={`${model.providerId ?? group.key}:${model.profileId}:${model.modelId}`}><strong>{model.modelId}</strong><RateBadge group={groupMetadata(group.key)} t={tModels} /><small>{model.mediaType} · {props.t(model.stale ? 'account.modelsStale' : 'account.modelsAvailable')}</small></div>)}</div>
            </details>)}</div>
            {mediaModelGroups.length === 0 && <p className={css.catalogEmpty}>{props.t(modelQuery.trim() ? 'account.modelsNoMatches' : 'account.modelsEmpty')}</p>}
          </details>
          <details className={css.modelList} open={modelQuery.trim() ? true : undefined}>
            <summary>{props.t('account.modelsList', { count: account.models.length })}</summary>
            <div className={css.modelGroups}>{modelGroups.map(group => <details className={css.modelGroup} key={group.key} open={modelQuery.trim() ? true : undefined}>
              <summary><span className={css.groupHeading}>{group.groupName}</span><RateBadge group={groupMetadata(group.key)} t={tModels} /><GroupInfo name={group.groupName} group={groupMetadata(group.key)} t={tModels} /><small>{group.models.length}</small></summary>
              <div className={css.modelRows}>{group.models.map(model => <div key={`${model.providerId}:${model.modelId}`}><strong>{model.modelId}</strong><RateBadge group={groupMetadata(group.key)} t={tModels} /><small>{model.providerId.split('-').at(-1)} · {model.capability ?? 'chat'} · {props.t(model.stale ? 'account.modelsStale' : 'account.modelsAvailable')}</small></div>)}</div>
            </details>)}</div>
            {modelGroups.length === 0 && <p className={css.catalogEmpty}>{props.t(modelQuery.trim() ? 'account.modelsNoMatches' : 'account.modelsEmpty')}</p>}
          </details>
          </>}
          {tab === 'billing' && <>{lowBalance && <p className={css.warning} role="alert">{account.balance !== undefined && account.balance <= 0 ? props.t('account.balanceEmpty') : props.t('account.lowBalance')}</p>}
          <div className={css.billingGrid} data-payment={activeOrder !== undefined}>
            <section className={css.rechargeCard}>
              <div className={css.sectionHeading}><div><h3>{props.t('account.rechargeTitle')}</h3><p>{props.t('account.rechargeDescription')}</p></div><CreditCard size={19} /></div>
              <div className={css.amountChoices}>{[50, 100, 200, 500].map(value => <button key={value} type="button" data-active={Number(amount) === value} onClick={() => setAmount(String(value))}>{value}</button>)}</div>
              <label>{props.t('account.customAmount')}<input type="number" min={minimumAmount} step="1" inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} /><small>{props.t('account.minimumAmount', { amount: minimumAmount })}</small></label>
              <div className={css.paymentChoices} role="group" aria-label={props.t('account.payment')}>
                {paymentTypes.map(type => <button key={type} type="button" data-active={paymentType === type} onClick={() => setPaymentType(type)}>{paymentLabel(type, props.t)}</button>)}
              </div>
              <button className={css.primary} type="button" onClick={() => void createOrder()} disabled={busy || checkout?.enabled === false || !Number.isFinite(Number(amount)) || Number(amount) < minimumAmount}><CreditCard size={16} />{props.t('account.createPayment')}</button>
              <p className={css.securityNote}><ShieldCheck size={14} />{props.t('account.paymentSecurity')}</p>
            </section>
            {activeOrder !== undefined && <section className={css.paymentCard}>
              <>
                <div className={css.sectionHeading}><div><h3>{props.t('account.orderNumber', { id: activeOrder.outTradeNo || String(activeOrder.id) })}</h3><p>{props.t('account.paymentLive')}</p></div><span className={css.status} data-status={activeOrder.status.toLowerCase()}>{statusLabel(activeOrder.status, props.t)}</span></div>
                <div className={css.orderAmount}>{activeOrder.amount.toFixed(2)} {account.currency ?? 'CNY'}<small>{activePaymentLabel}</small></div>
                {qrImage && !orderComplete && <div className={css.qrFrame}><img src={qrImage} alt={props.t('account.paymentQr')} /><span>{props.t('account.scanPayment')}</span></div>}
                {paymentUrl && <a className={css.payLink} href={withSelection(paymentUrl, amount, paymentType)} target="_blank" rel="noreferrer"><ExternalLink size={16} />{props.t('account.openPayment')}</a>}
                <div className={css.polling}>{polling ? props.t('account.checkingPayment') : TERMINAL.has(activeOrder.status.toUpperCase()) ? statusLabel(activeOrder.status, props.t) : props.t('account.waitingPayment')}</div>
              </>
            </section>}
          </div>
          <div className={css.ordersHeader}><div><h3>{props.t('account.recentOrders')}</h3><p>{props.t('account.ordersDescription')}</p></div><button className={css.iconButton} type="button" onClick={() => void loadBilling()} disabled={busy} title={props.t('common.refresh')} aria-label={props.t('common.refresh')}><RefreshCw size={17} /></button></div>
          <div className={css.orders}>{orders.length === 0 ? <p className={css.emptyOrders}>{props.t('account.noOrders')}</p> : orders.map(order => <div className={css.orderRow} key={order.id}>
            <div><strong>{order.outTradeNo || `#${order.id}`}</strong><small>{formatDate(order.createdAt)}</small></div>
            <span>{order.amount.toFixed(2)} {account.currency ?? 'CNY'}</span>
            <span className={css.status} data-status={order.status.toLowerCase()}>{statusLabel(order.status, props.t)}</span>
            {!TERMINAL.has(order.status.toUpperCase()) && <button type="button" onClick={() => continueOrder(order)}>{props.t('account.continuePayment')}</button>}
          </div>)}</div></>}
        </div></>}
      </section>
    </div>, target ?? document.body)}
    {balancePrompt && createPortal(<dialog ref={balanceDialog} className={css.balancePrompt} aria-labelledby="zerowall-balance-prompt-title" onCancel={() => setBalancePrompt(false)}>
      <button className={css.promptClose} type="button" aria-label={props.t('common.close')} onClick={() => setBalancePrompt(false)}><X size={16} /></button>
      <div className={css.balancePromptIcon}><CreditCard size={28} /></div>
      <h3 id="zerowall-balance-prompt-title">{props.t('account.balancePromptTitle')}</h3>
      <p>{props.t('account.balancePrompt')}</p>
      <div className={css.authActions}><button className={css.secondary} type="button" onClick={() => setBalancePrompt(false)}>{props.t('account.later')}</button><button className={css.primary} type="button" onClick={() => { setBalancePrompt(false); openAccount('billing') }}>{props.t('account.rechargeTitle')}</button></div>
    </dialog>, document.body)}
  </>
}

function gatewayLabel(gateway: AiCloudGatewayView, t: TranslateNS<typeof NS>): string {
  let hostname = ''
  try { hostname = new URL(gateway.baseUrl).hostname.toLowerCase() } catch { return gateway.label }
  return hostname === 'code.aicodeme.xyz' ? t('account.gatewayXyz')
    : hostname === 'hkcode.aicodeme.xyz' ? t('account.gatewayHk')
      : hostname === 'code.aicodeme.cn' ? t('account.gatewayCn') : gateway.label
}

function GatewaySelector({ gateways, selected, disabled, onChange, t }: { gateways: readonly AiCloudGatewayView[]; selected?: string | undefined; disabled: boolean; onChange: (baseUrl: string) => void; t: TranslateNS<typeof NS> }) {
  if (gateways.length === 0) return null
  const value = selected ?? gateways.find(gateway => gateway.preferred)?.baseUrl ?? gateways[0]?.baseUrl
  return <label className={css.gateway}><span>{t('account.gateway')}</span><select aria-label={t('account.gateway')} value={value} disabled={disabled} onChange={event => onChange(event.target.value)}>{gateways.map(gateway => <option value={gateway.baseUrl} key={gateway.baseUrl}>{gatewayLabel(gateway, t)}</option>)}</select></label>
}

function groupModels<T extends { groupId?: string; groupName: string }>(models: readonly T[]): Array<{ key: string; groupName: string; models: T[] }> {
  const groups = new Map<string, { key: string; groupName: string; models: T[] }>()
  for (const model of models) {
    const key = model.groupId ?? model.groupName
    let group = groups.get(key)
    if (!group) { group = { key, groupName: model.groupName, models: [] }; groups.set(key, group) }
    group.models.push(model)
  }
  return [...groups.values()]
}

function hasIncompleteCatalog(account: AiCloudAccountView): boolean {
  return [account.modelSync, account.mediaSync].some(sync => sync !== undefined && sync.status !== 'succeeded')
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
  const platform = gatewayPlatformUrl(baseUrl)
  return platform === undefined ? undefined : `${platform}/usage`
}
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
