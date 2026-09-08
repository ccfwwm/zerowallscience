import { ToolCallId, type StreamChunk } from '@deepseek-ai/dsh-llm'
import type { AssistantMessage, AssistantMessageEvent } from '@earendil-works/pi-ai'

function classifyError(message: string): string {
  if (/\b(?:401|403)\b|unauthor|forbidden|api.?key|authentication/iu.test(message)) return 'AUTH'
  if (/\b429\b|rate.?limit/iu.test(message)) return 'RATE_LIMIT'
  if (/quota|billing|insufficient/iu.test(message)) return 'QUOTA_EXCEEDED'
  if (/time(?:d)?\s*out|timeout/iu.test(message)) return 'TIMEOUT'
  if (/\b5\d\d\b/iu.test(message)) return 'SERVER'
  if (/network|connection|socket|fetch|ECONN|terminated|premature close/iu.test(message)) return 'TRANSPORT'
  return 'UPSTREAM'
}

function finishReason(message: AssistantMessage): Extract<StreamChunk, { type: 'finish' }>['reason'] {
  if (message.stopReason === 'stop') {
    return message.content.length === 0
      ? { kind: 'error', failure: { message: `model "${message.model}" returned no content`, code: 'EMPTY_RESPONSE' } }
      : { kind: 'stop' }
  }
  if (message.stopReason === 'length') return { kind: 'max-tokens' }
  if (message.stopReason === 'toolUse') return { kind: 'tool-calls' }
  if (message.stopReason === 'aborted') return { kind: 'aborted', failure: { message: message.errorMessage ?? 'request aborted', code: 'ABORTED' } }
  return { kind: 'error', failure: { message: message.errorMessage ?? `model stopped: ${message.stopReason}`, code: classifyError(message.errorMessage ?? '') } }
}

export async function* toStreamChunks(events: AsyncIterable<AssistantMessageEvent>): AsyncIterable<StreamChunk> {
  const toolIds = new Map<number, { id: string; name: string }>()
  for await (const event of events) {
    if (event.type === 'start') continue
    if (event.type === 'text_start') yield { type: 'block-start', index: event.contentIndex, blockType: 'text' }
    else if (event.type === 'text_delta') yield { type: 'text-delta', index: event.contentIndex, text: event.delta }
    else if (event.type === 'text_end') yield { type: 'block-end', index: event.contentIndex, block: { type: 'text', text: event.content } }
    else if (event.type === 'thinking_start') yield { type: 'block-start', index: event.contentIndex, blockType: 'reasoning' }
    else if (event.type === 'thinking_delta') yield { type: 'reasoning-delta', index: event.contentIndex, text: event.delta }
    else if (event.type === 'thinking_end') yield { type: 'block-end', index: event.contentIndex, block: { type: 'reasoning', text: event.content } }
    else if (event.type === 'toolcall_start') {
      const block = event.partial.content[event.contentIndex]
      const id = block?.type === 'toolCall' ? block.id : ''
      const name = block?.type === 'toolCall' ? block.name : ''
      toolIds.set(event.contentIndex, { id, name })
      yield { type: 'block-start', index: event.contentIndex, blockType: 'tool-call' }
    } else if (event.type === 'toolcall_delta') {
      const tool = toolIds.get(event.contentIndex)
      yield { type: 'tool-call-delta', index: event.contentIndex, id: ToolCallId(tool?.id ?? ''), ...(tool?.name ? { name: tool.name } : {}), argumentsDelta: event.delta }
    } else if (event.type === 'toolcall_end') {
      yield { type: 'block-end', index: event.contentIndex, block: { type: 'tool-call', id: ToolCallId(event.toolCall.id), name: event.toolCall.name, arguments: JSON.stringify(event.toolCall.arguments) } }
    } else if (event.type === 'done' || event.type === 'error') {
      const message = event.type === 'done' ? event.message : event.error
      yield { type: 'usage', usage: { inputTokens: message.usage.input, outputTokens: message.usage.output, ...(message.usage.cacheRead > 0 ? { cacheReadTokens: message.usage.cacheRead } : {}), ...(message.usage.cacheWrite > 0 ? { cacheWriteTokens: message.usage.cacheWrite } : {}) } }
      yield { type: 'finish', reason: finishReason(message) }
      return
    }
  }
  throw new Error('opencode2dsh stream ended without a terminal event')
}
