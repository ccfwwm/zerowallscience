import { Context } from '@deepseek-ai/cordis'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SecretBrokerClient } from '@zerowallscience/plugin-secrets'
import { afterEach, describe, expect, it, vi } from 'vitest'
import z from '@deepseek-ai/schemastery'
import { apply, inject, EnvironmentSettingsSchema, ENVIRONMENT_SETTINGS_NS, contextPressureThreshold, isEnvironmentVariableConfigured, selectContextBudgetRange, validateEnvironmentVariableName, ZeroWallEnvironmentService } from '../src/host/index.js'
import { fetchOfficialEnvironment } from '../src/host/official-config.js'

vi.mock('../src/host/official-config.js', () => ({ fetchOfficialEnvironment: vi.fn() }))
const names = ['ZW_ENV_REMOTE', 'ZW_ENV_CUSTOM', 'ZW_ENV_REMOVED_REMOTE', 'ZW_ENV_LEGACY']
afterEach(() => { for (const name of names) delete process.env[name] })

function fixture() {
  const vault = new Map<string, string>()
  const replace = vi.fn().mockResolvedValue(undefined)
  const service = Object.create(ZeroWallEnvironmentService.prototype) as ZeroWallEnvironmentService
  Object.assign(service, {
    hydration: Promise.resolve(),
    settings: { variables: [], imageModel: {}, imageQuality: 'max', contextBudgetTokens: 300_000 },
    secrets: { get: async (key: string) => vault.get(key), set: async (key: string, value: string) => { vault.set(key, value) }, delete: async (key: string) => { vault.delete(key) } },
    hostCtx: { settings: { replace } },
  })
  return { service, vault, replace }
}

