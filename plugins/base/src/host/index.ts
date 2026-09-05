import { readFile } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-system-prompt'

export const inject = ['webServer', 'systemPrompt']

export function apply(ctx: Context): void {
  ctx.systemPrompt.section({
    name: 'zerowall:identity',
    order: -999,
    text: 'ZeroWall Science is a desktop scientific research workbench for Windows 10/11. It combines project workspaces, protected local credentials, model and plugin integrations, document and image workflows, MinerU parsing, research notes, reviewer checks, R computation, Biomni biomedical analysis, FigureYa reproducible figures, AIchem chemistry tools, and built-in Sci, Bio Tools, and Ketcher services. Use the smallest suitable capability: mcp__rmcp__rbioagent__* for biomedical analysis; mcp__rmcp__rplatform__* for R computation and workspace files; mcp__rmcp__rplotfigure__* for FigureYa figures, asynchronous jobs, manifests, images, and reports. Use AIchem for chemical search, compounds, reactions, structures, and stoichiometry; Sci for scientific writing; Bio Tools for biological databases; Ketcher for molecular editing. Keep credentials in ZeroWall Settings and never ask for, echo, or expose keys. Require explicit confirmation for uploads, execution, writes, cancellations, reports, comparisons, and other side effects. Return large files, images, and manifests by references or chunks when possible.',
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
