import { Context } from '@deepseek-ai/cordis'
import { ToolsService } from '@deepseek-ai/dsh-tools'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import { SecretBrokerClient } from '@zerowall/dsh-plugin-ai-cloud/secrets'
import { afterEach, expect, it, vi } from 'vitest'
import { apply, inject, Config } from '../../src/pubmed/index.js'
import { DEFAULTS } from '../../src/pubmed/shared/types.js'

afterEach(() => vi.restoreAllMocks())

it('loads the PubMed composition, waits for official credentials and releases tools on disable', async () => {
  const ctx = new Context()
  let finish!: () => void
  const ready = new Promise<void>(resolve => { finish = resolve })
  const original = process.env.NCBI_API_KEY
  const get = vi.spyOn(SecretBrokerClient.prototype, 'get').mockResolvedValue(undefined)
  ctx.provide('credentials', {} as never)
  ctx.provide('settings', { describe: () => [], replace: async () => {} } as never)
  ctx.provide('sessions', {} as never)
  ctx.provide('zerowallEnvironment', { ready: () => ready } as never)
  ctx.provide('systemPrompt', { tools: () => () => {} } as never)
  try {
    await ctx.plugin(ToolsService).await()
    await ctx.plugin(TypertRegistry).await()
    const fiber = ctx.plugin({ name: 'pubmed-composition', inject, Config, apply }, DEFAULTS)
    await fiber.await()
    expect(ctx.tools.get('pubmed_search_papers')).toBeDefined()
    expect(ctx.tools.get('pubmed_graph_commit')).toBeUndefined()
    expect(ctx.typert.getPackage('@zerowall/dsh-zotero/pubmed', 'host')).toBeDefined()
    const status = ctx.zerowallPubmed.getConfigStatus()
    expect(get).not.toHaveBeenCalled()
    process.env.NCBI_API_KEY = 'synthetic-official-value'
    finish()
    expect((await status).keys.find(key => key.name === 'NCBI_API_KEY')).toEqual({ name: 'NCBI_API_KEY', configured: true, source: 'environment' })
    await fiber.dispose()
    expect(ctx.tools.get('pubmed_search_papers')).toBeUndefined()
  } finally {
    finish()
    await ctx.fiber.dispose()
    if (original === undefined) delete process.env.NCBI_API_KEY
    else process.env.NCBI_API_KEY = original
  }
})
