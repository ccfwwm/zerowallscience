// @vitest-environment jsdom
/** Native rows and pointer-owned tabs share canonical references and composer admission. */
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import type { ReferenceDropTarget } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { SessionId } from '@deepseek-ai/dsh-session'
import { absoluteFileAddress, sessionFileAddress } from '@deepseek-ai/dsh-util-workspace-path'
import { formatSessionReferenceMention } from '@deepseek-ai/dsh-session-reference/mention'
import { ReferenceDrags } from '../src/client/reference-drag.ts'

afterEach(() => vi.restoreAllMocks())

function setup(cwd = 'C:/work') {
  const target = document.createElement('div')
  document.body.append(target)
  onTestFinished(() => { target.remove() })
  // jsdom has no hit testing; pin only the test-owned card's result.
  const previous = Object.getOwnPropertyDescriptor(document, 'elementFromPoint')
  const hit = vi.fn<Document['elementFromPoint']>(() => target)
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: hit })
  onTestFinished(() => {
    if (previous === undefined) Reflect.deleteProperty(document, 'elementFromPoint')
    else Object.defineProperty(document, 'elementFromPoint', previous)
  })
  const drags = new ReferenceDrags(() => cwd, key => key)
  onTestFinished(() => { drags.dispose() })
  const insert = vi.fn<ReferenceDropTarget['insert']>(() => true)
  const preview = vi.fn<ReferenceDropTarget['preview']>()
  const report = vi.fn<ReferenceDropTarget['report']>()
  const available = vi.fn(() => true)
  const unregister = drags.register({ element: target, sessionId: SessionId('target'), insert, preview, report, available })
  return { drags, target, hit, insert, preview, report, available, unregister }
}

function nativeTransfer(): DataTransfer {
  const data = new Map<string, string>()
  return {
    effectAllowed: 'none', dropEffect: 'copy',
    get types() { return [...data.keys()] },
    files: Object.assign([] as File[], { item: () => null }),
    items: Object.assign([] as DataTransferItem[], { add: () => null, clear: () => {}, remove: () => {} }),
    clearData: (type?: string) => { if (type === undefined) data.clear(); else data.delete(type) },
    setDragImage: () => {},
    getData: (type: string) => data.get(type) ?? '',
    setData: (type: string, value: string) => { data.set(type, value) },
  }
}

function dragEvent(type: string, transfer: DataTransfer): Event {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperties(event, {
    dataTransfer: { value: transfer }, clientX: { value: 10 }, clientY: { value: 10 },
  })
  return event
}

describe('reference dragging', () => {
  it('consumes a native session drop before sorting listeners and preserves opaque identity', () => {
    const { drags, target, insert, preview } = setup()
    const transfer = nativeTransfer()
    const sessionId = SessionId('研究 "] session')
    const label = '结果 [一] \\ 二'
    const end = drags.start({ kind: 'session', sessionId, label }, transfer)
    const reorder = vi.fn()
    document.addEventListener('drop', reorder)
    onTestFinished(() => { document.removeEventListener('drop', reorder) })
    target.dispatchEvent(dragEvent('dragover', transfer))
    expect(preview).toHaveBeenLastCalledWith('drag.session', false)
    expect(transfer.effectAllowed).toBe('copyMove')
    const drop = dragEvent('drop', transfer)
    target.dispatchEvent(drop)
    expect(drop.defaultPrevented).toBe(true)
    expect(reorder).not.toHaveBeenCalled()
    expect(end()).toBe(true)
    expect(insert).toHaveBeenCalledWith({
      source: 'reference', ref: formatSessionReferenceMention({ sessionId, label }),
      label, appearance: 'session', clipboardText: formatSessionReferenceMention({ sessionId, label }),
    }, { x: 10, y: 10 })
    expect(preview).toHaveBeenLastCalledWith(null, false)
  })

  it.each([
    ['C:/work/研究 文件.py', '@"研究 文件.py"'],
    ['D:/other/结果.json', '@D:/other/结果.json'],
  ])('references the original Host path %s without reading bytes', (path, ref) => {
    const { drags, insert } = setup()
    const gesture = drags.pointer({ kind: 'file', address: absoluteFileAddress(path) })
    expect(gesture?.drop(10, 10)).toBe(true)
    expect(insert.mock.calls[0]?.[0]).toMatchObject({ ref, appearance: 'file', clipboardText: ref })
  })

  it('resolves session-scoped file tags in their source workspace', () => {
    const { drags, insert } = setup('/source')
    drags.pointer({ kind: 'file', address: sessionFileAddress('source', 'notes/a.md') })?.drop(10, 10)
    expect(insert.mock.calls[0]?.[0].ref).toBe('@notes/a.md')
    expect(drags.pointer({ kind: 'file', address: 'https://example.com' })).toBeUndefined()
  })

  it.each(['self', 'locked'] as const)('consumes %s drops without editing or moving their source', (mode) => {
    const { drags, available, insert, preview, report } = setup()
    available.mockReturnValue(mode !== 'locked')
    const gesture = drags.pointer({ kind: 'session', sessionId: SessionId(mode === 'self' ? 'target' : 'source'), label: mode })
    gesture?.move(10, 10)
    expect(preview).toHaveBeenLastCalledWith(mode === 'self' ? 'drag.self' : 'drag.blocked', true)
    expect(gesture?.drop(10, 10)).toBe(true)
    expect(insert).not.toHaveBeenCalled()
    expect(report).toHaveBeenCalledOnce()
  })

  it('does not intercept foreign file uploads or stale drag tokens', () => {
    const { drags, target, insert } = setup()
    const foreign = nativeTransfer()
    foreign.setData('Files', 'file')
    const ordinary = dragEvent('drop', foreign)
    target.dispatchEvent(ordinary)
    expect(ordinary.defaultPrevented).toBe(false)
    const stale = nativeTransfer()
    drags.start({ kind: 'session', sessionId: SessionId('old'), label: 'old' }, stale)
    drags.start({ kind: 'session', sessionId: SessionId('new'), label: 'new' }, nativeTransfer())
    target.dispatchEvent(dragEvent('drop', stale))
    expect(insert).not.toHaveBeenCalled()
  })

  it.each(['cancel', 'escape', 'blur', 'unregister', 'dispose'] as const)('clears feedback and rejects late releases after %s', (operation) => {
    const { drags, insert, preview, unregister } = setup()
    const gesture = drags.pointer({ kind: 'session', sessionId: SessionId('source'), label: 'source' })
    gesture?.move(10, 10)
    if (operation === 'cancel') gesture?.cancel()
    if (operation === 'escape') window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    if (operation === 'blur') window.dispatchEvent(new Event('blur'))
    if (operation === 'unregister') unregister()
    if (operation === 'dispose') drags.dispose()
    expect(preview).toHaveBeenLastCalledWith(null, false)
    expect(gesture?.drop(10, 10)).toBe(false)
    expect(insert).not.toHaveBeenCalled()
  })

  it('leaves releases outside the composer to the layout owner', () => {
    const { drags, hit, insert } = setup()
    const gesture = drags.pointer({ kind: 'session', sessionId: SessionId('source'), label: 'source' })
    gesture?.move(10, 10)
    hit.mockReturnValue(document.body)
    expect(gesture?.drop(100, 100)).toBe(false)
    expect(insert).not.toHaveBeenCalled()
  })
})
