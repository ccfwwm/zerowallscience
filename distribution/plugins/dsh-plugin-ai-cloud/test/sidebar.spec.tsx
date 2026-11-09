import { describe, expect, it, vi } from 'vitest'
import { apply as applyAccount } from '../src/account/client/index.js'
import { apply as applyClient } from '../src/client/index.js'
import { zh } from '../src/account/client/locales.js'

describe('AI Cloud navigation', () => {
  it('keeps account access in the footer and settings without adding sidebar pages or model shortcuts', () => {
    const register = vi.fn((_options: { name: string }, _component: unknown) => () => {})
    const ctx = {
      effect: vi.fn((factory: () => unknown) => factory()),
      locale: { register: vi.fn(() => () => {}), bind: () => (key: string) => key },
      slots: { inject: vi.fn((_slot: string, factory: () => unknown) => factory()), register },
      get: vi.fn(() => undefined), on: vi.fn(), inject: vi.fn(),
    }
    applyAccount(ctx as never)
    expect(register.mock.calls.map(call => call[0].name)).toEqual([
      'settings.models.provider-card', 'sidebar.footer.action', 'settings.onboarding', 'settings.section', 'plugins.bundle.config',
    ])
    expect(zh['account.nav']).toBe('登录 AI 云平台')
  })

  it('mounts only the account client while keeping the generated cloud remotes', async () => {
    const unmount = vi.fn()
    const ctx = { remote: { $mount: vi.fn(async () => unmount) }, effect: vi.fn(), plugin: vi.fn() }
    await applyClient(ctx as never)
    expect(ctx.remote.$mount).toHaveBeenCalledOnce()
    expect(ctx.plugin).toHaveBeenCalledOnce()
    expect(ctx.plugin).toHaveBeenCalledWith(expect.objectContaining({ apply: applyAccount }))
  })
})
