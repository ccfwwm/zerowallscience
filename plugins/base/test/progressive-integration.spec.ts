import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '../../../deepseek-harness/packages/core/agent-loop/lib/index.js'
import LlmRuntime, { LlmAdapter, ToolCallId, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjection from '../../../deepseek-harness/packages/session/session-projection/lib/index.js'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import * as ProgressiveTools from '../../../packages/dsh-progressive-tools/src/index.ts'
import { apply as applyBase } from '../src/host/index.ts'

describe('ZeroWall progressive tool composition', () => {
  it('keeps the first-turn request prefix fixed through search and dispatch with diagnostics enabled', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt, {})
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjection)
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(LlmRuntime)
    ctx.provide('webServer', { register() {} } as never)
    const logs: string[] = []
    vi.spyOn(ctx.logger, 'info').mockImplementation((value: unknown) => { logs.push(String(value)) })
    applyBase(ctx)
    const called = vi.fn(async () => 'short result')
    ctx.tools.register(defineTool({
      name: 'zerowall_probe', description: 'Read a local fixture value',
      parameters: {},
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
      execute: called,
    }))
    await ctx.plugin(ProgressiveTools, { mode: 'stable-proxy', requireDiscovery: true, deferToolGuidance: true })
    await ctx.plugin(AgentLoop, { agents: [] })
    const requests: GenerateOptions[] = []
    class FixtureAdapter extends LlmAdapter {
      async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
      requests.push(options)
      const call = requests.length === 1
        ? { name: 'tool_search', arguments: JSON.stringify({ query: 'zerowall_probe' }) }
        : requests.length === 2
          ? { name: 'tool_dispatch', arguments: JSON.stringify({ name: 'zerowall_probe', arguments: {} }) }
          : undefined
      if (call !== undefined) {
        const id = ToolCallId(`fixture-${requests.length}`)
        yield { type: 'block-start', index: 0, blockType: 'tool-call' }
        yield { type: 'tool-call-delta', index: 0, id, name: call.name, argumentsDelta: call.arguments }
        yield { type: 'block-end', index: 0, block: { type: 'tool-call', id, ...call } }
      }
      yield { type: 'usage', usage: { inputTokens: 10, cacheReadTokens: 90, cacheWriteTokens: 0, outputTokens: 1, totalTokens: 101 } }
      yield { type: 'finish', reason: { kind: call === undefined ? 'stop' : 'tool-calls' } }
      }
    }
    ctx.llm.registerAdapter(['fixture'], new FixtureAdapter())
    const agent = await ctx.agentLoop.create(SessionId('zerowall-progressive'), { provider: 'fixture', model: 'fixture' })
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Read the fixture' }], source: { kind: 'user' } }))
    await agent.whenIdle()
    expect(requests, JSON.stringify(agent.session.snapshotEvents())).toHaveLength(3)
    expect(called).toHaveBeenCalledTimes(1)
    expect(requests[0]?.tools?.map(tool => tool.name)).toEqual(['tool_dispatch', 'tool_search'])
    for (const request of requests.slice(1)) {
      expect(JSON.stringify(request.tools)).toBe(JSON.stringify(requests[0]?.tools))
      expect(request.messages[0]?.content).toEqual(requests[0]?.messages[0]?.content)
    }
    const headers = agent.session.snapshotEvents().filter(event => event.type === 'request/header')
    expect(headers).toHaveLength(1)
    const records = logs.filter(value => value.startsWith('[cache-diagnostics] '))
      .map(value => JSON.parse(value.slice('[cache-diagnostics] '.length)))
    expect(records.filter(record => record.tool_count !== undefined)).toHaveLength(3)
    expect(records.filter(record => record.changed_sections !== undefined).every(record => record.changed_sections.length === 0)).toBe(true)
    expect(records.filter(record => record.cache_hit_rate === 0.9)).toHaveLength(3)
    expect(logs.join('')).not.toContain('short result')
  })
})
