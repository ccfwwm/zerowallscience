// @vitest-environment jsdom
import '../../../tests/support/native-dialog.js'

import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { AiCloudAccountButton, mergePaymentOrder } from '../src/client/AiCloudAccountButton.js'
import { apply } from '../src/client/index.js'
import { AccountSection } from '../src/client/account-surface.js'
import { translator } from '../../base/test/locale.js'

vi.mock('qrcode/lib/browser.js', () => ({
  default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,zerowall-payment-qr') },
}))

afterEach(() => { cleanup(); vi.useRealTimers() })

function props() {
  return {
    wide: true,
    t: translator(),
    getAccount: vi.fn().mockResolvedValue({ status: 'signedOut', balanceFreshness: 'current', lowBalance: false, models: [] }),
    getPublicConfig: vi.fn().mockResolvedValue({ registrationEnabled: true, emailVerifyEnabled: true, invitationCodeEnabled: false, captchaEnabled: false, passwordResetEnabled: true }),
    gateways: vi.fn().mockResolvedValue([
      { baseUrl: 'https://hkcode.aicodeme.xyz', label: 'Hong Kong (default)', preferred: true },
      { baseUrl: 'https://code.aicodeme.xyz', label: 'Global XYZ backup', preferred: false },
      { baseUrl: 'https://code.aicodeme.cn', label: 'Global CN backup', preferred: false },
    ]),
    selectGateway: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    sendCode: vi.fn(),
    forgotPassword: vi.fn(),
    savedLogin: vi.fn().mockResolvedValue(undefined),
    relogin: vi.fn(),
    forgetLogin: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn(),
    discoverModels: vi.fn(),
    checkoutInfo: vi.fn().mockResolvedValue({ enabled: true, minimumAmount: 10, paymentTypes: ['alipay', 'wxpay'] }),
    listOrders: vi.fn().mockResolvedValue([]),
    createOrder: vi.fn(),
    getOrder: vi.fn(),
    verifyOrder: vi.fn(),
  }
}

