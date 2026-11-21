// @vitest-environment jsdom
/** Real Factory composition, local Component identity, locale, and missing-definition fallback. */
import { useState } from 'react'
import { act, fireEvent, render } from '@testing-library/react'
import { expect, it, onTestFinished, vi } from 'vitest'
import { makeTranslate, SlotTestRuntime } from '@deepseek-ai/dsh-client-test-runtime'
import type { FactoryLocalComponentPropsOf, PropsRenderFactories } from '@deepseek-ai/dsh-client-ui-slots'
import { TreeFixture } from './tree-fixture.client.tsx'
import { FileTree } from '../src/client/FileTree.tsx'
import type { FileTreeInput } from '../src/client/FileTree.tsx'
import { en } from '../src/client/locales.ts'

function CounterAccessory({ entry }: FactoryLocalComponentPropsOf<'sidebar.files.tree', 'accessory'>) {
  const [count, setCount] = useState(0)
  return <button onClick={() => { setCount(value => value + 1) }}>{entry.path}: {count}</button>
}

function EmptyAccessory() { return null }

it('composes independent local accessories and preserves their state across input updates', async () => {
  const runtime = await SlotTestRuntime.create()
  onTestFinished(() => runtime.dispose())
  const revision = { revision: 0 }
  runtime.slots.installLocale({
    getSnapshot: () => revision, subscribe: () => () => {}, bind: () => makeTranslate(en),
  })
  const unregister = runtime.slots.registerFactory({
    name: 'sidebar.files.tree', scope: 'root', locale: 'sidebarFiles', slots: { accessory: { scope: 'root' } },
  }, FileTree)
  const onOpen = vi.fn()
  let input: FileTreeInput = {
    root: 'pr', entries: [{ path: 'pr/a', name: 'a' }], expanded: [], onToggle: vi.fn(), onOpen,
  }
  let rerender = () => {}
  await runtime.root.declare({}, function Root({ renderFactorySlot }: PropsRenderFactories) {
    const [, update] = useState(0)
    rerender = () => { update(value => value + 1) }
    return <>
      <section data-case="custom">{renderFactorySlot('sidebar.files.tree', input, { slots: { accessory: CounterAccessory }, fallback: <p>Unavailable</p> })}</section>
      <section data-case="default">{renderFactorySlot('sidebar.files.tree', input)}</section>
      <section data-case="empty">{renderFactorySlot('sidebar.files.tree', input, { slots: { accessory: EmptyAccessory } })}</section>
    </>
  })
  const view = runtime.renderRoot()
  fireEvent.click(view.getByRole('button', { name: 'pr/a: 0' }))
  expect(view.getByRole('button', { name: 'pr/a: 1' })).toBeTruthy()
  expect(onOpen).not.toHaveBeenCalled()
  for (const variant of ['default', 'empty']) {
    expect(view.container.querySelector(`[data-case="${variant}"] [data-files-path] button`)?.nextElementSibling?.childNodes).toHaveLength(0)
  }
  input = { ...input, entries: [{ path: 'pr/a', name: 'renamed' }] }
  act(() => { rerender() })
  expect(view.getByRole('button', { name: 'pr/a: 1' })).toBeTruthy()
  input = { ...input, entries: [] }
  act(() => { rerender() })
  expect(view.getAllByText(en.empty)).toHaveLength(3)
  await act(async () => { unregister() })
  expect(view.getByText('Unavailable')).toBeTruthy()
  expect(view.container.querySelector('[data-case="default"]')?.textContent).toBe('')
})


it('drags a file without a viewer while keeping directory clicks and file opening separate', () => {
  const finish = vi.fn(() => true)
  const onDragFile = vi.fn(() => finish)
  const onOpen = vi.fn()
  const onToggle = vi.fn()
  const view = render(<TreeFixture root="" entries={[
    { path: 'notes.bin', name: 'notes.bin', meta: { kind: 'file' } },
    { path: 'folder', name: 'folder', meta: { kind: 'directory' } },
  ]} expanded={[]} canOpen={() => false} onOpen={onOpen} onToggle={onToggle} onDragFile={onDragFile} />)
  onTestFinished(() => { view.unmount() })
  const file = view.container.querySelector('[data-files-entry="file"]') as HTMLElement
  const directory = view.container.querySelector('[data-files-entry="directory"]') as HTMLElement
  expect(file.draggable).toBe(true)
  expect(directory.draggable).toBe(false)
  const transfer = {}
  fireEvent.dragStart(file, { dataTransfer: transfer })
  expect(onDragFile).toHaveBeenCalledWith(expect.objectContaining({ path: 'notes.bin' }), transfer)
  fireEvent.dragEnd(file, { dataTransfer: transfer })
  expect(finish).toHaveBeenCalledOnce()
  expect(onOpen).not.toHaveBeenCalled()
  fireEvent.click(view.getByRole('button', { name: 'folder' }))
  expect(onToggle).toHaveBeenCalledOnce()
})
