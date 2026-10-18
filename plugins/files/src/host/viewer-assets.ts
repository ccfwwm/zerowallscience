import { readFile } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'

export function registerViewerAssets(ctx: Context, base = new URL('./', import.meta.url), version = process.env.ZEROWALL_VERSION): void {
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/zerowall/viewer-assets', handler: async (request, response) => {
    if (!['GET', 'HEAD'].includes(request.method ?? 'GET')) { response.writeHead(405); response.end(); return }
    const suffix = new URL(request.url ?? '/', 'http://localhost').pathname.slice('/zerowall/viewer-assets/'.length)
    if (suffix.startsWith('runtime/')) {
      if (suffix !== `runtime/${version}/viewer-runtime.js`) { response.writeHead(404); response.end(); return }
      try {
        const bytes = await readFile(new URL('./viewer-runtime.js', base))
        response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'content-length': bytes.length, 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' })
        response.end(request.method === 'HEAD' ? undefined : bytes)
      } catch { response.writeHead(404); response.end() }
      return
    }
    try {
      const assetManifest = JSON.parse(await readFile(new URL('./viewer-assets/asset-manifest.json', base), 'utf8')) as { version: string }
      const versioned = suffix.match(/^([a-f0-9]{64})\/(.+)$/u)
      if (versioned && versioned[1] !== assetManifest.version) { response.writeHead(404); response.end(); return }
      const assetPath = versioned?.[2] ?? suffix
      const pdfAsset = /^(build|cmaps|standard_fonts|wasm|iccs)\/[A-Za-z0-9_.-]+$/u.test(assetPath)
      const mapAsset = /^leaflet\/(?:leaflet\.css|images\/[A-Za-z0-9_-]+\.png)$/u.test(assetPath)
      if (!pdfAsset && !mapAsset) { response.writeHead(404); response.end(); return }
      const bytes = await readFile(new URL(`./viewer-assets/${assetPath}`, base))
      const mediaType = assetPath.endsWith('.css') ? 'text/css; charset=utf-8' : assetPath.endsWith('.png') ? 'image/png' : assetPath.endsWith('.mjs') ? 'text/javascript' : assetPath.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream'
      response.writeHead(200, { 'content-type': mediaType, 'content-length': bytes.length, 'cache-control': versioned ? 'public, max-age=31536000, immutable' : 'no-cache', 'x-content-type-options': 'nosniff' })
      response.end(request.method === 'HEAD' ? undefined : bytes)
    } catch { response.writeHead(404); response.end() }
  } }))
}
