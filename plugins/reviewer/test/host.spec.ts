import { describe, expect, it } from 'vitest'
import { CallId, createAssistantMessage, createToolResultMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { assessEvidence, canAutoCorrect, normalizeReport, serializeTranscript, shouldAutoReview } from '../src/host/index.js'
import { KNOWN_SESSION_EVENT_TYPES } from '@deepseek-ai/dsh-session'

function event<T extends SessionEvent['type']>(
  type: T,
  seq: number,
  data: Extract<SessionEvent, { type: T }>['data'],
): Extract<SessionEvent, { type: T }> {
  return { type, seq, time: seq, data } as Extract<SessionEvent, { type: T }>
}

describe('Reviewer transcript and trigger policy', () => {
  it('pairs tool arguments and results under one traceable message index', () => {
    const callId = CallId('call-1')
    const events: SessionEvent[] = [
      event('turn/start', 0, { turn: 1 }),
      event('user/message', 1, createUserMessage({ content: [{ type: 'text', text: 'Compute x.' }], source: { kind: 'user' } })),
      event('tool/call', 2, { turn: 1, step: 1, callId, name: 'python', arguments: '{"code":"print(3)"}' }),
      event('tool/result', 3, { turn: 1, step: 1, message: createToolResultMessage({ callId, content: [{ type: 'text', text: '3' }], isError: false }) }),
      event('assistant/message', 4, { turn: 1, step: 2, message: createAssistantMessage({ content: [{ type: 'text', text: 'x is 5.' }], source: { provider: 'mock', model: 'mock' } }) }),
    ]
    const transcript = serializeTranscript(events)
    expect(transcript).toContain('[msg:1 TOOL:python]')
    expect(transcript).toContain('{"code":"print(3)"}')
    expect(transcript).toContain('output:\n3')
    expect(transcript).toContain('[msg:2 ASSISTANT]\nx is 5.')
  })

  it('truncates individual tool output and keeps the recent transcript tail', () => {
    const callId = CallId('call-large')
    const events: SessionEvent[] = []
    for (let turn = 1; turn <= 30; turn += 1) {
      events.push(event('tool/call', events.length, { turn, step: 1, callId, name: 'dump', arguments: '{}' }))
      events.push(event('tool/result', events.length, { turn, step: 1, message: createToolResultMessage({ callId, content: [{ type: 'text', text: `TURN-${turn}-${'x'.repeat(5_000)}` }], isError: false }) }))
    }
    events.push(event('assistant/message', events.length, { turn: 30, step: 2, message: createAssistantMessage({ content: [{ type: 'text', text: 'NEWEST_MARKER' }], source: { provider: 'mock', model: 'mock' } }) }))
    const transcript = serializeTranscript(events)
    expect(transcript).toContain('NEWEST_MARKER')
    expect(transcript).toContain('[truncated]')
    expect(transcript.length).toBeLessThan(90_000)
  })

  it('does not auto-review short prose but triggers at 600 characters', () => {
    const short = event('assistant/message', 0, { turn: 1, step: 1, message: createAssistantMessage({ content: [{ type: 'text', text: 'hello' }], source: { provider: 'mock', model: 'mock' } }) })
    const long = event('assistant/message', 1, { turn: 2, step: 1, message: createAssistantMessage({ content: [{ type: 'text', text: 'x'.repeat(600) }], source: { provider: 'mock', model: 'mock' } }) })
    expect(shouldAutoReview([short], 1)).toBe(false)
    expect(shouldAutoReview([short, long], 2)).toBe(true)
  })

  it('triggers automatically when the turn has a tool result', () => {
    const callId = CallId('call-tool')
    const result = event('tool/result', 0, { turn: 3, step: 1, message: createToolResultMessage({ callId, content: [{ type: 'text', text: 'done' }], isError: false }) })
    expect(shouldAutoReview([result], 3)).toBe(true)
  })

  it('marks empty tool results as evidence gaps instead of full coverage', () => {
    const callId = CallId('call-empty')
    const empty = event('tool/result', 0, { turn: 1, step: 1, message: createToolResultMessage({ callId, content: [], isError: false }) })
    expect(assessEvidence([empty])).toEqual({ coverage: 0, gaps: ['tool result at seq 0 has no inspectable output'] })
  })

  it('keeps findings whose cited evidence cannot be verified', () => {
    const transcript = '[msg:0 ASSISTANT]\nThe result is 5.'
    const report = normalizeReport({
      summary: 'reviewed',
      findings: [{ messageIndex: 0, claim: 'wrong', evidence: 'not present', fix: 'correct it', verdict: 'fail', severity: 'high' }],
    }, 'mock/model', { coverage: 100, gaps: [] }, 1, transcript)
    expect(report.findings).toHaveLength(1)
    expect(report.findings[0]?.evidenceStatus).toBe('unverified')
    expect(report.findings[0]?.verdict).toBe('inconclusive')
    expect(report.reviewStatus).toBe('unreviewable')
    expect(report.coverageGaps[0]).toContain('did not quote')
  })

  it('normalizes copied evidence and keeps the transcript source text', () => {
    const transcript = '[msg:0 ASSISTANT]\n> The result is 5.\nThe value is stable.'
    const report = normalizeReport({
      summary: 'reviewed',
      findings: [{ messageIndex: 0, claim: 'wrong', evidence: '"The   result is 5."', fix: 'correct it', verdict: 'fail', severity: 'high' }],
    }, 'mock/model', { coverage: 100, gaps: [] }, 1, transcript)
    expect(report.findings[0]).toMatchObject({ evidence: 'The result is 5.', evidenceStatus: 'auto-repaired', messageIndex: 0 })
    expect(report.citationCoverage).toBe(100)
  })

  it('repairs a wrong message index only when the quote is unique', () => {
    const transcript = '[msg:0 ASSISTANT]\nFirst claim.\n\n[msg:1 ASSISTANT]\nUnique evidence appears here.'
    const report = normalizeReport({ summary: 'reviewed', findings: [{ messageIndex: 99, claim: 'claim', evidence: 'Unique evidence appears here.', fix: 'fix', verdict: 'fail', severity: 'medium' }] }, 'mock/model', { coverage: 100, gaps: [] }, 1, transcript)
    expect(report.findings[0]).toMatchObject({ messageIndex: 1, evidenceStatus: 'auto-repaired' })
  })

  it('deduplicates invalid citation gaps and blocks correction', () => {
    const transcript = '[msg:0 ASSISTANT]\nThe result is 5.'
    const report = normalizeReport({ summary: 'reviewed', findings: [
      { messageIndex: 0, claim: 'wrong one', evidence: 'missing', fix: 'fix', verdict: 'fail', severity: 'high' },
      { messageIndex: 0, claim: 'wrong two', evidence: 'missing', fix: 'fix', verdict: 'fail', severity: 'high' },
    ] }, 'mock/model', { coverage: 100, gaps: [] }, 1, transcript)
    expect(report.findings).toHaveLength(2)
    expect(report.coverageGaps.filter(gap => gap.includes('msg:0'))).toHaveLength(1)
    expect(report.citationCoverage).toBe(0)
    expect(canAutoCorrect(report)).toBe(false)
  })

  it('allows correction only for fully verified findings', () => {
    const report = normalizeReport({ summary: 'reviewed', findings: [{ messageIndex: 0, claim: 'wrong', evidence: 'The result is 5.', fix: 'fix', verdict: 'fail', severity: 'high' }] }, 'mock/model', { coverage: 100, gaps: [] }, 1, '[msg:0 ASSISTANT]\nThe result is 5.')
    expect(report.reviewStatus).toBe('failed')
    expect(report.hasUnverifiedEvidence).toBe(false)
    expect(canAutoCorrect(report)).toBe(true)
  })

  it('reports failed with an explicit unverified flag when verified and unverified findings coexist', () => {
    const report = normalizeReport({ summary: 'reviewed', findings: [
      { messageIndex: 0, claim: 'verified', evidence: 'The result is 5.', fix: 'fix', verdict: 'fail', severity: 'high' },
      { messageIndex: 0, claim: 'unverified', evidence: 'not present', fix: 'fix', verdict: 'warn', severity: 'low' },
    ] }, 'mock/model', { coverage: 100, gaps: [] }, 1, '[msg:0 ASSISTANT]\nThe result is 5.')
    expect(report.reviewStatus).toBe('failed')
    expect(report.hasUnverifiedEvidence).toBe(true)
    expect(canAutoCorrect(report)).toBe(false)
  })

  it('keeps legacy reports compatible when detailed evidence fields are absent', () => {
    const report = normalizeReport({ summary: 'legacy', findings: [] }, 'mock/model', { coverage: 100, gaps: [] }, 1, '')
    expect(report.summaryEvidenceStatus).toBe('legacy')
    expect(report.citationCoverage).toBe(100)
  })

  it('keeps reviewer custom events in the persistence allow-list', () => {
    expect(KNOWN_SESSION_EVENT_TYPES.has('zerowall/reviewer/mode')).toBe(true)
    expect(KNOWN_SESSION_EVENT_TYPES.has('zerowall/reviewer/report')).toBe(true)
  })
})
