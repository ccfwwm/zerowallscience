import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { renderSvgFence } from '../src/client/svg-fence.tsx'

const raw = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><text x="2" y="20">模块图</text></svg>'
afterEach(cleanup)

describe('SVG fence', () => {
  it('switches between an isolated preview and copyable source', () => {
    const { getByRole, container } = render(<>{renderSvgFence(raw, 'svg')}</>)
    expect(getByRole('img')).not.toBeNull()
    fireEvent.click(getByRole('button', { name: '源码', exact: true }))
    expect(container.querySelector('pre')?.textContent).toContain(raw)
    expect(getByRole('button', { name: '复制', exact: true })).not.toBeNull()
    fireEvent.click(getByRole('button', { name: '预览', exact: true }))
    expect(getByRole('img')).not.toBeNull()
  })

  it('waits for the streaming marker to disappear without requiring a React rerender', async () => {
    const { container, queryByRole, getByRole } = render(<div data-streaming="true">{renderSvgFence('<svg', 'svg')}</div>)
    expect(queryByRole('img')).toBeNull()
    expect(queryByRole('status')).toBeNull()
    expect(container.querySelector('pre')?.textContent).toContain('<svg')
    container.firstElementChild!.removeAttribute('data-streaming')
    await waitFor(() => { expect(getByRole('status').textContent).toContain('SVG') })
  })

  it('preserves malformed source with a visible error', () => {
    const { getByRole, container } = render(<>{renderSvgFence('<svg><broken>', 'bad')}</>)
    expect(getByRole('status').textContent).toContain('SVG')
    expect(container.querySelector('pre')?.textContent).toBe('<svg><broken>')
    fireEvent.click(getByRole('button', { name: '源码', exact: true }))
    expect(getByRole('button', { name: '复制', exact: true })).not.toBeNull()
  })
})
