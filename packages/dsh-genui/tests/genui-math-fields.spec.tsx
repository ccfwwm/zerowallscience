import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { GenuiBlock } from '../src/client/GenuiBlock.tsx'
import { GenuiActionContext } from '../src/client/action-context.ts'
import type { GenuiNode } from '../src/client/spec.ts'

afterEach(cleanup)
const formula = String.raw`\(x^2\)`
const cases: [string, GenuiNode, number][] = [
  ['card', { type: 'card', title: formula, items: [] }, 1],
  ['steps', { type: 'steps', steps: [{ title: formula, desc: formula }] }, 2],
  ['timeline', { type: 'timeline', items: [{ title: formula, desc: formula, time: formula }] }, 3],
  ['tabs', { type: 'tabs', tabs: [{ label: formula, items: [] }] }, 1],
  ['accordion', { type: 'accordion', items: [{ title: formula, items: [] }] }, 1],
  ['keyvalue', { type: 'keyvalue', pairs: [{ key: formula, value: formula }] }, 2],
  ['table', { type: 'table', columns: [formula], rows: [[formula]] }, 2],
  ['stat', { type: 'stat', label: formula, value: formula }, 2],
  ['hero', { type: 'hero', title: formula, subtitle: formula, label: formula, value: formula }, 4],
  ['progress', { type: 'progress', label: formula, valueLabel: formula, value: 50 }, 2],
  ['button', { type: 'button', label: formula }, 1],
  ['input', { type: 'input', label: formula }, 1],
  ['checkbox', { type: 'checkbox', label: formula }, 1],
  ['quiz', { type: 'quiz', question: formula, options: [{ label: formula, correct: true }] }, 2],
]
it.each(cases)('renders math in %s without block elements inside text wrappers', (_name, node, count) => {
  const { container } = render(<GenuiBlock spec={{ items: [node] }} />)
  expect(container.querySelectorAll('.katex')).toHaveLength(count)
  expect(container.querySelector('span > div, strong > div, mark > div')).toBeNull()
})
it('keeps radio values and action payloads literal after formula rendering', async () => {
  const action = vi.fn()
  render(<GenuiActionContext.Provider value={action}>
    <GenuiBlock spec={{ title: formula, items: [{ type: 'radio', label: formula, options: [formula], action: 'choose' }] }} />
  </GenuiActionContext.Provider>)
  fireEvent.click(screen.getByRole('radio'))
  await vi.waitFor(() => expect(action).toHaveBeenCalledWith('choose', { type: 'radio', value: formula }))
})
