import { readFile } from 'node:fs/promises'
import sharp from 'sharp'
import { expect, it } from 'vitest'
import { RESEARCH_ASSETS, registerResearchAssets } from '../src/host/research-assets.js'

function server() {
  let handler: any
  registerResearchAssets({ effect: (callback: () => void) => callback(), webServer: { register: (route: any) => { handler = route.handler } } } as any, new URL('../src/client/assets/', import.meta.url), '0.1.16')
  return async (url: string, method = 'GET') => {
    let status = 0, headers: any, body: Buffer | undefined
    await handler({ url, method }, { writeHead: (code: number, values: any) => { status = code; headers = values }, end: (value: Buffer | undefined) => { body = value } })
    return { status, headers, body }
  }
}

it.each(RESEARCH_ASSETS)('serves the original offline %s PNG bytes as a decodable image', async name => {
  const response = await server()(`/zerowall/research-assets/0.1.16/${name}.png`)
  expect(response.status).toBe(200)
  expect(response.body).toEqual(await readFile(new URL(`../src/client/assets/${name}.png`, import.meta.url)))
  const metadata = await sharp(response.body).metadata()
  expect(metadata.format).toBe('png')
  expect(metadata.width).toBeGreaterThan(0)
  expect(metadata.height).toBeGreaterThan(0)
  expect(response.headers).toMatchObject({ 'content-type': 'image/png', 'content-length': response.body?.length, 'x-content-type-options': 'nosniff', 'cache-control': 'public, max-age=31536000, immutable' })
})

it('serves HEAD and rejects wrong versions, unknown files, escapes and mutation methods', async () => {
  const request = server()
  expect(await request('/zerowall/research-assets/0.1.16/cells.png', 'HEAD')).toMatchObject({ status: 200, body: undefined })
  for (const path of ['0.1.15/cells.png', '0.1.16/other.png', '0.1.16/%2e%2e/package.json', '0.1.16/cells.png/extra', 'cells.png']) {
    expect(await request(`/zerowall/research-assets/${path}`)).toMatchObject({ status: 404, body: undefined })
  }
  expect(await request('/zerowall/research-assets/0.1.16/cells.png', 'POST')).toMatchObject({ status: 405, body: undefined })
})
