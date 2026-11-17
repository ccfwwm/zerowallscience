import { Context } from '@deepseek-ai/cordis'
import { ToolsService } from '@deepseek-ai/dsh-tools'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import { SecretBrokerClient } from '@zerowall/dsh-plugin-ai-cloud/secrets'
import { afterEach, expect, it, vi } from 'vitest'
import { apply, inject, Config } from './index.ts'
import { DEFAULTS } from './config.ts'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })

async function mount(environment?: { ready(): Promise<void>; readVariable(name: string): Promise<string | undefined> }) {
  const ctx = new Context()
  ctx.provide('credentials', { resolve: async () => undefined } as never)
  ctx.provide('settings', { describe: () => [], replace: async () => {} } as never)
  ctx.provide('sessions', {} as never)
  ctx.provide('attachments', {} as never)
  if (environment) ctx.provide('zerowallEnvironment', environment as never)
  ctx.provide('systemPrompt', { tools: () => () => {} } as never)
  await ctx.plugin(ToolsService).await()
  await ctx.plugin(SkillRegistry).await()
  const fiber = ctx.plugin({ name: 'mineru-composition', inject, Config, apply }, DEFAULTS)
  await fiber.await()
  return { ctx, fiber }
}

it('loads independently with an environment key and removes tools and skill on disable', async () => {
  vi.spyOn(SecretBrokerClient.prototype, 'get').mockResolvedValue(undefined)
  vi.stubEnv('MINERU_API_TOKEN', 'synthetic-environment-key')
  const { ctx, fiber } = await mount()
  try {
    expect(await ctx.zerowallMineru.getConfigStatus()).toMatchObject({ api: 'precision', tokenConfigured: true, tokenSource: 'environment', available: true })
    const loaded = await ctx.skills.get('mineru-document-parser')
    expect(loaded?.content).toContain('mineru_task')
    expect(loaded?.metadata?.ownerPackage).toBe('@zerowall/dsh-plugin-mineru')
    await fiber.dispose()
    expect(ctx.tools.get('mineru_parse')).toBeUndefined()
    expect(await ctx.skills.get('mineru-document-parser')).toBeUndefined()
  } finally { await ctx.fiber.dispose() }
})

it('prefers saved plugin credentials and honors environment-service deletion and initialization failures', async () => {
  let dedicated: string | undefined = 'synthetic-saved-key'
  vi.spyOn(SecretBrokerClient.prototype, 'get').mockImplementation(async key => key.endsWith('mineru_api_token') ? dedicated : undefined)
  vi.stubEnv('MINERU_API_TOKEN', 'synthetic-inherited-key')
  const ready = vi.fn().mockResolvedValue(undefined)
  let shared: string | undefined = 'synthetic-shared-key'
  const { ctx } = await mount({ ready, readVariable: async () => shared })
  try {
    expect(await ctx.zerowallMineru.getConfigStatus()).toMatchObject({ tokenSource: 'plugin-settings' })
    dedicated = undefined
    expect(await ctx.zerowallMineru.getConfigStatus()).toMatchObject({ tokenSource: 'environment-settings' })
    shared = undefined
    expect(await ctx.zerowallMineru.getConfigStatus()).toMatchObject({ api: 'agent', tokenConfigured: false, tokenSource: null })
    ready.mockRejectedValueOnce(new Error('store unavailable'))
    await expect(ctx.zerowallMineru.getConfigStatus()).rejects.toThrow('store unavailable')
    expect(JSON.stringify(await ctx.zerowallMineru.getConfigStatus())).not.toContain('synthetic-')
  } finally { await ctx.fiber.dispose() }
})