describe('AI Cloud account panel', () => {
  it('shows shared group pricing and descriptions, searches descriptions across media and chat, and keeps details in the modal', async () => {
    const actions = props()
    actions.getAccount.mockResolvedValue({ status: 'signedIn', email: 'user@example.com', balanceFreshness: 'current', lowBalance: false,
      groups: [{ groupId: '1', groupName: '科研', description: '经济线路，适合批量分析', rateMultiplier: 0 }, { groupId: '2', groupName: '媒体', description: '高清画面线路', rateMultiplier: 0.6 }],
      models: [{ providerId: 'cloud-1', groupId: '1', groupName: '科研', modelId: 'same', baseUrl: 'https://code.aicodeme.xyz' }],
      mediaModels: [{ providerId: 'cloud-2', groupId: '2', groupName: '媒体', modelId: 'image', profileId: 'v1', mediaType: 'image' }],
      modelSync: { checkedAt: '2026-10-22T01:02:03.000Z', status: 'partial', groups: [] },
    })
    render(<AiCloudAccountButton {...actions} />)
    await waitFor(() => expect(actions.getAccount).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: '登录AI平台' }))
    const modal = await screen.findByRole('dialog', { name: '云账户与充值' })
    expect(within(modal).getByText(/最近同步/)).toBeTruthy()
    const chatList = within(modal).getByText('科研').closest('details')!.parentElement!.closest('details')!
    fireEvent.click(chatList.querySelector('summary')!)
    expect(chatList.open).toBe(true)
    const info = within(modal).getByRole('button', { name: '分组介绍：科研' })
    info.focus()
    expect(document.activeElement).toBe(info)
    fireEvent.click(info)
    const details = within(modal).getByRole('dialog', { name: '分组介绍：科研' })
    expect(within(details).getByText('经济线路，适合批量分析')).toBeTruthy()
    expect(within(details).getByLabelText('分组倍率：0×')).toBeTruthy()
    fireEvent.keyDown(within(details).getByRole('button', { name: '关闭介绍' }), { key: 'Escape' })
    expect(document.activeElement).toBe(info)
    const search = within(modal).getByRole('textbox', { name: /搜索模型/ })
    fireEvent.change(search, { target: { value: '批量分析' } })
    expect(within(modal).getByText('same').closest('details')?.open).toBe(true)
    expect(within(modal).queryByText('image')).toBeNull()
    fireEvent.change(search, { target: { value: '高清画面' } })
    const media = within(modal).getByText('image').closest('details')!
    expect(media.open).toBe(true)
    expect(within(media).getAllByLabelText('分组倍率：0.6×')).toHaveLength(2)
    expect(within(media).getByText(/媒体模型可能采用独立计费规则/)).toBeTruthy()
    expect(within(modal).queryByText('same')).toBeNull()
  })

  it('prevents duplicate model sync while showing progress and preserves the usable catalog on failure', async () => {
    const actions = props()
    const account = { status: 'signedIn', email: 'user@example.com', balanceFreshness: 'current', lowBalance: false,
      models: [{ providerId: 'cloud-1', groupId: '1', groupName: '科研', modelId: 'cached-model', baseUrl: 'https://code.aicodeme.xyz' }] }
    actions.getAccount.mockResolvedValue(account)
    let reject!: (reason: Error) => void
    actions.discoverModels.mockReturnValue(new Promise((_resolve, fail) => { reject = fail }))
    render(<AiCloudAccountButton {...actions} />)
    await waitFor(() => expect(actions.getAccount).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: '登录AI平台' }))
    const sync = await screen.findByRole('button', { name: '同步模型' })
    fireEvent.click(sync)
    expect(screen.getByRole('button', { name: '正在同步…' })).toHaveProperty('disabled', true)
    fireEvent.click(sync)
    expect(actions.discoverModels).toHaveBeenCalledOnce()
    await act(async () => reject(new Error('catalog offline')))
    expect(screen.getByRole('button', { name: '同步模型' })).toHaveProperty('disabled', false)
    expect(screen.getByText('cached-model')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('catalog offline')
  })

  it('captures the account Remote before the sidebar renderer runs', async () => {
    const account = { current: vi.fn().mockResolvedValue({ ok: true, value: { status: 'signedOut', balanceFreshness: 'current', lowBalance: false, models: [] } }) }
    const session = { modelCatalog: vi.fn().mockResolvedValue({ ok: true, value: { groups: [], failures: [] } }) }
    let accountReads = 0
    const remote = new Proxy({ zerowallAccount: account, session, $on: vi.fn(() => () => {}) }, {
      get(target, property, receiver) {
        if (property === 'zerowallAccount' && accountReads++ > 0) throw new Error('cannot get property "remote.zerowallAccount" without inject')
        return Reflect.get(target, property, receiver)
      },
    })
    let injected: (() => Record<string, any>) | undefined
    const ctx = {
      remote,
      locale: { bind: vi.fn(() => translator()), register: vi.fn(() => () => {}) },
      effect: (mount: () => unknown) => mount(), on: vi.fn(), inject: vi.fn(),
      get: vi.fn((name: string) => name === 'remote.zerowallAccount' ? account : name === 'remote.session' ? session : undefined),
      slots: {
        inject: vi.fn((_name: string, mount: () => unknown) => mount()),
        register: vi.fn((options: { name?: string; key?: string; inject?: () => Record<string, any> }) => { if (options.name === 'settings.models.provider-card') expect(options.key).toBe('zerowall-ai-cloud'); if (options.inject) injected = options.inject; return () => undefined }),
      },
    }
    apply(ctx as any)
    expect(accountReads).toBe(0)
    const props = injected!()
    await expect(props.getAccount()).resolves.toMatchObject({ status: 'signedOut' })
    await props.refreshModelCatalog()
    expect(session.modelCatalog.mock.calls).toEqual([[]])
    expect(account.current).toHaveBeenCalledOnce()
    expect(accountReads).toBe(0)
  })

  it('turns a missing account Remote into a recoverable error', async () => {
    let injected: (() => Record<string, any>) | undefined
    const ctx = {
      remote: { zerowallAccount: undefined, session: undefined, $on: vi.fn(() => () => {}) },
      locale: { bind: vi.fn(() => translator()), register: vi.fn(() => () => {}) },
      effect: (mount: () => unknown) => mount(), on: vi.fn(), inject: vi.fn(),
      get: vi.fn((name: string) => name === 'remote.zerowallAccount' ? undefined : undefined),
      slots: {
        inject: vi.fn((_name: string, mount: () => unknown) => mount()),
        register: vi.fn((options: { inject?: () => Record<string, any> }) => { if (options.inject) injected = options.inject; return () => undefined }),
      },
    }
    apply(ctx as any)
    await expect(injected!().getAccount()).rejects.toThrow('AI 云账户服务尚未连接')
  })

  it('keeps the shared catalog through a pending or failed relogin and ignores older in-flight reads', async () => {
    const current = { status: 'signedIn', email: 'saved@example.com', gatewayBaseUrl: 'https://code.aicodeme.xyz',
      balanceFreshness: 'current', lowBalance: false, models: [{ providerId: 'zerowall-ai-cloud-25-messages', groupId: '25', groupName: 'Claude', modelId: 'claude-opus-4-6', baseUrl: 'https://code.aicodeme.xyz' }] }
    let rejectRelogin!: (reason: Error) => void
    let finishOldRead!: (value: unknown) => void
    const account = { current: vi.fn().mockResolvedValueOnce({ ok: true, value: current }).mockImplementationOnce(() => new Promise(resolve => { finishOldRead = resolve })),
      relogin: vi.fn(() => new Promise((_, reject) => { rejectRelogin = reject })) }
    let injected!: () => Record<string, any>
    apply({ locale: { bind: () => translator(), register: () => () => {} }, effect: (mount: () => unknown) => mount(), on: vi.fn(), inject: vi.fn(),
      get: (name: string) => name === 'remote.zerowallAccount' ? account : undefined,
      slots: { inject: (_name: string, mount: () => unknown) => mount(), register: (options: any) => { if (options.name === 'sidebar.footer.action') injected = options.inject; return () => {} } } } as any)
    const actions = injected()
    await actions.getAccount()
    const cached = actions.catalog.getSnapshot()
    const stale = actions.getAccount()
    const pending = actions.relogin()
    expect(actions.catalog.getSnapshot()).toEqual(cached)
    rejectRelogin(new Error('offline'))
    await expect(pending).rejects.toThrow('offline')
    finishOldRead({ ok: true, value: { status: 'signedOut', balanceFreshness: 'current', lowBalance: false, models: [] } })
    await stale
    expect(actions.catalog.getSnapshot()).toEqual(cached)
  })

  it('does not block the conversation with a login surface on first signed-out launch', async () => {
    const actions = props()
    render(<AiCloudAccountButton {...actions} />)
    await waitFor(() => expect(actions.getAccount).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('dialog', { name: '登录或注册' })).toBeNull()
    expect(actions.getPublicConfig).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: '登录AI平台' }))
    expect(await screen.findByRole('dialog', { name: '登录或注册' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '登录AI平台' }).querySelector('[class*="statusDot"]')).toBeTruthy()
    expect(screen.getByText(/Claude、GPT、Kimi、DeepSeek/)).toBeTruthy()
  })

  it('does not block the first-run login surface on a slow public configuration request', async () => {
    const actions = props()
    actions.getPublicConfig.mockReturnValue(new Promise(() => {}))
    render(<AiCloudAccountButton {...actions} />)
    expect(screen.queryByRole('dialog', { name: '登录或注册' })).toBeNull()
    expect(actions.getAccount).toHaveBeenCalledOnce()
  })

  it('still opens first-run login when the Remote connection is not ready yet', async () => {
    const actions = props()
    actions.getAccount.mockRejectedValue(new Error('connection is starting'))
    render(<AiCloudAccountButton {...actions} />)
    expect(screen.queryByRole('dialog', { name: '登录或注册' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '登录AI平台' }))
    expect(await screen.findByRole('dialog', { name: '登录或注册' })).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('connection is starting')
  })

  it('discovers managed models immediately after login', async () => {
    const actions = props()
    actions.login.mockResolvedValue({ status: 'signedIn', email: 'user@example.com', balanceFreshness: 'current', lowBalance: false, models: [{ providerId: 'zerowall-ai-cloud-1', groupId: '1', groupName: '科研', modelId: 'model-a', baseUrl: 'https://code.aicodeme.xyz/v1' }] })
    render(<AiCloudAccountButton {...actions} />)
    fireEvent.click(screen.getByRole('button', { name: '登录AI平台' }))
    await screen.findByRole('dialog', { name: '登录或注册' })
    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'user@example.com' } })
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'not-persisted' } })
    fireEvent.click(screen.getByRole('button', { name: '登录并配置模型' }))
    await waitFor(() => expect(actions.login).toHaveBeenCalledTimes(1))
    expect(actions.discoverModels).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: '登录或注册' })).toBeNull()
  })

  it('provides a manual model sync action for an already signed-in account', async () => {
    const actions = props()
    actions.getAccount.mockResolvedValue({
      status: 'signedIn', email: 'user@example.com', balanceFreshness: 'current', lowBalance: false, models: [],
    })
    actions.discoverModels.mockResolvedValue({
      status: 'signedIn', email: 'user@example.com', balanceFreshness: 'current', lowBalance: false,
      models: [{ providerId: 'zerowall-ai-cloud-1', groupId: '1', groupName: '科研', modelId: 'model-a', baseUrl: 'https://code.aicodeme.xyz/v1' }],
    })
    render(<AiCloudAccountButton {...actions} />)
    await waitFor(() => expect(actions.getAccount).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: '登录AI平台' }))
    const sync = await screen.findByRole('button', { name: '同步模型' })
    fireEvent.click(sync)
    await waitFor(() => expect(actions.discoverModels).toHaveBeenCalledOnce())
    expect(screen.getByRole('button', { name: '同步模型' })).toBeTruthy()
  })

  it('shows the Hong Kong gateway by default and switches through the account Remote', async () => {
    const actions = props()
    actions.selectGateway.mockResolvedValue({ status: 'signedOut', balanceFreshness: 'current', lowBalance: false, gatewayBaseUrl: 'https://code.aicodeme.cn', models: [] })
    render(<AiCloudAccountButton {...actions} />)
    fireEvent.click(screen.getByRole('button', { name: '登录AI平台' }))
    const selector = await screen.findByLabelText<HTMLSelectElement>('服务节点')
    expect(selector.value).toBe('https://hkcode.aicodeme.xyz')
    fireEvent.change(selector, { target: { value: 'https://code.aicodeme.cn' } })
    await waitFor(() => expect(actions.selectGateway).toHaveBeenCalledWith('https://code.aicodeme.cn'))
  })

  it('shows an explicit logout action and returns to the login surface', async () => {
    const actions = props()
    actions.getAccount
      .mockResolvedValueOnce({ status: 'signedIn', email: 'user@example.com', balance: 8, currency: 'CNY', balanceFreshness: 'current', lowBalance: false, models: [] })
      .mockResolvedValueOnce({ status: 'signedIn', email: 'user@example.com', balance: 8, currency: 'CNY', balanceFreshness: 'current', lowBalance: false, models: [] })
      .mockResolvedValueOnce({ status: 'signedOut', balanceFreshness: 'current', lowBalance: false, models: [] })
    actions.logout.mockResolvedValue(undefined)
    render(<AiCloudAccountButton {...actions} />)

    await waitFor(() => expect(actions.getAccount).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: '登录AI平台' }))
    expect(await screen.findByRole('button', { name: '退出登录' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '退出登录' }))

    await waitFor(() => expect(actions.logout).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: '登录AI平台' }))
    expect(await screen.findByRole('dialog', { name: '登录或注册' })).toBeTruthy()
  })

  it('offers saved-credential relogin for a signed-in account and refreshes its models', async () => {
    const actions = props()
    const account = { status: 'signedIn' as const, email: 'user@example.com', balance: 8, currency: 'CNY', balanceFreshness: 'current' as const, lowBalance: false, models: [] }
    actions.getAccount.mockResolvedValue(account)
    actions.savedLogin.mockResolvedValue({ email: 'user@example.com', password: 'local-test', baseUrl: 'https://hkcode.aicodeme.xyz', rememberPassword: true })
    actions.relogin.mockResolvedValue(account)
    const refreshModelCatalog = vi.fn().mockResolvedValue(undefined)
    render(<AiCloudAccountButton {...actions} refreshModelCatalog={refreshModelCatalog} />)

    await waitFor(() => expect(actions.getAccount).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: '登录AI平台' }))
    fireEvent.click(await screen.findByRole('button', { name: '重新登录' }))

    await waitFor(() => expect(actions.relogin).toHaveBeenCalledOnce())
    expect(await screen.findByText('已使用保存的账号密码重新登录并同步模型')).toBeTruthy()
    expect(refreshModelCatalog).toHaveBeenCalledOnce()
  })

  it('waits for automatic account restoration before showing a sign-in form', async () => {
    const actions = props()
    let restore!: (account: any) => void
    actions.getAccount.mockReturnValue(new Promise(resolve => { restore = resolve }))
    render(<AiCloudAccountButton {...actions} />)
    fireEvent.click(screen.getByRole('button', { name: '登录AI平台' }))
    expect(screen.getByRole('dialog', { name: '正在恢复登录…' })).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: '邮箱' })).toBeNull()
    expect(actions.login).not.toHaveBeenCalled()
    await act(async () => restore({ status: 'signedIn', email: 'saved@example.com', balanceFreshness: 'current', lowBalance: false, models: [] }))
    expect(await screen.findByRole('dialog', { name: '云账户与充值' })).toBeTruthy()
    expect(screen.getByText('saved@example.com')).toBeTruthy()
  })

  it('offers saved-credential relogin while signed out after loading the encrypted login record', async () => {
    const actions = props()
    actions.savedLogin.mockResolvedValue({ email: 'saved@example.com', password: 'saved-password', baseUrl: 'https://hkcode.aicodeme.xyz', rememberPassword: true })
    actions.relogin.mockResolvedValue({ status: 'signedIn', email: 'saved@example.com', balanceFreshness: 'current', lowBalance: false, models: [] })
    render(<AiCloudAccountButton {...actions} />)

    await waitFor(() => expect(actions.getAccount).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: '登录AI平台' }))
    fireEvent.click(await screen.findByRole('button', { name: '重新登录' }))

    await waitFor(() => expect(actions.relogin).toHaveBeenCalledOnce())
    expect(await screen.findByRole('status')).toBeTruthy()
  })

  it('hides relogin when no encrypted saved login is available', async () => {
    const actions = props()
    actions.getAccount.mockResolvedValue({ status: 'signedIn', email: 'user@example.com', balance: 8, balanceFreshness: 'current', lowBalance: false, models: [] })
    render(<AiCloudAccountButton {...actions} />)
    await waitFor(() => expect(actions.getAccount).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: '登录AI平台' }))
    await screen.findByRole('dialog', { name: '云账户与充值' })
    await waitFor(() => expect(actions.savedLogin).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: '重新登录' })).toBeNull()
  })

  it('reports incomplete relogin sync without claiming all models were synchronized', async () => {
    const actions = props()
    const model = { providerId: 'zerowall-ai-cloud-25-messages', groupId: '25', groupName: 'Claude', modelId: 'claude-opus-4-6', baseUrl: 'https://code.aicodeme.xyz', stale: true }
    const account = { status: 'signedIn' as const, email: 'user@example.com', balance: 8, balanceFreshness: 'current' as const, lowBalance: false, models: [model],
      modelSync: { status: 'failed', checkedAt: '2026-10-26T00:00:00Z', groups: [] } }
    actions.getAccount.mockResolvedValue(account)
    actions.savedLogin.mockResolvedValue({ email: 'user@example.com', password: 'local-test', baseUrl: 'https://code.aicodeme.xyz', rememberPassword: true })
    actions.relogin.mockResolvedValue(account)
    render(<AiCloudAccountButton {...actions} />)
    await waitFor(() => expect(actions.getAccount).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: '登录AI平台' }))
    fireEvent.click(await screen.findByRole('button', { name: '重新登录' }))
    expect(await screen.findByText('部分目录暂未更新，已保留上次可用模型。可稍后重新同步。')).toBeTruthy()
    expect(screen.queryByText('已使用保存的账号密码重新登录并同步模型')).toBeNull()
    expect(screen.getByText('claude-opus-4-6')).toBeTruthy()
  })

  it('limits background restore to three retries even if the network repeatedly reports online', async () => {
    const actions = props()
    actions.getAccount.mockResolvedValue({ status: 'signedOut', autoLoginRetryable: true, balanceFreshness: 'current', lowBalance: false, models: [] })
    vi.useFakeTimers()
    render(<AiCloudAccountButton {...actions} />)
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(actions.getAccount).toHaveBeenCalledTimes(1)
    for (const milliseconds of [2_000, 8_000, 30_000]) {
      await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds) })
    }
    expect(actions.getAccount).toHaveBeenCalledTimes(4)
    await act(async () => { window.dispatchEvent(new Event('online')); await vi.advanceTimersByTimeAsync(120_000) })
    expect(actions.getAccount).toHaveBeenCalledTimes(4)
  })

  it('restores on an online event and cancels the pending timer after success', async () => {
    const actions = props()
    actions.getAccount.mockResolvedValueOnce({ status: 'signedOut', autoLoginRetryable: true, balanceFreshness: 'current', lowBalance: false, models: [] })
      .mockResolvedValue({ status: 'signedIn', email: 'saved@example.com', balance: 8, balanceFreshness: 'current', lowBalance: false, models: [] })
    vi.useFakeTimers()
    render(<AiCloudAccountButton {...actions} />)
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    await act(async () => { window.dispatchEvent(new Event('online')); await vi.advanceTimersByTimeAsync(0) })
    expect(actions.getAccount).toHaveBeenCalledTimes(2)
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); window.dispatchEvent(new Event('online')) })
    expect(actions.getAccount).toHaveBeenCalledTimes(2)
  })

  it('does not retry rejected credentials and removes restore listeners on unmount', async () => {
    const actions = props()
    vi.useFakeTimers()
    const view = render(<AiCloudAccountButton {...actions} />)
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    await act(async () => { window.dispatchEvent(new Event('online')); await vi.advanceTimersByTimeAsync(120_000) })
    expect(actions.getAccount).toHaveBeenCalledOnce()
    view.unmount()
    actions.getAccount.mockClear().mockResolvedValue({ status: 'signedOut', autoLoginRetryable: true, balanceFreshness: 'current', lowBalance: false, models: [] })
    const retrying = render(<AiCloudAccountButton {...actions} />)
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    retrying.unmount()
    await act(async () => { window.dispatchEvent(new Event('online')); await vi.advanceTimersByTimeAsync(120_000) })
    expect(actions.getAccount).toHaveBeenCalledOnce()
  })

  it('cancels delayed restore when the user starts an explicit login', async () => {
    const actions = props()
    actions.getAccount.mockResolvedValue({ status: 'signedOut', autoLoginRetryable: true, balanceFreshness: 'current', lowBalance: false, models: [] })
    actions.login.mockResolvedValue({ status: 'signedIn', email: 'new@example.com', balance: 8, balanceFreshness: 'current', lowBalance: false, models: [] })
    vi.useFakeTimers()
    render(<AiCloudAccountButton {...actions} />)
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    fireEvent.click(screen.getByRole('button', { name: '登录AI平台' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    fireEvent.change(screen.getByRole('textbox', { name: '邮箱' }), { target: { value: 'new@example.com' } })
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'local-only' } })
    fireEvent.click(screen.getByRole('button', { name: '登录并配置模型' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); window.dispatchEvent(new Event('online')) })
    expect(actions.login).toHaveBeenCalledOnce()
    expect(actions.getAccount).toHaveBeenCalledTimes(2)
  })

  it('shows billing and model pricing buttons for the active AI Cloud gateway', async () => {
    const actions = props()
    actions.getAccount.mockResolvedValue({
      status: 'signedIn', email: 'user@example.com', balance: 12, currency: 'CNY',
      balanceFreshness: 'current', lowBalance: false, gatewayBaseUrl: 'https://hkcode.aicodeme.xyz', models: [],
    })
    render(<AiCloudAccountButton {...actions} />)
    await waitFor(() => expect(actions.getAccount).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: '登录AI平台' }))
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    fireEvent.click(await screen.findByRole('button', { name: '查看费用详情' }))
    fireEvent.click(screen.getByRole('button', { name: '查看模型价格' }))
    expect(open).toHaveBeenNthCalledWith(1, 'https://hkcode.aicodeme.xyz/usage', '_blank', 'noopener,noreferrer')
    expect(open).toHaveBeenNthCalledWith(2, 'https://hkcode.aicodeme.xyz/model-plaza?embedded=1', '_blank', 'noopener,noreferrer')
    open.mockRestore()
  })

  it('warns clearly when the balance is zero or negative', async () => {
    const actions = props()
    actions.getAccount.mockResolvedValue({ status: 'signedIn', email: 'user@example.com', balance: 0, currency: 'CNY', balanceFreshness: 'current', lowBalance: false, models: [] })
    render(<AiCloudAccountButton {...actions} />)
    await waitFor(() => expect(actions.getAccount).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: '登录AI平台' }))
    expect((await screen.findByRole('alert')).textContent).toContain('余额已不足')
  })

  it('dismisses the empty balance prompt for the rest of this startup', async () => {
    const actions = props()
    actions.getAccount.mockResolvedValue({ status: 'signedIn', email: 'user@example.com', balance: -1, currency: 'CNY', balanceFreshness: 'current', lowBalance: false, models: [] })
    render(<AiCloudAccountButton {...actions} />)
    expect(await screen.findByRole('dialog', { name: '账户余额不足' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '稍后再说' }))
    expect(screen.queryByRole('dialog', { name: '账户余额不足' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '登录AI平台' }))
    await waitFor(() => expect(actions.getAccount).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('dialog', { name: '账户余额不足' })).toBeNull()
  })

  it.each([
    { balance: 0, balanceFreshness: 'stale' },
    { balance: undefined, balanceFreshness: 'current' },
    { balance: 5, balanceFreshness: 'current' },
  ])('never prompts for an unknown, stale or positive balance: %j', async (balance) => {
    const actions = props()
    actions.getAccount.mockResolvedValue({ status: 'signedIn', email: 'user@example.com', ...balance, lowBalance: false, models: [] })
    render(<AiCloudAccountButton {...actions} />)
    fireEvent.click(screen.getByRole('button', { name: '登录AI平台' }))
    await screen.findByRole('button', { name: '退出登录' })
    expect(screen.queryByRole('dialog', { name: '账户余额不足' })).toBeNull()
  })

  it('checks remember password by default and sends the choice with login', async () => {
    const actions = props()
    actions.login.mockResolvedValue({ status: 'signedIn', email: 'user@example.com', balanceFreshness: 'current', lowBalance: false, models: [] })
    render(<AiCloudAccountButton {...actions} />)
    fireEvent.click(screen.getByRole('button', { name: '登录AI平台' }))
    await screen.findByRole('dialog', { name: '登录或注册' })
    const checkbox = screen.getByRole('checkbox', { name: /记住密码/ }) as HTMLInputElement
    expect(checkbox.checked).toBe(true)
    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'user@example.com' } })
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'password' } })
    fireEvent.click(screen.getByRole('button', { name: '登录并配置模型' }))
    await waitFor(() => expect(actions.login).toHaveBeenCalledWith('user@example.com', 'password', true))
  })

  it('shows a textual verification action, success feedback and gateway-bound countdown', async () => {
    const actions = props()
    actions.sendCode.mockResolvedValue({ countdown: 60, gatewayBaseUrl: 'https://code.aicodeme.xyz' })
    render(<AiCloudAccountButton {...actions} />)
    fireEvent.click(screen.getByRole('button', { name: '登录AI平台' }))
    await screen.findByRole('dialog', { name: '登录或注册' })
    fireEvent.click(screen.getByRole('button', { name: '注册' }))
    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: ' User@Example.COM ' } })
    fireEvent.click(screen.getByRole('button', { name: '发送验证码' }))
    await waitFor(() => expect(actions.sendCode).toHaveBeenCalledWith('user@example.com', 'https://hkcode.aicodeme.xyz'))
    expect(screen.getByRole('status').textContent).toContain('验证码已发送到 user@example.com')
    expect(screen.getByRole('button', { name: '60 秒后重新发送' })).toBeTruthy()
  })

  it('sends a password reset email and lets the user return to sign in', async () => {
    const actions = props()
    actions.forgotPassword.mockResolvedValue(undefined)
    render(<AiCloudAccountButton {...actions} />)
    fireEvent.click(screen.getByRole('button', { name: '登录AI平台' }))
    await screen.findByRole('dialog', { name: '登录或注册' })
    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'user@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: '忘记密码？' }))
    expect(screen.getByRole('heading', { name: '重置密码' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '发送重置邮件' }))
    await waitFor(() => expect(actions.forgotPassword).toHaveBeenCalledWith('user@example.com', 'https://hkcode.aicodeme.xyz'))
    expect(screen.getByRole('status').textContent).toContain('重置请求已提交')
    fireEvent.click(screen.getByRole('button', { name: '返回登录' }))
    expect(screen.getByRole('heading', { name: '登录或注册' })).toBeTruthy()
  })

  it('blocks duplicate sends and surfaces sending and failure states', async () => {
    const actions = props()
    let reject!: (reason: Error) => void
    actions.sendCode.mockReturnValue(new Promise((_, fail) => { reject = fail }))
    render(<AiCloudAccountButton {...actions} />)
    fireEvent.click(screen.getByRole('button', { name: '登录AI平台' }))
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: '注册' }))
    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'user@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: '发送验证码' }))
    fireEvent.click(screen.getByRole('button', { name: /正在发送/ }))
    expect(actions.sendCode).toHaveBeenCalledOnce()
    expect((screen.getByLabelText('邮箱') as HTMLInputElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '登录AI平台' }))
    expect(actions.getAccount).toHaveBeenCalledOnce()
    reject(new Error('gateway/internal: fetch failed'))
    expect((await screen.findByRole('alert')).textContent).toContain('网络')
    expect(screen.queryByRole('status')).toBeNull()
    expect((screen.getByRole('button', { name: '发送验证码' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('registers with the issued gateway and leading-zero code, and translates expired codes', async () => {
    const actions = props()
    actions.sendCode.mockResolvedValue({ countdown: 60, gatewayBaseUrl: 'https://code.aicodeme.xyz' })
    actions.register.mockRejectedValue(new Error('gateway/internal: invalid or expired verification code'))
    render(<AiCloudAccountButton {...actions} />)
    fireEvent.click(screen.getByRole('button', { name: '登录AI平台' }))
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: '注册' }))
    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'USER@example.com' } })
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: ' password ' } })
    fireEvent.click(screen.getByRole('button', { name: '发送验证码' }))
    await screen.findByRole('status')
    fireEvent.change(screen.getByLabelText('验证码'), { target: { value: '012345' } })
    fireEvent.submit(screen.getByLabelText('邮箱').closest('form')!)
    await waitFor(() => expect(actions.register).toHaveBeenCalledWith('user@example.com', ' password ', '012345', true, 'https://code.aicodeme.xyz'))
    expect(screen.getByRole('alert').textContent).not.toMatch(/gateway|invalid or expired/)
    expect(screen.getByRole('alert').textContent).toContain('验证码')
    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'other@example.com' } })
    expect((screen.getByLabelText('验证码') as HTMLInputElement).value).toBe('')
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('invalidates the code and applies the new gateway registration policy', async () => {
    const actions = props()
    actions.selectGateway.mockResolvedValue({ status: 'signedOut', gatewayBaseUrl: 'https://code.aicodeme.cn', models: [] })
    render(<AiCloudAccountButton {...actions} />)
    fireEvent.click(screen.getByRole('button', { name: '登录AI平台' }))
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: '注册' }))
    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'user@example.com' } })
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'password' } })
    fireEvent.change(screen.getByLabelText('验证码'), { target: { value: '012345' } })
    actions.getPublicConfig.mockResolvedValue({ registrationEnabled: false, passwordResetEnabled: false })
    fireEvent.change(screen.getByLabelText('服务节点'), { target: { value: 'https://code.aicodeme.cn' } })
    await waitFor(() => expect(actions.getPublicConfig).toHaveBeenLastCalledWith('https://code.aicodeme.cn'))
    expect((screen.getByLabelText('验证码') as HTMLInputElement).value).toBe('')
    fireEvent.submit(screen.getByLabelText('邮箱').closest('form')!)
    expect(actions.register).not.toHaveBeenCalled()
    expect(actions.sendCode).not.toHaveBeenCalled()
  })

  it('shares reset-email feedback with the settings AI Cloud surface and prevents duplicate submissions', async () => {
    const actions = props()
    actions.forgotPassword.mockResolvedValue(undefined)
    render(<><AiCloudAccountButton {...actions} /><AccountSection /></>)
    await screen.findByRole('heading', { name: '登录或注册' })
    await waitFor(() => expect((screen.getByRole('button', { name: '忘记密码？' }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: '忘记密码？' }))
    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'user@example.com' } })
    const form = screen.getByLabelText('邮箱').closest('form')!
    fireEvent.submit(form)
    fireEvent.submit(form)
    await screen.findByRole('status')
    fireEvent.submit(form)
    expect(actions.forgotPassword).toHaveBeenCalledOnce()
    expect(screen.queryByLabelText('密码')).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('does not bypass reset policy through form submission', async () => {
    const actions = props()
    actions.getPublicConfig.mockResolvedValue({ passwordResetEnabled: false })
    render(<AiCloudAccountButton {...actions} />)
    fireEvent.click(screen.getByRole('button', { name: '登录AI平台' }))
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: '忘记密码？' }))
    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'user@example.com' } })
    fireEvent.submit(screen.getByLabelText('邮箱').closest('form')!)
    expect(actions.forgotPassword).not.toHaveBeenCalled()
  })

  it('shows reset failures without claiming the email was sent', async () => {
    const actions = props()
    actions.forgotPassword.mockRejectedValue(new Error('gateway/internal: HTTP 429'))
    render(<AiCloudAccountButton {...actions} />)
    fireEvent.click(screen.getByRole('button', { name: '登录AI平台' }))
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: '忘记密码？' }))
    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'user@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: '发送重置邮件' }))
    expect((await screen.findByRole('alert')).textContent).toContain('频繁')
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('offers a collapsed searchable model list and renders a scannable payment order', async () => {
    const actions = props()
    actions.getAccount.mockResolvedValue({
      status: 'signedIn', email: 'user@example.com', balance: 18, currency: 'CNY',
      balanceFreshness: 'current', lowBalance: false,
      models: [{ providerId: 'cloud-1', groupId: '1', groupName: '云模型', modelId: 'deepseek-v4-pro', baseUrl: 'https://code.aicodeme.xyz/v1' }],
    })
    actions.listOrders.mockResolvedValue([])
    actions.createOrder.mockResolvedValue({
      id: 950, outTradeNo: 'sub2_test', status: 'PENDING', amount: 10,
      paymentType: 'alipay', qrCode: 'https://payment.example/qr/950',
    })
    actions.verifyOrder.mockResolvedValue({
      id: 950, outTradeNo: 'sub2_test', status: 'PENDING', amount: 10,
      paymentType: 'alipay', qrCode: 'https://payment.example/qr/950',
    })

    render(<AiCloudAccountButton {...actions} />)
    await waitFor(() => expect(actions.getAccount).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: '登录AI平台' }))
    expect(await screen.findByText('账户余额')).toBeTruthy()
    const model = screen.getByText('deepseek-v4-pro')
    const list = model.closest('details')!
    expect(list.open).toBe(false)
    list.open = true
    fireEvent.change(screen.getByRole('textbox', { name: '搜索模型、分组、协议或能力' }), { target: { value: 'missing' } })
    expect(screen.queryByText('deepseek-v4-pro')).toBeNull()
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: '生成支付订单' }))
    expect(await screen.findByAltText('支付二维码')).toBeTruthy()
  })

  it('preserves payment material when status polling returns only order state', () => {
    expect(mergePaymentOrder({
      id: 950,
      outTradeNo: 'sub2_test',
      status: 'PENDING',
      amount: 50,
      paymentType: 'wxpay',
      paymentUrl: 'https://code.aicodeme.xyz/payment/950',
      qrCode: 'https://payment.example/qr/950',
      createdAt: '2026-08-17T06:00:00Z',
    }, {
      id: 950,
      outTradeNo: 'sub2_test',
      status: 'PENDING',
      amount: 50,
      paymentType: 'wxpay',
    })).toEqual(expect.objectContaining({
      status: 'PENDING',
      paymentUrl: 'https://code.aicodeme.xyz/payment/950',
      qrCode: 'https://payment.example/qr/950',
      createdAt: '2026-08-17T06:00:00Z',
    }))
  })

  it('closes the top-level panel on the first immediate Escape press', async () => {
    render(<AiCloudAccountButton {...props()} />)
    const trigger = screen.getByRole('button', { name: '登录AI平台' })
    fireEvent.click(trigger)
    await screen.findByRole('dialog', { name: '登录或注册' })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: '登录或注册' })).toBeNull()
    expect(trigger.isConnected).toBe(true)
  })
})
