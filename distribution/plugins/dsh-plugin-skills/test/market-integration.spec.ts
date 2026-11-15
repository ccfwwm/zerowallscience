/** Built-in market and existing Skills importer composed by the real Loader. */
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zipSync, strToU8 } from 'fflate'
import { Service, type Context } from '@deepseek-ai/cordis'
import { boot } from '@deepseek-ai/dsh-app-boot'
import PluginMarket from '@deepseek-ai/dsh-plugin-market'
import SkillRegistry from '../src/host/registry.ts'
import { SkillsManagement } from '../src/host/index.ts'
import { expect, it, onTestFinished, vi } from 'vitest'
import { installMarketSkills } from '../../../../apps/desktop-host/src/market-skills.ts'

class Manager extends Service {
  constructor(ctx: Context) { super(ctx, 'pluginManager') }
}

it('imports through the existing manager, retains disabled skills, and survives a restart without another catalog plugin', async () => {
  const home = await mkdtemp(join(tmpdir(), 'desktop-market-skills-'))
  let ctx: Awaited<ReturnType<typeof boot>> | undefined
  onTestFinished(async () => {
    try { await ctx?.fiber.dispose() } finally {
      vi.unstubAllGlobals()
      await rm(home, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })
    }
  })
  const resources = join(home, 'resources')
  const receipts = join(home, 'zerowall-online-catalog')
  await mkdir(resources)
  await writeFile(join(resources, 'catalog.json'), '[]')
  const archive = zipSync({ 'workflow/SKILL.md': strToU8('---\nname: workflow\ndescription: Workflow\n---\nRead the project.\n') })
  const row = { id: 'workflow', version: '1.0.0', title: { en: 'Workflow' }, description: { en: 'Workflow' },
    url: 'https://catalog.test/workflow.zip', bytes: archive.length, sha256: createHash('sha256').update(archive).digest('hex'), names: ['workflow'] }
  const fetcher: typeof fetch = async input => {
    if ((typeof input === 'string' ? input : input instanceof URL ? input.href : input.url) === 'https://catalog.test/skills.json') return Response.json({ schemaVersion: 1, skills: [row] })
    if ((typeof input === 'string' ? input : input instanceof URL ? input.href : input.url) === row.url) return new Response(new Uint8Array(archive).buffer)
    throw new Error('Unexpected fixture URL')
  }
  vi.stubGlobal('fetch', fetcher)
  const config = join(home, 'cordis.yml')
  await writeFile(config, [
    '- name: cordis:registry',
    '- name: cordis:skills', `  config: ${JSON.stringify({ home, resources })}`,
    '- name: cordis:manager',
    '- name: cordis:market', `  config: ${JSON.stringify({ detailCacheDir: join(home, 'cache'), skillIndexUrl: 'https://catalog.test/skills.json', skillReceiptDir: receipts })}`,
  ].join('\n') + '\n')
  const start = async () => {
    const root = await boot('test', config, [], scope => {
      Object.assign(scope.loader.builtins, { registry: SkillRegistry, skills: SkillsManagement, manager: Manager, market: PluginMarket })
    })
    installMarketSkills(root)
    await vi.waitFor(() => { expect(root.pluginMarket).toBeDefined() })
    return root
  }
  ctx = await start()
  expect((await ctx.pluginMarket.installSkill(row.id, row.version)).error).toBeUndefined()
  expect((await ctx.zerowallSkills.request({ action: 'list' })).entries).toContainEqual(expect.objectContaining({ name: 'workflow', enabled: true }))
  await ctx.zerowallSkills.request({ action: 'set-enabled', name: 'workflow', enabled: false, scope: 'global' })
  row.version = '1.0.1'
  expect((await ctx.pluginMarket.readSkills(true)).entries[0]?.status).toBe('update')
  expect((await ctx.pluginMarket.installSkill(row.id, row.version)).error).toBeUndefined()
  expect((await ctx.zerowallSkills.request({ action: 'list' })).entries).toContainEqual(expect.objectContaining({ name: 'workflow', enabled: false }))
  await ctx.fiber.dispose()
  ctx = await start()
  expect((await ctx.pluginMarket.readSkills(true)).entries[0]).toMatchObject({ installedVersion: '1.0.1', status: 'installed' })
  expect(JSON.parse(await readFile(join(receipts, 'skills.json'), 'utf8'))).toEqual({ workflow: '1.0.1' })
  expect(ctx.get('zerowallOnlineCatalog')).toBeUndefined()
})
