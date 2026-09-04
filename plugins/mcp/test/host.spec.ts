import { describe, expect, it } from 'vitest'
import type { McpServerRecord } from '@zerowallscience/research-store'
import { aiCloudCredentialKey, redactError, resolveMcpConfig, resolveStdioLaunch } from '../src/host/index.js'

const base: McpServerRecord = {
  id: 'mcp-1', name: 'Tools', serverName: 'tools', transport: 'stdio', enabled: true,
  command: 'node', args: ['server.mjs'], cwd: 'C:/science', envRefs: { API_TOKEN: 'MCP_TOKEN' },
  url: '', headerRefs: {}, toolCallTimeoutMs: 60000, failOnStartupError: true,
  reconnect: { enabled: true, initialDelayMs: 500, maxDelayMs: 30000, maxAttempts: 10 },
  createdAt: '2026-08-17T00:00:00.000Z', updatedAt: '2026-08-17T00:00:00.000Z',
}

describe('ZeroWall MCP config boundary', () => {
  it('resolves stdio credential references only inside the Host', () => {
    const result = resolveMcpConfig(base, { MCP_TOKEN: 'secret-value' })
    expect(result.missingEnvironmentVariables).toEqual([])
    expect(result.config).toMatchObject({ transport: 'stdio', env: { API_TOKEN: 'secret-value' } })
  })

  it('normalizes stdio working directories and path arguments to absolute paths', () => {
    const result = resolveStdioLaunch({ command: 'node', args: ['scripts/server.mjs', '@scope/server', '--flag'], cwd: 'workspace' }, 'C:/host')
    expect(result.cwd).toMatch(/^[A-Za-z]:[\\/]host[\\/]workspace$/u)
    expect(result.command).toBe('node')
    expect(result.args[0]).toMatch(/^[A-Za-z]:[\\/]host[\\/]workspace[\\/]scripts[\\/]server\.mjs$/u)
    expect(result.args.slice(1)).toEqual(['@scope/server', '--flag'])
  })

  it('returns only missing environment variable names', () => {
    const result = resolveMcpConfig(base, {})
    expect(result).toEqual({ missingEnvironmentVariables: ['MCP_TOKEN'] })
    expect(JSON.stringify(result)).not.toContain('API_TOKEN=')
  })

  it('resolves HTTP headers from environment references', () => {
    const result = resolveMcpConfig({
      ...base,
      transport: 'streamable-http', command: '', args: [], envRefs: {}, url: 'https://mcp.example.test/api',
      headerRefs: { Authorization: 'MCP_AUTHORIZATION' },
    }, { MCP_AUTHORIZATION: 'Bearer secret-value' })
    expect(result.config).toMatchObject({
      transport: 'streamable-http',
      url: 'https://mcp.example.test/api',
      headers: { Authorization: 'Bearer secret-value' },
    })
  })

  it('ignores references owned by the inactive transport', () => {
    const stdio = resolveMcpConfig({ ...base, headerRefs: { Authorization: 'MISSING_HTTP_TOKEN' } }, { MCP_TOKEN: 'value' })
    expect(stdio.missingEnvironmentVariables).toEqual([])

    const http = resolveMcpConfig({
      ...base,
      transport: 'streamable-http', command: '', args: [], url: 'https://mcp.example.test/api',
      headerRefs: {}, envRefs: { API_TOKEN: 'MISSING_STDIO_TOKEN' },
    }, {})
    expect(http.missingEnvironmentVariables).toEqual([])
  })

  it('redacts credentials and URL query values from runtime errors', () => {
    const redacted = redactError(new Error(
      'Bearer abc.def token=plain https://user:pass@mcp.example.test/api?api_key=query-secret#fragment',
    ))
    expect(redacted).not.toContain('abc.def')
    expect(redacted).not.toContain('plain')
    expect(redacted).not.toContain('user')
    expect(redacted).not.toContain('pass')
    expect(redacted).not.toContain('query-secret')
    expect(redacted).toContain('[redacted]')
  })

  it('maps only supported AI Cloud provider routes to group secret keys', () => {
    expect(aiCloudCredentialKey('zerowall-ai-cloud-50-completions')).toBe('zerowall.ai-cloud.group.50')
    expect(aiCloudCredentialKey('zerowall-ai-cloud-50-responses')).toBe('zerowall.ai-cloud.group.50')
    expect(aiCloudCredentialKey('zerowall-ai-cloud-50-messages')).toBe('zerowall.ai-cloud.group.50')
    expect(aiCloudCredentialKey('zerowall-ai-cloud-0-completions')).toBeUndefined()
    expect(aiCloudCredentialKey('other-provider-50')).toBeUndefined()
  })
})
