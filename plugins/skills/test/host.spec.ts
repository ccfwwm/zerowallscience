import { describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Context } from '@deepseek-ai/cordis'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import { ZeroWallCapabilitiesService } from '../src/host/index.js'

const summary = {
  name: 'literature-review',
  description: 'Build a reproducible literature review.',
  whenToUse: 'Use for structured evidence synthesis.',
  source: 'bundled',
  provider: 'zerowall-scientific-skills',
  invocation: { modelInvocable: true, userInvocable: true },
}

describe('ZeroWall capabilities Remote', () => {
  it('returns sanitized Skill summaries and loads full content only on demand', async () => {
    const ctx = new Context()
    const list = async () => [summary]
    const get = async (name: string) => name === summary.name ? { ...summary, content: '# Literature review\n\nWorkflow.' } : undefined
    ctx.provide('skills', { list, get } as never)
    const service = new ZeroWallCapabilitiesService(ctx)

    await expect(service.listSkills()).resolves.toEqual([{
      name: summary.name,
      description: summary.description,
      whenToUse: summary.whenToUse,
      source: summary.source,
      provider: summary.provider,
      modelInvocable: true,
      userInvocable: true,
    }])
    await expect(service.getSkill(' literature-review ')).resolves.toEqual(expect.objectContaining({
      name: summary.name,
      content: '# Literature review\n\nWorkflow.',
    }))
  })

  it('reports a missing Skill without leaking registry internals', async () => {
    const ctx = new Context()
    ctx.provide('skills', { list: async () => [], get: async () => undefined } as never)
    const service = new ZeroWallCapabilitiesService(ctx)
    await expect(service.getSkill('missing')).rejects.toThrow('Skill was not found: missing')
  })

  it('registers the Electron-provided scientific catalog in the DSH registry', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zerowall-scientific-skills-'))
    const skillRoot = join(root, 'literature-review')
    await mkdir(skillRoot)
    await writeFile(join(skillRoot, 'SKILL.md'), [
      '---',
      'name: literature-review',
      'description: Build a reproducible literature review.',
      '---',
      '',
      '# Literature review',
    ].join('\n'))

    const previous = process.env.ZEROWALL_BUNDLED_SKILLS
    process.env.ZEROWALL_BUNDLED_SKILLS = root
    try {
      const ctx = new Context()
      await ctx.plugin(SkillRegistry)
      const service = new ZeroWallCapabilitiesService(ctx)
      await expect(service.listSkills()).resolves.toEqual([
        expect.objectContaining({ name: 'literature-review', source: 'bundled', provider: 'zerowall-scientific' }),
      ])
      await expect(service.getSkill('literature-review')).resolves.toEqual(
        expect.objectContaining({ content: '# Literature review' }),
      )
      await ctx.fiber.dispose()
    } finally {
      if (previous === undefined) delete process.env.ZEROWALL_BUNDLED_SKILLS
      else process.env.ZEROWALL_BUNDLED_SKILLS = previous
    }
  })

  it('creates and disables user Skills without modifying the bundled catalog', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zerowall-user-skills-'))
    const enabled = join(root, 'enabled')
    const previous = process.env.ZEROWALL_USER_SKILLS
    process.env.ZEROWALL_USER_SKILLS = enabled
    try {
      const ctx = new Context()
      await ctx.plugin(SkillRegistry)
      const service = new ZeroWallCapabilitiesService(ctx)
      await expect(service.createSkill({ name: 'custom-analysis', description: 'Custom analysis workflow.', content: '# Steps\n\nRun the analysis.' }))
        .resolves.toEqual(expect.objectContaining({ name: 'custom-analysis', provider: 'zerowall-user-skills' }))
      await expect(service.listSkillSources()).resolves.toEqual({ enabled: ['custom-analysis'], disabled: [] })
      await service.setSkillEnabled('custom-analysis', false)
      await expect(service.listSkillSources()).resolves.toEqual({ enabled: [], disabled: ['custom-analysis'] })
      await expect(service.listSkills()).resolves.toEqual([
        expect.objectContaining({ name: 'custom-analysis', provider: 'zerowall-user-skills', modelInvocable: false }),
      ])
      await expect(service.getSkill('custom-analysis')).resolves.toEqual(
        expect.objectContaining({ name: 'custom-analysis', content: '# Steps\n\nRun the analysis.' }),
      )
      await service.setSkillEnabled('custom-analysis', true)
      await expect(service.listSkillSources()).resolves.toEqual({ enabled: ['custom-analysis'], disabled: [] })
      await service.setSkillEnabled('custom-analysis', false)
      await service.removeImportedSkill('custom-analysis')
      await expect(service.listSkillSources()).resolves.toEqual({ enabled: [], disabled: [] })
      await ctx.fiber.dispose()
    } finally {
      if (previous === undefined) delete process.env.ZEROWALL_USER_SKILLS
      else process.env.ZEROWALL_USER_SKILLS = previous
    }
  })

  it('copies a bundled Skill into the editable user directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zerowall-copy-bundled-skill-'))
    const bundled = join(root, 'bundled')
    const enabled = join(root, 'enabled')
    const skill = join(bundled, 'paper-triage')
    await mkdir(skill, { recursive: true })
    await writeFile(join(skill, 'SKILL.md'), '---\nname: paper-triage\ndescription: Triage papers.\n---\n\n# Triage\n')
    const previousBundled = process.env.ZEROWALL_BUNDLED_SKILLS
    const previousUser = process.env.ZEROWALL_USER_SKILLS
    process.env.ZEROWALL_BUNDLED_SKILLS = bundled
    process.env.ZEROWALL_USER_SKILLS = enabled
    try {
      const ctx = new Context()
      await ctx.plugin(SkillRegistry)
      const service = new ZeroWallCapabilitiesService(ctx)
      await expect(service.copyBundledSkill({ name: 'paper-triage' })).resolves.toEqual(expect.objectContaining({ provider: 'zerowall-user-skills' }))
      await expect(service.listSkillSources()).resolves.toEqual({ enabled: ['paper-triage'], disabled: [] })
      await ctx.fiber.dispose()
    } finally {
      if (previousBundled === undefined) delete process.env.ZEROWALL_BUNDLED_SKILLS
      else process.env.ZEROWALL_BUNDLED_SKILLS = previousBundled
      if (previousUser === undefined) delete process.env.ZEROWALL_USER_SKILLS
      else process.env.ZEROWALL_USER_SKILLS = previousUser
    }
  })

  it('lets an editable user Skill override a same-name bundled Skill', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zerowall-skill-override-'))
    const bundled = join(root, 'bundled')
    const enabled = join(root, 'enabled')
    await mkdir(join(bundled, 'shared-skill'), { recursive: true })
    await mkdir(enabled, { recursive: true })
    await writeFile(join(bundled, 'shared-skill', 'SKILL.md'), '---\nname: shared-skill\ndescription: Bundled copy.\n---\n\nBundled body.\n')
    await mkdir(join(enabled, 'shared-skill'))
    await writeFile(join(enabled, 'shared-skill', 'SKILL.md'), '---\nname: shared-skill\ndescription: User copy.\n---\n\nUser body.\n')
    const previousBundled = process.env.ZEROWALL_BUNDLED_SKILLS
    const previousUser = process.env.ZEROWALL_USER_SKILLS
    process.env.ZEROWALL_BUNDLED_SKILLS = bundled
    process.env.ZEROWALL_USER_SKILLS = enabled
    try {
      const ctx = new Context()
      await ctx.plugin(SkillRegistry)
      const service = new ZeroWallCapabilitiesService(ctx)
      await expect(service.getSkill('shared-skill')).resolves.toEqual(expect.objectContaining({
        provider: 'zerowall-user-skills',
        description: 'User copy.',
        content: 'User body.',
      }))
      await ctx.fiber.dispose()
    } finally {
      if (previousBundled === undefined) delete process.env.ZEROWALL_BUNDLED_SKILLS
      else process.env.ZEROWALL_BUNDLED_SKILLS = previousBundled
      if (previousUser === undefined) delete process.env.ZEROWALL_USER_SKILLS
      else process.env.ZEROWALL_USER_SKILLS = previousUser
    }
  })
})
