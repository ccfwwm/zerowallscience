import { expect, it, vi } from 'vitest'
import { downloadImageBytes, type ImageArtifactFetch } from '../src/host/image-download.js'

const url = new URL('https://images.example.test/private.png?signature=private')
it('keeps fast downloads on one connection and does not send credentials', async () => {
  const bytes = Buffer.alloc(600_000, 7)
  const fetcher = vi.fn<ImageArtifactFetch>(async (_url, _signal, headers) => {
    expect(headers).toEqual({ 'Accept-Encoding': 'identity' })
    return new Response(bytes, { headers: { 'content-length': String(bytes.length) } })
  })
  const result = await downloadImageBytes(url, { fetch: fetcher })
  expect(Buffer.from(result.bytes).equals(bytes)).toBe(true)
  expect(result).toMatchObject({ transport: 'single', attempts: 1 })
})

it('accelerates a stalled connection, preserves its prefix and retries only a reset segment tail', async () => {
  const bytes = Buffer.from(Array.from({ length: 900_000 }, (_, i) => i % 251)), requested: number[] = []
  let reset = false, active = 0, maximum = 0
  const fetcher: ImageArtifactFetch = async (_url, _signal, headers) => {
    if (!headers?.Range) return new Response(new ReadableStream({ start(c) { c.enqueue(bytes.subarray(0, 100)) } }), { headers: { 'content-length': String(bytes.length), etag: '"immutable"' } })
    const [, a, b] = /bytes=(\d+)-(\d+)/.exec(headers.Range)!
    const start = Number(a), end = Number(b)
    requested.push(start); active++; maximum = Math.max(maximum, active)
    expect(headers['If-Range']).toBe('"immutable"')
    const fail = start === 100 && !reset; if (fail) reset = true
    return new Response(new ReadableStream({
      start(c) { c.enqueue(bytes.subarray(start, fail ? start + 50 : end + 1)) },
      pull(c) { active--; if (fail) c.error(new Error('reset')); else c.close() },
    }), { status: 206, headers: { 'content-range': `bytes ${start}-${end}/${bytes.length}` } })
  }
  const result = await downloadImageBytes(url, { fetch: fetcher, slowAfterMs: 1 })
  expect(Buffer.from(result.bytes).equals(bytes)).toBe(true)
  expect(result.transport).toBe('range'); expect(requested).toContain(150)
  expect(requested.filter(n => n === 100)).toHaveLength(1)
  expect(maximum).toBeLessThanOrEqual(8)
})

it('falls back to an ordinary download if the server ignores Range', async () => {
  const bytes = Buffer.alloc(600_000, 5); let calls = 0
  const fetcher: ImageArtifactFetch = async (_url, _signal, headers) => {
    calls++
    return new Response(calls === 1 ? new ReadableStream({ start(c) { c.enqueue(bytes.subarray(0, 10)) } }) : bytes, { headers: { 'content-length': String(bytes.length) } })
  }
  const result = await downloadImageBytes(url, { fetch: fetcher, slowAfterMs: 1 })
  expect(Buffer.from(result.bytes).equals(bytes)).toBe(true); expect(result.transport).toBe('single')
})

it('bounds a body that never ends even if a custom transport ignores cancellation', async () => {
  const fetcher: ImageArtifactFetch = async () => new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array([1])) } }))
  await expect(downloadImageBytes(url, { fetch: fetcher, timeoutMs: 10 })).rejects.toThrow('IMAGE_DOWNLOAD_TIMEOUT')
})

it('rejects oversized and truncated responses and preserves explicit cancellation', async () => {
  await expect(downloadImageBytes(url, { fetch: async () => new Response('x', { headers: { 'content-length': String(65 * 1024 * 1024) } }) })).rejects.toThrow('IMAGE_DOWNLOAD_FAILED')
  await expect(downloadImageBytes(url, { fetch: async () => new Response('x', { headers: { 'content-length': '10' } }) })).rejects.toThrow('IMAGE_DOWNLOAD_FAILED')
  const controller = new AbortController(); const reason = new Error('user stopped'); controller.abort(reason)
  await expect(downloadImageBytes(url, { signal: controller.signal, fetch: vi.fn() })).rejects.toBe(reason)
})
