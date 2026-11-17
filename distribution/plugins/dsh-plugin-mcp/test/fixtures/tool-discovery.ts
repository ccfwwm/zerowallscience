/** Real tool discovery in the shipped headless profile. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-working-directory'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { installToolDiscovery } from '../../src/host/tool-discovery.ts'

export const inject = ['tools', 'systemPrompt', 'agents']

/** Mount discovery and an optional capability. @param ctx - profile context. */
export function apply(ctx: Context): void {
  // Forward slashes keep the recorded cwd text independent of JSON backslash escaping.
  ctx.on('agent/created', ({ agent }) => {
    agent.session.append('working-directory/change', { cwd: process.cwd().replaceAll('\\', '/') })
  })
  installToolDiscovery(ctx, {})
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'research_lookup', description: 'Look up a research topic.', parameters: {},
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    execute: async () => 'FOUND',
  })))
}
