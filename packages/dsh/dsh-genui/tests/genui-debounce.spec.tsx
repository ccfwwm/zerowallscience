// @vitest-environment jsdom
// GenUI action dispatch: DISCRETE gestures (button/checkbox/…) deliver one
// action per user interaction — no debounce window, nothing silently dropped
// (#178). The CONTINUOUS gesture (slider drag) still collapses per control
// into a single action with the last payload; sliders sharing an action name
// but not an id stay independent; unmount cancels pending timers.
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GenuiActionContext } from '../src/client/action-context.ts'
import { GenuiBlock, GENUI_ACTION_DEBOUNCE_MS } from '../src/client/GenuiBlock.tsx'
import type { GenuiSpec } from '../src/client/spec.ts'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})
beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
})

function renderWithActions(spec: GenuiSpec, actions: Array<[string, Record<string, unknown>]>) {
  return render(
    <GenuiActionContext.Provider value={(action, payload) => actions.push([action, payload])}>
      <GenuiBlock spec={spec} />
    </GenuiActionContext.Provider>,
  )
}

describe('action dispatch', () => {
  it('delivers every discrete interaction immediately — rapid repeats are not collapsed', () => {
    const actions: Array<[string, Record<string, unknown>]> = []
    renderWithActions({ items: [{ type: 'button', label: '刷新', action: 'refresh' }] }, actions)
    const button = document.querySelector('button')!
    fireEvent.click(button)
    fireEvent.click(button)
    fireEvent.click(button)
    expect(actions).toEqual([
      ['refresh', { type: 'button', label: '刷新' }],
      ['refresh', { type: 'button', label: '刷新' }],
      ['refresh', { type: 'button', label: '刷新' }],
    ])
    vi.advanceTimersByTime(GENUI_ACTION_DEBOUNCE_MS)
    expect(actions).toHaveLength(3) // the window adds nothing on top
  })

  it('keeps same-name discrete actions from displacing each other (#178)', () => {
    const actions: Array<[string, Record<string, unknown>]> = []
    renderWithActions({ items: [
      { type: 'checkbox', label: 'a', action: 'toggle' },
      { type: 'checkbox', label: 'b', action: 'toggle' },
    ] }, actions)
    const boxes = document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
    fireEvent.click(boxes[0]!)
    fireEvent.click(boxes[1]!)
    expect(actions.map(([, p]) => (p as { checked?: boolean }).checked)).toEqual([true, true])
    expect(actions).toHaveLength(2)
  })

  it('collapses a slider drag into one action with the last payload', () => {
    const actions: Array<[string, Record<string, unknown>]> = []
    renderWithActions({ items: [{ type: 'slider', label: '透明度', min: 0, max: 100, value: 10, action: 'opacity' }] }, actions)
    const slider = document.querySelector<HTMLInputElement>('input[type="range"]')!
    for (const v of [20, 40, 80]) fireEvent.change(slider, { target: { value: String(v) } })
    expect(actions).toHaveLength(0) // nothing fired inside the window
    vi.advanceTimersByTime(GENUI_ACTION_DEBOUNCE_MS)
    expect(actions).toEqual([['opacity', { type: 'slider', value: 80 }]])
  })

  it('keeps distinct sliders sharing an action name independent via their ids', () => {
    const actions: Array<[string, Record<string, unknown>]> = []
    renderWithActions({ items: [
      { type: 'slider', label: '红', min: 0, max: 255, id: 'r', value: 0, action: 'color' },
      { type: 'slider', label: '绿', min: 0, max: 255, id: 'g', value: 0, action: 'color' },
    ] }, actions)
    const sliders = document.querySelectorAll<HTMLInputElement>('input[type="range"]')
    fireEvent.change(sliders[0]!, { target: { value: '200' } })
    fireEvent.change(sliders[1]!, { target: { value: '100' } })
    vi.advanceTimersByTime(GENUI_ACTION_DEBOUNCE_MS)
    expect(actions).toHaveLength(2)
    expect(actions.map(([, p]) => (p as { id?: string }).id).sort()).toEqual(['g', 'r'])
  })

  it('fires a slider again after the window elapses', () => {
    const actions: Array<[string, Record<string, unknown>]> = []
    renderWithActions({ items: [{ type: 'slider', label: '音量', min: 0, max: 10, value: 1, action: 'vol' }] }, actions)
    const slider = document.querySelector<HTMLInputElement>('input[type="range"]')!
    fireEvent.change(slider, { target: { value: '3' } })
    vi.advanceTimersByTime(GENUI_ACTION_DEBOUNCE_MS)
    fireEvent.change(slider, { target: { value: '7' } })
    vi.advanceTimersByTime(GENUI_ACTION_DEBOUNCE_MS)
    expect(actions.map(([, p]) => (p as { value?: number }).value)).toEqual([3, 7])
  })

  it('does not fire without a provider (v1 behavior)', () => {
    const actions: Array<[string, Record<string, unknown>]> = []
    render(<GenuiBlock spec={{ items: [{ type: 'button', label: 'x', action: 'a' }] }} />)
    fireEvent.click(document.querySelector('button')!)
    vi.advanceTimersByTime(GENUI_ACTION_DEBOUNCE_MS)
    expect(actions).toHaveLength(0)
  })

  it('cancels pending slider actions on unmount', () => {
    const actions: Array<[string, Record<string, unknown>]> = []
    const view = renderWithActions({ items: [{ type: 'slider', label: 'x', min: 0, max: 10, value: 0, action: 'a' }] }, actions)
    fireEvent.change(document.querySelector<HTMLInputElement>('input[type="range"]')!, { target: { value: '5' } })
    view.unmount()
    vi.advanceTimersByTime(GENUI_ACTION_DEBOUNCE_MS)
    expect(actions).toHaveLength(0)
  })

  it('exposes a sane debounce window', () => {
    expect(GENUI_ACTION_DEBOUNCE_MS).toBeGreaterThan(0)
    expect(GENUI_ACTION_DEBOUNCE_MS).toBeLessThanOrEqual(1000)
  })
})
