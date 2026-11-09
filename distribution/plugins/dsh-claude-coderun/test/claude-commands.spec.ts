import { describe, expect, it } from 'vitest'
import { FALLBACK_COMMANDS, commandSupported, compactBoundaryOf, parseClaudeCommand } from '../src/host/claude-commands.js'

describe('Claude slash commands', () => {
  it('parses Chinese and English compact commands', () => {
    expect(parseClaudeCommand('/压缩')).toEqual({ kind: 'slash', name: '/压缩', args: [] })
    expect(parseClaudeCommand('/context full')).toEqual({ kind: 'slash', name: '/context', args: ['full'] })
    expect(parseClaudeCommand('继续当前任务')).toEqual({ kind: 'prompt', text: '继续当前任务' })
  })

  it('uses the SDK list when present while retaining the safe fallback list', () => {
    expect(commandSupported(FALLBACK_COMMANDS, '/compact')).toBe(true)
    expect(commandSupported([{ name: '/compact' }], '/压缩')).toBe(false)
  })

  it('accepts only a real compact_boundary system message as compression evidence', () => {
    expect(compactBoundaryOf({ type: 'assistant', subtype: 'compact_boundary' })).toBeUndefined()
    expect(compactBoundaryOf({ type: 'system', subtype: 'compact_boundary', compact_metadata: { trigger: 'manual', pre_tokens: 180000, post_tokens: 50000, duration_ms: 1200 } }))
      .toEqual({ trigger: 'manual', preTokens: 180000, postTokens: 50000, durationMs: 1200 })
  })
})
