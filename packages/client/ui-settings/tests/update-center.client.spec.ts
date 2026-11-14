import { Context } from '@deepseek-ai/cordis'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { expect, it, onTestFinished, vi } from 'vitest'
import { UpdateCenter, type UpdateStatus } from '../src/client/update-center.ts'

async function fixture() {
  const ctx = new Context()
  const fiber = ctx.plugin({ apply(scope) { new UpdateCenter(scope) } })
  onTestFinished(() => fiber.dispose())
  await fiber.await()
  return { center: ctx.updateCenter, fiber }
}

function status(available = 1, ready = false) {
  return createSnapshotStore<UpdateStatus>({ available, ready, busy: false, failed: false, checked: true })
}

it('prepares plugins and runtime before Desktop, coalesces clicks, and never restarts a staged source', async () => {
  const { center } = await fixture()
  const order: string[] = []
  const pending = Promise.withResolvers<boolean>()
  onTestFinished(() => { pending.resolve(false) })
  center.register('desktop', { status: status(), prepare: async () => { order.push('desktop'); return true } })
  center.register('runtime', { status: status(), prepare: async () => { order.push('runtime'); return true } })
  center.register('plugins', { status: status(), prepare: () => { order.push('plugins'); return pending.promise } })
  const first = center.prepareAll()
  expect(center.prepareAll()).toBe(first)
  await vi.waitFor(() => { expect(order).toEqual(['plugins']) })
  expect(center.store.getSnapshot().operation).toBe('preparing')
  pending.resolve(true)
  expect(await first).toBe(true)
  expect(order).toEqual(['plugins', 'runtime', 'desktop'])
  expect(center.store.getSnapshot().operation).toBe('idle')
})

it.each(['refused', 'throw'] as const)('stops preparation after a %s result and retains the failed group', async (failure) => {
  const { center } = await fixture()
  const desktop = vi.fn(async () => true)
  center.register('plugins', { status: status(), prepare: async () => {
    if (failure === 'throw') throw new Error('Connection lost')
    return false
  } })
  center.register('desktop', { status: status(), prepare: desktop })
  expect(await center.prepareAll()).toBe(false)
  expect(desktop).not.toHaveBeenCalled()
  expect(center.store.getSnapshot().failure).toEqual({ group: 'plugins', operation: 'prepare' })
})

it('checks other sources after a failed check and leaves automatically checked Desktop untouched', async () => {
  const { center } = await fixture()
  const runtime = vi.fn(async () => true)
  const desktop = vi.fn(async () => true)
  center.register('plugins', { status: status(), check: async () => false, prepare: desktop })
  center.register('runtime', { status: status(), check: runtime, prepare: desktop })
  center.register('desktop', { status: status(), prepare: desktop })
  expect(await center.checkAll()).toBe(false)
  expect(runtime).toHaveBeenCalledOnce()
  expect(desktop).not.toHaveBeenCalled()
  expect(center.store.getSnapshot().failure).toEqual({ group: 'plugins', operation: 'check' })
})

it('publishes updates without a mounted page, skips ready candidates, and detaches a removed source', async () => {
  const { center } = await fixture()
  const source = status(0)
  const prepare = vi.fn(async () => true)
  const remove = center.register('plugins', { status: source, prepare })
  expect(() => center.register('plugins', { status: source, prepare })).toThrow('already owns')
  const stable = center.store.getSnapshot()
  expect(center.store.getSnapshot()).toBe(stable)
  source.set({ ...source.getSnapshot(), ready: true, available: 2 })
  expect(center.store.getSnapshot().sources[0]).toMatchObject({ id: 'plugins', ready: true, available: 2 })
  expect(await center.prepareAll()).toBe(true)
  expect(prepare).not.toHaveBeenCalled()
  remove()
  const removed = center.store.getSnapshot()
  source.set({ ...source.getSnapshot(), available: 3 })
  expect(center.store.getSnapshot()).toBe(removed)
  expect(removed.sources).toEqual([])
})

it('stops a sequence when its owner unloads and ignores late completion after provider disposal', async () => {
  const { center, fiber } = await fixture()
  const pending = Promise.withResolvers<boolean>()
  onTestFinished(() => { pending.resolve(false) })
  const remove = center.register('plugins', { status: status(), prepare: () => pending.promise })
  const desktop = vi.fn(async () => true)
  center.register('desktop', { status: status(), prepare: desktop })
  const run = center.prepareAll()
  await Promise.resolve()
  remove()
  await fiber.dispose()
  const disposed = center.store.getSnapshot()
  pending.resolve(true)
  expect(await run).toBe(false)
  expect(desktop).not.toHaveBeenCalled()
  expect(center.store.getSnapshot()).toBe(disposed)
  expect(await center.checkAll()).toBe(false)
})

it('does not begin a second operation while a source is already busy', async () => {
  const { center } = await fixture()
  const source = status()
  source.set({ ...source.getSnapshot(), busy: true })
  const check = vi.fn(async () => true)
  center.register('plugins', { status: source, check, prepare: check })
  expect(await center.checkAll()).toBe(false)
  expect(check).not.toHaveBeenCalled()
})

it('stops before preparing a source whose previous result remains unknown', async () => {
  const { center } = await fixture()
  const source = status()
  source.set({ ...source.getSnapshot(), failed: true })
  const prepare = vi.fn(async () => true)
  center.register('plugins', { status: source, prepare })
  expect(await center.prepareAll()).toBe(false)
  expect(prepare).not.toHaveBeenCalled()
  expect(center.store.getSnapshot().failure).toEqual({ group: 'plugins', operation: 'prepare' })
})
