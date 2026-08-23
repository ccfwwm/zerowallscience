// @vitest-environment jsdom

import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AiCloudAccountButton, mergePaymentOrder } from '../src/client/AiCloudAccountButton.js'
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
    getPublicConfig: vi.fn().mockResolvedValue({ registrationEnabled: true, emailVerifyEnabled: true, invitationCodeEnabled: false, captchaEnabled: false }),
    gateways: vi.fn().mockResolvedValue([
      { baseUrl: 'https://hkcode.aicodeme.xyz', label: 'Hong Kong (default)', preferred: true },
      { baseUrl: 'https://code.aicodeme.xyz', label: 'Global XYZ backup', preferred: false },
      { baseUrl: 'https://code.aicodeme.cn', label: 'Global CN backup', preferred: false },
    ]),
    selectGateway: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    sendCode: vi.fn(),
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
  it('opens the Chinese login surface on first signed-out launch and can be skipped', async () => {
    const actions = props()
    render(<AiCloudAccountButton {...actions} />)
    expect(await screen.findByRole('dialog', { name: '登录或注册' })).toBeTruthy()
    await waitFor(() => expect(actions.getAccount).toHaveBeenCalledTimes(1))
    expect(actions.getPublicConfig).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText('密码').getAttribute('type')).toBe('password')
    fireEvent.click(screen.getByRole('button', { name: '暂时跳过' }))
    expect(screen.queryByRole('dialog', { name: '登录或注册' })).toBeNull()
  })

  it('does not block the first-run login surface on a slow public configuration request', async () => {
    const actions = props()
    actions.getPublicConfig.mockReturnValue(new Promise(() => {}))
    render(<AiCloudAccountButton {...actions} />)
    expect(await screen.findByRole('dialog', { name: '登录或注册' })).toBeTruthy()
    expect(actions.getAccount).toHaveBeenCalledOnce()
  })

  it('still opens first-run login when the Remote connection is not ready yet', async () => {
    const actions = props()
    actions.getAccount.mockRejectedValue(new Error('connection is starting'))
    render(<AiCloudAccountButton {...actions} />)
    expect(await screen.findByRole('dialog', { name: '登录或注册' })).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('connection is starting')
  })

  it('discovers managed models immediately after login', async () => {
    const actions = props()
    actions.login.mockResolvedValue({ status: 'signedIn', email: 'user@example.com', balanceFreshness: 'current', lowBalance: false, models: [{ providerId: 'zerowall-ai-cloud-1', groupId: '1', groupName: '科研', modelId: 'model-a', baseUrl: 'https://code.aicodeme.xyz/v1' }] })
    render(<AiCloudAccountButton {...actions} />)
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
    fireEvent.click(screen.getByRole('button', { name: 'ZeroWall 云账户' }))
    const sync = await screen.findByRole('button', { name: '同步模型' })
    fireEvent.click(sync)
    await waitFor(() => expect(actions.discoverModels).toHaveBeenCalledOnce())
    expect(screen.getByRole('button', { name: '同步模型' })).toBeTruthy()
  })

  it('shows the Hong Kong gateway by default and switches through the account Remote', async () => {
    const actions = props()
    actions.selectGateway.mockResolvedValue({ status: 'signedOut', balanceFreshness: 'current', lowBalance: false, gatewayBaseUrl: 'https://code.aicodeme.cn', models: [] })
    render(<AiCloudAccountButton {...actions} />)
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
    fireEvent.click(screen.getByRole('button', { name: 'ZeroWall 云账户' }))
    expect(await screen.findByRole('button', { name: '退出登录' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '退出登录' }))

    await waitFor(() => expect(actions.logout).toHaveBeenCalledOnce())
    expect(await screen.findByRole('dialog', { name: '登录或注册' })).toBeTruthy()
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
    fireEvent.click(screen.getByRole('button', { name: 'ZeroWall 云账户' }))
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
    const trigger = screen.getByRole('button', { name: 'ZeroWall 云账户' })
    await screen.findByRole('dialog', { name: '登录或注册' })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: '登录或注册' })).toBeNull()
    expect(trigger.isConnected).toBe(true)
  })
})
