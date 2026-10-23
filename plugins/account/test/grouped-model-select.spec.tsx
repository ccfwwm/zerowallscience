// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, onTestFinished, vi } from 'vitest'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { SlotTestRuntime } from '../../../deepseek-harness/packages/test-support/client-runtime/src/index.js'
import { apply, inject } from '../src/client/index.js'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import { GroupedModelSelect } from '../src/client/GroupedModelSelect.js'
import { GroupCatalogStore, displayGroups } from '../src/client/group-catalog.js'
import { defaultModelText as t } from '../src/client/model-locales.js'

afterEach(cleanup)
const model = (id: string) => ({ id, name: id, reasoning: { defaultEffort: 'high', efforts: [{ id: 'high', name: 'High' }, { id: 'xhigh', name: 'Xhigh' }] } })
function setup() {
  const state = createSnapshotStore<ModelDirectoryState>({ current: { provider: 'cloud-a', model: 'same', reasoningEffort: 'xhigh' }, routable: true, pending: null, failures: [], status: 'ready', error: null, groups: [
    { id: 'deepseek-official', name: 'DeepSeek', models: [model('deepseek-v4')] },
    { id: 'cloud-a', name: 'protocol A', models: [model('same')] },
    { id: 'cloud-b', name: 'protocol B', models: [model('claude')] },
    { id: 'cloud-pro', name: 'Pro', models: [model('same')] },
  ] } as any)
  const catalog = new GroupCatalogStore()
  catalog.update({ status: 'signedIn', gatewayBaseUrl: 'https://code.aicodeme.xyz', models: [
    { providerId: 'cloud-a', modelId: 'same', groupId: '1', groupName: 'Economy' },
    { providerId: 'cloud-b', modelId: 'claude', groupId: '1', groupName: 'Economy' },
    { providerId: 'cloud-pro', modelId: 'same', groupId: '2', groupName: 'Pro' },
  ], groups: [{ groupId: '1', groupName: 'Economy', description: 'Economy description', rateMultiplier: 0 }, { groupId: '2', groupName: 'Pro', description: 'Pro description', rateMultiplier: 0.6 }] } as any)
  const select = vi.fn().mockImplementation(async selection => { state.update(s => { s.current = selection }); return { ok: true, value: undefined } })
  const load = vi.fn()
  const actions = { available: true, directory: state, catalog, select, load, t }
  const view = render(<GroupedModelSelect {...actions} />)
  const open = () => fireEvent.click(screen.getByRole('button', { name: '选择模型：same · 0× · Xhigh' }))
  return { ...actions, state, view, open }
}

it('merges protocol routes by business group while keeping exact model and provider identities', () => {
  const { state, catalog } = setup()
  const groups = displayGroups(state.getSnapshot().groups, catalog.getSnapshot())
  expect(groups.map(g => [g.name, g.models.length])).toEqual([['DeepSeek', 1], ['Economy', 2], ['Pro', 1]])
  expect(groups[1]!.models.map(row => row.providerId)).toEqual(['cloud-a', 'cloud-b'])
})

it('browses and cancels without switching, then selects the exact same-named model in a different group', async () => {
  const { open, select, state, load } = setup()
  open()
  expect(load).not.toHaveBeenCalled()
  expect(screen.getAllByRole('button').filter(node => ['分组', '模型', '推理强度'].some(text => node.textContent?.startsWith(text))).map(node => node.textContent?.slice(0, 2))).toEqual(['分组', '模型', '推理'])
  fireEvent.click(screen.getByRole('button', { name: /^分组 Economy/ }))
  fireEvent.click(screen.getByRole('menuitemradio', { name: /Pro/ }))
  expect(select).not.toHaveBeenCalled()
  fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Escape' })
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  expect(state.getSnapshot().current).toMatchObject({ provider: 'cloud-a', reasoningEffort: 'xhigh' })
  open()
  fireEvent.click(screen.getByRole('button', { name: /^分组 Economy/ }))
  fireEvent.click(screen.getByRole('menuitemradio', { name: /Pro/ }))
  fireEvent.click(screen.getByRole('menuitemradio', { name: /same/ }))
  await waitFor(() => expect(select).toHaveBeenCalledWith({ provider: 'cloud-pro', model: 'same', reasoningEffort: 'xhigh' }))
  expect(await screen.findByRole('button', { name: '选择模型：same · 0.6× · Xhigh' })).toBeTruthy()
})

