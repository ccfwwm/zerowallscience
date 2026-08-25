import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { LlmAdapter, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import { PiAiAdapter, type PiAiAdapterOptions } from '@deepseek-ai/dsh-llm-pi-ai'
import { AiCloudLlmController } from '../src/host/index.js'
import type { AccountSecretStore } from '@zerowallscience/plugin-account'

class MemorySecrets implements AccountSecretStore {
  readonly values = new Map<string, string>()
  async get(key: string): Promise<string | undefined> { return this.values.get(key) }
  async set(key: string, value: string): Promise<void> { this.values.set(key, value) }
  async delete(key: string): Promise<void> { this.values.delete(key) }
}

class DelegatingAdapter extends LlmAdapter {
  private readonly inner: PiAiAdapter
  constructor(private readonly options: PiAiAdapterOptions) { super(); this.inner = new PiAiAdapter(options) }
  override providerInfo(provider: string) { return this.inner.providerInfo(provider) }
  override listModels(provider: string) { return this.inner.listModels(provider) }
  override resolveModel(provider: string, model: string, signal?: AbortSignal) { return this.inner.resolveModel(provider, model, signal) }
  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const key = await this.options.resolveApiKey(options.provider, this.options.profiles().get(options.provider)!)
    yield { type: 'text-delta', delta: key === 'managed-secret' ? 'ok' : 'bad' }
    yield { type: 'finish', reason: { kind: 'stop' }, usage: { inputTokens: 0, outputTokens: 0 } }
  }
}

async function setup(secrets: MemorySecrets) {
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  let options: PiAiAdapterOptions | undefined
  const controller = new AiCloudLlmController(ctx, {
    secrets,
    createAdapter: (value) => { options = value; return new DelegatingAdapter(value) },
  })
  return { ctx, controller, options: () => options! }
}

