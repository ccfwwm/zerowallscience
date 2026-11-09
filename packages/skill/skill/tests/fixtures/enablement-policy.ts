/** A profile-mounted policy exercises ordinary discovery and tool dispatch. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-working-directory'
export const inject = ['skills', 'systemPrompt', 'workingDirectory']
/** Hide the selected name on every normal Skill consumer. @param ctx - fixture plugin context. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.skills.registerEnablementPolicy(() => candidate => candidate.name !== 'snapshot-skill'))
  // Keep the actual directory readable by the shared snapshot path tokenizer on Windows.
  const directoryText = (directory: string) => `Current working directory: ${JSON.stringify(directory.replaceAll('\\', '/'))}.`
  ctx.on('agent/created', ({ agent }) => {
    agent.ctx.effect(() => agent.ctx.systemPrompt.context({
      name: 'working-directory:current',
      order: ctx.systemPrompt.getContextOrder('WORKING_DIRECTORY'),
      required: true,
      interpolate: false,
      text: () => directoryText(ctx.workingDirectory.get(agent.session)),
    }))
  })
  ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
    const assembly = await next()
    const current = assembly.contexts.find(entry => entry.name === 'working-directory:current')
    if (current && context.agent) current.text = directoryText(ctx.workingDirectory.get(context.agent.session))
    return assembly
  }, { prepend: true })
}
