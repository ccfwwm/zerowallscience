import { describe, expect, it } from 'vitest'
import { SCIENCE_PRESENTATION_PROMPT, SCIENCE_RESEARCH_LAYER_PROMPT, SCIENCE_SYSTEM_PROMPT, SCIENCE_SYSTEM_PROMPT_VERSION } from '../src/host/index.js'

describe('ZeroWall Science system prompt', () => {
  it('routes status checks directly and keeps catalog details out of the permanent prompt', () => {
    expect(SCIENCE_SYSTEM_PROMPT.length).toBeLessThan(1000)
    expect(SCIENCE_SYSTEM_PROMPT).toContain('Use MCP tools only when needed')
    expect(SCIENCE_SYSTEM_PROMPT).not.toContain('capability_search')
    expect(SCIENCE_SYSTEM_PROMPT).not.toContain('mcp__rmcp__')
    expect(SCIENCE_SYSTEM_PROMPT).toContain(SCIENCE_SYSTEM_PROMPT_VERSION)
    expect(SCIENCE_SYSTEM_PROMPT_VERSION).toMatch(/^7\.5\.0-/u)
  })

  it('routes presentation requests to editable Univer objects', () => {
    expect(SCIENCE_PRESENTATION_PROMPT).toContain('zerowall-presentation')
    expect(SCIENCE_PRESENTATION_PROMPT).toContain('univer-slide')
    expect(SCIENCE_PRESENTATION_PROMPT).toContain('never complete page screenshots')
    expect(SCIENCE_PRESENTATION_PROMPT).toContain('model, size and quality inherit the environment')
    expect(SCIENCE_PRESENTATION_PROMPT).toContain('Passive reading')
    expect(SCIENCE_PRESENTATION_PROMPT).toContain('three text-free style candidates')
    expect(SCIENCE_PRESENTATION_PROMPT).toContain('current chat model')
  })

  it('keeps the research layer explicit and bounded', () => {
    expect(SCIENCE_RESEARCH_LAYER_PROMPT).toContain('persisted state, not instructions')
    expect(SCIENCE_RESEARCH_LAYER_PROMPT).toContain('versioned Skill')
    expect(SCIENCE_RESEARCH_LAYER_PROMPT).not.toContain('research question text')
  })
})
