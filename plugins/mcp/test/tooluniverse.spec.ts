import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ connect: vi.fn(), callTool: vi.fn(), close: vi.fn(), transport: vi.fn() }))
vi.mock('@modelcontextprotocol/client', () => ({
  Client: class { connect = mocks.connect; callTool = mocks.callTool; close = mocks.close },
  StreamableHTTPClientTransport: class { constructor(...args: unknown[]) { mocks.transport(...args) } },
}))
import { callToolUniverse, normalizeToolUniverseUrl, resolveToolUniverseCredentials, rejectToolUniverseSecretArguments, TOOLUNIVERSE_TRUSTED_URL } from '../src/host/tooluniverse-transport.js'
beforeEach(() => { vi.clearAllMocks(); mocks.connect.mockResolvedValue(undefined); mocks.close.mockResolvedValue(undefined); mocks.callTool.mockResolvedValue({ content: [{ type: 'text', text: '{"job_id":"j"}' }] }) })
const connection = { serverName: 'rmcp', transport: 'streamable-http', url: TOOLUNIVERSE_TRUSTED_URL, enabled: true, envRefs: { NCBI_API_KEY: 'NCBI_REF' } }
it('normalizes the retired IP endpoint to the HTTPS product endpoint', () => {
  expect(normalizeToolUniverseUrl('https://rmcp.chengxunkeji.cn/r-platform/mcp/')).toBe(TOOLUNIVERSE_TRUSTED_URL)
  expect(normalizeToolUniverseUrl('http://103.217.185.141:8099/r-platform/mcp')).toBe(TOOLUNIVERSE_TRUSTED_URL)
  expect(normalizeToolUniverseUrl('https://untrusted.example/r-platform/mcp')).toBeUndefined()
})
it('keeps request credentials exclusively in metadata and clears them after submission', async () => {
  const credentials = await resolveToolUniverseCredentials(connection, async () => 'private-value')
  let sent: any
  mocks.callTool.mockImplementation(async params => { sent = JSON.parse(JSON.stringify(params)); return { content: [] } })
  await callToolUniverse({ url: TOOLUNIVERSE_TRUSTED_URL, authorization: 'Bearer internal', operation: 'tooluniverse.tool.UniProt_get_entry_by_accession', arguments: { project_id: 'p', request_id: 'r', tool_arguments: { accession: 'P05067' }, confirm: true }, credentials })
  expect(sent._meta['zerowall.tooluniverse.credentials']).toEqual({ NCBI_API_KEY: 'private-value' })
  expect(JSON.stringify(sent.arguments)).not.toContain('private-value')
  expect(credentials).toEqual({})
  expect(mocks.transport.mock.calls[0]?.[1]).toMatchObject({ requestInit: { redirect: 'error' } })
  expect(mocks.close).toHaveBeenCalledOnce()
})
it('sends a migrated legacy connection to the HTTPS endpoint', async () => {
  await callToolUniverse({ url: 'http://103.217.185.141:8099/r-platform/mcp', authorization: 'Bearer internal', operation: 'tooluniverse.run.tool', arguments: {}, credentials: {} })
  expect(mocks.transport.mock.calls[0]?.[0]?.toString()).toBe(TOOLUNIVERSE_TRUSTED_URL)
})
it('does not resolve or forward secrets to untrusted endpoints, disabled connections or read operations', async () => {
  const resolver = vi.fn(async () => 'private-value')
  for (const changes of [{ url: 'https://untrusted.example/mcp' }, { enabled: false }, { transport: 'stdio' }, { serverName: 'user-copy' }]) await expect(resolveToolUniverseCredentials({ ...connection, ...changes }, resolver)).rejects.toThrow('UNTRUSTED')
  expect(resolver).not.toHaveBeenCalled()
  await expect(callToolUniverse({ url: TOOLUNIVERSE_TRUSTED_URL, authorization: 'Bearer internal', operation: 'tooluniverse.status', arguments: {}, credentials: {} })).rejects.toThrow('TARGET')
  expect(mocks.callTool).not.toHaveBeenCalled()
})
it('rejects nested model credential arguments and redacts transport errors', async () => {
  expect(() => rejectToolUniverseSecretArguments({ tool_arguments: { nested: [{ api_key: 'secret' }] } })).toThrow('CREDENTIAL_ARGUMENT_FORBIDDEN')
  mocks.callTool.mockRejectedValue(new Error('request included private-value'))
  const credentials = { NCBI_API_KEY: 'private-value' }
  await expect(callToolUniverse({ url: TOOLUNIVERSE_TRUSTED_URL, authorization: 'Bearer internal', operation: 'tooluniverse.run.tool', arguments: {}, credentials })).rejects.toThrow('TOOLUNIVERSE_TRANSPORT_FAILED')
  expect(credentials).toEqual({})
})
