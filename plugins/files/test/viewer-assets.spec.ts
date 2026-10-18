import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { registerViewerAssets } from '../src/host/viewer-assets.js'

let root: string
let request: (url: string, method?: string) => Promise<{ status: number; headers: any; body: Buffer | undefined }>
const version = 'f'.repeat(64)
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'zws-viewer-assets-'))
  await mkdir(join(root, 'viewer-assets/build'), { recursive: true })
  await mkdir(join(root, 'viewer-assets/leaflet/images'), { recursive: true })
  await writeFile(join(root, 'viewer-runtime.js'), 'globalThis.previewRuntime = true;')
  await writeFile(join(root, 'viewer-assets/asset-manifest.json'), JSON.stringify({ version }))
  await writeFile(join(root, 'viewer-assets/build/pdf.worker.mjs'), 'offline-worker')
  await writeFile(join(root, 'viewer-assets/leaflet/leaflet.css'), 'offline-css')
  await writeFile(join(root, 'viewer-assets/leaflet/images/marker-icon.png'), Buffer.from([1, 2, 3]))
  let handler: any
  registerViewerAssets({ effect: (callback: () => void) => callback(), webServer: { register: (route: any) => { handler = route.handler } } } as any, pathToFileURL(root + '/'), '0.2.10')
  request = async (url, method = 'GET') => {
    let status = 0, headers: any, body: Buffer | undefined
    await handler({ url, method }, { writeHead: (code: number, values: any) => { status = code; headers = values }, end: (value: Buffer | undefined) => { body = value } })
    return { status, headers, body }
  }
})
afterEach(async () => { await rm(root, { recursive: true, force: true }) })

it('serves the local versioned runtime offline with immutable JS headers and supports HEAD', async () => {
  const url = '/zerowall/viewer-assets/runtime/0.2.10/viewer-runtime.js'
  const result = await request(url)
  expect(result.status).toBe(200)
  expect(result.body?.toString()).toBe('globalThis.previewRuntime = true;')
  expect(result.headers).toMatchObject({ 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff', 'content-length': result.body?.length })
  expect(await request(url, 'HEAD')).toMatchObject({ status: 200, body: undefined })
})

it.each([
  ['/zerowall/viewer-assets/runtime/0.2.9/viewer-runtime.js', 'GET'],
  ['/zerowall/viewer-assets/runtime/0.2.10/other.js', 'GET'],
  ['/zerowall/viewer-assets/runtime/0.2.10/%2e%2e/package.json', 'GET'],
  ['/zerowall/viewer-assets/build/%2e%2e/package.json', 'GET'],
  [`/zerowall/viewer-assets/${'e'.repeat(64)}/build/pdf.worker.mjs`, 'GET'],
])('rejects unknown or escaped asset path %s', async (url, method) => {
  expect(await request(url!, method)).toMatchObject({ status: 404, body: undefined })
})

it('preserves versioned and legacy offline PDF/GIS resource paths', async () => {
  for (const [path, expected] of [['build/pdf.worker.mjs', 'offline-worker'], ['leaflet/leaflet.css', 'offline-css']] as const) {
    expect((await request(`/zerowall/viewer-assets/${version}/${path}`)).body?.toString()).toBe(expected)
    expect((await request(`/zerowall/viewer-assets/${path}`)).body?.toString()).toBe(expected)
  }
  expect((await request(`/zerowall/viewer-assets/${version}/leaflet/images/marker-icon.png`)).body).toEqual(Buffer.from([1, 2, 3]))
  expect(await request('/zerowall/viewer-assets/runtime/0.2.10/viewer-runtime.js', 'POST')).toMatchObject({ status: 405, body: undefined })
})

it('reports a missing sidecar without falling back to arbitrary code', async () => {
  await rm(join(root, 'viewer-runtime.js'))
  expect(await request('/zerowall/viewer-assets/runtime/0.2.10/viewer-runtime.js')).toMatchObject({ status: 404, body: undefined })
})

it('releases its route on plugin unload and permits remounting without a duplicate route', async () => {
  const ctx = new Context()
  const routes = new Map<string, unknown>()
  const dispose = vi.fn((path: string) => { routes.delete(path) })
  ctx.provide('webServer', { register: (route: any) => {
    if (routes.has(route.path)) throw new Error('duplicate route')
    routes.set(route.path, route)
    return () => dispose(route.path)
  } } as any)
  const plugin = (webCtx: Context) => registerViewerAssets(webCtx, pathToFileURL(root + '/'), '0.2.11')
  try {
    const first = ctx.plugin(plugin)
    await first
    expect(routes.has('/zerowall/viewer-assets')).toBe(true)
    await first.dispose()
    expect(routes.size).toBe(0)
    expect(dispose).toHaveBeenCalledOnce()
    const second = ctx.plugin(plugin)
    await second
    expect(routes.has('/zerowall/viewer-assets')).toBe(true)
    await second.dispose()
    expect(routes.size).toBe(0)
    expect(dispose).toHaveBeenCalledTimes(2)
  } finally { await ctx.fiber.dispose() }
})
