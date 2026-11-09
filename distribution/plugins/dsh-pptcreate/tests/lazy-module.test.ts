import { describe, expect, it, vi } from 'vitest'
import { retryableImport } from '../src/core/lazy-module.js'

describe('implementation loading', () => {
  it('shares in-flight work and retains a successfully loaded module', async () => {
    let accept!: (value: object) => void
    const module = {}
    const load = vi.fn(() => new Promise<object>(resolve => { accept = resolve }))
    const get = retryableImport(load)
    const first = get(), second = get()
    expect(second).toBe(first)
    await Promise.resolve()
    expect(load).toHaveBeenCalledTimes(1)
    accept(module)
    expect(await first).toBe(module)
    expect(await get()).toBe(module)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('retries after an asynchronous or synchronous loader failure', async () => {
    const load = vi.fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('temporary read failure'))
      .mockImplementationOnce(() => { throw new Error('temporary resolver failure') })
      .mockResolvedValue('recovered')
    const get = retryableImport(load)
    await expect(get()).rejects.toThrow('temporary read failure')
    await expect(get()).rejects.toThrow('temporary resolver failure')
    await expect(get()).resolves.toBe('recovered')
    expect(load).toHaveBeenCalledTimes(3)
  })
})
