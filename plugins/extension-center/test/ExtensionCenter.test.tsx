// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ExtensionCenter } from '../src/client/ExtensionCenter.js'
import { zh } from '../src/client/locales.js'

afterEach(() => { cleanup(); vi.useRealTimers(); delete window.zerowallDesktop })
const t = (key: keyof typeof zh) => zh[key]
function bridge() {
  const resources = {
    list: vi.fn(async (kind: string) => ({ kind, catalogStatus: 'local', checkedAt: '', resources: [{ id: kind + '-local', version: '1.0.0', installedVersion: '1.0.0', source: 'profile', enabled: true }] })),
    check: vi.fn(async (kind: string) => ({ kind, catalogStatus: 'checked', checkedAt: '', resources: [{ id: kind + '-local', version: '1.1.0', installedVersion: '1.0.0', updateAvailable: true, source: 'profile', enabled: true }] })),
    listJobs: vi.fn(async () => []),
  }
  const status = { revision: 'r1', packageCount: 1, installedPackageCount: 0, pendingPackageCount: 1, changes: [], needsRuntime: true, source: 'bundled', checkedAt: '', layer: 'core' }
  const pythonLayers = { listLocal: vi.fn(async () => status), check: vi.fn(async () => status) }
  window.zerowallDesktop = { resources, pythonLayers } as any
  return { resources, pythonLayers }
}
describe('local Extension Center', () => {
  it('a failed Python layer does not hide other Python layers', async () => {
    const api = bridge()
    const original = api.pythonLayers.listLocal
    api.pythonLayers.listLocal = vi.fn((layer: any) => layer === 'science' ? Promise.reject(new Error('science unavailable')) : original()) as any
    window.zerowallDesktop!.pythonLayers!.listLocal = api.pythonLayers.listLocal as any
    render(<ExtensionCenter {...{ t } as any} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Python' }))
    await waitFor(() => expect(screen.getByText('Python Core', { selector: 'strong' })).toBeTruthy())
    expect(screen.queryByText('Python Science', { selector: 'strong' })).toBeNull()
    expect(api.pythonLayers.check).not.toHaveBeenCalled()
  })
  it('an unavailable catalog preserves previously verified update rows', async () => {
    const api = bridge()
    render(<ExtensionCenter {...{ t } as any} />)
    await waitFor(() => expect(screen.getByText('plugin-local', { selector: 'strong' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: zh.refresh }))
    await waitFor(() => expect(screen.getByText('1.0.0 → 1.1.0')).toBeTruthy())
    api.resources.check.mockImplementation(async kind => ({ kind, resources: [], checkedAt: '', catalogStatus: 'unavailable', error: 'invalid signature' } as any))
    fireEvent.click(screen.getByRole('button', { name: zh.refresh }))
    await waitFor(() => expect(screen.getByText('invalid signature')).toBeTruthy())
    expect(screen.getByText('1.0.0 → 1.1.0')).toBeTruthy()
  })
  it('open, tab changes, language changes and reopening never perform remote checks', async () => {
    const api = bridge()
    const view = render(<ExtensionCenter {...{ t } as any} />)
    await waitFor(() => expect(screen.getByText('plugin-local', { selector: 'strong' })).toBeTruthy())
    fireEvent.click(screen.getByRole('tab', { name: 'Skills' }))
    view.rerender(<ExtensionCenter {...{ t: (key: keyof typeof zh) => String(zh[key]) } as any} />)
    fireEvent.click(screen.getByRole('button', { name: zh.localRefresh }))
    expect(api.resources.check).not.toHaveBeenCalled()
    expect(api.pythonLayers.check).not.toHaveBeenCalled()
    view.unmount()
    render(<ExtensionCenter {...{ t } as any} />)
    await waitFor(() => expect(screen.getByText('plugin-local', { selector: 'strong' })).toBeTruthy())
    expect(api.resources.check).not.toHaveBeenCalled()
    expect(api.pythonLayers.check).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: zh.refresh }))
    await waitFor(() => expect(api.resources.check).toHaveBeenCalledTimes(3))
    expect(api.pythonLayers.check).toHaveBeenCalledTimes(3)
  })
  it('a hung Skills group does not delay the plugin list and failed remote checks keep rows', async () => {
    const api = bridge(), original = api.resources.list
    api.resources.list = vi.fn((kind: string) => kind === 'skill' ? new Promise<any>(() => {}) : original(kind))
    window.zerowallDesktop!.resources!.list = api.resources.list as any
    api.resources.check.mockRejectedValue(new Error('network unavailable'))
    const view = render(<ExtensionCenter {...{ t } as any} />)
    await waitFor(() => expect(screen.getByText('plugin-local', { selector: 'strong' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: zh.refresh }))
    await waitFor(() => expect(api.resources.check).toHaveBeenCalledTimes(3))
    expect(screen.getByText('plugin-local', { selector: 'strong' })).toBeTruthy()
    view.unmount()
  })
  it('late results after a newer local refresh cannot replace displayed rows', async () => {
    const api = bridge()
    const completions = new Map<string, (value: any) => void>()
    api.resources.check = vi.fn((kind: string) => new Promise<any>(resolve => { completions.set(kind, resolve) }))
    window.zerowallDesktop!.resources!.check = api.resources.check as any
    const view = render(<ExtensionCenter {...{ t } as any} />)
    await waitFor(() => expect(screen.getByText('plugin-local', { selector: 'strong' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: zh.refresh }))
    fireEvent.click(screen.getByRole('button', { name: zh.localRefresh }))
    await act(async () => { for (const [kind, complete] of completions) complete({ kind, resources: [{ id: 'stale', version: '9.0.0' }] }) })
    fireEvent.click(screen.getByRole('tab', { name: 'MCP' }))
    expect(screen.getByText('mcp-local', { selector: 'strong' })).toBeTruthy()
    expect(screen.queryByText('stale')).toBeNull()
    view.unmount()
  })
})
