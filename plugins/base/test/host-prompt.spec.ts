import { describe, expect, it } from 'vitest'
import { SCIENCE_SYSTEM_PROMPT, SCIENCE_SYSTEM_PROMPT_VERSION } from '../src/host/index.js'

describe('ZeroWall Science system prompt', () => {
  it('routes status checks directly and keeps catalog details out of the permanent prompt', () => {
    expect(SCIENCE_SYSTEM_PROMPT.length).toBeLessThan(1000)
    expect(SCIENCE_SYSTEM_PROMPT).not.toContain('Use MCP tools only when needed')
    expect(SCIENCE_SYSTEM_PROMPT).toContain('capability_search')
    expect(SCIENCE_SYSTEM_PROMPT).not.toContain('mcp__rmcp__')
    expect(SCIENCE_SYSTEM_PROMPT).toContain(SCIENCE_SYSTEM_PROMPT_VERSION)
    expect(SCIENCE_SYSTEM_PROMPT).toContain('Handle research through installed Skills and Host tools')
    expect(SCIENCE_SYSTEM_PROMPT).toContain('science_viewer_panel')
    expect(SCIENCE_SYSTEM_PROMPT).toContain('danger-full-access')
    expect(SCIENCE_SYSTEM_PROMPT).toContain('managed ZeroWall runtime')
    expect(SCIENCE_SYSTEM_PROMPT).toContain('200 lines per call')
    expect(SCIENCE_SYSTEM_PROMPT).not.toMatch(/Gate|Study|register/u)
    expect(SCIENCE_SYSTEM_PROMPT.toLowerCase()).not.toContain('workbench')
    expect(SCIENCE_SYSTEM_PROMPT_VERSION).toBe('8.4.21-tool-exposure.1')
    expect(SCIENCE_SYSTEM_PROMPT).toContain('built-in Host tools execute them without external MCP servers')
  })

  it('keeps domain workflows out of the permanent prompt', () => {
    expect(SCIENCE_SYSTEM_PROMPT).not.toMatch(/Zotero|web.?search|media|Biomni|research_workflow|python_environment/iu)
    expect(SCIENCE_SYSTEM_PROMPT).toContain('capability_search')
  })
})
