import { describe, expect, it } from 'vitest'
import { SCIENCE_PRESENTATION_PROMPT, SCIENCE_RESEARCH_LAYER_PROMPT, SCIENCE_RMCP_ROUTING_PROMPT, SCIENCE_SYSTEM_PROMPT, SCIENCE_SYSTEM_PROMPT_VERSION } from '../src/host/index.js'

describe('ZeroWall Science system prompt', () => {
  it('routes status checks directly and keeps catalog details out of the permanent prompt', () => {
    expect(SCIENCE_SYSTEM_PROMPT.length).toBeLessThan(1000)
    expect(SCIENCE_SYSTEM_PROMPT).not.toContain('Use MCP tools only when needed')
    expect(SCIENCE_SYSTEM_PROMPT).not.toContain('capability_search')
    expect(SCIENCE_SYSTEM_PROMPT).not.toContain('mcp__rmcp__')
    expect(SCIENCE_SYSTEM_PROMPT).toContain(SCIENCE_SYSTEM_PROMPT_VERSION)
    expect(SCIENCE_SYSTEM_PROMPT).toContain('Handle research in this conversation')
    expect(SCIENCE_SYSTEM_PROMPT).toContain('science_viewer_panel')
    expect(SCIENCE_SYSTEM_PROMPT).not.toMatch(/Gate|Study|register/u)
    expect(SCIENCE_SYSTEM_PROMPT.toLowerCase()).not.toContain('workbench')
    expect(SCIENCE_SYSTEM_PROMPT_VERSION).toBe('8.4.16-on-demand-context.1')
  })

  it('routes scientific work through the smallest matching Skill and on-demand MCP', () => {
    expect(SCIENCE_RMCP_ROUTING_PROMPT).toContain('skill_search')
    expect(SCIENCE_RMCP_ROUTING_PROMPT).toContain('load matching instructions with skill')
    expect(SCIENCE_RMCP_ROUTING_PROMPT).toContain('connect only the MCP server needed')
    expect(SCIENCE_RMCP_ROUTING_PROMPT).toContain('use its live schemas and results')
    expect(SCIENCE_RMCP_ROUTING_PROMPT).toContain('Do not substitute local execution when remote work fails')
    expect(SCIENCE_RMCP_ROUTING_PROMPT).toContain('permission, credential, provenance, and data-transfer boundaries')
    expect(SCIENCE_RMCP_ROUTING_PROMPT).toContain('An explicit run request authorizes that submission')
  })

  it('loads presentation instructions and verifies rendered exports only when needed', () => {
    expect(SCIENCE_PRESENTATION_PROMPT).toContain('load the matching presentation Skills')
    expect(SCIENCE_PRESENTATION_PROMPT).toContain('discover presentation tools only when needed')
    expect(SCIENCE_PRESENTATION_PROMPT).toContain("Follow the user's page count, template, visual direction, editability, and model settings")
    expect(SCIENCE_PRESENTATION_PROMPT).toContain('inspect rendered output and verify the exported file')
  })

  it('routes scientific work through versioned Skills and retains Research Host workflows', () => {
    expect(SCIENCE_RESEARCH_LAYER_PROMPT).toContain('directly in this conversation')
    expect(SCIENCE_RESEARCH_LAYER_PROMPT).toContain('versioned Skill')
    expect(SCIENCE_RESEARCH_LAYER_PROMPT).toContain('pending evidence as unverified')
    expect(SCIENCE_RESEARCH_LAYER_PROMPT).toContain('research_study and research_workflow')
    expect(SCIENCE_RESEARCH_LAYER_PROMPT).toContain('active Project/Study')
  })})
