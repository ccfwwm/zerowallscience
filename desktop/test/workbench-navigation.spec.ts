import { describe, expect, it, vi } from 'vitest'
import { awaitWorkbenchStep, WorkbenchNavigation } from '../src/main/workbench-navigation.js'
import { nextStartupStatus } from '../src/main/startup-status.js'
import type { StartupStatus } from '../src/shared/contracts.js'

describe('startup generations', () => {
  it('bounds a stalled navigation and a stalled renderer probe by the same deadline', async () => {
    vi.useFakeTimers()
    try {
      const controller = new AbortController()
      const deadline = Date.now() + 45_000
      await awaitWorkbenchStep(async () => undefined, controller.signal, deadline)
      await vi.advanceTimersByTimeAsync(40_000)
      const pending = awaitWorkbenchStep(() => new Promise<never>(() => {}), controller.signal, deadline)
      const assertion = expect(pending).rejects.toThrow('工作台界面加载超时')
      await vi.advanceTimersByTimeAsync(5_000)
      await assertion
      expect(vi.getTimerCount()).toBe(0)
    } finally { vi.useRealTimers() }
  })
  it('cancels a pending navigation immediately when rollback replaces the Host', async () => {
    const controller = new AbortController()
    const pending = awaitWorkbenchStep(() => new Promise<never>(() => {}), controller.signal, Date.now() + 45_000)
    const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    controller.abort()
    await assertion
  })
  it('ignores stale navigation failure and opens the authenticated rollback URL', async () => {
    const navigation = new WorkbenchNavigation()
    let rejectOld!: (error: Error) => void
    const fail = vi.fn(async () => {})
    const old = navigation.open('old', async () => new Promise<void>((_resolve, reject) => { rejectOld = reject }), fail)
    await Promise.resolve()
    navigation.cancel()
    const rollback = navigation.open('rollback', async signal => { expect(signal.aborted).toBe(false) }, fail)
    rejectOld(new Error('stale renderer'))
    expect(await old).toBe(false)
    expect(await rollback).toBe(true)
    expect(fail).not.toHaveBeenCalled()
  })
  it('deduplicates one ready URL and reports a current client failure', async () => {
    const navigation = new WorkbenchNavigation()
    const render = vi.fn(async () => { throw new Error('plugin failed') })
    const fail = vi.fn(async () => {})
    const first = navigation.open('url', render, fail)
    expect(navigation.open('url', render, fail)).toBe(first)
    expect(await first).toBe(false)
    expect(fail).toHaveBeenCalledOnce()
  })
  it('preserves failure diagnostics until a new Host attempt explicitly starts', () => {
    const failed: StartupStatus = { phase: 'failed', progress: 85, message: 'plugin failed', startedAt: 10, finishedAt: 20 }
    expect(nextStartupStatus(failed, { message: '正在打开工作台' }, 30)).toBe(failed)
    const retry = nextStartupStatus(failed, { phase: 'starting', progress: 35, message: 'restart' }, 30)
    expect(retry).toMatchObject({ phase: 'starting', startedAt: 30, finishedAt: undefined })
    expect(nextStartupStatus(retry, { phase: 'ready', progress: 100 }, 40).finishedAt).toBe(40)
  })
})
