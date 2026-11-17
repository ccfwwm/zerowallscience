import { afterEach, describe, expect, it, vi } from 'vitest'
import JSZip from 'jszip'
import { request, RequestBudget } from './transport.ts'
import { DEFAULTS } from './config.ts'
import { extractZip } from './io.ts'
import { requestedPages, remapPages } from './pages.ts'

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
describe('MinerU request ownership', () => {
  it('does not repeat an uncertain POST', async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError('connection lost'))
    vi.stubGlobal('fetch', fetcher)
    await expect(request('https://mineru.test', { method: 'POST' }, new AbortController().signal)).rejects.toMatchObject({ code: 'MINERU_SUBMISSION_UNKNOWN' })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('honors explicit throttling and cancels the retry delay', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn().mockResolvedValue(new Response('', { status: 429, headers: { 'retry-after': '30' } }))
    vi.stubGlobal('fetch', fetcher)
    const stop = new AbortController()
    const operation = request('https://mineru.test', { method: 'POST' }, stop.signal)
    const assertion = expect(operation).rejects.toMatchObject({ name: 'AbortError' })
    await vi.advanceTimersByTimeAsync(1)
    stop.abort()
    await assertion
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('counts files, retains independent poll capacity and resets at UTC midnight', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-13T23:59:00Z'))
    const budget = new RequestBudget()
    const cfg = { ...DEFAULTS, dailyLimit: 2 }
    const signal = new AbortController().signal
    const first = budget.acquire(cfg, 'submit', 2, signal)
    await vi.advanceTimersByTimeAsync(0); await first
    const poll = budget.acquire(cfg, 'poll', 0, signal)
    await vi.advanceTimersByTimeAsync(0); await poll
    const denied = budget.acquire(cfg, 'submit', 1, signal)
    const checked = expect(denied).rejects.toMatchObject({ code: 'MINERU_DAILY_LIMIT' })
    await vi.advanceTimersByTimeAsync(3000); await checked
    vi.setSystemTime(new Date('2026-11-14T00:00:00Z'))
    const next = budget.acquire(cfg, 'submit', 1, signal)
    await vi.advanceTimersByTimeAsync(0); await next
  })
  it('rejects original ZIP traversal names before extracting', async () => {
    const zip = new JSZip(); zip.file('../escape.txt', 'unsafe')
    await expect(extractZip(await zip.generateAsync({ type: 'uint8array' }), '/unused-mineru-test')).rejects.toThrow('不安全路径')
  })
  it('maps subsets to physical pages and rejects unresolvable or overlapping ranges', () => {
    expect(requestedPages('2,4--2', 7)).toEqual([2,4,5,6])
    expect(remapPages([{ page_idx: 1 }, { page_idx: 9 }], [2,8])).toEqual([{ page_idx: 7 }, { page_idx: -1 }])
    expect(() => requestedPages('2--2')).toThrow('本地 PDF')
    expect(() => requestedPages('2-4,4-5', 9)).toThrow('重叠')
  })
})
