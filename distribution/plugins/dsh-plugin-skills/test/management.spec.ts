import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SkillRegistry from '../src/host/registry.js'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SkillsManagement } from '../src/host/index.js'

const roots: string[] = []
const disposers: (() => Promise<void>)[] = []
afterEach(async () => { for (const dispose of disposers.splice(0)) await dispose(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function setup(home?: string, providerOwners: Record<string, string> = {}) {
  const root = home ?? await mkdtemp(join(tmpdir(), 'skills-management-'))
  if (!home) roots.push(root)
  const resources = join(root, 'resources')
  await mkdir(resources, { recursive: true })
  const rows = ['core-one', 'topic-one', 'topic-two'].map((name, index) => ({ name, path: `${name}.md`, description: name, topic: index ? 'optional' : 'core', core: !index, license: 'MIT', capabilityId: name, requirements: [] }))
  if (!home) for (const row of rows) await writeFile(join(resources, row.path), `---\nname: ${row.name}\ndescription: ${row.name}\n---\nBody\n`)
  if (!home) await writeFile(join(resources, 'catalog.json'), JSON.stringify(rows))
  const ctx = new Context()
  await ctx.plugin(SkillRegistry)
  const fork = ctx.plugin(SkillsManagement, { home: root, resources, providerOwners })
  await fork
  disposers.push(() => fork.dispose())
  await ctx.zerowallSkills.request({ action: 'list' })
  return { root, ctx, service: ctx.zerowallSkills }
}
describe('shared management policy', () => {
  it('maps official provider ownership while keeping a same-name project override in Skills', async () => {
    const { ctx, service } = await setup(undefined, { official: '@deepseek-ai/dsh-skill-office' })
    const rows = [
      { name: 'office-test', description: 'Bundled', source: 'bundled', provider: 'official', rank: 100, locator: 'bundled' },
      { name: 'office-test', description: 'Project', source: 'project-dsh', provider: 'official', rank: 50, locator: 'project', path: '/project/office-test.md', metadata: { ownerPackage: '@deepseek-ai/dsh-skill-office' } },
    ]
    const dispose = ctx.skills.registerProvider(() => ({ name: 'official', list: async () => rows, get: async candidate => ({ ...candidate, content: candidate.source }) }))
    try {
      const entries = (await service.request({ action: 'list' })).entries!.filter(row => row.name === 'office-test')
      expect(entries.find(row => row.source === 'bundled')).toMatchObject({ kind: 'plugin-instructions', ownerPackage: '@deepseek-ai/dsh-skill-office', effective: false })
      expect(entries.find(row => row.source === 'project-dsh')).toMatchObject({ kind: 'standalone', effective: true })
      expect(entries.find(row => row.source === 'project-dsh')?.ownerPackage).toBeUndefined()
    } finally { dispose() }
  })
  it('classifies plugin instructions without hiding them from model discovery', async () => {
    const { ctx, service } = await setup()
    const descriptor = { name: 'plugin-help', description: 'Plugin help', source: 'bundled', provider: 'owner', rank: 100, locator: 'help', invocation: { modelInvocable: true, userInvocable: true }, metadata: { ownerPackage: '@zerowall/example' } }
    const dispose = ctx.skills.registerProvider(() => ({ name: 'owner', list: async () => [descriptor], get: async candidate => ({ ...candidate, content: 'Use the real plugin tools.' }) }))
    try {
      const entry = (await service.request({ action: 'list' })).entries!.find(row => row.name === 'plugin-help')!
      expect(entry).toMatchObject({ kind: 'plugin-instructions', ownerPackage: '@zerowall/example', enabled: true })
      expect((await ctx.skills.get('plugin-help'))?.content).toBe('Use the real plugin tools.')
      await service.request({ action: 'set-enabled', name: 'plugin-help', enabled: false })
      expect(await ctx.skills.get('plugin-help')).toBeUndefined()
    } finally { dispose() }
    expect((await service.request({ action: 'list' })).entries!.some(row => row.name === 'plugin-help')).toBe(false)
  })
  it('defaults to core and enables one optional skill without enabling its siblings', async () => {
    const { ctx, service } = await setup()
    expect((await ctx.skills.list()).map(row => row.name)).toEqual(['core-one'])
    await service.request({ action: 'set-enabled', name: 'topic-one', enabled: true })
    expect((await ctx.skills.list()).map(row => row.name)).toEqual(['core-one', 'topic-one'])
    await service.request({ action: 'set-topic', topic: 'optional', enabled: false })
    expect(await ctx.skills.get('topic-one')).toBeUndefined()
  })
  it('activates an optional skill only for its workspace without persisting automatic selection', async () => {
    const { root, ctx, service } = await setup()
    const cwd = join(root, 'project')
    expect((await service.request({ action: 'list', cwd })).entries?.find(row => row.name === 'topic-one')).toMatchObject({ enabled: false, onDemand: true, effective: true })
    expect(await service.request({ action: 'activate', name: 'topic-one', cwd })).toEqual({ status: 'activated' })
    expect((await ctx.skills.list({ cwd })).map(row => row.name)).toEqual(['core-one', 'topic-one'])
    expect(await ctx.skills.get('topic-one', { cwd: join(root, 'other') })).toBeUndefined()
    expect(await service.request({ action: 'activate', name: 'topic-one', cwd })).toEqual({ status: 'already-enabled' })
    await expect(readFile(join(root, 'zerowall-skills/state.json'))).rejects.toMatchObject({ code: 'ENOENT' })
    await service.request({ action: 'set-enabled', name: 'topic-one', scope: 'global', enabled: false })
    await expect(service.request({ action: 'activate', name: 'topic-one', cwd })).rejects.toThrow('disabled')
    expect(await ctx.skills.get('topic-one', { cwd })).toBeUndefined()
    await service.request({ action: 'set-enabled', name: 'topic-one', scope: 'workspace', cwd, enabled: true })
    expect(await ctx.skills.get('topic-one', { cwd })).toBeDefined()
    const restored = await setup(root)
    expect(await restored.ctx.skills.get('topic-one', { cwd })).toBeDefined()
    expect(await restored.ctx.skills.get('topic-one', { cwd: join(root, 'other') })).toBeUndefined()
  })
  it('keeps manual-only optional instructions out of automatic activation', async () => {
    const first = await setup()
    await writeFile(join(first.root, 'resources/topic-one.md'), '---\nname: topic-one\ndescription: Manual workflow\ndisable-model-invocation: true\n---\nBody\n')
    const { service } = await setup(first.root)
    await expect(service.request({ action: 'activate', name: 'topic-one', cwd: join(first.root, 'project') })).rejects.toThrow('does not permit automatic')
  })
  it('persists workspace overrides without disabling another workspace', async () => {
    const { root, ctx, service } = await setup()
    const cwd = join(root, 'project')
    await service.request({ action: 'set-enabled', name: 'core-one', enabled: false, scope: 'workspace', cwd })
    expect(await ctx.skills.get('core-one', { cwd })).toBeUndefined()
    expect(await ctx.skills.get('core-one', { cwd: join(root, 'other') })).toBeDefined()
    expect(JSON.parse(await readFile(join(root, 'zerowall-skills', 'state.json'), 'utf8')).workspaceOverrides[cwd]['core-one']).toBe(false)
  })
  it('rejects workspace policy changes without a directory and preserves global enablement', async () => {
    const { ctx, service } = await setup()
    await expect(service.request({ action: 'set-enabled', name: 'core-one', enabled: false, scope: 'workspace' })).rejects.toThrow('Choose a workspace')
    await expect(service.request({ action: 'set-topic', topic: 'optional', enabled: true, scope: 'workspace' })).rejects.toThrow('Choose a workspace')
    expect((await ctx.skills.list()).map(row => row.name)).toEqual(['core-one'])
  })
  it('restores a saved policy and refuses dependency activation before it is usable', async () => {
    const first = await setup()
    await first.service.request({ action: 'set-enabled', name: 'topic-one', enabled: true })
    const second = await setup(first.root)
    expect((await second.ctx.skills.list()).map(row => row.name)).toEqual(['core-one', 'topic-one'])
    const resources = join(first.root, 'resources', 'catalog.json')
    const rows = JSON.parse(await readFile(resources, 'utf8')) as { name: string; requirements: string[] }[]
    rows.find(row => row.name === 'topic-two')!.requirements = ['missing-dependency']
    await writeFile(resources, JSON.stringify(rows))
    const third = await setup(first.root)
    expect(await third.ctx.skills.get('topic-two')).toBeUndefined()
    await expect(third.service.request({ action: 'set-enabled', name: 'topic-two', enabled: true })).rejects.toThrow('Python dependency management is unavailable')
    await expect(third.service.request({ action: 'activate', name: 'topic-two', cwd: join(first.root, 'project') })).rejects.toThrow('Python dependency management is unavailable')
    expect(await third.ctx.skills.get('topic-two')).toBeUndefined()
  })
  it('imports into one workspace disabled and retains files when removed', async () => {
    const { root, ctx, service } = await setup()
    const source = join(root, 'import.md'); const cwd = join(root, 'project')
    await writeFile(source, '---\nname: imported\ndescription: Imported skill\n---\nHello\n')
    const preview = await service.request({ action: 'preview', source, cwd })
    await service.request({ action: 'install', id: preview.preview!.id, scope: 'workspace', cwd })
    expect(await ctx.skills.get('imported', { cwd })).toBeUndefined()
    const item = (await service.request({ action: 'list', cwd })).entries!.find(row => row.name === 'imported')!
    await service.request({ action: 'set-enabled', name: 'imported', enabled: true, cwd, scope: 'workspace' })
    expect((await ctx.skills.get('imported', { cwd }))?.content).toContain('Hello')
    await service.request({ action: 'remove', id: item.id, cwd })
    expect(await ctx.skills.get('imported', { cwd })).toBeUndefined()
    expect(await readFile(item.path!, 'utf8')).toContain('Hello')
  })
  it('preserves manual-only and model-only imported invocation policies after enablement', async () => {
    const { root, ctx, service } = await setup()
    for (const [name, field, expected] of [
      ['manual-only', 'disable-model-invocation: true', { modelInvocable: false, userInvocable: true }],
      ['model-only', 'user-invocable: false', { modelInvocable: true, userInvocable: false }],
    ] as const) {
      const source = join(root, `${name}.md`)
      await writeFile(source, `---\nname: ${name}\ndescription: Invocation policy\n${field}\n---\nBody\n`)
      const preview = await service.request({ action: 'preview', source })
      await service.request({ action: 'install', id: preview.preview!.id, scope: 'global' })
      await service.request({ action: 'set-enabled', name, enabled: true, scope: 'global' })
      expect((await ctx.skills.get(name))?.invocation).toEqual(expected)
      expect((await ctx.skills.list()).find(row => row.name === name)?.invocation).toEqual(expected)
    }
  })
})
