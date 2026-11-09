import { randomUUID } from 'node:crypto'
import { Context } from '@deepseek-ai/cordis'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolsService from '@deepseek-ai/dsh-tools'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import { afterEach, vi } from 'vitest'

const contexts: Context[] = []
afterEach(async () => { await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose())) })
/** Use real persistence and policy stages with scripted domain capabilities. */
export async function workflowRuntime(root: string, canonical: Map<string, (args: never) => unknown>) {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SystemPrompt).await()
  await ctx.plugin(ToolsService).await()
  await ctx.plugin(SessionProjectionRegistry).await()
  const definitions = new Map()
  const register = ctx.tools.register.bind(ctx.tools)
  vi.spyOn(ctx.tools, 'register').mockImplementation(definition => { definitions.set(definition.name, definition); return register(definition) })
  for (const name of ['ppt_create', 'ppt_edit', 'ppt_undo', 'ppt_redo', 'ppt_check', 'ppt_render', 'ppt_export', 'generate_image', 'edit_image']) register({
    name, description: name, parameters: { type: 'object', additionalProperties: true },
    output: { schema: {}, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    execute: args => { const execute = canonical.get(name); if (!execute) throw new Error('Unscripted capability ' + name); return execute(args as never) },
  })
  const id = SessionId(randomUUID())
  const session = Session.create(id, [], { ...Session.create(id).header, cwd: root })
  const agent = { session, ctx }
  const events = { at: (index: number) => session.snapshotEvents().at(index) }
  const around = (exec: object, next: () => Promise<unknown>) => ctx.waterfall(ctx.tools, 'tools/execute', exec, next)
  return { ctx, agent, events, definitions, around }
}
