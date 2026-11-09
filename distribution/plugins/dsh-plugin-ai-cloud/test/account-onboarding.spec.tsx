// @vitest-environment jsdom
import { act, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AiCloudAccountButton, type AiCloudAccountView } from '../src/account/client/AiCloudAccountButton.js'
import { zh } from '../src/account/client/locales.js'

type Props = ComponentProps<typeof AiCloudAccountButton>
const signedOut: AiCloudAccountView = { status: 'signedOut', balanceFreshness: 'current', lowBalance: false, models: [] }
const signedIn = (balance: number, balanceFreshness: 'current' | 'stale' = 'current'): AiCloudAccountView => ({
  ...signedOut, status: 'signedIn', email: 'test@example.com', balance, balanceFreshness, currency: 'CNY',
})
let root: Root
let container: HTMLDivElement
let dialogDescriptor: PropertyDescriptor | undefined

function actions(getAccount: Props['getAccount']): Props {
  const dictionary: Record<string, string> = zh
  return {
    wide: true, t: key => dictionary[key] ?? key, getAccount,
    savedLogin: vi.fn(async () => undefined), forgetLogin: vi.fn(async () => {}),
    relogin: vi.fn(async () => signedIn(20)),
    getPublicConfig: vi.fn(async () => ({ registrationEnabled: true, emailVerifyEnabled: true, invitationCodeEnabled: false, captchaEnabled: false })),
    gateways: vi.fn(async () => []), selectGateway: vi.fn(async () => signedOut),
    login: vi.fn(async () => signedIn(20)), register: vi.fn(async () => signedIn(0)),
    sendCode: vi.fn(async () => ({ countdown: 60, gatewayBaseUrl: 'https://example.com' })), forgotPassword: vi.fn(async () => {}),
    logout: vi.fn(async () => {}), discoverModels: vi.fn(async () => signedIn(20)),
    checkoutInfo: vi.fn(async () => ({ enabled: false, minimumAmount: 10, paymentTypes: [] })),
    listOrders: vi.fn(async () => []), createOrder: vi.fn(), getOrder: vi.fn(), verifyOrder: vi.fn(),
  }
}
const buttons = () => [...document.querySelectorAll<HTMLButtonElement>('button')]
async function click(text: string) {
  const button = buttons().find(node => node.textContent === text)
  expect(button, text).toBeDefined()
  await act(async () => button!.click())
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  dialogDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal')
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value(this: HTMLDialogElement) { this.open = true } })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  if (dialogDescriptor) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', dialogDescriptor)
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('AI Cloud startup and sidebar balance', () => {
  it('records the localized login, registration, password reset and signed-in account controls without credentials', async () => {
    const props = actions(async () => signedOut)
    props.getPublicConfig = vi.fn(async () => ({ registrationEnabled: true, emailVerifyEnabled: true, passwordResetEnabled: true, invitationCodeEnabled: false, captchaEnabled: false }))
    await act(async () => root.render(<AiCloudAccountButton {...props} />))
    const controls = () => {
      const form = document.querySelector('form')!
      return {
        fields: [...form.querySelectorAll('label')].map(label => label.textContent),
        actions: [...form.querySelectorAll('button')].map(button => button.getAttribute('aria-label') ?? button.textContent),
      }
    }
    expect(controls()).toMatchSnapshot('login')
    await click('注册')
    expect(controls()).toMatchSnapshot('registration')
    await click('登录')
    await click('忘记密码？')
    expect(controls()).toMatchSnapshot('password reset')
    await click('暂时跳过')
    await act(async () => root.unmount())
    root = createRoot(container)
    await act(async () => root.render(<AiCloudAccountButton {...actions(async () => signedIn(20))} />))
    await act(async () => document.querySelector<HTMLButtonElement>('[data-zerowall-footer-action]')!.click())
    const tabs = [...document.querySelectorAll('nav button')].map(tab => tab.textContent)
    expect(tabs).toHaveLength(3)
    expect(tabs).toMatchSnapshot('account tabs')
  })

  it('waits for an existing welcome dialog before presenting sign-in once', async () => {
    const welcome = document.createElement('section')
    welcome.setAttribute('role', 'dialog'); welcome.setAttribute('aria-modal', 'true')
    document.body.append(welcome)
    try {
      await act(async () => root.render(<AiCloudAccountButton {...actions(async () => signedOut)} />))
      expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1)
      await act(async () => welcome.remove())
      expect(document.querySelector('[role="dialog"]')?.textContent).toContain('暂时跳过')
      await click('暂时跳过')
      await act(async () => window.dispatchEvent(new Event('focus')))
      expect(document.querySelector('[role="dialog"]')).toBeNull()
    } finally { welcome.remove() }
  })

  it('returns keyboard focus to the account trigger after Escape', async () => {
    await act(async () => root.render(<AiCloudAccountButton {...actions(async () => signedOut)} />))
    await click('暂时跳过')
    const trigger = document.querySelector<HTMLButtonElement>('[data-zerowall-footer-action]')!
    trigger.focus()
    await act(async () => trigger.click())
    expect(document.querySelector('[role="dialog"]')?.contains(document.activeElement)).toBe(true)
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('opens sign-in automatically and lets the user skip without reopening it', async () => {
    const props = actions(vi.fn(async () => signedOut))
    await act(async () => root.render(<AiCloudAccountButton {...props} />))
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    expect(document.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(true)
    await click('暂时跳过')
    await act(async () => window.dispatchEvent(new Event('focus')))
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(props.getAccount).toHaveBeenCalledOnce()
  })

  it('waits for saved-session restoration and enters directly when it succeeds', async () => {
    let resolve!: (value: AiCloudAccountView) => void
    const restored = new Promise<AiCloudAccountView>(done => { resolve = done })
    const props = actions(vi.fn(() => restored))
    await act(async () => root.render(<AiCloudAccountButton {...props} />))
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    await act(async () => resolve(signedIn(20)))
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.querySelector('[data-zerowall-footer-action]')?.textContent).toContain('20.00')
    expect(props.login).not.toHaveBeenCalled()
  })

  it('shows a current balance below five, offers recharge, and refreshes after returning', async () => {
    let account = signedIn(4.99)
    const read = vi.fn(async () => account)
    const props = actions(read)
    await act(async () => root.render(<AiCloudAccountButton {...props} />))
    const footer = () => document.querySelector('[data-zerowall-footer-action]')!
    expect(footer().textContent).toContain('4.99')
    expect(footer().textContent).toContain('充值')
    expect(document.querySelector('dialog[open]')?.textContent).toContain('低于 5 元')
    await click('余额充值')
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    expect(props.createOrder).not.toHaveBeenCalled()
    await act(async () => document.querySelector<HTMLButtonElement>('button[aria-label="关闭"]')!.click())
    account = signedIn(5)
    await act(async () => window.dispatchEvent(new Event('focus')))
    expect(footer().textContent).toContain('5.00')
    expect(footer().getAttribute('data-low-balance')).toBe('false')
    expect(document.querySelector('dialog')).toBeNull()
    account = signedIn(3)
    await act(async () => window.dispatchEvent(new Event('focus')))
    expect(document.querySelector('dialog[open]')).not.toBeNull()
    await click('稍后再说')
    await act(async () => window.dispatchEvent(new Event('focus')))
    expect(document.querySelector('dialog')).toBeNull()
  })

  it('labels an offline balance as the last balance and avoids an automatic recharge prompt', async () => {
    await act(async () => root.render(<AiCloudAccountButton {...actions(async () => signedIn(2, 'stale'))} />))
    expect(document.querySelector('[data-zerowall-footer-action]')?.textContent).toContain('最近一次余额')
    expect(document.querySelector('dialog')).toBeNull()
  })

  it('refreshes saved login and models from the account header without creating a payment', async () => {
    const props = actions(async () => signedIn(20, 'stale'))
    props.savedLogin = vi.fn(async () => ({ email: 'test@example.com', password: 'fixture-only', baseUrl: 'https://code.aicodeme.xyz', rememberPassword: true as const }))
    props.refreshModelCatalog = vi.fn(async () => {})
    await act(async () => root.render(<AiCloudAccountButton {...props} />))
    await act(async () => document.querySelector<HTMLButtonElement>('[data-zerowall-footer-action]')!.click())
    await click('刷新账户与模型')
    expect(props.relogin).toHaveBeenCalledTimes(1)
    expect(props.refreshModelCatalog).toHaveBeenCalledTimes(1)
    expect(props.createOrder).not.toHaveBeenCalled()
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
  })

  it('removes background balance listeners when the footer unmounts', async () => {
    const read = vi.fn(async () => signedIn(20))
    await act(async () => root.render(<AiCloudAccountButton {...actions(read)} />))
    await act(async () => root.unmount())
    const count = read.mock.calls.length
    window.dispatchEvent(new Event('focus'))
    window.dispatchEvent(new Event('online'))
    expect(read).toHaveBeenCalledTimes(count)
    root = createRoot(container)
  })

  it('keeps the refreshed balance visible and reports a failed shared model refresh', async () => {
    const props = actions(async () => signedIn(20, 'stale'))
    props.savedLogin = vi.fn(async () => ({ email: 'test@example.com', password: 'fixture-only', baseUrl: 'https://code.aicodeme.xyz', rememberPassword: true as const }))
    props.refreshModelCatalog = vi.fn(async () => { throw new Error('fetch failed') })
    await act(async () => root.render(<AiCloudAccountButton {...props} />))
    await act(async () => document.querySelector<HTMLButtonElement>('[data-zerowall-footer-action]')!.click())
    await click('刷新账户与模型')
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('20.00 CNY')
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(zh['account.networkError'])
    expect(document.body.textContent).not.toContain(zh['account.reloginSuccess'])
    expect(props.createOrder).not.toHaveBeenCalled()
  })
})