describe('ZeroWall AI Cloud LLM routes', () => {
  it('registers managed routes, resolves the group key per request, and removes routes on logout', async () => {
    const secrets = new MemorySecrets()
    secrets.values.set('zerowall.ai-cloud.group.2', 'managed-secret')
    const { ctx, controller } = await setup(secrets)
    controller.update({
      status: 'signedIn', email: 'masked@example.com', balanceFreshness: 'current', lowBalance: false,
      models: [
        { providerId: 'zerowall-ai-cloud-2', groupId: '2', groupName: 'Research', modelId: 'alpha', baseUrl: 'https://code.aicodeme.xyz/v1' },
        { providerId: 'zerowall-ai-cloud-2', groupId: '2', groupName: 'Research', modelId: 'beta', baseUrl: 'https://code.aicodeme.xyz/v1' },
      ],
    })
    expect(ctx.llm.listProviders()).toEqual([{ id: 'zerowall-ai-cloud-2', name: 'ZeroWall AI Cloud - Research' }])
    await expect(ctx.llm.listModels('zerowall-ai-cloud-2')).resolves.toEqual([
      { provider: 'zerowall-ai-cloud-2', id: 'alpha', name: 'alpha', inputModalities: ['text', 'image'] },
      { provider: 'zerowall-ai-cloud-2', id: 'beta', name: 'beta', inputModalities: ['text', 'image'] },
    ])
    const chunks = []
    for await (const chunk of ctx.llm.stream({ provider: 'zerowall-ai-cloud-2', model: 'alpha', messages: [] })) chunks.push(chunk)
    expect(chunks[0]).toEqual({ type: 'text-delta', delta: 'ok' })

    controller.update({ status: 'signedOut', balanceFreshness: 'current', lowBalance: false, models: [] })
    expect(ctx.llm.listProviders()).toEqual([])
  })

  it('atomically replaces group routes and never exposes credentials in provider metadata', async () => {
    const secrets = new MemorySecrets()
    const { ctx, controller, options } = await setup(secrets)
    const updated = vi.fn()
    ctx.on('llm/adapters-updated', updated)
    controller.update({
      status: 'signedIn', balanceFreshness: 'current', lowBalance: false,
      models: [{ providerId: 'zerowall-ai-cloud-1', groupId: '1', groupName: 'A', modelId: 'm1', baseUrl: 'https://code.aicodeme.cn/v1' }],
    })
    controller.update({
      status: 'signedIn', balanceFreshness: 'current', lowBalance: false,
      models: [{ providerId: 'zerowall-ai-cloud-3', groupId: '3', groupName: 'B', modelId: 'm2', baseUrl: 'https://code.aicodeme.xyz/v1' }],
    })
    expect(updated).toHaveBeenCalledTimes(2)
    expect(ctx.llm.listProviders().map(item => item.id)).toEqual(['zerowall-ai-cloud-3'])
    expect(JSON.stringify([...options().profiles().values()])).not.toContain('managed-secret')
  })

  it('switches an unusable built-in default to the first managed DeepSeek model after login', async () => {
    const secrets = new MemorySecrets()
    secrets.values.set('zerowall.ai-cloud.group.2', 'managed-secret')
    const { ctx, controller } = await setup(secrets)
    const saveSelection = vi.fn()
    ctx.provide('agentDefaultModel', {
      currentSelection: () => ({ provider: 'deepseek-official', model: 'deepseek-v4-flash' }),
      saveSelection,
    } as never)

    await controller.update({
      status: 'signedIn', balanceFreshness: 'current', lowBalance: false,
      models: [
        { providerId: 'zerowall-ai-cloud-2', groupId: '2', groupName: 'Research', modelId: 'deepseek-chat', baseUrl: 'https://code.aicodeme.xyz/v1' },
        { providerId: 'zerowall-ai-cloud-2', groupId: '2', groupName: 'Research', modelId: 'kimi-k3', baseUrl: 'https://code.aicodeme.xyz/v1' },
      ],
    })

    expect(saveSelection).toHaveBeenCalledWith({ provider: 'zerowall-ai-cloud-2', model: 'deepseek-chat' })
  })

  it('restores reasoning effort choices for managed DeepSeek reasoning models', async () => {
    const secrets = new MemorySecrets()
    secrets.values.set('zerowall.ai-cloud.group.2', 'managed-secret')
    const { ctx, controller } = await setup(secrets)
    await controller.update({
      status: 'signedIn', balanceFreshness: 'current', lowBalance: false,
      models: [
        { providerId: 'zerowall-ai-cloud-2', groupId: '2', groupName: 'Research', modelId: 'deepseek-v4-pro', baseUrl: 'https://code.aicodeme.xyz/v1' },
        { providerId: 'zerowall-ai-cloud-2', groupId: '2', groupName: 'Research', modelId: 'deepseek-chat', baseUrl: 'https://code.aicodeme.xyz/v1' },
      ],
    })

    await expect(ctx.llm.resolveModelInfo('zerowall-ai-cloud-2', 'deepseek-v4-pro')).resolves.toMatchObject({
      inputModalities: ['text', 'image'],
      reasoning: {
        efforts: [
          { id: 'off', name: 'Off' },
          { id: 'low', name: 'Low' },
          { id: 'medium', name: 'Medium' },
          { id: 'high', name: 'High' },
          { id: 'max', name: 'Max' },
        ],
      },
    })
    await expect(ctx.llm.resolveModelInfo('zerowall-ai-cloud-2', 'deepseek-chat')).resolves.not.toHaveProperty('reasoning')
  })

  it('defaults every non-DeepSeek managed model to vision input and keeps GPT reasoning choices', async () => {
    const { ctx, controller } = await setup(new MemorySecrets())
    await controller.update({
      status: 'signedIn', balanceFreshness: 'current', lowBalance: false,
      models: [
        { providerId: 'zerowall-ai-cloud-2', groupId: '2', groupName: 'Research', modelId: 'gpt-5.6-sol', baseUrl: 'https://code.aicodeme.xyz/v1' },
        { providerId: 'zerowall-ai-cloud-2', groupId: '2', groupName: 'Research', modelId: 'gpt-5.6-terra', baseUrl: 'https://code.aicodeme.xyz/v1' },
        { providerId: 'zerowall-ai-cloud-2', groupId: '2', groupName: 'Research', modelId: 'plain-chat', baseUrl: 'https://code.aicodeme.xyz/v1' },
      ],
    })

    await expect(ctx.llm.listModels('zerowall-ai-cloud-2')).resolves.toEqual([
      { provider: 'zerowall-ai-cloud-2', id: 'gpt-5.6-sol', name: 'gpt-5.6-sol', inputModalities: ['text', 'image'] },
      { provider: 'zerowall-ai-cloud-2', id: 'gpt-5.6-terra', name: 'gpt-5.6-terra', inputModalities: ['text', 'image'] },
      { provider: 'zerowall-ai-cloud-2', id: 'plain-chat', name: 'plain-chat', inputModalities: ['text', 'image'] },
    ])
    await expect(ctx.llm.resolveModelInfo('zerowall-ai-cloud-2', 'gpt-5.6-sol')).resolves.toMatchObject({
      inputModalities: ['text', 'image'],
      reasoning: { efforts: [
        { id: 'off', name: 'Off' },
        { id: 'minimal', name: 'Minimal' },
        { id: 'low', name: 'Low' },
        { id: 'medium', name: 'Medium' },
        { id: 'high', name: 'High' },
        { id: 'xhigh', name: 'Xhigh' },
        { id: 'max', name: 'Max' },
      ] },
    })
    await expect(ctx.llm.resolveModelInfo('zerowall-ai-cloud-2', 'plain-chat')).resolves.not.toHaveProperty('reasoning')
  })

  it('splits mixed gateway catalogs into protocol-specific streaming routes', async () => {
    const { controller, options } = await setup(new MemorySecrets())
    await controller.update({
      status: 'signedIn', balanceFreshness: 'current', lowBalance: false,
      models: [
        { providerId: 'zerowall-ai-cloud-2-responses', groupId: '2', groupName: 'Research', modelId: 'gpt-5.6', baseUrl: 'https://hkcode.aicodeme.xyz/v1' },
        { providerId: 'zerowall-ai-cloud-2-messages', groupId: '2', groupName: 'Research', modelId: 'claude-sonnet-4', baseUrl: 'https://hkcode.aicodeme.xyz' },
        { providerId: 'zerowall-ai-cloud-2-completions', groupId: '2', groupName: 'Research', modelId: 'deepseek-v4', baseUrl: 'https://hkcode.aicodeme.xyz/v1' },
      ],
    })

    expect(options().profiles().get('zerowall-ai-cloud-2-responses')).toMatchObject({ api: 'openai-responses' })
    expect(options().profiles().get('zerowall-ai-cloud-2-messages')).toMatchObject({ api: 'anthropic-messages' })
    expect(options().profiles().get('zerowall-ai-cloud-2-completions')).toMatchObject({ api: 'openai-completions' })
    expect(options().profiles().get('zerowall-ai-cloud-2-messages')).toMatchObject({ baseURL: 'https://hkcode.aicodeme.xyz' })
  })

  it('states the gateway wire switches pi-ai cannot infer, per protocol', async () => {
    const { controller, options } = await setup(new MemorySecrets())
    await controller.update({
      status: 'signedIn', balanceFreshness: 'current', lowBalance: false,
      models: [
        { providerId: 'zerowall-ai-cloud-2-responses', groupId: '2', groupName: 'Research', modelId: 'gpt-5.6', baseUrl: 'https://hkcode.aicodeme.xyz/v1' },
        { providerId: 'zerowall-ai-cloud-2-messages', groupId: '2', groupName: 'Research', modelId: 'claude-sonnet-4', baseUrl: 'https://hkcode.aicodeme.xyz' },
        { providerId: 'zerowall-ai-cloud-2-completions', groupId: '2', groupName: 'Research', modelId: 'deepseek-v4', baseUrl: 'https://hkcode.aicodeme.xyz/v1' },
      ],
    })

    const compatOf = (route: string): Record<string, unknown> | undefined =>
      options().profiles().get(route)?.piProvider.getModels()[0]?.compat as Record<string, unknown> | undefined

    // The gateway rejects `role: "developer"`, and rejects a `strict` tool
    // whose schema declares no `required`. Both OpenAI-shaped protocols must
    // carry the two switches; the Anthropic route takes its own strict field.
    expect(compatOf('zerowall-ai-cloud-2-completions')).toMatchObject({ supportsDeveloperRole: false, supportsStrictMode: false })
    expect(compatOf('zerowall-ai-cloud-2-responses')).toMatchObject({ supportsDeveloperRole: false, supportsStrictMode: false })
    expect(compatOf('zerowall-ai-cloud-2-messages')).toMatchObject({ supportsStrictTools: false })
    // Route-level switches skip protocols that do not declare them rather than
    // leaking an OpenAI field onto the Anthropic transport.
    expect(compatOf('zerowall-ai-cloud-2-messages')).not.toHaveProperty('supportsDeveloperRole')
    expect(compatOf('zerowall-ai-cloud-2-completions')).not.toHaveProperty('supportsStrictTools')
  })

  it('rejects untrusted endpoints and mismatched group routes', async () => {
    const { controller } = await setup(new MemorySecrets())
    await expect(controller.update({
      status: 'signedIn', balanceFreshness: 'current', lowBalance: false,
      models: [{ providerId: 'zerowall-ai-cloud-2', groupId: '2', groupName: 'Bad', modelId: 'm', baseUrl: 'https://evil.example/v1' }],
    })).rejects.toThrow('not a trusted')
    await expect(controller.update({
      status: 'signedIn', balanceFreshness: 'current', lowBalance: false,
      models: [{ providerId: 'zerowall-ai-cloud-2', groupId: '3', groupName: 'Bad', modelId: 'm', baseUrl: 'https://code.aicodeme.xyz/v1' }],
    })).rejects.toThrow('does not match group')
  })
})
