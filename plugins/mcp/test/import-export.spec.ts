import { describe, expect, it } from 'vitest'
import { parseMcpServers, serializeMcpServers, type McpServerView } from '../src/client/McpConnectionsButton.js'

const server: McpServerView = {
  id: 'mcp-1', name: 'Literature', serverName: 'literature', transport: 'streamable-http', enabled: true,
  command: '', args: [], cwd: '', envRefs: {}, url: 'https://example.test/mcp', headerRefs: { Authorization: 'MCP_AUTH_REF' },
  toolCallTimeoutMs: 60000, failOnStartupError: false,
  reconnect: { enabled: true, initialDelayMs: 500, maxDelayMs: 30000, maxAttempts: 10 },
  runtimeState: 'active', runtimeError: '', missingEnvironmentVariables: [], createdAt: '2026-01-01', updatedAt: '2026-01-01',
}

describe('MCP JSON import and export', () => {
  it('exports only connection metadata and credential references', () => {
    const raw = serializeMcpServers([server])
    expect(raw).not.toContain('runtimeState')
    expect(raw).not.toContain('createdAt')
    expect(parseMcpServers(raw)).toEqual([expect.objectContaining({ serverName: 'literature', headerRefs: { Authorization: 'MCP_AUTH_REF' } })])
  })

  it('rejects JSON without a server list', () => {
    expect(() => parseMcpServers('{"name":"bad"}')).toThrow('servers array')
  })
})
