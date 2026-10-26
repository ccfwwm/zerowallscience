// @vitest-environment jsdom
import { createElement, useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { McpConnectionsButton, McpSettingsTab, type McpServerView } from '../src/client/McpConnectionsButton.js'
import { observeEmbeddedPanelSize } from '../src/client/embedded-panel.js'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function connection(serverName: string): McpServerView {
  return {
    id: serverName, name: serverName, serverName, transport: 'streamable-http', enabled: true,
    command: '', args: [], cwd: '', envRefs: {}, url: 'https://example.test/mcp', headerRefs: {},
    toolCallTimeoutMs: 30_000, failOnStartupError: false,
    reconnect: { enabled: true, initialDelayMs: 500, maxDelayMs: 30_000, maxAttempts: 5 },
    runtimeState: 'idle', runtimeError: '', missingEnvironmentVariables: [], tools: [],
    toolDiscoveryState: 'unknown', createdAt: '', updatedAt: '',
  }
}

function actions(initial = connection('custom')) {
  let record = initial
  return {
    t: (key: string) => key,
    listMcpServers: vi.fn(async () => [record]),
    createMcpServer: vi.fn(), removeMcpServer: vi.fn(async () => {}), reloadMcpServer: vi.fn(),
    updateMcpServer: vi.fn(async (_id: string, changes: Partial<McpServerView>) => (record = { ...record, ...changes, runtimeState: changes.enabled === false ? 'disabled' : 'idle' })),
    getSciMasterCredentialStatus: vi.fn(async () => ({ configured: false })), setSciMasterApiKey: vi.fn(), clearSciMasterApiKey: vi.fn(),
    getRdatalinuxCredentialStatus: vi.fn(async () => ({ configured: false, endpoint: record.url })), setRdatalinuxAuthorization: vi.fn(), clearRdatalinuxAuthorization: vi.fn(),
  }
}

it.each(['gpsadb', 'rmcp', 'huagongshe', 'zerowall_managed_scimaster', 'zerowall_managed_bio_tools', 'zerowall_managed_ketcher'])(
  'protects built-in %s from deletion and keeps its page usable after disabling and re-enabling', async name => {
    const props = actions(connection(name))
    render(createElement(McpSettingsTab, props))
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(name) }))
    expect(screen.queryByRole('button', { name: 'mcp.deleteConnection' })).toBeNull()
    for (const enabled of [false, true]) {
      fireEvent.click(screen.getByRole('checkbox', { name: 'mcp.enabled' }))
      fireEvent.click(screen.getByRole('button', { name: 'common.save' }))
      await waitFor(() => expect(props.updateMcpServer).toHaveBeenLastCalledWith(name, expect.objectContaining({ enabled })))
      await waitFor(() => expect((screen.getByRole('button', { name: 'common.save' }) as HTMLButtonElement).disabled).toBe(false))
      expect((screen.getByRole('checkbox', { name: 'mcp.enabled' }) as HTMLInputElement).checked).toBe(enabled)
      expect(screen.getByRole('heading', { name: 'mcp.title' })).toBeTruthy()
    }
    expect(props.removeMcpServer).not.toHaveBeenCalled()
  },
)

it('leaves Settings closing to its owner, remounts on reopen, and only consumes Escape for a delete confirmation', async () => {
  const props = actions()
  function Settings() {
    const [open, setOpen] = useState(true)
    return <>
      <button onClick={() => setOpen(!open)}>{open ? 'Close Settings' : 'Open Settings'}</button>
      {open && <McpSettingsTab {...props} />}
    </>
  }
  render(createElement(Settings))
  fireEvent.click(await screen.findByRole('button', { name: /custom/ }))
  expect(screen.queryByRole('button', { name: 'common.close' })).toBeNull()
  const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
  document.dispatchEvent(escape)
  expect(escape.defaultPrevented).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'mcp.deleteConnection' }))
  expect(screen.getByRole('alertdialog')).toBeTruthy()
  const cancel = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
  document.dispatchEvent(cancel)
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  expect(cancel.defaultPrevented).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Close Settings' }))
  expect(screen.queryByRole('heading', { name: 'mcp.title' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Open Settings' }))
  fireEvent.click(await screen.findByRole('button', { name: /custom/ }))
  fireEvent.click(screen.getByRole('button', { name: 'mcp.deleteConnection' }))
  fireEvent.click(screen.getByRole('button', { name: 'common.delete' }))
  await waitFor(() => expect(props.removeMcpServer).toHaveBeenCalledWith('custom'))
  expect(screen.getByRole('heading', { name: 'mcp.title' })).toBeTruthy()
})

it('keeps standalone close and reopen working', async () => {
  render(createElement(McpConnectionsButton, actions()))
  fireEvent.click(screen.getByRole('button', { name: 'mcp.trigger' }))
  expect(screen.getByRole('dialog')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'common.close' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'mcp.trigger' }))
  expect(screen.getByRole('dialog')).toBeTruthy()
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('fits the real scrollport, resizes, survives hidden tabs, and cleans up its observer', () => {
  const viewport = document.createElement('div')
  const panel = document.createElement('section')
  viewport.style.overflowY = 'auto'
  viewport.style.paddingBottom = '24px'
  viewport.append(panel)
  document.body.append(viewport)
  let height = 500
  let top = 180
  let visible = true
  viewport.getBoundingClientRect = () => ({ top: 100 }) as DOMRect
  panel.getBoundingClientRect = () => ({ top }) as DOMRect
  panel.getClientRects = () => ({ length: visible ? 1 : 0 }) as DOMRectList
  Object.defineProperty(viewport, 'clientHeight', { get: () => height })
  let resize!: () => void
  const disconnect = vi.fn()
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resize = callback }
    observe() {}
    disconnect = disconnect
  })
  const stop = observeEmbeddedPanelSize(panel)
  expect(panel.style.getPropertyValue('--mcp-panel-height')).toBe('396px')
  height = 320
  resize()
  expect(panel.style.getPropertyValue('--mcp-panel-height')).toBe('216px')
  visible = false
  top = 0
  resize()
  expect(panel.style.getPropertyValue('--mcp-panel-height')).toBe('216px')
  visible = true
  top = 220
  resize()
  expect(panel.style.getPropertyValue('--mcp-panel-height')).toBe('176px')
  stop()
  expect(disconnect).toHaveBeenCalledOnce()
  expect(panel.style.getPropertyValue('--mcp-panel-height')).toBe('')
  viewport.remove()
})
