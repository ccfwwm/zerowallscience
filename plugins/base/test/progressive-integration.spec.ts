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
import { apply as applyBase } from '../src/host/index.ts'

describe('ZeroWall native tool composition', () => {
	it('executes exposed tools directly with diagnostics enabled', async () => {
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
    await ctx.plugin(AgentLoop, { agents: [] })
    const requests: GenerateOptions[] = []
    class FixtureAdapter extends LlmAdapter {
      async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
      requests.push(options)
		const call = requests.length === 1
			? { name: 'zerowall_probe', arguments: '{}' }
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
	const agent = await ctx.agentLoop.create(SessionId('zerowall-native-tools'), { provider: 'fixture', model: 'fixture' })
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Read the fixture' }], source: { kind: 'user' } }))
    await agent.whenIdle()
	expect(requests, JSON.stringify(agent.session.snapshotEvents())).toHaveLength(2)
    expect(called).toHaveBeenCalledTimes(1)
	expect(requests[0]?.tools?.map(tool => tool.name)).toContain('zerowall_probe')
	expect(requests[0]?.tools?.map(tool => tool.name)).not.toEqual(expect.arrayContaining(['tool_dispatch', 'tool_search']))
    const headers = agent.session.snapshotEvents().filter(event => event.type === 'request/header')
    expect(headers).toHaveLength(1)
    const records = logs.filter(value => value.startsWith('[cache-diagnostics] '))
      .map(value => JSON.parse(value.slice('[cache-diagnostics] '.length)))
	expect(records.filter(record => record.tool_count !== undefined)).toHaveLength(2)
    expect(records.filter(record => record.changed_sections !== undefined).every(record => record.changed_sections.length === 0)).toBe(true)
	expect(records.filter(record => record.cache_hit_rate === 0.9)).toHaveLength(2)
    expect(logs.join('')).not.toContain('short result')
  })

  it('restricts a large tool surface and expands it only after capability_search enables an exact tool', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt, {})
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjection)
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(LlmRuntime)
    ctx.provide('webServer', { register() {} } as never)
    ctx.provide('workspaceRegistry', { list: () => [], create: vi.fn() } as never)
    applyBase(ctx)
    const called = vi.fn(async () => 'loaded')
    const standardTools = [
      'bash', 'pwsh', 'read', 'write', 'edit', 'glob', 'grep', 'read_image', 'working_directory',
      'web_search', 'web_fetch', 'skill', 'skill_search', 'ask_user_question', 'create_goal',
      'get_goal', 'update_goal', 'exit_plan_mode', 'job_kill', 'job_list', 'job_output',
      'todo_write', 'subagent', 'subagent_fork', 'schedule_list',
    ]
    for (const name of standardTools) {
      ctx.tools.register(defineTool({
        name, description: `DSH standard tool ${name}`, parameters: {},
        output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
        execute: called,
      }))
    }
    for (let index = 0; index < 160; index += 1) {
      const name = `zerowall_extra_${index}`
      ctx.tools.register(defineTool({
        name, description: `Extra capability ${index} for on-demand loading`, parameters: {},
        output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
        execute: called,
      }))
    }
    await ctx.plugin(AgentLoop, { agents: [] })
    const requests: GenerateOptions[] = []
    class FixtureAdapter extends LlmAdapter {
      async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
        requests.push(options)
        const call = requests.length === 1
          ? { name: 'capability_search', arguments: JSON.stringify({ query: 'extra capability' }) }
          : requests.length === 2
            ? { name: 'capability_search', arguments: JSON.stringify({ enable: ['zerowall_extra_3'] }) }
            : requests.length === 3
              ? { name: 'zerowall_extra_3', arguments: '{}' }
              : undefined
        if (call !== undefined) {
          const id = ToolCallId(`on-demand-${requests.length}`)
          yield { type: 'block-start', index: 0, blockType: 'tool-call' }
          yield { type: 'tool-call-delta', index: 0, id, name: call.name, argumentsDelta: call.arguments }
          yield { type: 'block-end', index: 0, block: { type: 'tool-call', id, ...call } }
        }
        yield { type: 'usage', usage: { inputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 1, totalTokens: 11 } }
        yield { type: 'finish', reason: { kind: call === undefined ? 'stop' : 'tool-calls' } }
      }
    }
    ctx.llm.registerAdapter(['fixture'], new FixtureAdapter())
    const agent = await ctx.agentLoop.create(SessionId('zerowall-on-demand'), { provider: 'fixture', model: 'fixture' })
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Load one extra capability' }], source: { kind: 'user' } }))
    await agent.whenIdle()
    expect(called).toHaveBeenCalledOnce()
    const initial = requests[0]?.tools?.map(tool => tool.name) ?? []
    const afterSearch = requests[1]?.tools?.map(tool => tool.name) ?? []
    const afterEnable = requests[2]?.tools?.map(tool => tool.name) ?? []
    expect(initial).toContain('capability_search')
    expect(initial).not.toContain('zerowall_extra_3')
    expect(initial).toEqual(expect.arrayContaining(standardTools))
    expect(initial).toHaveLength(standardTools.length + 1)
    expect(afterSearch).not.toContain('zerowall_extra_3')
    expect(afterEnable).toContain('zerowall_extra_3')
    expect(afterEnable).not.toContain('zerowall_extra_4')
    await ctx.fiber.dispose()
  })
})
