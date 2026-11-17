/** Expose the maintained integrity workflow and real report tool in the shipped headless profile. */
import type { Context } from '@deepseek-ai/cordis'
import type { SkillProvider } from '@deepseek-ai/dsh-skill'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as SkillsPlugin from '../../src/host/index.ts'

export const inject = ['skills']

/** Mount the production instruction text without optional Python preparation. @param ctx - Profile context. */
export async function apply(ctx: Context): Promise<void> {
  const path = join(process.cwd(), 'integrity-plugin', 'SKILL.md').replaceAll('\\', '/')
  const resourceBase = { kind: 'directory' as const, path: join(process.cwd(), 'integrity-plugin').replaceAll('\\', '/') }
  const descriptor = { name: 'research-integrity', description: 'Compile reviewed evidence into an integrity conclusion report with automatic OCR, ten priority findings and Word export.', source: 'bundled', provider: 'integrity-fixture', rank: 100, locator: 'integrity', invocation: { modelInvocable: true, userInvocable: true }, path, resourceBase }
  const content = (await readFile(fileURLToPath(new URL('../../resources/skills/research-integrity/SKILL.md', import.meta.url)), 'utf8')).split(/---\r?\n/u).slice(2).join('---\n').trim().replaceAll('\r\n', '\n')
  const provider: SkillProvider = { name: 'integrity-fixture', async list() { return [descriptor] }, async get() { return { ...descriptor, content } } }
  ctx.effect(() => ctx.skills.registerProvider(() => provider))
  await ctx.plugin(SkillsPlugin, { resources: fileURLToPath(new URL('./empty-skills', import.meta.url)) })
}
