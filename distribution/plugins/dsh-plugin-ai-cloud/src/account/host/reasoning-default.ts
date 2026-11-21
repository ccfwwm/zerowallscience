import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-llm'

/** Apply the product default after session/model routing, before adapter preparation. */
export function installDefaultReasoning(ctx: Context): void {
  ctx.on('agent/request', async ({ signal }, next) => {
    const config = await next()
    if (config.reasoningEffort !== undefined || !config.provider || !config.model) return config
    try {
      const info = await ctx.llm.resolveModelInfo(config.provider, config.model, signal)
      const effort = info.reasoning?.defaultEffort ?? info.reasoning?.efforts.find(effort => effort.id === 'xhigh')?.id
        ?? info.reasoning?.efforts.find(effort => effort.id === 'high')?.id
      if (effort) return { ...config, reasoningEffort: effort }
    } catch {
      signal.throwIfAborted()
      // Adapter preparation owns routing errors; discovery must not mask them.
    }
    return config
  }, { prepend: true })
}
