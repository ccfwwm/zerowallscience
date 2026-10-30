import { Context } from '@deepseek-ai/cordis'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import z from '@deepseek-ai/schemastery'
import { SecretBrokerClient } from '@zerowallscience/plugin-secrets'
import { expect, it, vi } from 'vitest'
import TokenMeter from '../../../deepseek-harness/packages/llm/token-meter/src/index.ts'
import SessionProjectionRegistry from '../../../deepseek-harness/packages/session/session-projection/src/index.ts'
import BasicCompactionEngine from '../../../deepseek-harness/packages/compaction/compaction-basic/src/index.ts'
import { EnvironmentSettingsSchema, ZeroWallEnvironmentService } from '../src/host/index.js'

it('lands a durable DSH checkpoint through the session preset and reduces measured pressure', async () => {
  const host = new Context()
  const preset = new Context()
  const get = vi.spyOn(SecretBrokerClient.prototype, 'get').mockResolvedValue(undefined)
  const set = vi.spyOn(SecretBrokerClient.prototype, 'set').mockResolvedValue(undefined)
  const del = vi.spyOn(SecretBrokerClient.prototype, 'delete').mockResolvedValue(undefined)
  try {
    new SessionProjectionRegistry(host)
    const meter = new TokenMeter(host)
    const llm = { resolveModelInfo: async () => ({ context: { contextWindow: 1_000_000 }, defaultMaxTokens: 32_000 }) }
    host.provide('llm', llm as any)
    host.provide('settings', { describe: () => [], replace: async () => undefined } as any)
    preset.provide('llm', llm as any)
    preset.provide('tokenMeter', meter)
    const compaction = new BasicCompactionEngine(preset, { auto: false })
    vi.spyOn(compaction as any, 'summarize').mockResolvedValue({ summary: [{ type: 'text', text: 'Keep the requested task, workspace and pending work.' }], provider: 'selected', model: 'selected' })
    host.provide('agentPresets', { serviceFor: (_agent: unknown, name: string) => name === 'compaction' ? compaction : undefined } as any)
    new ZeroWallEnvironmentService(host, z.resolve({}, EnvironmentSettingsSchema)[0])
    const session = Session.create(SessionId('durable-context-budget'))
    session.append('turn/start', { turn: 1 })
    session.append('user/message', createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'historical context '.repeat(90_000) }] }), { surfaceOp: 'append' })
    session.append('user/message', createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Continue the current task.' }] }), { surfaceOp: 'append' })
    const before = meter.measure(session).totalTokens
    expect(before).toBeGreaterThan(270_000)
    const agent = { session, options: { provider: 'selected', model: 'selected' }, ctx: host } as any
    await host.waterfall('agent/pre-step', { agent, messages: [], signal: new AbortController().signal, turn: 1, step: 2 }, async () => ({ kind: 'enter' as const, messages: [] }))
    const events = session.snapshotEvents()
    expect(events.some(event => event.type === 'compaction/start')).toBe(true)
    expect(events.some(event => event.type === 'compaction/end')).toBe(true)
    expect(meter.measure(session).totalTokens).toBeLessThan(270_000)
    expect(events.some(event => event.type === 'user/message' && event.data.content.some(block => block.type === 'text' && block.text.startsWith('historical context')))).toBe(true)
  } finally {
    await host.fiber.dispose()
    await preset.fiber.dispose()
    get.mockRestore(); set.mockRestore(); del.mockRestore()
  }
})
