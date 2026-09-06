import { readFile } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { KNOWN_SESSION_EVENT_TYPES } from '@deepseek-ai/dsh-session'

// Persisted approval events remain readable even when automatic approval is off.
for (const type of ['autoReview/state', 'autoReview/verdict', 'autoReview/circuit', 'autoReview/override', 'autoReview/rejection']) {
  (KNOWN_SESSION_EVENT_TYPES as Set<string>).add(type)
}

export const inject = ['webServer', 'systemPrompt']

export function apply(ctx: Context): void {
  ctx.systemPrompt.section({
    name: 'zerowall:identity',
    order: -999,
    text: 'ZeroWall Science is a scientific research workbench. Built-in tools and dsh-genui are available by default. rmcp is an on-demand MCP family: rplatform handles R computation/projects/workspaces, rbioagent handles biomedical analysis, and rplotfigure handles FigureYa plotting and charts. zerowall_managed_bio_tools provides biomedical database and research analysis tools; huagongshe provides chemistry search, structures, reactions and stoichiometry. Use meta_search with terms such as FigureYa, figureya, 绘图, 可视化, rplotfigure, R, Biomni or chemistry to find on-demand capabilities, then use meta_enable to enable the selected tools. Only enabled on-demand schemas are sent in the next request. Keep credentials in Settings; never request, echo, or expose keys. Preserve operation approvals for uploads, execution, writes, deletions and cancellations. Return large outputs as file references and concise summaries. Answer verification and operation approval are independent settings.',
  })
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