describe('environment configuration', () => {
  it('keeps the 300k prompt budget independent of a large default output cap while respecting model capacity', () => {
    expect(contextPressureThreshold(300_000, 1_000_000, 256_000)).toBe(270_000)
    expect(contextPressureThreshold(300_000, 128_000, 16_000)).toBe(96_000)
    expect(contextPressureThreshold(300_000, 128_000, 120_000)).toBeLessThan(0)
  })
  it('normalizes valid variable names and rejects unsafe names', () => {
    expect(validateEnvironmentVariableName(' sci_key ')).toBe('SCI_KEY')
    expect(() => validateEnvironmentVariableName('bad-name')).toThrow('环境变量名无效')
    expect(() => validateEnvironmentVariableName('NODE_OPTIONS')).toThrow('环境变量名无效')
    expect(() => validateEnvironmentVariableName('')).toThrow('环境变量名无效')
  })
  it('defaults context budgets to 300k and persists validated adjustments', async () => {
    expect(z.resolve({}, EnvironmentSettingsSchema)[0].contextBudgetTokens).toBe(300_000)
    const { service, replace } = fixture()
    expect(service.getContextBudget()).toBe(300_000)
    await service.setContextBudget(512_000)
    expect(service.getContextBudget()).toBe(512_000)
    expect(replace).toHaveBeenCalledWith(ENVIRONMENT_SETTINGS_NS, expect.objectContaining({ contextBudgetTokens: 512_000 }))
    await expect(service.setContextBudget(31_999)).rejects.toThrow('32k 到 1,000k')
    await expect(service.setContextBudget(1_000_001)).rejects.toThrow('32k 到 1,000k')
  })
  it('stores and reads a per-session budget override without changing global settings', async () => {
    const session = Session.create(SessionId('session-budget-override'))
    const agent = { session } as any
    const { service, replace } = fixture()
    ;(service as any).hostCtx.agents = { get: (id: SessionId) => String(id) === String(session.id) ? agent : undefined }
    expect(service.getSessionContextBudget(String(session.id))).toBe(300_000)
    await service.setSessionContextBudget(String(session.id), 512_000)
    expect(service.getSessionContextBudget(String(session.id))).toBe(512_000)
    expect(service.getContextBudget()).toBe(300_000)
    expect(replace).not.toHaveBeenCalled()
    expect(session.snapshotEvents().at(-1)).toMatchObject({ type: 'zerowall/context-budget', data: { tokens: 512_000 } })
    await expect(service.setSessionContextBudget(String(session.id), 1_000_001)).rejects.toThrow('32k 到 1,000k')
  })
  it('selects an old balanced tool-call range and preserves the newest surface event', () => {
    const session = {
      eventAt: (seq: number) => ({
        1: { type: 'user/message' },
        2: { type: 'assistant/message', data: { message: { content: [{ type: 'tool-call' }] } } },
        3: { type: 'tool/result' },
        4: { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: 'recent' }] } } },
      } as Record<number, any>)[seq],
    } as any
    expect(selectContextBudgetRange(session, [1, 2, 3, 4] as any, new Map([[1, 30], [2, 20], [3, 10], [4, 40]]) as any, 0, 50))
      .toEqual({ start: 1, end: 3 })
    expect(selectContextBudgetRange(session, [2, 3, 4] as any, new Map([[2, 20], [3, 10], [4, 40]]) as any, 0, 15))
      .toEqual({ start: 2, end: 3 })
    expect(selectContextBudgetRange(session, [2, 4] as any, new Map([[2, 20], [4, 40]]) as any, 0, 1)).toBeUndefined()
  })
  it('marks remote vault and inherited values as configured without exposing them', async () => {
    const vault = new Map([['zerowall.environment.var.r_platform_mcp_authorization', 'Bearer test-secret']])
    const environment = { MINERU_API_TOKEN: 'test-token', EMPTY_API_KEY: '  ' }
    const get = async (key: string) => vault.get(key)
    await expect(isEnvironmentVariableConfigured('R_PLATFORM_MCP_AUTHORIZATION', get, {})).resolves.toBe(true)
    await expect(isEnvironmentVariableConfigured('MINERU_API_TOKEN', get, environment)).resolves.toBe(true)
    await expect(isEnvironmentVariableConfigured('EMPTY_API_KEY', get, environment)).resolves.toBe(false)
    await expect(isEnvironmentVariableConfigured('MISSING_API_KEY', get, {})).resolves.toBe(false)
    await expect(isEnvironmentVariableConfigured('BROKEN_API_KEY', async () => { throw new Error('vault unavailable') }, {})).resolves.toBe(false)
  })
  it('deletes names and values, supports editing and overwrites only remote names on manual sync', async () => {
    const { service, vault } = fixture()
    await service.setVariable('ZW_ENV_REMOTE', 'local override')
    await service.setVariable('ZW_ENV_CUSTOM', 'custom value')
    await service.setVariable('ZW_ENV_REMOVED_REMOTE', 'retained former default')
    const metadata = JSON.parse(vault.get('zerowall.environment.meta')!)
    metadata.variables.ZW_ENV_REMOVED_REMOTE = { source: 'official' }
    vault.set('zerowall.environment.meta', JSON.stringify(metadata))
    await service.deleteVariable('ZW_ENV_REMOTE')
    expect(await service.listVariables()).not.toEqual(expect.arrayContaining([expect.objectContaining({ name: 'ZW_ENV_REMOTE' })]))
    expect(await service.readVariable('ZW_ENV_REMOTE')).toBeUndefined()
    expect(vault.has('zerowall.environment.var.zw_env_remote')).toBe(false)
    expect(process.env.ZW_ENV_REMOTE).toBeUndefined()
    expect(JSON.parse(vault.get('zerowall.environment.meta')!).variables.ZW_ENV_REMOTE).toBeUndefined()
    vi.mocked(fetchOfficialEnvironment).mockResolvedValue({ version: '2026.10.29.1', variables: { ZW_ENV_REMOTE: 'cloud value' } })
    await service.restoreOfficialDefaults()
    expect(await service.readVariable('ZW_ENV_REMOTE')).toBe('cloud value')
    await service.setVariable('ZW_ENV_REMOTE', 'edited value')
    expect(await service.readVariable('ZW_ENV_REMOTE')).toBe('edited value')
    await service.restoreOfficialDefaults()
    expect(await service.readVariable('ZW_ENV_REMOTE')).toBe('cloud value')
    expect(await service.readVariable('ZW_ENV_CUSTOM')).toBe('custom value')
    expect(await service.readVariable('ZW_ENV_REMOVED_REMOTE')).toBe('retained former default')
    expect(JSON.parse(vault.get('zerowall.environment.meta')!).deletedNames).not.toContain('ZW_ENV_REMOTE')
    vi.mocked(fetchOfficialEnvironment).mockRejectedValueOnce(new Error('signature invalid'))
    await expect(service.restoreOfficialDefaults()).rejects.toThrow('signature invalid')
    expect(await service.readVariable('ZW_ENV_CUSTOM')).toBe('custom value')
  })
  it('migrates old disabled rows out of the list and imports them on explicit sync', async () => {
    const { service, vault } = fixture()
    vault.set('zerowall.environment.meta', JSON.stringify({ version: 1, variables: { ZW_ENV_LEGACY: { source: 'official', suppressed: true } } }))
    process.env.ZW_ENV_LEGACY = 'stale injected value'
    await (service as any).hydrate()
    expect((await service.listVariables()).find(row => row.name === 'ZW_ENV_LEGACY')).toBeUndefined()
    expect(process.env.ZW_ENV_LEGACY).toBeUndefined()
    vi.mocked(fetchOfficialEnvironment).mockResolvedValue({ version: '2026.10.29.1', variables: { ZW_ENV_LEGACY: 'cloud value' } })
    expect((await service.restoreOfficialDefaults()).find(row => row.name === 'ZW_ENV_LEGACY')).toEqual({ name: 'ZW_ENV_LEGACY', configured: true, source: 'official' })
  })
})

