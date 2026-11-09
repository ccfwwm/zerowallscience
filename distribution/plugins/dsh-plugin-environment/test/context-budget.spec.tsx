// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ContextBudgetControl } from '../src/client/context-budget.js'
import { zh, type EnvironmentTranslate } from '../src/client/locales.js'

afterEach(cleanup)
const t: EnvironmentTranslate = key => zh[key]

it('loads a session budget and confirms a changed value before retaining it', async () => {
  const saveBudget = vi.fn(async () => ({ ok: true, value: undefined }))
  const readBudget = vi.fn(async () => ({ ok: true, value: 300_000 }))
  const readInfo = vi.fn(async () => ({ ok: true, value: {} }))
  render(createElement(ContextBudgetControl, { sessionId: 'budget-session', readBudget, readInfo, saveBudget, t } as never))
  const slider = screen.getByRole('slider', { name: zh.contextBudgetTitle }) as HTMLInputElement
  await waitFor(() => expect(slider.disabled).toBe(false))
  expect(slider.value).toBe('300000')
  fireEvent.change(slider, { target: { value: '160000' } })
  fireEvent.pointerUp(slider)
  await waitFor(() => expect(saveBudget).toHaveBeenCalledWith('budget-session', 160_000))
  await waitFor(() => expect(slider.disabled).toBe(false))
  expect(slider.value).toBe('160000')
  expect(screen.queryByRole('alert')).toBeNull()
})

it('reports an unconfirmed save and keeps the last confirmed display value', async () => {
  const saveBudget = vi.fn(async () => ({ ok: false, error: { code: 'error', message: 'rejected' } }))
  const readBudget = vi.fn(async () => ({ ok: true, value: 300_000 }))
  const readInfo = vi.fn(async () => ({ ok: true, value: {} }))
  render(createElement(ContextBudgetControl, { sessionId: 'budget-session', readBudget, readInfo, saveBudget, t } as never))
  const slider = screen.getByRole('slider', { name: zh.contextBudgetTitle }) as HTMLInputElement
  await waitFor(() => expect(slider.disabled).toBe(false))
  fireEvent.change(slider, { target: { value: '160000' } })
  fireEvent.keyUp(slider, { key: 'ArrowLeft' })
  expect((await screen.findByRole('alert')).textContent).toBe(zh.contextBudgetSaveFailed)
  expect(slider.value).toBe('300000')
})

it('ignores completion from a conversation that was replaced while saving', async () => {
  const pending = Promise.withResolvers<{ ok: true; value: undefined }>()
  const saveBudget = vi.fn(() => pending.promise)
  const readBudget = vi.fn(async (id: string) => ({ ok: true, value: id === 'first' ? 300_000 : 200_000 }))
  const readInfo = vi.fn(async () => ({ ok: true, value: {} }))
  const props = { readBudget, readInfo, saveBudget, t }
  const view = render(createElement(ContextBudgetControl, { ...props, sessionId: 'first' } as never))
  const slider = screen.getByRole('slider', { name: zh.contextBudgetTitle }) as HTMLInputElement
  await waitFor(() => expect(slider.disabled).toBe(false))
  fireEvent.change(slider, { target: { value: '160000' } })
  fireEvent.pointerUp(slider)
  view.rerender(createElement(ContextBudgetControl, { ...props, sessionId: 'second' } as never))
  await waitFor(() => expect(slider.value).toBe('200000'))
  pending.resolve({ ok: true, value: undefined })
  await pending.promise
  expect(slider.value).toBe('200000')
})
