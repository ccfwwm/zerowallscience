import { describe, expect, it } from 'vitest'
import { claudePromptFromRequest, parseClaudeCliEvent } from '../src/host/cli.js'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'

describe('Claude CLI conversation bridge', () => {
  it('preserves system, user, assistant and tool-result context in the request', () => {
    const options = {
      system: 'System addition',
      messages: [
        { role: 'system', content: [{ type: 'text', text: 'Workspace instructions' }] },
        { role: 'user', content: [{ type: 'text', text: 'First request' }, { type: 'file', attachment: { name: 'data.csv', bytes: 21 } }] },
        { role: 'assistant', content: [{ type: 'text', text: 'First answer' }] },
        { role: 'tool', content: [{ type: 'text', text: 'Tool output' }], toolCallId: 'call-1' },
      ],
    } as unknown as Pick<GenerateOptions, 'messages' | 'system'>
    const prompt = claudePromptFromRequest(options)
    expect(prompt).toContain('Follow its system instructions')
    expect(prompt).toContain('System addition')
    expect(prompt).toContain('Workspace instructions')
    expect(prompt).toContain('First request')
    expect(prompt).toContain('Uploaded file: data.csv, 21 bytes')
    expect(prompt).toContain('First answer')
    expect(prompt).toContain('Tool output')
  })

  it('preserves Claude content block starts, deltas, stops, and the nested block index', () => {
    expect(parseClaudeCliEvent(JSON.stringify({ type: 'stream_event', index: 77, event: {
      type: 'content_block_start', index: 2, content_block: { type: 'text' },
    } }))).toEqual({ kind: 'text-start', index: 2 })
    expect(parseClaudeCliEvent(JSON.stringify({ type: 'stream_event', event: {
      type: 'content_block_delta', index: 2, delta: { type: 'text_delta', text: 'hello' },
    } }))).toEqual({ kind: 'text', text: 'hello', index: 2 })
    expect(parseClaudeCliEvent(JSON.stringify({ type: 'stream_event', event: {
      type: 'content_block_stop', index: 2,
    } }))).toEqual({ kind: 'block-stop', index: 2 })
    expect(parseClaudeCliEvent(JSON.stringify({ type: 'stream_event', event: {
      type: 'content_block_start', index: 3, content_block: { type: 'thinking' },
    } }))).toEqual({ kind: 'thinking-start', index: 3 })
    expect(parseClaudeCliEvent(JSON.stringify({ type: 'stream_event', event: {
      type: 'content_block_delta', index: 3, delta: { type: 'thinking_delta', thinking: 'reasoning' },
    } }))).toEqual({ kind: 'thinking', text: 'reasoning', index: 3 })
    expect(parseClaudeCliEvent(JSON.stringify({ type: 'stream_event', event: {
      type: 'content_block_start', index: 4, content_block: { type: 'tool_use', id: 'tool-1', name: 'Read' },
    } }))).toEqual({ kind: 'tool-start', index: 4, id: 'tool-1', name: 'Read' })
    expect(parseClaudeCliEvent(JSON.stringify({ type: 'stream_event', event: {
      type: 'content_block_delta', index: 4, delta: { type: 'input_json_delta', partial_json: '{"path":' },
    } }))).toEqual({ kind: 'tool-input', argumentsDelta: '{"path":', index: 4 })
  })

  it('reports CLI result failures without exposing raw frames', () => {
    expect(parseClaudeCliEvent(JSON.stringify({ type: 'result', is_error: true, result: 'provider details' })))
      .toEqual({ kind: 'result', text: 'provider details', final: true, failed: true })
    expect(parseClaudeCliEvent('not json')).toBeUndefined()
    expect(parseClaudeCliEvent(JSON.stringify({ type: 'system', subtype: 'init' }))).toBeUndefined()
  })
})
