// @vitest-environment jsdom
import { expect, it, vi } from 'vitest'
import { apply } from '../src/client/index.js'

it('registers the compact footer and settings without retired customer entries', async () => {
  const register = vi.fn(() => () => {})
  const ctx = {
    effect: (mount: () => unknown) => mount(),
    locale: { register: vi.fn(() => () => {}), bind: () => (key: string) => key },
    slots: { inject: (_name: string, mount: () => unknown) => mount(), register },
  }
  await apply(ctx as any)
  const entries = register.mock.calls.map((call: any) => call[0])
  expect(entries.filter((entry: any) => entry.name === 'sidebar.footer.action').map((entry: any) => entry.id)).toEqual(['zerowall-update'])
  expect(entries.some((entry: any) => entry.name === 'settings.launcher')).toBe(true)
  expect(entries.some((entry: any) => ['zerowall-github', 'zerowall-wechat-status', 'zerowall-plugin-settings'].includes(entry.id))).toBe(false)
})
