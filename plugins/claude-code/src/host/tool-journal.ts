import type { Agent } from '@deepseek-ai/dsh-agent'
import { createAssistantMessage, createToolResultMessage, type ToolCallId } from '@deepseek-ai/dsh-llm'

/** CLI-owned tools still require the complete DSH durable presentation lifecycle. */
export async function appendClaudeToolCall(agent: Agent,
  call: { callId: ToolCallId; name: string; arguments: string }, source: { provider: string; model: string }) {
  const cursor = agent.session.snapshotEvents().reduce((value, event) => event.type === 'step/start' ? event.data : value, { turn: 0, step: 0 })
  if (!cursor.turn || !cursor.step) return
  await agent.session.append('assistant/message', { ...cursor, stream: [], message: createAssistantMessage({
    content: [{ type: 'tool-call', id: call.callId, name: call.name, arguments: call.arguments }], source,
  }) }, { surfaceOp: 'append' })
  await agent.session.append('tool/call', { ...cursor, ...call })
}

/** A stopped SDK may omit its final tool response; preserve the unknown outcome without replay. */
export async function settleClaudeToolCalls(agent: Agent) {
  const pending = new Set<ToolCallId>()
  let cursor = { turn: 0, step: 0 }
  for (const event of agent.session.snapshotEvents()) {
    if (event.type === 'step/start') { cursor = event.data; pending.clear() }
    else if (event.type === 'tool/call') pending.add(event.data.callId)
    else if (event.type === 'tool/result') pending.delete(event.data.message.toolCallId)
  }
  if (!cursor.turn || !cursor.step) return
  for (const callId of pending) await agent.session.append('tool/result', { ...cursor, message: createToolResultMessage({
    callId, isError: true, content: [{ type: 'text', text: 'Claude stopped before reporting this tool outcome. Inspect existing files and results before continuing; do not automatically replay the operation.' }],
  }) }, { surfaceOp: 'append' })
}
