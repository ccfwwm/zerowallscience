// @vitest-environment jsdom
import '../../../tests/support/native-dialog.js'

import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AiCloudAccountButton, mergePaymentOrder } from '../src/client/AiCloudAccountButton.js'
import { AccountSection } from '../src/client/account-surface.js'
import { translator } from '../../base/test/locale.js'

vi.mock('qrcode/lib/browser.js', () => ({
  default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,zerowall-payment-qr') },
}))

afterEach(() => cleanup())

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

  it('keeps model names out of account management and renders a scannable payment order', async () => {
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
