import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { ZeroWallWebSearchController } from '../src/host/index.ts'

describe('ZeroWall web search routing', () => {
  it('describes the active AI Cloud route without resolving its credential eagerly', async () => {
    const ctx = new Context()
    const currentInitiator = vi.fn(() => ({
      options: { provider: 'zerowall-ai-cloud-7', model: 'deepseek-v4' },
    }))
    ctx.provide('agents', { currentInitiator } as never)
    const get = vi.fn(async () => 'managed-secret')
    const controller = new ZeroWallWebSearchController(ctx, { secrets: { get, set: vi.fn(), delete: vi.fn() } })
    controller.update({
      status: 'signedIn',
      balanceFreshness: 'current',
      lowBalance: false,
      models: [{
        providerId: 'zerowall-ai-cloud-7',
        groupId: '7',
        groupName: 'DeepSeek',
        modelId: 'deepseek-v4',
        baseUrl: 'https://code.aicodeme.xyz/v1',
      }],
    })

    const route = controller.currentRoute()
    expect(route).toMatchObject({
      provider: 'zerowall-ai-cloud-7',
      model: 'deepseek-v4',
      supportsWebSearch: false,
      searchProtocol: 'openai-completions',
      searchEndpoint: 'https://code.aicodeme.xyz/v1',
    })
    expect(get).not.toHaveBeenCalled()
    await expect(route?.resolveApiKey()).resolves.toBe('managed-secret')
    expect(get).toHaveBeenCalledWith('zerowall.ai-cloud.group.7')
  })

  it('does not claim official or unknown providers', () => {
    const ctx = new Context()
    ctx.provide('agents', {
      currentInitiator: () => ({ options: { provider: 'deepseek-official', model: 'deepseek-v4' } }),
    } as never)
    const controller = new ZeroWallWebSearchController(ctx, {
      secrets: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
    })
    expect(controller.currentRoute()).toBeUndefined()
  })
})
