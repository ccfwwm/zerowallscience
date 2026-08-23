import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { mapOpenAIResponsesResult, OpenAIResponsesSearchProvider, ZeroWallWebSearchController } from '../src/host/index.ts'

describe('ZeroWall web search routing', () => {
  it('describes the active AI Cloud route without resolving its credential eagerly', async () => {
    const ctx = new Context()
    const currentInitiator = vi.fn(() => ({
      options: { provider: 'zerowall-ai-cloud-7-completions', model: 'deepseek-v4' },
    }))
    ctx.provide('agents', { currentInitiator } as never)
    const get = vi.fn(async () => 'managed-secret')
    const controller = new ZeroWallWebSearchController(ctx, { secrets: { get, set: vi.fn(), delete: vi.fn() } })
    controller.update({
      status: 'signedIn',
      balanceFreshness: 'current',
      lowBalance: false,
      models: [{
        providerId: 'zerowall-ai-cloud-7-completions',
        groupId: '7',
        groupName: 'DeepSeek',
        modelId: 'deepseek-v4',
        baseUrl: 'https://code.aicodeme.xyz/v1',
      }],
    })

    const route = controller.currentRoute()
    expect(route).toMatchObject({
      provider: 'zerowall-ai-cloud-7-completions',
      model: 'deepseek-v4',
      supportsWebSearch: true,
      searchProtocol: 'anthropic-messages',
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

  it('resolves the group secret from the managed model metadata', () => {
    const ctx = new Context()
    ctx.provide('agents', { currentInitiator: () => ({ options: { provider: 'zerowall-ai-cloud-50-completions', model: 'deepseek-v4-flash' } }) } as never)
    const controller = new ZeroWallWebSearchController(ctx, { secrets: { get: vi.fn(async () => 'key'), set: vi.fn(), delete: vi.fn() } })
    controller.update({
      status: 'signedIn', balanceFreshness: 'current', lowBalance: false,
      models: [{ providerId: 'zerowall-ai-cloud-50-completions', groupId: '50', groupName: '国产模型', modelId: 'deepseek-v4-flash', baseUrl: 'https://hkcode.aicodeme.xyz/v1' }],
    })
    expect(controller.currentRoute()?.supportsWebSearch).toBe(true)
    expect(controller.currentRoute()?.searchProtocol).toBe('anthropic-messages')
  })

  it('selects the codex enterprise gpt-5.6-sol route and maps Responses citations', async () => {
    const ctx = new Context()
    ctx.provide('agents', { currentInitiator: () => ({ options: { provider: 'zerowall-ai-cloud-50-completions', model: 'deepseek-v4-flash' } }) } as never)
    const controller = new ZeroWallWebSearchController(ctx, { secrets: { get: vi.fn(async () => 'key'), set: vi.fn(), delete: vi.fn() } })
    controller.update({ status: 'signedIn', balanceFreshness: 'current', lowBalance: false, models: [
      { providerId: 'zerowall-ai-cloud-77-responses', groupId: '77', groupName: 'codex-企业分组', modelId: 'gpt-5.6-sol', baseUrl: 'https://code.aicodeme.xyz/v1' },
    ] })
    expect(controller.preferredRoute()).toMatchObject({ model: 'gpt-5.6-sol', searchProtocol: 'openai-responses' })
    expect(mapOpenAIResponsesResult({ output: [{ content: [{ annotations: [{ type: 'url_citation', url: 'https://example.test/paper', title: 'Paper' }] }] }] })).toEqual({ sources: [{ url: 'https://example.test/paper', title: 'Paper' }], truncated: false })
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ output: [{ content: [{ annotations: [{ type: 'url_citation', url: 'https://example.test/paper' }] }] }] }), { status: 200, headers: { 'content-type': 'application/json' } }))
    await expect(new OpenAIResponsesSearchProvider(() => ({ resolveApiKey: async () => 'key', baseURL: 'https://code.aicodeme.xyz/v1', model: 'gpt-5.6-sol', fetcher })).search({ query: 'paper' })).resolves.toMatchObject({ sources: [{ url: 'https://example.test/paper' }] })
    expect(fetcher).toHaveBeenCalledWith('https://code.aicodeme.xyz/v1/responses', expect.objectContaining({ method: 'POST' }))
  })
})
