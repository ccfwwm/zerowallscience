import { describe, expect, it } from 'vitest'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createToolResultMessage, ToolCallId } from '@deepseek-ai/dsh-llm'
import { assertReleasedV4Relationships } from '../../../deepseek-harness/packages/session/session-format-v3-to-v4/src/validation.ts'
import { appendClaudeToolCall, settleClaudeToolCalls } from '../src/host/tool-journal.js'

describe('durable CLI tool history', () => {
  it.each([false, true])('reopens the canonical V4 lifecycle after completion or interruption (%s)', async interrupted => {
    const events: Array<any> = []
    const append = async (type: string, data: unknown, extra = {}) => {
      events.push({ seq: events.length, timestamp: Date.now(), type, data, ...extra })
    }
    const agent = { session: { snapshotEvents: () => events, append } } as unknown as Agent
    await append('turn/start', { turn: 1 })
    await append('step/start', { turn: 1, step: 1 })
    const callId = ToolCallId('native-or-bridge-call')
    await appendClaudeToolCall(agent, { callId, name: 'Write', arguments: '{"file_path":"result.txt"}' }, { provider: 'selected-provider', model: 'selected-model' })
    if (!interrupted) await append('tool/result', { turn: 1, step: 1, message: createToolResultMessage({ callId, content: [{ type: 'text', text: 'done' }] }) }, { surfaceOp: 'append' })
    await settleClaudeToolCalls(agent)
    await settleClaudeToolCalls(agent)
    await append('step/end', { turn: 1, step: 1 })
    await append('turn/end', { turn: 1, reason: { kind: interrupted ? 'aborted' : 'completed' } })
    const known = new Set(events.map(event => event.type))
    const artifact = JSON.parse(JSON.stringify({ header: { id: 'session-test', isSeeded: false }, inheritedEventCount: 0, events }))
    expect(() => assertReleasedV4Relationships(artifact, known)).not.toThrow()
    expect(events.filter(event => event.type === 'tool/result')).toHaveLength(1)
    expect(events[2].data.message.source).toMatchObject({ provider: 'selected-provider', model: 'selected-model' })
    if (interrupted) expect(events.find(event => event.type === 'tool/result').data.message).toMatchObject({ isError: true, content: [{ type: 'text', text: expect.stringContaining('do not automatically replay') }] })
    artifact.events = artifact.events.filter((event: any) => event.type !== 'assistant/message')
    expect(() => assertReleasedV4Relationships(artifact, known)).toThrow('no advertised tool lifecycle')
  })
})
