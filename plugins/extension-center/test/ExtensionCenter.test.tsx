// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ExtensionCenter } from '../src/client/ExtensionCenter.js'
import { zh } from '../src/client/locales.js'

afterEach(() => { cleanup(); vi.useRealTimers(); sessionStorage.clear(); delete window.zerowallDesktop })
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
  it.each(['profile', 'disabled', 'catalog'] as const)('hides composition packages from %s rows, counts, search and batch candidates', async source => {
    const api = bridge()
    const read = async (kind: string) => ({ kind, catalogStatus: 'checked', checkedAt: '', resources: kind === 'plugin' ? [
      ...['core', 'science'].map(name => ({ id: `@zerowallscience/dsh-bundle-${name}`, name: `Hidden ${name}`, version: '2', installedVersion: source === 'catalog' ? undefined : '1', source, enabled: source !== 'disabled', updateAvailable: true })),
      { id: 'normal-disabled', name: 'Normal disabled', version: '1', installedVersion: '1', source: 'disabled', enabled: false },
      { id: 'normal-update', name: 'Normal update', version: '2', installedVersion: '1', source: 'profile', enabled: true, updateAvailable: true },
    ] : [] })
    api.resources.list.mockImplementation(read as any)
    api.resources.check.mockImplementation(read as any)
    const updatePlugins = vi.fn(async () => ({ taskId: 'batch' }))
    const startJob = vi.fn(async () => ({ taskId: 'enable' }))
    Object.assign(api.resources, { updatePlugins, startJob, getJob: vi.fn(async () => ({ taskId: 'done', status: 'succeeded' })) })
    render(<ExtensionCenter {...{ t } as any} />)
    await screen.findByText('Normal update', { selector: 'strong' })
    await waitFor(() => expect(api.resources.check).toHaveBeenCalledTimes(3))
    expect(screen.queryByText(/Hidden/)).toBeNull()
    expect(screen.getByRole('button', { name: zh.filter_all }).textContent).toContain('2')
    expect(screen.getByRole('button', { name: zh.filter_updates }).textContent).toContain('1')
    fireEvent.change(screen.getByRole('textbox', { name: zh.search }), { target: { value: 'dsh-bundle' } })
    expect(screen.queryByText(/Hidden/)).toBeNull()
    expect(screen.getByText(zh.noMatches)).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: zh.search }), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: zh.filter_disabled }))
    expect(screen.getByText('Normal disabled', { selector: 'strong' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh.enable }))
    await waitFor(() => expect(startJob).toHaveBeenCalledWith('plugin', 'enable', 'normal-disabled', undefined))
    await waitFor(() => expect(screen.getByRole('button', { name: zh.updateAll }).hasAttribute('disabled')).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: zh.updateAll }))
    await waitFor(() => expect(updatePlugins).toHaveBeenCalledWith(['normal-update']))
  })
  it('distinguishes a historical rollback conflict from a successful update and prevents ineffective retries', async () => {
    const api = bridge(), retryJob = vi.fn()
    Object.assign(api.resources, { retryJob, listJobs: vi.fn(async () => [
      { taskId: 'upgrade', kind: 'plugin', id: '@zerowallscience/plugin-extension-center', action: 'update', status: 'succeeded', oldVersion: '0.1.10', newVersion: '0.1.11', updatedAt: '2026-10-13T00:00:00Z', progress: 100 },
      { taskId: 'old-rollback', kind: 'plugin', id: '@zerowallscience/plugin-extension-center', action: 'rollback', status: 'failed', oldVersion: '0.1.10', updatedAt: '2026-10-12T17:45:53Z', progress: 100, error: 'PLUGIN_ROLLBACK_CONFLICT: environment requires base@0.1.11' },
    ]) })
    render(<ExtensionCenter {...{ t } as any} />)
    const tasks = await screen.findByRole('region', { name: zh.tasks })
    await within(tasks).findByText('更新 · 扩展中心')
    expect(within(tasks).getByText('回滚 · 扩展中心')).toBeTruthy()
    expect(within(tasks).getByText('回滚 · 失败')).toBeTruthy()
    expect(within(tasks).getByText('0.1.10 → 0.1.11')).toBeTruthy()
    expect(tasks.querySelectorAll('time')).toHaveLength(2)
    expect(within(tasks).getByText(zh.rollbackConflict)).toBeTruthy()
    const retry = within(tasks).getByRole('button', { name: '重试 · 回滚 · 扩展中心' })
    expect(retry.hasAttribute('disabled')).toBe(true)
    fireEvent.click(retry)
    expect(retryJob).not.toHaveBeenCalled()
    expect(tasks.textContent).not.toContain('100%')
  })
  it('labels retry by the failed action and preserves its error details', async () => {
    const api = bridge(), retryJob = vi.fn(async () => ({ taskId: 'retry' }))
    Object.assign(api.resources, { retryJob, listJobs: vi.fn(async () => [
      { taskId: 'update-failed', kind: 'plugin', id: 'a', action: 'update', status: 'failed', error: 'Download hash mismatch' },
    ]) })
    render(<ExtensionCenter {...{ t } as any} />)
    const retry = await screen.findByRole('button', { name: '重试 · 更新 · a' })
    expect(screen.getByText('更新 · 失败')).toBeTruthy()
    expect(screen.getByText('Download hash mismatch')).toBeTruthy()
    fireEvent.click(retry)
    await waitFor(() => expect(retryJob).toHaveBeenCalledExactlyOnceWith('update-failed'))
    expect(sessionStorage.getItem('zerowall.extension-center.operation')).toBeTruthy()
  })
  it('uninstalled Python resources require an explicit install and are excluded from update all', async () => {
    const api = bridge()
    const startJob = vi.fn(async () => ({ taskId: 'done' }))
    const updatePlugins = vi.fn(async () => ({ taskId: 'done' }))
    const getJob = vi.fn(async () => ({ taskId: 'done', status: 'succeeded' }))
    const update = vi.fn(async () => ({ upToDate: true }))
    Object.assign(api.resources, { startJob, getJob, updatePlugins })
    Object.assign(api.pythonLayers, { update })
    render(<ExtensionCenter {...{ t } as any} />)
    await waitFor(() => expect(screen.getByRole('button', { name: zh.updateAll })).toBeTruthy())
    fireEvent.click(screen.getByRole('tab', { name: 'Python' }))
    await waitFor(() => expect(screen.getAllByRole('button', { name: zh.install })).toHaveLength(2))
    expect(screen.queryByRole('button', { name: zh.update })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: zh.updateAll }))
    await waitFor(() => expect(updatePlugins).toHaveBeenCalledOnce())
    expect(updatePlugins).toHaveBeenCalledWith(['plugin-local'])
    await waitFor(() => expect(startJob).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getByRole('button', { name: zh.refresh }).hasAttribute('disabled')).toBe(false))
    expect(update).not.toHaveBeenCalled()
    fireEvent.click(screen.getAllByRole('button', { name: zh.install })[0]!)
    await waitFor(() => expect(update).toHaveBeenCalledWith('core', undefined))
  })
  it('an installed Python package with an old version remains an update', async () => {
    const api = bridge()
    const status = { revision: 'r2', packageCount: 1, installedPackageCount: 0, pendingPackageCount: 1, changes: [{ name: 'numpy', from: '1.0', to: '2.0' }], needsRuntime: false, source: 'cache', checkedAt: '' }
    api.pythonLayers.listLocal.mockResolvedValue(status as any)
    api.pythonLayers.check.mockResolvedValue(status as any)
    render(<ExtensionCenter {...{ t } as any} />)
    fireEvent.click(screen.getByRole('tab', { name: /Python/ }))
    await waitFor(() => expect(screen.getByText('Python Core', { selector: 'strong' })).toBeTruthy())
    const row = screen.getByText('Python Core', { selector: 'strong' }).closest('article')!
    expect(within(row).getByRole('button', { name: zh.update })).toBeTruthy()
    expect(within(row).queryByRole('button', { name: zh.install })).toBeNull()
    expect(within(row).queryByRole('button', { name: zh.remove })).toBeNull()
  })
  it('a failed Python layer does not hide other Python layers', async () => {
    const api = bridge()
    const original = api.pythonLayers.listLocal
    api.pythonLayers.listLocal = vi.fn((layer: any) => layer === 'science' ? Promise.reject(new Error('science unavailable')) : original()) as any
    window.zerowallDesktop!.pythonLayers!.listLocal = api.pythonLayers.listLocal as any
    render(<ExtensionCenter {...{ t } as any} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Python' }))
    await waitFor(() => expect(screen.getByText('Python Core', { selector: 'strong' })).toBeTruthy())
    expect(screen.getByText('Python Science', { selector: 'strong' })).toBeTruthy()
    await waitFor(() => expect(api.pythonLayers.check).toHaveBeenCalled())
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
  it('checks all remote catalogs on open and repeats checks only on explicit refresh or reopen', async () => {
    const api = bridge()
    const view = render(<ExtensionCenter {...{ t } as any} />)
    await waitFor(() => expect(screen.getByText('plugin-local', { selector: 'strong' })).toBeTruthy())
    await waitFor(() => expect(api.resources.check).toHaveBeenCalledTimes(3))
    await waitFor(() => expect(api.pythonLayers.check).toHaveBeenCalledTimes(3))
    fireEvent.click(screen.getByRole('tab', { name: /Skills/ }))
    view.rerender(<ExtensionCenter {...{ t: (key: keyof typeof zh) => String(zh[key]) } as any} />)
    fireEvent.click(screen.getByRole('button', { name: zh.localRefresh }))
    expect(api.resources.check).toHaveBeenCalledTimes(3)
    expect(api.pythonLayers.check).toHaveBeenCalledTimes(3)
    view.unmount()
    render(<ExtensionCenter {...{ t } as any} />)
    await waitFor(() => expect(screen.getByText('plugin-local', { selector: 'strong' })).toBeTruthy())
    await waitFor(() => expect(api.resources.check).toHaveBeenCalledTimes(6))
    await waitFor(() => expect(api.pythonLayers.check).toHaveBeenCalledTimes(6))
    fireEvent.click(screen.getByRole('button', { name: zh.refresh }))
    await waitFor(() => expect(api.resources.check).toHaveBeenCalledTimes(9))
    await waitFor(() => expect(api.pythonLayers.check).toHaveBeenCalledTimes(9))
  })
  it('a hung Skills group does not delay the plugin list and failed remote checks keep rows', async () => {
    const api = bridge(), original = api.resources.list
    api.resources.list = vi.fn((kind: string) => kind === 'skill' ? new Promise<any>(() => {}) : original(kind))
    window.zerowallDesktop!.resources!.list = api.resources.list as any
    api.resources.check.mockRejectedValue(new Error('network unavailable'))
    const view = render(<ExtensionCenter {...{ t } as any} />)
    await waitFor(() => expect(screen.getByText('plugin-local', { selector: 'strong' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: zh.refresh }))
    await waitFor(() => expect(api.resources.check).toHaveBeenCalledTimes(6))
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
    fireEvent.click(screen.getByRole('button', { name: zh.localRefresh }))
    await act(async () => { for (const [kind, complete] of completions) complete({ kind, resources: [{ id: 'stale', version: '9.0.0' }] }) })
    fireEvent.click(screen.getByRole('tab', { name: /MCP/ }))
    expect(screen.getByText('mcp-local', { selector: 'strong' })).toBeTruthy()
    expect(screen.queryByText('stale')).toBeNull()
    view.unmount()
  })
  it('a slow initial local read cannot overwrite a completed remote check', async () => {
    const api = bridge()
    const completions = new Map<string, (value: any) => void>()
    api.resources.list.mockImplementation(kind => new Promise<any>(resolve => { completions.set(kind, resolve) }))
    render(<ExtensionCenter {...{ t } as any} />)
    await waitFor(() => expect(screen.getByText('1.0.0 → 1.1.0')).toBeTruthy())
    await act(async () => { for (const [kind, complete] of completions) complete({ kind, catalogStatus: 'local', resources: [{ id: kind + '-local', installedVersion: '1.0.0', version: '1.0.0' }] }) })
    expect(screen.getByText('1.0.0 → 1.1.0')).toBeTruthy()
  })
  it('filters updates and treats DSH core resources as read-only', async () => {
    const api = bridge()
    api.resources.list.mockImplementation(async kind => ({ kind, catalogStatus: 'local', checkedAt: '', resources: kind === 'plugin' ? [
      { id: '@deepseek-ai/dsh-base', name: 'DSH Base', version: 'core', source: 'runtime', managed: false, installedVersion: 'core', updateAvailable: true, enabled: true },
      { id: 'plugin-local', version: '1.0.0', installedVersion: '1.0.0', source: 'profile', enabled: true },
    ] : [{ id: kind + '-local', version: '1.0.0', installedVersion: '1.0.0', source: 'profile', enabled: true }] } as any))
    api.resources.check.mockImplementation(async kind => ({ kind, catalogStatus: 'checked', checkedAt: '', resources: kind === 'plugin' ? [
      { id: '@deepseek-ai/dsh-base', name: 'DSH Base', version: 'core', source: 'runtime', managed: false, installedVersion: 'core', updateAvailable: true, enabled: true },
      { id: 'plugin-local', version: '1.1.0', installedVersion: '1.0.0', source: 'profile', enabled: true, updateAvailable: true },
    ] : [{ id: kind + '-local', version: '1.0.0', installedVersion: '1.0.0', source: 'profile', enabled: true }] } as any))
    Object.assign(api.resources, { startJob: vi.fn(async () => ({ taskId: 'done' })), getJob: vi.fn(async () => ({ taskId: 'done', status: 'succeeded' })) })
    render(<ExtensionCenter {...{ t } as any} />)
    await waitFor(() => expect(screen.getByText('DSH Base', { selector: 'strong' })).toBeTruthy())
    const core = screen.getByText('DSH Base', { selector: 'strong' }).closest('article')!
    expect(within(core).getByText(zh.coreDescription)).toBeTruthy()
    expect(within(core).queryByRole('button')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: zh.filter_updates }))
    expect(screen.getByText('plugin-local', { selector: 'strong' })).toBeTruthy()
    expect(screen.queryByText('DSH Base', { selector: 'strong' })).toBeNull()
  })
  it('keeps pinned updates visible and combines status filtering with search', async () => {
    const api = bridge()
    const resources = [
      { id: 'available', version: '2', installedVersion: '1', source: 'profile', enabled: true, updateAvailable: true },
      { id: 'pinned', version: '2', installedVersion: '1', source: 'profile', pinnedVersion: '1', updateAvailable: true },
      { id: 'disabled', version: '1', installedVersion: '1', source: 'disabled', enabled: false },
      { id: 'missing', version: '1', source: 'profile', installState: 'missing' },
      { id: 'catalog', version: '1', source: 'catalog' },
    ]
    api.resources.check.mockImplementation(async kind => ({ kind, catalogStatus: 'checked', resources: kind === 'plugin' ? resources : [] } as any))
    render(<ExtensionCenter {...{ t } as any} />)
    await waitFor(() => expect(screen.getByText('pinned', { selector: 'strong' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: zh.filter_updates }))
    expect(screen.getAllByRole('article')).toHaveLength(2)
    const pinned = screen.getByText('pinned', { selector: 'strong' }).closest('article')!
    expect(within(pinned).queryByRole('checkbox')).toBeNull()
    expect(within(pinned).queryByRole('button', { name: zh.update })).toBeNull()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'available' } })
    expect(screen.getAllByRole('article')).toHaveLength(1)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: zh.filter_disabled }))
    expect(screen.getAllByRole('article')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: zh.filter_missing }))
    expect(screen.getAllByRole('article')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: zh.filter_installed }))
    expect(screen.getAllByRole('article')).toHaveLength(3)
  })
  it('does not label a read-only bundled Skill as system core', async () => {
    const api = bridge()
    api.resources.check.mockImplementation(async kind => ({ kind, resources: [{ id: 'built-in', source: 'bundled', managed: false, version: '1', installedVersion: '1' }] } as any))
    render(<ExtensionCenter {...{ t } as any} />)
    await waitFor(() => expect(api.resources.check).toHaveBeenCalledTimes(3))
    fireEvent.click(screen.getByRole('tab', { name: /Skills/ }))
    await waitFor(() => expect(screen.getByText('built-in', { selector: 'strong' })).toBeTruthy())
    expect(screen.queryByText(zh.coreDescription)).toBeNull()
    expect(within(screen.getByRole('article')).getByText(zh.installed)).toBeTruthy()
  })
  it('keeps required ZeroWall plugins independently updatable without disable or remove actions', async () => {
    const api = bridge()
    api.resources.check.mockImplementation(async kind => ({ kind, resources: kind === 'plugin' ? [{ id: '@zerowallscience/plugin-extension-center', source: 'profile', managed: false, version: '0.1.10', installedVersion: '0.1.9', installState: 'installed', activationState: 'active', enabled: true, updateAvailable: true }] : [] } as any))
    render(<ExtensionCenter {...{ t } as any} />)
    await waitFor(() => expect(screen.getByRole('button', { name: zh.update })).toBeTruthy())
    expect(screen.queryByText(zh.coreDescription)).toBeNull()
    expect(screen.queryByRole('button', { name: zh.disable })).toBeNull()
    expect(screen.queryByRole('button', { name: zh.remove })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: zh.filter_updates }))
    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(screen.getByRole('checkbox')).toBeTruthy()
  })
  it('updates hot resources first, submits all plugins once, and suppresses checks after reload', async () => {
    const api = bridge(), calls: string[] = []
    api.resources.check.mockImplementation(async kind => ({ kind, catalogStatus: 'checked', resources: kind === 'plugin' ? ['first', 'second', 'pinned', 'blocked'].map(id => ({ id, source: 'profile', version: '2', installedVersion: '1', updateAvailable: true, ...(id === 'pinned' ? { pinnedVersion: '1' } : {}), ...(id === 'blocked' ? { updateBlocked: 'Dependency version is pinned' } : {}) })) : [{ id: kind, source: 'profile', version: '2', installedVersion: '1', updateAvailable: true }] } as any))
    const startJob = vi.fn(async (kind: string) => { calls.push(kind); return { taskId: kind } })
    const updatePlugins = vi.fn(async () => { calls.push('plugin-batch'); return { taskId: 'batch' } })
    Object.assign(api.resources, { startJob, updatePlugins, getJob: vi.fn(async () => ({ taskId: 'done', status: 'succeeded' })) })
    const view = render(<ExtensionCenter {...{ t } as any} />)
    await waitFor(() => expect(screen.getByRole('button', { name: zh.refresh }).hasAttribute('disabled')).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: zh.updateAll }))
    await waitFor(() => expect(screen.getByText(zh.operationComplete)).toBeTruthy())
    expect(updatePlugins).toHaveBeenCalledExactlyOnceWith(['first', 'second'])
    expect(calls).toEqual(['skill', 'mcp', 'plugin-batch'])
    expect(api.resources.check).toHaveBeenCalledTimes(3)
    expect(api.pythonLayers.check).toHaveBeenCalledTimes(3)
    view.unmount()
    render(<ExtensionCenter {...{ t } as any} />)
    await waitFor(() => expect(screen.getByText('plugin-local', { selector: 'strong' })).toBeTruthy())
    expect(api.resources.check).toHaveBeenCalledTimes(3)
    fireEvent.click(screen.getByRole('button', { name: zh.refresh }))
    await waitFor(() => expect(api.resources.check).toHaveBeenCalledTimes(6))
  })
  it('updates selected plugins only and surfaces a failed batch without retrying', async () => {
    const api = bridge()
    api.resources.check.mockImplementation(async kind => ({ kind, resources: ['a', 'b'].map(id => ({ id: kind + id, source: 'profile', version: '2', installedVersion: '1', updateAvailable: true })) } as any))
    const updatePlugins = vi.fn(async () => ({ taskId: 'batch' }))
    const startJob = vi.fn()
    Object.assign(api.resources, { startJob, updatePlugins, getJob: vi.fn(async () => ({ taskId: 'batch', status: 'failed', error: 'Health check failed' })) })
    render(<ExtensionCenter {...{ t } as any} />)
    await waitFor(() => expect(screen.getByRole('button', { name: zh.refresh }).hasAttribute('disabled')).toBe(false))
    fireEvent.click(screen.getByRole('checkbox', { name: zh.selectUpdate + ' plugina' }))
    fireEvent.click(screen.getByRole('button', { name: /更新选中项/ }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Health check failed'))
    expect(updatePlugins).toHaveBeenCalledExactlyOnceWith(['plugina'])
    expect(startJob).not.toHaveBeenCalled()
  })
})
