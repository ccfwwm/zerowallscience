import { readFile } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'

export const inject = ['webServer']

export function apply(ctx: Context): void {
  const iconPath = process.env.ZEROWALL_BRAND_ICON
  if (iconPath === undefined) return
  ctx.webServer.register({
    kind: 'exact',
    path: '/zerowall-icon.png',
    handler: async (_request, response) => {
      try {
        const icon = await readFile(iconPath)
        response.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' })
        response.end(icon)
      } catch {
        response.writeHead(404)
        response.end()
      }
    },
  })
}
export default { inject, apply }
