import { describe, expect, it } from 'vitest'
import { SCIENCE_SYSTEM_PROMPT } from '../src/host/index.js'

describe('ZeroWall Science system prompt', () => {
  it('routes status checks directly and keeps catalog details out of the permanent prompt', () => {
    expect(SCIENCE_SYSTEM_PROMPT.length).toBeLessThan(1000)
    expect(SCIENCE_SYSTEM_PROMPT).toContain('Use MCP tools only when needed')
    expect(SCIENCE_SYSTEM_PROMPT).not.toContain('capability_search')
    expect(SCIENCE_SYSTEM_PROMPT).not.toContain('mcp__rmcp__')
  })
})
