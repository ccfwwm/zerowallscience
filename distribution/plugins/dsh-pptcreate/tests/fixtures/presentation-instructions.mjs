/** Mount the presentation instructions and discovery in a shipped headless profile. */
import { join } from 'node:path'
import { presentationSkill } from '../../src/index.ts'
import { installPresentationGuidance } from '../../src/workflow/presentation-guidance.ts'
import { installToolDiscovery } from '../../../dsh-plugin-mcp/src/host/tool-discovery.ts'

export const inject = ['skills', 'systemPrompt', 'tools', 'agents']

/** Register the maintained instructions with a stable fixture resource location.
 * @param {import('@deepseek-ai/cordis').Context} ctx - Profile services.
 */
export async function apply(ctx) {
  ctx.on('agent/created', ({ agent }) => {
    agent.session.append('working-directory/change', { cwd: process.cwd().replaceAll('\\', '/') })
  })
  const provider = presentationSkill()
  const observation = await provider.list({})
  const candidates = 'candidates' in observation ? observation.candidates : observation
  const path = join(process.cwd(), 'presentation-plugin', 'SKILL.md').replaceAll('\\', '/')
  const resourceBase = { kind: 'directory', path: join(process.cwd(), 'presentation-plugin').replaceAll('\\', '/') }
  /** @type {import('@deepseek-ai/dsh-skill').SkillProvider} */
  const projected = {
    name: provider.name,
    async list() { return candidates.map(candidate => ({ ...candidate, path, resourceBase })) },
    async get(candidate) {
      const original = candidates.find(row => row.name === candidate.name)
      const definition = original ? await provider.get(original, {}) : undefined
      return definition ? { ...definition, content: definition.content.replaceAll('\r\n', '\n'), path, resourceBase } : undefined
    },
  }
  ctx.effect(() => ctx.skills.registerProvider(() => projected))
  installPresentationGuidance(ctx)
  installToolDiscovery(ctx, {})
}
