import { describe, expect, it } from 'vitest'
import {
  ENVIRONMENT_TARGET,
  HTTP_HEADER_TARGET,
  formatReferences,
  parseLines,
  parseReferences,
} from '../src/client/mcp-form.js'

describe('MCP form boundary', () => {
  it('parses one argument per non-empty line', () => {
    expect(parseLines(' -y\n\n @scope/server \r\n C:\\science ')).toEqual(['-y', '@scope/server', 'C:\\science'])
  })

  it('round-trips environment references without values', () => {
    const refs = parseReferences('API_TOKEN=ZEROWALL_MCP_TOKEN\nMODE=ZEROWALL_MCP_MODE', 'Environment references', ENVIRONMENT_TARGET)
    expect(refs).toEqual({ API_TOKEN: 'ZEROWALL_MCP_TOKEN', MODE: 'ZEROWALL_MCP_MODE' })
    expect(formatReferences(refs)).toBe('API_TOKEN=ZEROWALL_MCP_TOKEN\nMODE=ZEROWALL_MCP_MODE')
  })

  it('rejects malformed, duplicate, and injected reference targets', () => {
    expect(() => parseReferences('TOKEN=literal secret', 'Environment references', ENVIRONMENT_TARGET)).toThrow('environment variable')
    expect(() => parseReferences('TOKEN=A\nTOKEN=B', 'Environment references', ENVIRONMENT_TARGET)).toThrow('duplicate')
    expect(() => parseReferences('Authorization\r\nX-Test=MCP_TOKEN', 'Header references', HTTP_HEADER_TARGET)).toThrow()
  })
})