it('opens accessible plain-text details and restores focus on Escape without selecting or closing the menu', () => {
  const { open, select } = setup()
  open()
  const info = screen.getByRole('button', { name: '分组介绍：Economy' })
  fireEvent.click(info)
  const dialog = screen.getByRole('dialog', { name: '分组介绍：Economy' })
  expect(within(dialog).getByText('Economy description')).toBeTruthy()
  expect(within(dialog).getByLabelText('分组倍率：0×')).toBeTruthy()
  fireEvent.keyDown(within(dialog).getByRole('button', { name: '关闭介绍' }), { key: 'Escape' })
  expect(document.activeElement).toBe(info)
  expect(screen.getByRole('dialog', { name: '分组、模型与推理强度' })).toBeTruthy()
  expect(select).not.toHaveBeenCalled()
})

it('previews details on hover without moving focus and keeps them open while moving into the panel', () => {
  vi.useFakeTimers()
  try {
    const { open, select, load } = setup()
    open()
    const focus = document.activeElement
    const info = screen.getByRole('button', { name: '分组介绍：Economy' })
    fireEvent.mouseEnter(info)
    const dialog = screen.getByRole('dialog', { name: '分组介绍：Economy' })
    expect(within(dialog).getByText('Economy description')).toBeTruthy()
    expect(document.activeElement).toBe(focus)
    fireEvent.mouseLeave(info)
    fireEvent.mouseEnter(dialog)
    act(() => vi.advanceTimersByTime(200))
    expect(screen.getByRole('dialog', { name: '分组介绍：Economy' })).toBe(dialog)
    fireEvent.mouseLeave(dialog)
    act(() => vi.advanceTimersByTime(200))
    expect(screen.queryByRole('dialog', { name: '分组介绍：Economy' })).toBeNull()
    expect(select).not.toHaveBeenCalled()
    expect(load).not.toHaveBeenCalled()
  } finally { vi.useRealTimers() }
})

it('shows details on keyboard focus and dismisses them with Escape without closing the selector', () => {
  const { open } = setup()
  open()
  const info = screen.getByRole('button', { name: '分组介绍：Economy' })
  act(() => info.focus())
  expect(screen.getByRole('dialog', { name: '分组介绍：Economy' })).toBeTruthy()
  fireEvent.keyDown(info, { key: 'Escape' })
  expect(screen.queryByRole('dialog', { name: '分组介绍：Economy' })).toBeNull()
  expect(document.activeElement).toBe(info)
  expect(screen.getByRole('dialog', { name: '分组、模型与推理强度' })).toBeTruthy()
})

it('does not reload the catalog while reopening, searching or browsing groups', () => {
  const { open, load, select } = setup()
  for (let index = 0; index < 3; index++) {
    open()
    fireEvent.click(screen.getByRole('button', { name: /^分组 Economy/ }))
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Pro' } })
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Pro/ }))
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Escape' })
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  }
  expect(load).not.toHaveBeenCalled()
  expect(select).not.toHaveBeenCalled()
})

it('supports keyboard model selection and keeps a rejected selection retryable', async () => {
  const { open, select } = setup()
  select.mockResolvedValueOnce({ ok: false, error: { code: 'session/writer-held', message: 'Busy' } })
  open()
  fireEvent.click(screen.getByRole('button', { name: /^模型 same/ }))
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'claude' } })
  fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Enter' })
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'session/writer-held: Busy重试')
  fireEvent.click(screen.getByRole('button', { name: '重试' }))
  await waitFor(() => expect(select).toHaveBeenCalledTimes(2))
  expect(select).toHaveBeenLastCalledWith({ provider: 'cloud-b', model: 'claude', reasoningEffort: 'xhigh' })
})

it('uses the shared directory for effort changes and hides controls for addressed subagents', async () => {
  const { open, state, select, view, ...actions } = setup()
  open()
  fireEvent.click(screen.getByRole('button', { name: /^推理强度/ }))
  fireEvent.click(screen.getByRole('menuitemradio', { name: 'High' }))
  await waitFor(() => expect(state.getSnapshot().current?.reasoningEffort).toBe('high'))
  view.rerender(<GroupedModelSelect {...actions} directory={state} select={select} available={false} />)
  expect(screen.queryByRole('button', { name: /选择模型/ })).toBeNull()
})

