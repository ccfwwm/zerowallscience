import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime, {
  ToolCallId,
  createUserMessage,
} from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjection from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import * as ProgressiveTools from '../src/index.js'

const signal = new AbortController().signal

function fixtureTool(name: string) {
  return defineTool({
    name,
    description: `${name} fixture`,
    parameters: {},
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    execute: async () => `ran:${name}`,
  })
}

function oneStopResponse(): AsyncIterable<StreamChunk> {
  return (async function* () {
    yield { type: 'finish', reason: { kind: 'stop' } }
  })()
}

function systemOf(request: GenerateOptions | undefined): string {
  const message = request?.messages[0]
  expect(message?.role).toBe('system')
  const text = message?.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('') ?? ''
  expect(text).toContain('tool_search')
  return text
}

describe('AgentLoop request integration', () => {
  it('sends a minimal first request and preserves the exact tool prefix after discovery', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt, {})
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjection)
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(LlmRuntime)
    for (const name of ['browser_open', 'browser_click', 'db_query', 'skill', 'ask_user_question']) {
      ctx.tools.register(fixtureTool(name))
    }
    await ctx.plugin(ProgressiveTools, {
      groups: [
        { id: 'browser', include: ['browser_*'], description: 'Browser tools' },
        { id: 'database', include: ['db_*'], description: 'Database tools' },
      ],
    })
    await ctx.plugin(AgentLoop, { agents: [] })

    const requests: GenerateOptions[] = []
    ctx.on('llm/stream', (options) => {
      requests.push(options)
      return oneStopResponse()
    })

    const agent = await ctx.agentLoop.create(SessionId('request-integration'), {
      provider: 'fixture',
      model: 'fixture',
    })
    agent.followup(createUserMessage({
      content: [{ type: 'text', text: 'open a browser page' }],
      source: { kind: 'user' },
    }))
    await agent.whenIdle()

    expect(requests).toHaveLength(1)
    expect(requests[0]?.tools?.map(tool => tool.name).sort()).toEqual([
      'ask_user_question',
      'skill',
      'tool_dispatch',
      'tool_search',
    ])

    const search = await ctx.tools.execute({
      signal,
      callId: ToolCallId('integration-search'),
      name: 'tool_search',
      arguments: { query: 'browser navigation' },
      agent,
    })
    expect(search.isError).toBe(false)

    agent.followup(createUserMessage({
      content: [{ type: 'text', text: 'continue' }],
      source: { kind: 'user' },
    }))
    await agent.whenIdle()

    expect(requests).toHaveLength(2)
    expect(JSON.stringify(requests[1]?.tools)).toBe(JSON.stringify(requests[0]?.tools))
    expect(systemOf(requests[1])).toBe(systemOf(requests[0]))

    // A status listing and the family-wide discovery it precedes must not
    // write back into the stable prefix either.
    const status = await ctx.tools.execute({
      signal,
      callId: ToolCallId('integration-status'),
      name: 'tool_search',
      arguments: { action: 'status' },
      agent,
    })
    expect(status.isError).toBe(false)

    agent.followup(createUserMessage({
      content: [{ type: 'text', text: 'continue again' }],
      source: { kind: 'user' },
    }))
    await agent.whenIdle()

    expect(requests).toHaveLength(3)
    expect(JSON.stringify(requests[2]?.tools)).toBe(JSON.stringify(requests[0]?.tools))
    expect(systemOf(requests[2])).toBe(systemOf(requests[0]))
  })
})
