/** Catalog discovery shares network work and rejects invalid metadata before installation. */
import { afterEach, expect, it, vi } from 'vitest'
import { PluginUpdateIndex } from '../src/update-index.ts'

afterEach(() => { vi.unstubAllGlobals() })
const catalog = { format: 1, title: 'Plugins', plugins: [{ name: 'feature', title: 'Feature', versions: [
  { version: '2.0.0', publishTimestamp: 1000, source: { type: 'npm' } },
] }] }

it('serves simultaneous checks from one metadata request and caches their result', async () => {
  const pending = Promise.withResolvers<Response>()
  const fetcher = vi.fn(() => pending.promise)
  vi.stubGlobal('fetch', fetcher)
  const index = new PluginUpdateIndex('https://updates.example/plugins.json', 8000, 60000)
  const lifetime = new AbortController()
  const checks = Array.from({ length: 30 }, () => index.read(lifetime.signal))
  pending.resolve(Response.json(catalog))
  const results = await Promise.all(checks)
  expect(fetcher).toHaveBeenCalledOnce()
  expect(results.every(result => result === results[0])).toBe(true)
  expect((await index.read(lifetime.signal)).plugins[0]?.versions[0]?.version).toBe('2.0.0')
  expect(fetcher).toHaveBeenCalledOnce()
})

it('rejects malformed catalogs and permits a later retry', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ format: 1 })).mockResolvedValueOnce(Response.json(catalog))
  vi.stubGlobal('fetch', fetcher)
  const index = new PluginUpdateIndex('https://updates.example/plugins.json', 8000, 0)
  const lifetime = new AbortController()
  await expect(index.read(lifetime.signal)).rejects.toThrow()
  expect((await index.read(lifetime.signal)).plugins).toHaveLength(1)
  expect(fetcher).toHaveBeenCalledTimes(2)
})
