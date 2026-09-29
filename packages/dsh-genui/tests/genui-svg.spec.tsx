import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { GenuiBlock } from '../src/client/GenuiBlock.tsx'
import { repairGenuiSpec } from '../src/client/guard.ts'

afterEach(cleanup)

const code = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><rect width="200" height="100" fill="#346"/><text x="10" y="50">模块图</text></svg>'

function renderSvg(source = code) {
  const spec = repairGenuiSpec({ items: [{ type: 'svg', code: source, title: '模块图' }] })
  expect(spec).not.toBeNull()
  expect(spec!.items[0]?.type).toBe('svg')
  return render(<GenuiBlock spec={spec!} />)
}

describe('SVG content', () => {
  it('keeps malformed XML visible as source with a diagnostic', () => {
    const { getByRole, container } = renderSvg('<svg><rect></svg>')
    expect(getByRole('status').textContent).toContain('SVG')
    expect(container.querySelector('pre')?.textContent).toBe('<svg><rect></svg>')
    expect(container.querySelector('img')).toBeNull()
  })

  it('falls back on image failure and recovers when the source changes', () => {
    const { getByRole, rerender, queryByRole } = renderSvg()
    fireEvent.error(getByRole('img'))
    expect(getByRole('status')).not.toBeNull()
    const spec = repairGenuiSpec({ items: [{ type: 'svg', code: code.replace('#346', '#654') }] })!
    rerender(<GenuiBlock spec={spec} />)
    expect(getByRole('img')).not.toBeNull()
    expect(queryByRole('status')).toBeNull()
  })

  it('rejects non-SVG documents and doctypes before image loading', () => {
    for (const source of ['<html xmlns="http://www.w3.org/1999/xhtml"/>', '<!DOCTYPE svg><svg xmlns="http://www.w3.org/2000/svg"/>']) {
      const { queryByRole, getByRole, unmount } = renderSvg(source)
      expect(queryByRole('img')).toBeNull()
      expect(getByRole('status')).not.toBeNull()
      unmount()
    }
  })

  it('requires code and bounds optional height', () => {
    expect(repairGenuiSpec({ items: [{ type: 'svg', title: 'missing' }] })?.items ?? []).toHaveLength(0)
    const spec = repairGenuiSpec({ items: [{ type: 'svg', code, height: 10000 }] })!
    expect(spec.items[0]).toMatchObject({ type: 'svg', height: 800 })
  })

  it('renders SVG as an isolated image, not host DOM markup', () => {
    const { getByRole, container } = renderSvg()
    const image = getByRole('img', { name: '模块图' })
    expect(image.getAttribute('src')).toBe(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(code)}`)
    expect(container.querySelector('svg text')).toBeNull()
  })

  it('renders HTML-style SVG without an explicit xmlns (issue #185)', () => {
    // In HTML the parser infers the SVG namespace, so models routinely emit
    // <svg> without xmlns; in XML mode that markup is well-formed but
    // un-namespaced and used to be rejected 100% of the time.
    const source = '<svg viewBox="0 0 200 60"><rect width="200" height="60" fill="#111"/><text x="100" y="38" text-anchor="middle" fill="#fff">hello</text></svg>'
    const { getByRole, container } = renderSvg(source)
    const src = getByRole('img', { name: '模块图' }).getAttribute('src') ?? ''
    expect(src.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true)
    expect(decodeURIComponent(src)).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(container.querySelector('svg text')).toBeNull()
  })

  it('still rejects a root with an explicitly foreign namespace', () => {
    const { queryByRole, getByRole } = renderSvg('<svg xmlns="http://www.w3.org/1999/xhtml"><text>hi</text></svg>')
    expect(queryByRole('img')).toBeNull()
    expect(getByRole('status')).not.toBeNull()
  })
})
