import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime, { createUserMessage } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjections from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools, { defineTool } from '@deepseek-ai/dsh-tools'
import * as NativeExecutor from '@deepseek-ai/dsh-tool-executor-native'
import { afterEach, expect, it } from 'vitest'
import { MockAdapter, textResponse, toolCallResponse } from '../../../../packages/core/agent-loop/tests/mock-adapter.ts'
import { installToolDiscovery } from '../src/host/tool-discovery.js'
import type { ToolDiscoveryConfig } from '../src/host/tool-discovery.js'

const contexts: Context[] = []
afterEach(async () => { for (const ctx of contexts.splice(0)) await ctx.fiber.dispose() })

async function fixture(config: ToolDiscoveryConfig = {}) {
  const ctx = new Context()
  contexts.push(ctx)
  for (const plugin of [LlmRuntime, SessionStore, SessionProjections, SystemPrompt, Tools, NativeExecutor, AgentRegistry]) await ctx.plugin(plugin).await()
  await ctx.plugin(AgentLoop, { agents: [] }).await()
  const discovery = ctx.plugin({ inject: ['tools', 'systemPrompt', 'agents'], apply(scope: Context) { installToolDiscovery(scope, config) } })
  await discovery.await()
  for (const name of ['read', 'db_query', 'db_export', 'presentation_prepare']) {
    ctx.effect(() => ctx.tools.register(defineTool({
      name, description: name.startsWith('db_') ? 'Query database tables' : name,
      parameters: {}, output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
      execute: async () => `${name}:done`,
    })))
  }
  const adapter = new MockAdapter([
    toolCallResponse('search', 'tool_search', { query: 'db_query' }),
    toolCallResponse('query', 'db_query', {}), textResponse('DONE'),
  ])
  ctx.llm.registerAdapter(['mock'], adapter)
  const agent = await ctx.agentLoop.create(SessionId('discovery'), { provider: 'mock', model: 'mock' })
  return { ctx, adapter, agent, discovery }
}

it('loads only searched definitions in the next real Agent step and logs the selection', async () => {
  const { ctx, adapter, agent } = await fixture()
  const names = async (scope: object) => (await ctx.systemPrompt.assemble({ scope })).tools.map(tool => tool.name)
  expect(await names(agent)).toEqual(['read', 'tool_search'])
  agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Query the database.' }] }))
  await agent.whenIdle()
  expect(adapter.requests.map(request => request.tools?.map(tool => tool.name))).toEqual([
    ['read', 'tool_search'], ['db_query', 'read', 'tool_search'], ['db_query', 'read', 'tool_search'],
  ])
  const result = agent.session.snapshotEvents().find(event => event.type === 'tool/result' && event.data.message.toolCallId === 'query')
  expect(result).toMatchObject({ data: { message: { isError: false, content: [{ type: 'text', text: 'db_query:done' }] } } })
  const other = await ctx.agentLoop.create(SessionId('other'), { provider: 'mock', model: 'mock' })
  expect(await names(other)).toEqual(['read', 'tool_search'])
  const restored = await ctx.agents.create({
    sessionId: SessionId('restored'), seed: agent.session.snapshotEvents(), agentOptions: { provider: 'mock', model: 'mock' },
  })
  expect(await names(restored.agent)).toEqual(['db_query', 'read', 'tool_search'])
})

it('bounds broad searches without revoking executable native capabilities', async () => {
  const { ctx, agent } = await fixture({ toolSearchLimit: 1 })
  const result = await ctx.tools.execute({ agent, signal: new AbortController().signal,
    calls: [{ type: 'tool-call', id: 'search' as never, name: 'tool_search', arguments: '{"query":"database"}' }],
  })
  expect(result.results[0]?.result).toMatchObject({ isError: false, value: { loadedToolNames: ['db_export'] } })
  const assembly = await ctx.systemPrompt.assemble({ scope: agent })
  expect(assembly.tools.map(tool => tool.name)).toEqual(['db_export', 'read', 'tool_search'])
  const native = await ctx.tools.execute({ agent, signal: new AbortController().signal,
    calls: [{ type: 'tool-call', id: 'nested' as never, name: 'db_query', arguments: '{}' }],
  })
  expect(native.results[0]?.result).toMatchObject({ isError: false, value: 'db_query:done' })
})

it('retains full presentation when explicitly configured', async () => {
  const { ctx, agent } = await fixture({ toolLoading: 'all' })
  expect((await ctx.systemPrompt.assemble({ scope: agent })).tools.map(tool => tool.name))
    .toEqual(['db_export', 'db_query', 'presentation_prepare', 'read'])
})
