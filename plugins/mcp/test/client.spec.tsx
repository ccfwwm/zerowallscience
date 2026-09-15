// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { McpConnectionsButton, type McpServerView } from '../src/client/McpConnectionsButton.js'

afterEach(cleanup)

it('releases managed connection controls after successful saves and repair', async () => {
  let record: McpServerView = {
    id: 'managed', name: 'rmcp', serverName: 'rmcp', transport: 'streamable-http',
    enabled: true, command: '', args: [], cwd: '', envRefs: {}, url: 'https://example.test/mcp',
    headerRefs: {}, toolCallTimeoutMs: 300_000, failOnStartupError: false,
    reconnect: { enabled: true, initialDelayMs: 5_000, maxDelayMs: 60_000, maxAttempts: 2 },
    runtimeState: 'idle', runtimeError: '', missingEnvironmentVariables: [], tools: [], createdAt: '', updatedAt: '',
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
  fireEvent.click(await screen.findByRole('button', { name: /rmcp/ }))
  const save = await screen.findByRole('button', { name: 'common.save' }) as HTMLButtonElement
  for (const timeout of ['301000', '300000']) {
    fireEvent.change(screen.getByLabelText('mcp.toolTimeout'), { target: { value: timeout } })
    fireEvent.click(save)
    await waitFor(() => expect(save.disabled).toBe(false))
    expect(record.toolCallTimeoutMs).toBe(Number(timeout))
    expect(record.runtimeState).toBe('idle')
  }
  expect(update).toHaveBeenCalledTimes(2)
  const repair = screen.getByRole('button', { name: 'mcp.reload' }) as HTMLButtonElement
  fireEvent.click(repair)
  await waitFor(() => expect(repair.disabled).toBe(false))
  expect(reload).toHaveBeenCalledOnce()
})
