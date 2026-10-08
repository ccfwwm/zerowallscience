// @vitest-environment jsdom
// Debounce handler lifecycle (the slider is the only debounced payload type
// since #178; discrete gestures deliver synchronously): a pending timer reads
// the LATEST provider handler through a ref, and unmount cancels it.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GenuiActionContext } from '../src/client/action-context.ts'
import { GENUI_ACTION_DEBOUNCE_MS, GenuiBlock } from '../src/client/GenuiBlock.tsx'
import { repairGenuiSpec } from '../src/client/guard.ts'

const spec = repairGenuiSpec({
  items: [{ type: 'slider', label: '透明度', min: 0, max: 100, value: 10, action: 'opacity' }],
})!

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function dragTo(value: string): void {
  fireEvent.change(document.querySelector<HTMLInputElement>('input[type="range"]')!, { target: { value } })
}

describe('action debounce handler lifecycle', () => {
  it('delivers a pending action to the latest provider handler', () => {
    const handlerA = vi.fn()
    const handlerB = vi.fn()
    const view = render(
      <GenuiActionContext.Provider value={handlerA}>
        <GenuiBlock spec={spec} />
      </GenuiActionContext.Provider>,
    )

    dragTo('40')
    view.rerender(
      <GenuiActionContext.Provider value={handlerB}>
        <GenuiBlock spec={spec} />
      </GenuiActionContext.Provider>,
    )
    vi.advanceTimersByTime(GENUI_ACTION_DEBOUNCE_MS)

    expect(handlerA).not.toHaveBeenCalled()
    expect(handlerB).toHaveBeenCalledTimes(1)
    expect(handlerB).toHaveBeenCalledWith('opacity', { type: 'slider', value: 40 })
  })

  it('cancels an old pending timer after the provider changes and the block unmounts', () => {
    const handlerA = vi.fn()
    const handlerB = vi.fn()
    const view = render(
      <GenuiActionContext.Provider value={handlerA}>
        <GenuiBlock spec={spec} />
      </GenuiActionContext.Provider>,
    )

    dragTo('40')
    view.rerender(
      <GenuiActionContext.Provider value={handlerB}>
        <GenuiBlock spec={spec} />
      </GenuiActionContext.Provider>,
    )
    view.unmount()
    vi.advanceTimersByTime(GENUI_ACTION_DEBOUNCE_MS)

    expect(handlerA).not.toHaveBeenCalled()
    expect(handlerB).not.toHaveBeenCalled()
  })

  it('delivers a discrete gesture to the handler active at click time, synchronously', () => {
    const handlerA = vi.fn()
    const handlerB = vi.fn()
    const buttonSpec = repairGenuiSpec({ items: [{ type: 'button', label: '刷新', action: 'refresh' }] })!
    const view = render(
      <GenuiActionContext.Provider value={handlerA}>
        <GenuiBlock spec={buttonSpec} />
      </GenuiActionContext.Provider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    view.rerender(
      <GenuiActionContext.Provider value={handlerB}>
        <GenuiBlock spec={buttonSpec} />
      </GenuiActionContext.Provider>,
    )
    vi.advanceTimersByTime(GENUI_ACTION_DEBOUNCE_MS)

    expect(handlerA).toHaveBeenCalledTimes(1)
    expect(handlerB).not.toHaveBeenCalled()
  })
})