it('does not apply a delayed catalog response after logout or after a gateway change', async () => {
  const catalog = new GroupCatalogStore()
  let resolve!: (value: any) => void
  const pending = catalog.refresh(() => new Promise(done => { resolve = done }))
  catalog.clear()
  resolve({ gatewayBaseUrl: 'old', groups: [{ groupId: '1', groupName: 'Old' }], routes: [] })
  await pending
  expect(catalog.getSnapshot()).toEqual({ groups: [], routes: [] })
})

it('does not invent a multiplier when cached metadata is missing and reacts to shared catalog updates', () => {
  const { catalog } = setup()
  act(() => catalog.update({ status: 'signedIn', models: [{ providerId: 'cloud-a', modelId: 'same', groupId: '1', groupName: 'Legacy' }] } as any))
  expect(screen.getByRole('button', { name: '选择模型：same · 倍率未提供 · Xhigh' })).toBeTruthy()
})

it('does not notify or replace the shared snapshot when synchronized metadata has not changed', () => {
  const catalog = new GroupCatalogStore()
  const listener = vi.fn()
  catalog.subscribe(listener)
  const account = { status: 'signedIn', models: [], groups: [{ groupId: '1', groupName: 'Pro', rateMultiplier: 0.6 }] } as any
  catalog.update(account)
  const snapshot = catalog.getSnapshot()
  catalog.update(structuredClone(account))
  expect(catalog.getSnapshot()).toBe(snapshot)
  expect(listener).toHaveBeenCalledOnce()
})

it('shadows the real composer slot and restores its original occupant on plugin unload', async () => {
  const { state, catalog, select, load, view } = setup()
  view.unmount()
  const runtime = await SlotTestRuntime.create()
  onTestFinished(() => runtime.dispose())
  const locale = new LocaleRuntime(runtime.ctx)
  locale.setLocale('zh')
  runtime.ctx.provide('locale', locale)
  runtime.slots.installLocale(locale)
  runtime.ctx.provide('connection', {} as any)
  runtime.ctx.provide('modelDirectories', { directoryFor: () => ({ store: state, select, load }) } as any)
  const metadata = catalog.getSnapshot()
  const read = vi.fn().mockResolvedValue({ ok: true, value: { status: 'signedIn', gatewayBaseUrl: metadata.gatewayBaseUrl, groups: metadata.groups, models: metadata.routes.map(route => ({ ...route, groupName: metadata.groups.find(group => group.groupId === route.groupId)?.groupName })) } })
  runtime.remote.provideNamespaces({ zerowallAccount: { discoverModels: read }, session: {} })
  const sessionId = SessionId('grouped-model-slot')
  await runtime.sessions.add({ id: sessionId })
  const session = runtime.sessions.retainFor(runtime.ctx, sessionId)
  await runtime.root.declare({ 'conversation.input.model': { kind: 'single', scope: 'session' } }, ({ renderSlot, SessionProvider }) =>
    <SessionProvider session={session}>{renderSlot('conversation.input.model', { locked: false })}</SessionProvider>)
  await runtime.mount({ inject: ['slots'], apply(ctx) {
    ctx.slots.inject('conversation.input.model', () => ctx.slots.register({ name: 'conversation.input.model' }, () => <button>Original selector</button>))
  } })
  runtime.renderRoot()
  expect(screen.getByRole('button', { name: 'Original selector' })).toBeTruthy()
  const plugin = await runtime.mount({ inject: [...inject], apply })
  expect(await screen.findByRole('button', { name: '选择模型：same · 0× · Xhigh' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Original selector' })).toBeNull()
  expect(read).toHaveBeenCalledOnce()
  act(() => runtime.remote.emit('llm/adapters-updated', []))
  expect(read).toHaveBeenCalledOnce()
  act(() => state.update(snapshot => { snapshot.current = { provider: 'cloud-pro', model: 'same', reasoningEffort: 'high' } }))
  expect(screen.getByRole('button', { name: '选择模型：same · 0.6× · High' })).toBeTruthy()
  await plugin.dispose()
  expect(screen.getByRole('button', { name: 'Original selector' })).toBeTruthy()
  expect(state.getSnapshot().current).toEqual({ provider: 'cloud-pro', model: 'same', reasoningEffort: 'high' })
  expect(select).not.toHaveBeenCalled()
  expect(load).not.toHaveBeenCalled()
})
