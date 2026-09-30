import type { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/file-review-service.ts', () => ({ FileReviewService: vi.fn() }))
vi.mock('../src/file-lifecycle-capture.ts', () => ({ registerFileLifecycleCapture: vi.fn() }))
vi.mock('../src/ptc-adapter.ts', () => ({ registerPtcAdapter: vi.fn() }))

import { apply, Config, inject } from '../src/index.ts'

describe('file-review settings', () => {
  it('defaults to split without wrapping and marks both fields live', () => {
    const defaults = Config({})
    expect(defaults.wordWrap.get()).toBe(false)
    expect(defaults.diffLayout.get()).toBe('split')
    expect(() => Config({ diffLayout: 'invalid' })).toThrow()
    expect(Config.dict.wordWrap.meta.volatile).toBe(true)
    expect(Config.dict.diffLayout.meta.volatile).toBe(true)
  })

  it('disables the generic settings page because the plugin row owns its configuration', () => {
    const configure = vi.fn(() => () => {})
    const section = vi.fn()
    const fiber = Symbol('file-review-fiber')
    const ctx = {
      fiber,
      inject: vi.fn((_services: readonly string[], callback: (child: unknown) => void) => {
        callback({ effect: (setup: () => void) => setup(), settings: { configure } })
      }),
      systemPrompt: { section },
    } as unknown as Context

    apply(ctx)

    expect(inject).toEqual(['systemPrompt', 'tools'])
    expect(ctx.inject).toHaveBeenCalledWith(['settings'], expect.any(Function))
    expect(configure).toHaveBeenCalledWith({ auto: false }, fiber)
    expect(section).toHaveBeenCalledWith(expect.objectContaining({ name: 'ui:file-review-references' }))
  })
})
