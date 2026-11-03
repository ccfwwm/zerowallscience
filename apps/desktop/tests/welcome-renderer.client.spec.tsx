// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Welcome } from '../src/client/WelcomePage.tsx'
import { resolveDesktopLocale } from '../src/locale.ts'
import type { WelcomeApi } from '../src/welcome-api.ts'
afterEach(cleanup)
function mount(language = 'zh-CN') {
  const api = {
    ...resolveDesktopLocale(language), skip: vi.fn(async () => {}),
    saveApiKey: vi.fn(), startSignIn: vi.fn(), cancelSignIn: vi.fn(), copySignInLink: vi.fn(),
    takeNotice: vi.fn(), analyticsEnabled: vi.fn(), onAccountState: vi.fn(() => () => {}),
  } satisfies WelcomeApi
  render(<Welcome api={api} />)
  return { api, button: screen.getByRole('button') }
}
describe('ZeroWall desktop entry', () => {
  it.each(['zh-CN', 'en'])('offers only cloud workspace entry in %s', async (language) => {
    const { api, button } = mount(language)
    expect(button.textContent).toBe(api.messages.welcomeCloudStart)
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(document.querySelector('input')).toBeNull()
    expect(document.body.textContent).not.toContain('DeepSeek')
    expect(api.onAccountState).not.toHaveBeenCalled()
    await expect([
      document.title, screen.getByRole('img').getAttribute('alt'),
      screen.getByRole('heading').textContent, api.messages.welcomeCloudHint, button.textContent,
    ].join('\n') + '\n').toMatchFileSnapshot(`./expected/welcome/${language}.expected.txt`)
  })
  it('coalesces entry clicks without starting official authentication', async () => {
    const { api, button } = mount()
    const pending = Promise.withResolvers<undefined>()
    vi.mocked(api.skip).mockReturnValueOnce(pending.promise)
    fireEvent.click(button); fireEvent.click(button)
    expect(api.skip).toHaveBeenCalledOnce()
    expect(api.startSignIn).not.toHaveBeenCalled()
    expect(api.saveApiKey).not.toHaveBeenCalled()
    await act(async () => { pending.resolve(undefined); await pending.promise })
  })
  it('retains a failed entry and clears its error on retry', async () => {
    const { api, button } = mount()
    vi.mocked(api.skip).mockRejectedValueOnce(new Error('host unavailable'))
    fireEvent.click(button)
    await screen.findByRole('alert')
    expect(screen.getByRole('alert').textContent).toBe(api.messages.welcomeContinueFailed)
    fireEvent.click(button)
    await vi.waitFor(() => { expect(api.skip).toHaveBeenCalledTimes(2) })
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
