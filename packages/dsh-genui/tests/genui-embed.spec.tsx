import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { GenuiBlock, GenuiActionContext, type GenuiSpec } from '../src/client/embed.ts'
import { assetUrl, setGenuiAssetBase } from '../src/client/asset-loader.ts'

afterEach(cleanup)

it('embeds the same renderer with native persistence, local assets and action relay', async () => {
  localStorage.clear()
  const save = vi.fn()
  const action = vi.fn()
  const spec: GenuiSpec = { items: [
    { type: 'input', id: 'answer', label: '问题' },
    { type: 'button', label: '继续', action: 'explain' },
  ] }
  render(<GenuiActionContext.Provider value={action}>
    <GenuiBlock spec={spec} stateKey="message-1" initialState={{ fields: { answer: '已保存' } }} onStateChange={save} />
  </GenuiActionContext.Provider>)
  const input = screen.getByRole('textbox') as HTMLInputElement
  expect(input.value).toBe('已保存')
  fireEvent.change(input, { target: { value: '本次编辑' } })
  expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ fields: { answer: '本次编辑' } }))
  expect(localStorage.getItem('dsh.genui.interaction')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '继续' }))
  await vi.waitFor(() => expect(action).toHaveBeenCalledWith('explain', expect.any(Object)))
  setGenuiAssetBase('file:///Applications/WeiBei.app/Contents/Resources/GenUI/')
  expect(assetUrl('mermaid.js')).toBe('file:///Applications/WeiBei.app/Contents/Resources/GenUI/mermaid.js')
})

it('does not echo unchanged state when a host saves with an inline callback', () => {
  let calls = 0
  const spec: GenuiSpec = { items: [{ type: 'input', id: 'answer' }] }
  function Host() {
    const [saved, setSaved] = useState({})
    return <GenuiBlock spec={spec} stateKey="host" initialState={saved} onStateChange={state => {
      calls++
      if (calls < 8) setSaved(state)
    }} />
  }
  render(<Host />)
  expect(calls).toBe(1)
})
