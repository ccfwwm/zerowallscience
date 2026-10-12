import { expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createUserMessage, createMessage, ToolCallId, LlmAdapter, LlmError, CONTEXT_WINDOW_EXCEEDED_CODE, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import AgentLoop from '../../../deepseek-harness/packages/core/agent-loop/src/index.ts'
import { mountAgentLoopTestDependencies } from '../../../deepseek-harness/packages/test-support/agent-loop-testkit/src/index.ts'
import { BasicCompactionEngine } from '../../../deepseek-harness/packages/compaction/compaction-basic/src/index.ts'
import TokenMeter from '../../../deepseek-harness/packages/llm/token-meter/src/index.ts'
import { defineContentToolFixture } from '../../../deepseek-harness/packages/core/tools/src/index.ts'
import { Session, SessionId } from '../../../deepseek-harness/packages/core/session/src/index.ts'

it('recovers a dynamic ZeroWall route after a completed Python tool without executing the tool again', async () => {
  const provider = 'zerowall-ai-cloud-7-responses', model = 'gateway-fixture'
  const requests: GenerateOptions[] = []; let executions = 0
  class Adapter extends LlmAdapter {
    override async resolveModel() { return { provider, id: model, name: model, context: { contextWindow: 32000, maxOutputTokens: 1000 } } }
    override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
      requests.push(options)
      if (requests.length === 1) {
        yield { type: 'block-start', index: 0, blockType: 'tool-call' }
        yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: ToolCallId('python-once'), name: 'python_fixture', arguments: '{}' } }
        yield { type: 'finish', reason: { kind: 'tool-calls' } }; return
      }
      if (requests.length === 2) throw new LlmError('gateway context window exceeded', CONTEXT_WINDOW_EXCEEDED_CODE)
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: 'Recovered model reply' } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
  }
  class Compact extends BasicCompactionEngine {
    override async summarize() { return { summary: [{ type: 'text' as const, text: 'Previous work retained.' }], provider, model } }
  }
  const ctx = new Context()
  try {
    await mountAgentLoopTestDependencies(ctx); await ctx.plugin(AgentLoop, { agents: [] }); await ctx.plugin(TokenMeter)
    ctx.llm.registerAdapter([provider], new Adapter())
    ctx.tools.register(defineContentToolFixture({ name: 'python_fixture', description: 'Completed install', parameters: {}, async execute() { executions++; return [{ type: 'text', text: 'Python exit=0; installation completed.' }] } }))
    await ctx.plugin(Compact, { thresholdRatio: 1, headroomTokens: 0, retainTokens: 100, maxTokens: 64, compactionRetries: 0, maxOverflowRetries: 1 })
    const history = Session.create(SessionId('historical'))
    for (let turn = 1; turn <= 2; turn++) {
      history.append('turn/start', { turn })
      history.append('user/message', createUserMessage({ content: [{ type: 'text', text: 'OLD HISTORY '.repeat(400) }], source: { kind: 'user' } }), { surfaceOp: 'append' })
      history.append('step/start', { turn, step: 1 })
      history.append('assistant/message', { stream: [], turn, step: 1, message: createMessage({ role: 'assistant', content: [{ type: 'text', text: 'Old answer '.repeat(400) }], source: { kind: 'model', provider, model } }) }, { surfaceOp: 'append' })
      history.append('step/end', { turn, step: 1 }); history.append('turn/end', { turn, reason: { kind: 'completed' } })
    }
    const { agent } = await ctx.agentLoop.createAgent(ctx, { sessionId: SessionId('managed-recovery'), seed: history.snapshotEvents(), agentOptions: { provider, model } })
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Install once and report.' }], source: { kind: 'user' } }))
    await agent.whenIdle()
    expect(executions).toBe(1); expect(requests).toHaveLength(3)
    expect(JSON.stringify(requests[2]!.messages).length).toBeLessThan(JSON.stringify(requests[1]!.messages).length)
    expect(requests.every(request => request.provider === provider && request.model === model)).toBe(true)
    const events = agent.session.snapshotEvents()
    expect(events.filter(event => event.type === 'tool/result')).toHaveLength(1)
    expect(JSON.stringify(events)).toContain('Python exit=0')
    expect(events.at(-1)).toMatchObject({ type: 'turn/end', data: { reason: { kind: 'completed' } } })
  } finally { await ctx.fiber.dispose() }
}, 15_000)