it('enforces prompt pressure through the real pre-step hook, prunes first, and respects cancellation', async () => {
  const ctx = new Context()
  const get = vi.spyOn(SecretBrokerClient.prototype, 'get').mockResolvedValue(undefined)
  const set = vi.spyOn(SecretBrokerClient.prototype, 'set').mockResolvedValue(undefined)
  const del = vi.spyOn(SecretBrokerClient.prototype, 'delete').mockResolvedValue(undefined)
  try {
    ctx.provide('settings', { describe: () => [], replace: vi.fn() } as any)
    ctx.provide('llm', { resolveModelInfo: vi.fn(async () => ({ context: { contextWindow: 1_000_000 }, defaultMaxTokens: 256_000 })) } as any)
    const session = Session.create(SessionId('budget-hook'))
    const events = Array.from({ length: 4 }, (_, i) => session.append('user/message', createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'message ' + i }] }), { surfaceOp: 'append' }))
    let totalTokens = 100_000
    const measure = vi.fn(() => ({ totalTokens, baseline: { kind: 'estimated' }, nodes: events.map(event => ({ seq: event.seq, tokens: 70_000 })) }))
    const compactRegion = vi.fn(async () => ({ shadowedTokenCount: 70_000 }))
    const pruneSession = vi.fn()
    ctx.provide('tokenMeter', { measure } as any)
    ctx.provide('agentPresets', { serviceFor: (_agent: unknown, name: string) => name === 'compaction' ? { compactRegion } : name === 'toolResultPruner' ? { pruneSession } : undefined } as any)
    expect(inject).not.toContain('compaction')
    const fiber = ctx.plugin({ name: 'budget-plugin', inject, apply }, { get: () => z.resolve({}, EnvironmentSettingsSchema)[0] })
    await fiber
    expect(ctx.get('zerowallEnvironment')).toBeDefined()
    const agent = { session, options: { provider: 'selected', model: 'selected' } } as any
    const step = (signal: AbortSignal) => ctx.waterfall('agent/pre-step', { agent, messages: [], signal, turn: 1, step: 2 }, async () => ({ kind: 'enter' as const, messages: [] }))
    await step(new AbortController().signal)
    expect(compactRegion).not.toHaveBeenCalled()
    totalTokens = 280_000
    await step(new AbortController().signal)
    expect(pruneSession).toHaveBeenCalledWith(session)
    expect(compactRegion).toHaveBeenCalledWith(events[0]!.seq, events[0]!.seq, expect.objectContaining({ options: { provider: 'selected', model: 'selected' } }), expect.any(AbortSignal))
    expect(pruneSession.mock.invocationCallOrder[0]).toBeLessThan(compactRegion.mock.invocationCallOrder[0]!)
    const cancelled = new AbortController(); cancelled.abort()
    await step(cancelled.signal)
    expect(compactRegion).toHaveBeenCalledTimes(1)
  } finally { await ctx.fiber.dispose(); get.mockRestore(); set.mockRestore(); del.mockRestore() }
})
