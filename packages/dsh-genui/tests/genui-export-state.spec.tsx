import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { GenuiBlock } from '../src/client/GenuiBlock.tsx'
import type { BlockInteractionState } from '../src/client/interaction-store.ts'

afterEach(cleanup)

describe('GenuiBlock state snapshots', () => {
  it('reports the current input state immediately after input without waiting for durable-save debounce', () => {
    const snapshots: BlockInteractionState[] = []
    render(<GenuiBlock spec={{ items: [{ type: 'input', label: 'Keyword', id: 'keyword' }] }} onStateSnapshot={state => snapshots.push(state)} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'current value' } })
    expect(snapshots.at(-1)?.fields).toEqual({ keyword: 'current value' })
  })

  it('keeps password content out of state snapshots', () => {
    const snapshots: BlockInteractionState[] = []
    render(<GenuiBlock spec={{ items: [{ type: 'input', label: 'Password', inputType: 'password', id: 'secret' }] }} onStateSnapshot={state => snapshots.push(state)} />)
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'sensitive' } })
    expect(snapshots.at(-1)?.fields).toBeUndefined()
  })
})
