import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { createGenuiArtifact } from '../src/client/artifact/create.ts'
import '../src/client/standalone/runtime.tsx'
import { CodeBlock, JsonTree } from '../src/client/standalone/primitive-adapter.tsx'
import { setLocale } from '../src/client/i18n/index.ts'

afterEach(() => {
  cleanup()
  document.body.removeAttribute('data-ds-dark-theme')
  localStorage.clear()
  setLocale('zh')
})

describe('standalone runtime', () => {
  it('shows one JSON body with a separate copy control', () => {
    const view = render(<JsonTree data={{ answer: 42 }} copyable />)
    expect(view.container.querySelectorAll('pre')).toHaveLength(1)
    expect(screen.getByRole('button', { name: '复制' })).toBeTruthy()
  })

  it('keeps CodeBlock copy feedback unchanged when clipboard APIs are unavailable', async () => {
    const view = render(<CodeBlock code="copy me" />)
    const button = screen.getByRole('button', { name: '复制' })

    fireEvent.click(button)
    await act(async () => { await Promise.resolve() })

    expect(button.textContent).toBe('复制')
    expect(view.container.querySelector('textarea')).toBeNull()
  })

  it('restores artifact presentation and durable state while keeping model actions inactive', () => {
    const artifact = createGenuiArtifact({ items: [
      { type: 'button', label: 'Run', action: 'run' },
      { type: 'input', label: 'Keyword', id: 'keyword' },
    ] }, { fields: { keyword: 'saved value' } }, { locale: 'en', theme: 'dark' })
    const root = document.createElement('main')
    document.body.appendChild(root)
    let unmount = () => {}
    act(() => { unmount = window.__GenuiStandalone__!.mount(root, artifact) })
    expect(document.body.hasAttribute('data-ds-dark-theme')).toBe(true)
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('saved value')
    expect((screen.getByRole('button', { name: 'Run' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    act(() => unmount())
  })

  it('keeps local tabs, accordion, and grading available without an action provider', () => {
    const artifact = createGenuiArtifact({ items: [
      { type: 'tabs', tabs: [{ label: 'One', items: [{ type: 'text', content: 'Tab one' }] }, { label: 'Two', items: [{ type: 'text', content: 'Tab two' }] }] },
      { type: 'accordion', items: [{ title: 'Details', items: [{ type: 'text', content: 'Expanded locally' }] }] },
      { type: 'radio', group: 'q1', options: ['A', 'B'], answer: 'A' },
      { type: 'submit', label: 'Grade', groups: ['q1'] },
    ] })
    const root = document.createElement('main')
    document.body.appendChild(root)
    let unmount = () => {}
    act(() => { unmount = window.__GenuiStandalone__!.mount(root, artifact) })
    fireEvent.click(screen.getByRole('tab', { name: 'Two' }))
    expect(screen.getByText('Tab two')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Details/ }))
    expect(screen.queryByText('Expanded locally')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Details/ }))
    expect(screen.getByText('Expanded locally')).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: 'A' }))
    fireEvent.click(screen.getByRole('button', { name: 'Grade' }))
    expect(screen.getByText(/得分/)).toBeTruthy()
    act(() => unmount())
  })
})
