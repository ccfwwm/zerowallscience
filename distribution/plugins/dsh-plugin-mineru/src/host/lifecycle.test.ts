import { Context } from '@deepseek-ai/cordis'
import { ToolsService } from '@deepseek-ai/dsh-tools'
import { SecretBrokerClient } from '@zerowall/dsh-plugin-ai-cloud/secrets'
import { expect, it, vi } from 'vitest'
import { apply, inject, Config, DEFAULTS } from './index.js'

it('mounts all tools, uses official environment readiness and releases registration on disable', async () => {
  const ctx = new Context()
  const ready = vi.fn().mockResolvedValue(undefined)
  const get = vi.spyOn(SecretBrokerClient.prototype, 'get').mockResolvedValue(undefined)
  ctx.provide('credentials', {} as never)
  ctx.provide('settings', { describe: () => [], replace: async () => {} } as never)
  ctx.provide('sessions', {} as never)
  ctx.provide('attachments', {} as never)
  ctx.provide('zerowallEnvironment', { ready } as never)
  ctx.provide('systemPrompt', { tools: () => () => {} } as never)
  try {
    await ctx.plugin(ToolsService).await()
    const fiber = ctx.plugin({ name: 'mineru-composition', inject, Config, apply }, DEFAULTS)
    await fiber.await()
    for (const name of ['mineru_activate', 'mineru_parse', 'mineru_batch_parse', 'mineru_task']) expect(ctx.tools.get(name)).toBeDefined()
    expect(await ctx.zerowallMineru.getConfigStatus()).toMatchObject({ available: true })
    expect(ready).toHaveBeenCalled()
    await fiber.dispose()
    expect(ctx.tools.get('mineru_parse')).toBeUndefined()
  } finally {
    await ctx.fiber.dispose()
    get.mockRestore()
  }
})
