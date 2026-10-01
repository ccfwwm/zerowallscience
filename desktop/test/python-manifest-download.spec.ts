import { expect, it } from 'vitest'
import { downloadPythonManifest } from '../src/main/python-manifest-download.js'

it('retries an interrupted response body, then returns the complete document', async () => {
  let requests = 0
  const fetcher = (async (_url, options) => {
    expect(options?.signal).toBeDefined()
    if (++requests === 1) return new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode('{"partial":'))
      controller.error(new TypeError('terminated'))
    } }))
    return Response.json({ complete: true })
  }) as typeof fetch
  expect(await downloadPythonManifest('https://fixture.invalid/manifest', fetcher)).toEqual({ complete: true })
  expect(requests).toBe(2)
})

it('bounds repeated transport failures to three attempts', async () => {
  let requests = 0
  await expect(downloadPythonManifest('https://fixture.invalid/manifest', (async () => {
    requests++; throw new TypeError('network down')
  }) as typeof fetch)).rejects.toThrow('network down')
  expect(requests).toBe(3)
})

it('retries temporary HTTP failures without retrying absent resources or malformed documents', async () => {
  let requests = 0
  const fetcher = (async () => ++requests === 1 ? new Response('busy', { status: 503 }) : Response.json({ ok: true })) as typeof fetch
  expect(await downloadPythonManifest('https://fixture.invalid/manifest', fetcher)).toEqual({ ok: true })
  for (const response of [new Response('absent', { status: 404 }), new Response('{invalid')]) {
    let calls = 0
    await expect(downloadPythonManifest('https://fixture.invalid/manifest', (async () => { calls++; return response }) as typeof fetch)).rejects.toThrow()
    expect(calls).toBe(1)
  }
})

it('cancels oversized manifests without retrying or parsing them', async () => {
  let requests = 0, cancelled = false
  const fetcher = (async () => {
    requests++
    return new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new Uint8Array(16 * 1024 ** 2 + 1))
    }, cancel() { cancelled = true } }))
  }) as typeof fetch
  await expect(downloadPythonManifest('https://fixture.invalid/manifest', fetcher)).rejects.toThrow('size limit')
  expect(requests).toBe(1); expect(cancelled).toBe(true)
})
