import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { expect, it, vi } from 'vitest'
import plugin from '../src/host/index.js'

it('loads the service and all tool schemas through the pinned Cordis runtime', async () => {
  const ctx = new Context()
  try {
    ctx.provide('sessions', {} as any)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(plugin)
    expect(ctx.zerowallSinglecell.searchGenes({ targetGenes: ['HSPA1A'], maxCandidates: 1 })[0]?.symbol).toBe('HSPA1A')
    const names = ctx.tools.schemas().map(tool => tool.name)
    for (const operation of ['validate', 'plan', 'run', 'status', 'report']) {
      expect(names).toContain(`sc_tenifold_knockout_${operation}`)
    }
  } finally { await ctx.fiber.dispose() }
})

it('propagates child service registration failures to the plugin loader', async () => {
  const ctx = new Context()
  try {
    ctx.provide('sessions', {} as any)
    ctx.provide('tools', { register: vi.fn(() => { throw new Error('registration failed') }) } as any)
    await expect(ctx.plugin(plugin)).rejects.toThrow('registration failed')
  } finally { await ctx.fiber.dispose() }
})
