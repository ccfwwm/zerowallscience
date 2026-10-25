import { describe, expect, it, vi } from 'vitest'
import {
  ClaudeSafeOutput,
  resolveClaudeRoute,
  selectedClaudeModel,
  type ClaudeRouteServices,
  type ClaudeSelection,
} from '../src/host/route.js'

const selection: ClaudeSelection = { provider: 'manual', model: 'claude-selected', reasoningEffort: 'high' }
const manualServices = (profile: Record<string, unknown> = {}): ClaudeRouteServices => ({
  directory: () => [{ provider: 'manual', settingsNs: 'models', settingsPath: ['providers', 'manual'], defaultBaseURL: 'https://default.example/api/' }],
  settings: () => [{ ns: 'models', value: { providers: { manual: {
    api: 'anthropic-messages', baseURL: 'https://manual.example/api///', apiKeyEnv: 'MANUAL_CLAUDE_KEY', ...profile,
  } } } }],
  credential: vi.fn(async ref => ref === 'MANUAL_CLAUDE_KEY' ? '  manual-key-sentinel  ' : undefined),
})

describe('Claude Code current conversation routing', () => {
  it.each(['none', 'minimal', 'unknown'])('rejects unsupported effort %s before reading credentials', async reasoningEffort => {
    const services = manualServices()
    await expect(resolveClaudeRoute({ ...selection, reasoningEffort }, services)).rejects.toThrow('推理强度不受此 Claude Code 版本支持')
    expect(services.credential).not.toHaveBeenCalled()
  })

  it('resolves the nested manual profile and its credential reference without changing selection', async () => {
    const services = manualServices()
    expect(await resolveClaudeRoute(selection, services)).toEqual({
      ...selection, baseUrl: 'https://manual.example/api', apiKey: 'manual-key-sentinel',
    })
    expect(services.credential).toHaveBeenCalledExactlyOnceWith('MANUAL_CLAUDE_KEY')
  })

  it('uses the provider default endpoint when no explicit endpoint is configured', async () => {
    expect((await resolveClaudeRoute(selection, manualServices({ baseURL: undefined }))).baseUrl)
      .toBe('https://default.example/api')
  })

  it.each(['openai-completions', 'openai-responses', undefined])('rejects a manual route whose declared protocol is %s', async api => {
    await expect(resolveClaudeRoute(selection, manualServices({ api }))).rejects.toThrow('仅支持明确声明为 Anthropic Messages')
  })

  it.each(['literal key with spaces', 'vault://credentials/key', '', undefined])('does not treat an invalid credential reference as a literal key (%s)', async apiKeyEnv => {
    const services = manualServices({ apiKeyEnv, apiKey: 'plaintext-must-not-be-used' })
    await expect(resolveClaudeRoute(selection, services)).rejects.toThrow('当前模型路由没有可用凭据')
    expect(services.credential).not.toHaveBeenCalled()
  })

  it.each([undefined, '', '   ', 'bad\0key'])('rejects missing or invalid resolved credentials (%s)', async value => {
    const services = manualServices()
    services.credential = vi.fn(async () => value)
    await expect(resolveClaudeRoute(selection, services)).rejects.toThrow('当前模型路由没有可用凭据')
  })

  it('fails closed when the provider or nested profile cannot be read', async () => {
    await expect(resolveClaudeRoute({ ...selection, provider: 'absent' }, manualServices()))
      .rejects.toThrow('当前模型路由没有可读取的协议配置')
    const services = manualServices()
    services.settings = () => [{ ns: 'models', value: { providers: {} } }]
    await expect(resolveClaudeRoute(selection, services)).rejects.toThrow('当前模型路由没有可读取的协议配置')
  })

  it('uses Host-only AI Cloud route metadata and the fresh managed credential', async () => {
    const selected = { provider: 'zerowall-ai-cloud-group', model: 'platform-claude', reasoningEffort: 'high' }
    const services = manualServices()
    services.managedRoute = vi.fn(async () => ({ api: 'anthropic-messages', baseUrl: 'https://cloud.example/v1/', apiKey: 'old-route-key' }))
    services.managedCredential = vi.fn(async () => 'fresh-managed-key')
    expect(await resolveClaudeRoute(selected, services)).toEqual({
      ...selected, baseUrl: 'https://cloud.example/v1', apiKey: 'fresh-managed-key',
    })
    expect(services.managedRoute).toHaveBeenCalledExactlyOnceWith(selected.provider, selected.model)
    expect(services.managedCredential).toHaveBeenCalledExactlyOnceWith(selected.provider, selected.model)
    expect(services.credential).not.toHaveBeenCalled()
  })

  it('can use the managed route credential when the optional fresh credential resolver is absent', async () => {
    const services = manualServices()
    services.managedRoute = vi.fn(async () => ({ api: 'anthropic-messages', baseUrl: 'https://cloud.example', apiKey: 'route-owned-key' }))
    expect((await resolveClaudeRoute({ provider: 'zerowall-ai-cloud-group', model: 'platform-model' }, services)).apiKey)
      .toBe('route-owned-key')
  })

  it.each(['openai-completions', undefined])('does not infer AI Cloud wire protocol from the Claude model name (%s)', async api => {
    const services = manualServices()
    services.managedRoute = vi.fn(async () => ({ ...(api === undefined ? {} : { api }), baseUrl: 'https://cloud.example', apiKey: 'managed-key' }))
    await expect(resolveClaudeRoute({ provider: 'zerowall-ai-cloud-group', model: 'claude-sonnet' }, services))
      .rejects.toThrow('仅支持明确声明为 Anthropic Messages')
  })

  it('takes pending before the logged selection and resolves a changed model and credential on the next turn', async () => {
    const services = manualServices()
    services.managedRoute = vi.fn(async (_provider, model) => ({ api: 'anthropic-messages', baseUrl: `https://${model}.example` }))
    services.managedCredential = vi.fn(async (_provider, model) => `${model}-credential`)
    const first = { provider: 'zerowall-ai-cloud-group', model: 'first-model', reasoningEffort: 'medium' }
    const second = { provider: 'zerowall-ai-cloud-group', model: 'second-model', reasoningEffort: 'high' }
    const fallback = vi.fn(() => selection)
    const firstRoute = await resolveClaudeRoute(selectedClaudeModel({ lastUsed: first }, fallback, { config: first }), services)
    const secondRoute = await resolveClaudeRoute(selectedClaudeModel({ pending: second, lastUsed: first }, fallback, { config: first, adapterDefaults: { reasoningEffort: true } }), services)
    expect(firstRoute).toEqual({ ...first, baseUrl: 'https://first-model.example', apiKey: 'first-model-credential' })
    expect(secondRoute).toEqual({ ...second, baseUrl: 'https://second-model.example', apiKey: 'second-model-credential' })
    expect(fallback).not.toHaveBeenCalled()
    expect(services.managedCredential).toHaveBeenCalledTimes(2)
  })

  it('falls back only without session selection and rejects an incomplete selected model', () => {
    const fallback = vi.fn(() => selection)
    expect(selectedClaudeModel({ pending: null, lastUsed: null }, fallback)).toEqual(selection)
    expect(fallback).toHaveBeenCalledOnce()
    expect(() => selectedClaudeModel({ pending: { provider: 'manual', model: '' } }, fallback)).toThrow('当前会话没有选择模型')
  })

  it.each(['minimal', 'high'])('does not reinterpret logged adapter-default effort %s as user intent', async reasoningEffort => {
    const lastUsed = Object.freeze({ ...selection, reasoningEffort })
    const header = Object.freeze({ config: lastUsed, adapterDefaults: Object.freeze({ reasoningEffort: true }) })
    const fallback = vi.fn(() => ({ provider: 'other-provider', model: 'other-model', reasoningEffort: 'max' }))
    const restored = selectedClaudeModel({ pending: null, lastUsed }, fallback, header)
    expect(restored).toEqual({ provider: selection.provider, model: selection.model })
    expect(await resolveClaudeRoute(restored, manualServices())).toMatchObject({ provider: selection.provider, model: selection.model })
    expect(restored).not.toHaveProperty('reasoningEffort')
    expect(lastUsed.reasoningEffort).toBe(reasoningEffort)
    expect(fallback).not.toHaveBeenCalled()
  })

  it('keeps explicit logged effort and honors an explicit pending effort over an adapter default', () => {
    const fallback = vi.fn(() => ({ provider: 'other-provider', model: 'other-model' }))
    expect(selectedClaudeModel({ pending: null, lastUsed: selection }, fallback, { config: selection })).toEqual(selection)
    const pending = Object.freeze({ ...selection, reasoningEffort: 'xhigh' })
    expect(selectedClaudeModel({ pending, lastUsed: selection }, fallback, { config: selection, adapterDefaults: { reasoningEffort: true } })).toEqual(pending)
    expect(pending.reasoningEffort).toBe('xhigh')
    expect(fallback).not.toHaveBeenCalled()
  })

  it('does not inherit effort from a stale projection or fallback when the logged route omits it', () => {
    const fallback = vi.fn(() => ({ ...selection, reasoningEffort: 'max' }))
    const logged = { provider: selection.provider, model: 'logged-without-effort' }
    expect(selectedClaudeModel({ lastUsed: selection }, fallback, { config: logged })).toEqual(logged)
    expect(fallback).not.toHaveBeenCalled()
  })

  it('reads the live fallback when no request header or pending intent exists', () => {
    let current = { ...selection, model: 'first-default' }
    const fallback = vi.fn(() => current)
    expect(selectedClaudeModel({ pending: null, lastUsed: selection }, fallback)).toEqual(current)
    current = { ...selection, model: 'second-default' }
    expect(selectedClaudeModel({ pending: null, lastUsed: selection }, fallback)).toEqual(current)
    expect(fallback).toHaveBeenCalledTimes(2)
  })

  it.each(['', 'minimal'])('keeps explicit unsupported effort %j for rejection before resolving credentials', async reasoningEffort => {
    const services = manualServices()
    const pending = { ...selection, reasoningEffort }
    const restored = selectedClaudeModel({ pending }, () => selection, { config: selection, adapterDefaults: { reasoningEffort: true } })
    expect(restored.reasoningEffort).toBe(reasoningEffort)
    await expect(resolveClaudeRoute(restored, services)).rejects.toThrow('推理强度不受此 Claude Code 版本支持')
    expect(services.credential).not.toHaveBeenCalled()
  })

  it.each([
    'file:///private/model', 'ftp://endpoint.example', 'https://user:password@endpoint.example',
    'https://endpoint.example?key=sensitive', 'https://endpoint.example#fragment', 'not-an-endpoint',
  ])('rejects unsupported endpoint %s', async baseURL => {
    await expect(resolveClaudeRoute(selection, manualServices({ baseURL }))).rejects.toThrow('当前路由的 API endpoint 不受支持')
  })

  it.each(['', '  ', 'https://endpoint.example/\0'])('rejects an empty or NUL-bearing endpoint (%s)', async baseURL => {
    await expect(resolveClaudeRoute(selection, manualServices({ baseURL }))).rejects.toThrow('当前路由没有可用的 API endpoint')
  })
})

