// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { McpConnectionsButton, type McpServerView } from '../src/client/McpConnectionsButton.js'

afterEach(cleanup)

it.each(['rmcp', 'gpsadb'])('keeps %s connection fields read-only while allowing runtime saves and repair', async serverName => {
  let record: McpServerView = {
    id: 'managed', name: serverName, serverName, transport: 'streamable-http',
    enabled: true, command: '', args: [], cwd: '', envRefs: {}, url: 'https://example.test/mcp',
    headerRefs: {}, toolCallTimeoutMs: 300_000, failOnStartupError: false,
    reconnect: { enabled: true, initialDelayMs: 5_000, maxDelayMs: 60_000, maxAttempts: 2 },
    runtimeState: 'idle', runtimeError: '', missingEnvironmentVariables: [], tools: [], toolDiscoveryState: 'unknown', createdAt: '', updatedAt: '',
  }
  const update = vi.fn(async (_id, changes) => (record = { ...record, ...changes }))
  const reload = vi.fn(async () => record)
  render(createElement(McpConnectionsButton, {
    embedded: true, t: key => key,
    listMcpServers: vi.fn(async () => [record]), updateMcpServer: update,
    createMcpServer: vi.fn(), removeMcpServer: vi.fn(), reloadMcpServer: reload,
    getSciMasterCredentialStatus: vi.fn(async () => ({ configured: false })),
    setSciMasterApiKey: vi.fn(), clearSciMasterApiKey: vi.fn(),
    getRdatalinuxCredentialStatus: vi.fn(async () => ({ configured: false, endpoint: record.url })),
    setRdatalinuxAuthorization: vi.fn(), clearRdatalinuxAuthorization: vi.fn(),
  }))
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(serverName) }))
  expect(screen.getByLabelText('URL').matches(':disabled')).toBe(true)
  expect(screen.getByLabelText('mcp.namespace').matches(':disabled')).toBe(true)
  expect(screen.getByLabelText('mcp.toolTimeout').matches(':disabled')).toBe(false)
  const save = await screen.findByRole('button', { name: 'common.save' }) as HTMLButtonElement
  for (const timeout of ['301000', '300000']) {
    fireEvent.change(screen.getByLabelText('mcp.toolTimeout'), { target: { value: timeout } })
    fireEvent.click(save)
    await waitFor(() => expect(save.disabled).toBe(false))
    expect(record.toolCallTimeoutMs).toBe(Number(timeout))
    expect(record.runtimeState).toBe('idle')
    expect(update).toHaveBeenLastCalledWith('managed', {
      enabled: true, toolCallTimeoutMs: Number(timeout), reconnect: record.reconnect, failOnStartupError: false,
    })
  }
  expect(update).toHaveBeenCalledTimes(2)
  const repair = screen.getByRole('button', { name: 'mcp.reload' }) as HTMLButtonElement
  fireEvent.click(repair)
  await waitFor(() => expect(repair.disabled).toBe(false))
  expect(reload).toHaveBeenCalledOnce()
})

it('shows searchable tool descriptions and parameter requirements from detailed DTOs', async () => {
  const record: McpServerView = {
    id: 'custom', name: 'Research', serverName: 'research', transport: 'streamable-http', enabled: true,
    command: '', args: [], cwd: '', envRefs: {}, url: 'https://example.test/mcp', headerRefs: {},
    toolCallTimeoutMs: 30_000, failOnStartupError: false,
    reconnect: { enabled: true, initialDelayMs: 500, maxDelayMs: 30_000, maxAttempts: 5 },
    runtimeState: 'active', runtimeError: '', missingEnvironmentVariables: [], tools: ['mcp__research__search'],
    toolDetails: [{ name: 'mcp__research__search', description: 'Search the study catalog', inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Search phrase', enum: ['GEO', 'NHANES'], default: 'GEO' } }, required: ['query'] } }],
    toolDiscoveryState: 'complete', createdAt: '', updatedAt: '',
  }
  render(createElement(McpConnectionsButton, {
    embedded: true, t: key => key,
    listMcpServers: vi.fn(async () => [record]), createMcpServer: vi.fn(), updateMcpServer: vi.fn(),
    removeMcpServer: vi.fn(), reloadMcpServer: vi.fn(),
    getSciMasterCredentialStatus: vi.fn(async () => ({ configured: false })), setSciMasterApiKey: vi.fn(), clearSciMasterApiKey: vi.fn(),
    getRdatalinuxCredentialStatus: vi.fn(async () => ({ configured: false, endpoint: record.url })), setRdatalinuxAuthorization: vi.fn(), clearRdatalinuxAuthorization: vi.fn(),
  }))
  fireEvent.click(await screen.findByRole('button', { name: /Research/ }))
  const tool = await screen.findByText('mcp__research__search')
  fireEvent.click(tool)
  expect(screen.getByText('Search the study catalog')).toBeTruthy()
  expect(screen.getByText('Search phrase')).toBeTruthy()
  expect(screen.getByText('mcp.required')).toBeTruthy()
  expect(screen.getByText('mcp.enumValues：GEO, NHANES')).toBeTruthy()
  expect(screen.getByText('mcp.defaultValue：')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('mcp.searchTools'), { target: { value: 'not-found' } })
  expect(screen.getByText('mcp.noToolMatches')).toBeTruthy()
})

it('keeps tools from older Hosts readable when parameter schemas are unavailable', async () => {
  const record: McpServerView = {
    id: 'legacy', name: 'Legacy Host', serverName: 'legacy', transport: 'streamable-http', enabled: true,
    command: '', args: [], cwd: '', envRefs: {}, url: 'https://example.test/mcp', headerRefs: {},
    toolCallTimeoutMs: 30_000, failOnStartupError: false,
    reconnect: { enabled: true, initialDelayMs: 500, maxDelayMs: 30_000, maxAttempts: 5 },
    runtimeState: 'active', runtimeError: '', missingEnvironmentVariables: [], tools: ['mcp__legacy__search'],
    toolDiscoveryState: 'complete', createdAt: '', updatedAt: '',
  }
  render(createElement(McpConnectionsButton, {
    embedded: true, t: key => key,
    listMcpServers: vi.fn(async () => [record]), createMcpServer: vi.fn(), updateMcpServer: vi.fn(),
    removeMcpServer: vi.fn(), reloadMcpServer: vi.fn(),
    getSciMasterCredentialStatus: vi.fn(async () => ({ configured: false })), setSciMasterApiKey: vi.fn(), clearSciMasterApiKey: vi.fn(),
    getRdatalinuxCredentialStatus: vi.fn(async () => ({ configured: false, endpoint: record.url })), setRdatalinuxAuthorization: vi.fn(), clearRdatalinuxAuthorization: vi.fn(),
  }))
  fireEvent.click(await screen.findByRole('button', { name: /Legacy Host/ }))
  fireEvent.click(await screen.findByText('mcp__legacy__search'))
  expect(screen.getByText('mcp.noParameterSchema')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('mcp.searchTools'), { target: { value: 'legacy' } })
  expect(screen.getByText('mcp__legacy__search')).toBeTruthy()
  fireEvent.change(screen.getByRole('combobox', { name: 'mcp.title', hidden: true }), { target: { value: '__new__' } })
  expect(screen.queryByText('mcp__legacy__search')).toBeNull()
  fireEvent.change(screen.getByRole('combobox', { name: 'mcp.title', hidden: true }), { target: { value: 'legacy' } })
  expect(await screen.findByText('mcp__legacy__search')).toBeTruthy()
})
