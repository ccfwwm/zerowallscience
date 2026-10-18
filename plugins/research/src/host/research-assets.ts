import { readFile } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'

export const RESEARCH_ASSETS = ['brainglobe', 'canvas', 'cells', 'flow', 'he', 'imagej', 'molecule', 'sanger', 'sequence'] as const
export function registerResearchAssets(ctx: Context, base = new URL('./research-assets/', import.meta.url), version = process.env.ZEROWALL_VERSION): void {
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/zerowall/research-assets', handler: async (request, response) => {
    if (!['GET', 'HEAD'].includes(request.method ?? 'GET')) { response.writeHead(405); response.end(); return }
    const suffix = new URL(request.url ?? '/', 'http://localhost').pathname.slice('/zerowall/research-assets/'.length)
    const name = RESEARCH_ASSETS.find(name => suffix === `${version}/${name}.png`)
    if (!name) { response.writeHead(404); response.end(); return }
    try {
      const bytes = await readFile(new URL(`${name}.png`, base))
      response.writeHead(200, { 'content-type': 'image/png', 'content-length': bytes.length, 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' })
      response.end(request.method === 'HEAD' ? undefined : bytes)
    } catch { response.writeHead(404); response.end() }
  } }))
}
