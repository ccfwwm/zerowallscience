import { Context } from '@deepseek-ai/cordis'
import AgentLoop from '../../../../packages/core/agent-loop/src/index.ts'
import { mountAgentLoopTestDependencies, provideWorkingDirectoryFixture } from '../../../../packages/test-support/agent-loop-testkit/src/index.ts'
import { SessionId } from '@deepseek-ai/dsh-session'
import { ToolCallId, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import SubagentRuntime, { NO_START_CAPABILITIES, type ResolvedSubagentStartRequest } from '@deepseek-ai/dsh-subagent'
import SubagentModelSelection from '@deepseek-ai/dsh-tool-subagent/model-selection-settings'
import { apply as applyOfficialSubagent } from '@deepseek-ai/dsh-tool-subagent'
import { afterEach, expect, it, vi } from 'vitest'
import { mountClaudeSubagentTools } from '../src/host/subagent-tool.js'

const contexts: Context[] = []
afterEach(async () => { await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose())) })

async function fixture(enabled: boolean | null = true) {
  const ctx = new Context()
  contexts.push(ctx)
  await mountAgentLoopTestDependencies(ctx)
  if (enabled !== null) await ctx.plugin(SubagentModelSelection, { enabled, allowedModels: [{ provider: 'anthropic-route', model: 'configured-claude' }] })
  await ctx.plugin(AgentLoop, { agents: [] })
  provideWorkingDirectoryFixture(ctx)
  await ctx.plugin(SubagentRuntime)
  const requests: ResolvedSubagentStartRequest[] = []
  let counter = 0
  ctx.subagents.registerProvider({ name: 'claude-code', capabilities: { ...NO_START_CAPABILITIES, agentOptions: true }, inheritsParentContext: false,
    async start(request) {
      requests.push(request)
      return { id: SessionId(`claude-child-${++counter}`), result: Promise.resolve({ output: [{ type: 'text' as const, text: 'child result' }], stopReason: 'completed' as const }), dispose: async () => {} }
    },
  })
  const resolveCallConfig = vi.spyOn(ctx.llm, 'resolveCallConfig').mockResolvedValue({} as never)
  const mounting = await ctx.plugin({ name: 'claude-subagent-tools-test', apply: mountClaudeSubagentTools })
  const parent = (await ctx.agents.create({ sessionId: SessionId('openai-parent'), agentOptions: { provider: 'openai-route', model: 'selected-gpt', reasoningEffort: ReasoningEffortId('high') },
    // Standard's own selection-aware tool must coexist in this same Agent scope.
    setup: async (scope, agent) => {
      const fiber = scope.inject(['tools', 'subagents', 'systemPrompt', 'sessionProjections', 'llm'], runtime =>
        applyOfficialSubagent(runtime, { provider: 'claude-code', toolName: 'existing_subagent', maxDepth: 'provider-managed', modelSelection: true, modelDiscovery: true }))
      await fiber.await()
    },
  })).agent
  return { ctx, parent, requests, resolveCallConfig, mounting }
}

it('registers official Claude delegation beside existing tools, selects only an allowed child route, and disposes cleanly', async () => {
  const f = await fixture()
  const schemas = f.ctx.tools.schemas(f.parent)
  expect(schemas.map(tool => tool.name)).toEqual(expect.arrayContaining(['existing_subagent', 'list_subagent_models', 'claude_subagent', 'claude_list_subagent_models']))
  const schema = schemas.find(tool => tool.name === 'claude_subagent')!
  expect(schemas.find(tool => tool.name === 'claude_list_subagent_models')).toBeDefined()
  expect((schema.parameters as { properties: object }).properties).toHaveProperty('provider')
  const options = { ...f.parent.options }
  const resultBatch = await f.ctx.tools.execute({ signal: new AbortController().signal, calls: [{ type: 'tool-call', id: ToolCallId('delegate-claude'), name: 'claude_subagent', arguments: JSON.stringify({ description: 'Review project', prompt: 'Review changes', provider: 'anthropic-route', model: 'configured-claude', reasoning_effort: 'max' }) }], agent: f.parent })
  const result = resultBatch.results[0]!.result
  expect(result.isError).toBeFalsy()
  expect(f.requests).toHaveLength(1)
  expect(f.requests[0]!.agentOptions).toEqual({ provider: 'anthropic-route', model: 'configured-claude', reasoningEffort: 'max' })
  expect(f.resolveCallConfig).toHaveBeenCalledWith({ provider: 'anthropic-route', model: 'configured-claude', reasoningEffort: 'max' }, expect.any(AbortSignal))
  expect(f.parent.options).toEqual(options)
  const deniedBatch = await f.ctx.tools.execute({ signal: new AbortController().signal, calls: [{ type: 'tool-call', id: ToolCallId('denied-claude'), name: 'claude_subagent', arguments: JSON.stringify({ description: 'Denied route', prompt: 'Review', provider: 'unknown', model: 'unconfigured' }) }], agent: f.parent })
  const denied = deniedBatch.results[0]!.result
  expect(denied.isError).toBe(true)
  expect(f.requests).toHaveLength(1)
  await f.mounting.dispose()
  expect(f.ctx.tools.schemas(f.parent).map(tool => tool.name)).not.toContain('claude_subagent')
  expect(f.ctx.tools.schemas(f.parent).map(tool => tool.name)).toContain('existing_subagent')
})

it('keeps the official model-selection preference disabled and rejects route arguments when disabled', async () => {
  const f = await fixture(false)
  const schema = f.ctx.tools.schemas(f.parent).find(tool => tool.name === 'claude_subagent')!
  expect((schema.parameters as { properties: object }).properties).toHaveProperty('provider')
  expect(f.parent.session.snapshotEvents().some(event => event.type === 'subagent/model-selection-policy')).toBe(false)
  const resultBatch = await f.ctx.tools.execute({ signal: new AbortController().signal, calls: [{ type: 'tool-call', id: ToolCallId('disabled-route'), name: 'claude_subagent', arguments: JSON.stringify({ description: 'Invalid override', prompt: 'Review', provider: 'anthropic-route', model: 'configured-claude' }) }], agent: f.parent })
  const result = resultBatch.results[0]!.result
  expect(result.isError).toBe(true)
  expect(f.requests).toHaveLength(0)
})

it('still mounts inherited-route delegation when the optional model-selection service is absent', async () => {
  const f = await fixture(null)
  const schema = f.ctx.tools.schemas(f.parent).find(tool => tool.name === 'claude_subagent')!
  expect(schema).toBeDefined()
  expect((schema.parameters as { properties: object }).properties).toHaveProperty('provider')
  const resultBatch = await f.ctx.tools.execute({ signal: new AbortController().signal, calls: [{ type: 'tool-call', id: ToolCallId('inherited-route'), name: 'claude_subagent', arguments: JSON.stringify({ description: 'Inherited route', prompt: 'Review' }) }], agent: f.parent })
  const result = resultBatch.results[0]!.result
  expect(result.isError).toBeFalsy()
  expect(f.requests).toHaveLength(1)
})
