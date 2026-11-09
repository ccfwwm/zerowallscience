/** Exercise the shipped management tool and registry through a headless profile. */
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import * as management from '../../src/host/index.ts'

export const inject = ['skills', 'tools', 'workingDirectory']

/** Mount the actual policy against workspace-local recorded resources. @param ctx - profile context. */
export async function apply(ctx: Context): Promise<void> {
  await ctx.plugin(management, { resources: join(process.cwd(), 'skill-resources') })
  // Workspace-relative resource text uses one spelling across Windows and POSIX recordings.
  ctx.on('tools/post-execute', async (exec, result, next) => {
    const decision = await next()
    if (exec.name !== 'skill' || decision.kind !== 'accept' || decision.content !== undefined || decision.value !== undefined) return decision
    return { ...decision, content: result.content.map(block => block.type === 'text' ? { ...block, text: block.text.replaceAll('\\', '/') } : block) }
  })
}
