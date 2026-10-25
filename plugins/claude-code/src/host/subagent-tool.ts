import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Session } from '@deepseek-ai/dsh-session'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { apply as applySubagentTool } from '@deepseek-ai/dsh-tool-subagent'

const dependencies = ['tools', 'subagents', 'systemPrompt', 'sessionProjections', 'llm']

/** Keep official delegation, route policy and lifecycle, with plugin-owned names. */
export async function registerClaudeSubagentTool(ctx: Context, session: Session): Promise<void> {
  const tools = ctx.get('tools')
  if (!tools) throw new Error('Claude subagent tool runtime is unavailable.')
  const namedTools = new Proxy(tools, {
    get(target, key) {
      if (key !== 'register') {
        const value = Reflect.get(target, key)
        return typeof value === 'function' ? value.bind(target) : value
      }
      return (definition: ToolDefinition) => target.register({
        ...definition,
        name: definition.name === 'list_subagent_models' ? 'claude_list_subagent_models' : definition.name,
        description: definition.description.replaceAll('list_subagent_models', 'claude_list_subagent_models'),
      })
    },
  })
  const toolContext = new Proxy(ctx, { get(target, key) {
    return key === 'tools' ? namedTools : Reflect.get(target, key)
  } })
  await applySubagentTool(toolContext, {
    provider: 'claude-code', toolName: 'claude_subagent', maxDepth: 'provider-managed',
    modelSelectionSettings: ctx.get('subagentModelSelection') !== undefined,
  }, session)
}

/** Mount into each Agent scope so official session-sampled selection stays local. */
export function mountClaudeSubagentTools(ctx: Context): void {
  ctx.inject(['agents', ...dependencies], async scope => {
    const fibers = new Map<Agent, ReturnType<Context['inject']>>()
    const install = async (agent: Agent) => {
      if (fibers.has(agent)) return
      const fiber = agent.ctx.inject(dependencies, runtime => registerClaudeSubagentTool(runtime, agent.session))
      fibers.set(agent, fiber)
      await fiber.await()
    }
    scope.on('agent/created', async ({ agent }) => { await install(agent) })
    scope.on('agent/disposed', ({ agent }) => {
      const fiber = fibers.get(agent)
      fibers.delete(agent)
      if (fiber) void fiber.dispose()
    })
    scope.effect(() => async () => {
      await Promise.allSettled([...fibers.values()].map(fiber => fiber.dispose()))
      fibers.clear()
    })
    await Promise.all(scope.get('agents')!.list().map(install))
  })
}
