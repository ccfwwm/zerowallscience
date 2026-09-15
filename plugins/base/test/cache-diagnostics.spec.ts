import { describe, expect, it } from 'vitest'
import { createUserMessage, createSystemMessage } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { CacheDiagnostics, cacheUsage } from '../src/host/cache-diagnostics.ts'

const request = (): GenerateOptions => ({
  provider: 'fixture', model: 'fixture', sessionId: SessionId('diagnostics'),
  messages: [createSystemMessage('fixed'), createUserMessage({ content: [{ type: 'text', text: 'hello' }], source: { kind: 'user' } })],
  tools: [{ name: 'tool_search', description: 'Search', parameters: { type: 'object' } }],
})

describe('cache diagnostics', () => {
  it('ignores fresh message IDs, detects appended history without changing the prefix', () => {
    const d = new CacheDiagnostics()
    const first = d.begin(request())
    const next = request()
    next.messages.push(createUserMessage({ content: [{ type: 'text', text: 'result' }], source: { kind: 'user' } }))
    const second = d.begin(next)
    expect(second.changed_sections).toEqual([])
    expect(second.history_prefix_preserved).toBe(true)
    expect(second.tool_schema_hash).toBe(first.tool_schema_hash)
    expect(JSON.stringify(second)).not.toContain('hello')
  })
  it('distinguishes tool, route, system and history changes and isolates sessions', () => {
    const d = new CacheDiagnostics()
    d.begin(request())
    const next = request()
    next.tools![0]!.description = 'Changed'
    next.model = 'other'
    next.messages[0] = createSystemMessage('different')
    const result = d.begin(next)
    expect(result.changed_sections).toEqual(['tool_schema_hash', 'system_prompt_hash', 'route_hash'])
    expect(result.history_prefix_preserved).toBe(false)
    expect(result.prefix_warning).toContain('可能')
    next.sessionId = SessionId('another')
    expect(d.begin(next).changed_sections).toEqual([])
  })
  it('counts cache writes in the denominator and never invents missing usage', () => {
    expect(cacheUsage({ inputTokens: 26965, cacheReadTokens: 152800, cacheWriteTokens: 0, outputTokens: 1545 }).cache_hit_rate).toBeCloseTo(0.85, 2)
    expect(cacheUsage({ inputTokens: 10, cacheReadTokens: 60, cacheWriteTokens: 30, outputTokens: 1 }).cache_hit_rate).toBe(0.6)
    expect(cacheUsage({ inputTokens: 10, outputTokens: 1 }).cache_hit_rate).toBeNull()
    expect(cacheUsage({ inputTokens: 10, outputTokens: 1, totalTokens: 11 }).cache_hit_rate).toBe(0)
    expect(cacheUsage({ inputTokens: 0, outputTokens: 0, totalTokens: 0 }).cache_hit_rate).toBeNull()
    expect(cacheUsage({ inputTokens: -1, outputTokens: 1, cacheReadTokens: 2, cacheWriteTokens: 0 }).cache_hit_rate).toBeNull()
  })
})