describe('Claude Code output credential isolation', () => {
  it('exposes short ordinary deltas immediately while withholding only a possible credential prefix', () => {
    const output = new ClaudeSafeOutput(['a-long-private-credential-that-must-not-delay-every-token'])
    output.append('Hi!')
    expect(output.snapshot()).toBe('Hi!')
    output.append(' a-long-private-cred')
    expect(output.snapshot()).toBe('Hi! ')
    output.append('ential-that-must-not-delay-every-token')
    output.finish()
    expect(output.snapshot()).toBe('Hi! [REDACTED]')
  })
  it('redacts a credential across every possible chunk boundary before exposing output', () => {
    const secret = 'private-sentinel-token'
    for (let split = 1; split < secret.length; split++) {
      const output = new ClaudeSafeOutput([secret])
      output.append(`prefix ${secret.slice(0, split)}`)
      expect('prefix '.startsWith(output.snapshot())).toBe(true)
      output.append(`${secret.slice(split)} suffix`)
      expect(output.snapshot()).not.toContain(secret)
      output.finish()
      expect(output.snapshot()).toBe('prefix [REDACTED] suffix')
    }
  })

  it('redacts repeated route and MCP credentials while flushing ordinary suffix text at completion', () => {
    const output = new ClaudeSafeOutput(['route-token', 'mcp-secret', ''])
    for (const character of 'route-token / mcp-secret / route-token; done') {
      output.append(character)
      expect(output.snapshot()).not.toContain('route-token')
      expect(output.snapshot()).not.toContain('mcp-secret')
    }
    output.finish()
    expect(output.snapshot()).toBe('[REDACTED] / [REDACTED] / [REDACTED]; done')
  })

  it('permits output up to the per-turn limit and rejects the next character', () => {
    const output = new ClaudeSafeOutput([])
    const limit = 4 * 1024 * 1024
    expect(() => output.append('a'.repeat(limit))).not.toThrow()
    expect(output.snapshot()).toHaveLength(limit)
    expect(() => output.append('b')).toThrow('Claude Code 输出超过单轮限制')
  })
})
