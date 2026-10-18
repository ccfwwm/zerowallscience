// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

beforeEach(() => { vi.resetModules(); vi.stubEnv('ZEROWALL_VERSION', '0.2.10') })
afterEach(() => { document.head.replaceChildren(); delete (globalThis as any).__ZEROWALL_VIEWER_RUNTIMES__; vi.unstubAllEnvs(); vi.useRealTimers() })
const runtime = () => ({ createViewer: vi.fn(), plugins: vi.fn(() => []) })
const script = () => document.head.querySelector('script')!

it('defers the local runtime until first preview and shares one request between concurrent previews', async () => {
  const { loadViewerRuntime } = await import('../src/client/viewer-runtime-loader.js')
  expect(document.head.querySelector('script')).toBeNull()
  const first = loadViewerRuntime(), second = loadViewerRuntime()
  expect(first).toBe(second)
  expect(document.head.querySelectorAll('script')).toHaveLength(1)
  expect(script().getAttribute('src')).toBe('/zerowall/viewer-assets/runtime/0.2.10/viewer-runtime.js')
  const loaded = runtime()
  ;(globalThis as any).__ZEROWALL_VIEWER_RUNTIMES__ = { '0.2.10': loaded }
  script().dispatchEvent(new Event('load'))
  expect(await first).toBe(loaded)
  expect(await loadViewerRuntime()).toBe(loaded)
  expect(document.head.querySelectorAll('script')).toHaveLength(1)
})

it.each(['error', 'malformed', 'timeout'])('allows a new preview to retry a %s load', async failure => {
  vi.useFakeTimers()
  const { loadViewerRuntime } = await import('../src/client/viewer-runtime-loader.js')
  const first = loadViewerRuntime()
  const rejected = expect(first).rejects.toThrow(/本地预览运行时/u)
  if (failure === 'timeout') await vi.advanceTimersByTimeAsync(30_000)
  else script().dispatchEvent(new Event(failure === 'error' ? 'error' : 'load'))
  await rejected
  expect(document.head.querySelector('script')).toBeNull()
  const retry = loadViewerRuntime()
  const loaded = runtime()
  ;(globalThis as any).__ZEROWALL_VIEWER_RUNTIMES__ = { '0.2.10': loaded }
  script().dispatchEvent(new Event('load'))
  expect(await retry).toBe(loaded)
})

it('does not use another plugin version or a non-callable registry entry', async () => {
  const { loadViewerRuntime } = await import('../src/client/viewer-runtime-loader.js')
  ;(globalThis as any).__ZEROWALL_VIEWER_RUNTIMES__ = { '0.2.9': runtime(), '0.2.10': { createViewer: true, plugins: true } }
  const pending = loadViewerRuntime()
  const rejected = expect(pending).rejects.toThrow(/不完整/u)
  script().dispatchEvent(new Event('load'))
  await rejected
})
