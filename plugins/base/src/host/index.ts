import { readFile } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-system-prompt'

export const inject = ['webServer', 'systemPrompt']

export function apply(ctx: Context): void {
  if (process.platform === 'win32') {
    ctx.systemPrompt.section({
      name: 'zerowall:windows-workflow',
      order: 92,
      text: 'Default runtime environment: Windows 10/11. Execute commands with pwsh (PowerShell), use Windows paths, and read environment variables with $env:NAME. Do not choose Bash as the default, and do not use POSIX paths or Bash commands such as find or cat. Use glob, grep, and read for file discovery; inspect the workspace structure first, then search a narrow workspace-relative path in small batches. Always provide glob.path when possible and avoid scanning node_modules, dist, build, target, caches, and other generated directories. Use Bash only when the active runtime is explicitly Linux or macOS.',
    })
  }
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
