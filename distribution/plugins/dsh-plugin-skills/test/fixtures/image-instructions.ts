/** Mount the real image instructions and their management policy in a shipped profile. */
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import type { SkillProvider } from '@deepseek-ai/dsh-skill'
import { createImageSkillProvider } from '../../../dsh-imagecreate/src/host/skill.ts'
import { SkillsManagement } from '../../src/host/index.ts'

export const inject = ['skills']

/** Register plugin-owned instructions while leaving model discovery enabled. @param ctx - profile context. */
export async function apply(ctx: Context): Promise<void> {
  const provider = createImageSkillProvider()
  const path = join(process.cwd(), 'image-plugin', 'SKILL.md')
  const resourceBase = { kind: 'directory' as const, path: dirname(path) }
  const observation = await provider.list({})
  const candidates = 'candidates' in observation ? observation.candidates : observation
  const projected: SkillProvider = {
    name: provider.name,
    async list() { return candidates.map(candidate => ({ ...candidate, path, resourceBase })) },
    async get(candidate) {
      const original = candidates.find(row => row.name === candidate.name)
      const definition = original ? await provider.get(original, {}) : undefined
      return definition ? { ...definition, content: definition.content.replaceAll('\r\n', '\n'), path, resourceBase } : undefined
    },
  }
  ctx.effect(() => ctx.skills.registerProvider(() => projected))
  const management = ctx.plugin(SkillsManagement, { resources: fileURLToPath(new URL('./empty-skills', import.meta.url)) })
  await management
}
