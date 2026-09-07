import { describe, expect, it } from 'vitest'
import { SCIENCE_SYSTEM_PROMPT } from '../src/host/index.js'

describe('ZeroWall Science system prompt', () => {
  it('describes the compact research capability surface without retired MCP names', () => {
    expect(SCIENCE_SYSTEM_PROMPT).toContain('R/Bioconductor')
    expect(SCIENCE_SYSTEM_PROMPT).toContain('FigureYa')
    expect(SCIENCE_SYSTEM_PROMPT).toContain('GEO and NHANES')
    expect(SCIENCE_SYSTEM_PROMPT).toContain('bio_search')
    expect(SCIENCE_SYSTEM_PROMPT).toContain('capability_search')
    expect(SCIENCE_SYSTEM_PROMPT).toContain('capability_execute')
    expect(SCIENCE_SYSTEM_PROMPT).toContain('manifests')
    expect(SCIENCE_SYSTEM_PROMPT).not.toContain('meta_search')
    expect(SCIENCE_SYSTEM_PROMPT).not.toContain('meta_enable')
    expect(SCIENCE_SYSTEM_PROMPT).not.toContain('rplatform')
    expect(SCIENCE_SYSTEM_PROMPT).not.toContain('rbioagent')
    expect(SCIENCE_SYSTEM_PROMPT).not.toContain('rplotfigure')
  })
})
