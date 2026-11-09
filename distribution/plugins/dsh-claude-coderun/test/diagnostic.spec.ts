import { describe, expect, it } from 'vitest'
import { claudeFailureCategory } from '../src/host/diagnostic.js'

describe('Claude failure diagnosis', () => {
  it('retains a provider billing response hidden by the CLI authentication wrapper', () => {
    expect(claudeFailureCategory('Failed to authenticate. API Error: 403 insufficient balance')).toBe('provider-billing')
    expect(claudeFailureCategory('401 invalid API key')).toBe('authentication')
    expect(claudeFailureCategory('API Error: 429 rate limit')).toBe('provider-capacity')
    expect(claudeFailureCategory('ECONNRESET fetch failed')).toBe('connection')
  })
})
