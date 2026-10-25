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

  it('reads streamed text deltas and reports CLI result failures without exposing raw frames', () => {
    expect(parseClaudeCliEvent(JSON.stringify({ type: 'stream_event', event: {
      type: 'content_block_delta', delta: { type: 'text_delta', text: 'hello' },
    } }))).toEqual({ text: 'hello' })
    expect(parseClaudeCliEvent(JSON.stringify({ type: 'result', is_error: true, result: 'provider details' })))
      .toEqual({ text: 'provider details', final: true, failed: true })
    expect(parseClaudeCliEvent('not json')).toBeUndefined()
    expect(parseClaudeCliEvent(JSON.stringify({ type: 'system', subtype: 'init' }))).toBeUndefined()
  })
})
