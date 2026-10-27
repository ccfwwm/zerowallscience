// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { PythonEnvironmentPanel } from '../src/client/PythonEnvironmentPanel.js'

const inventory = {
  ready: true, inventoryComplete: true, runtimeRoot: 'C:/ZeroWall/Python', packageCount: 1,
  officialPackageCount: 0, packages: [{ name: 'pandas', version: '2.0.0', source: 'custom', health: 'healthy' }],
}

afterEach(() => { cleanup(); delete (window as Window & { zerowallDesktop?: unknown }).zerowallDesktop; vi.restoreAllMocks() })

it('shows a completed empty install at 100 percent and exposes package version actions', async () => {
  const task = { taskId: 'task-1', requestId: 'request-1', action: 'sync', layer: 'science', state: 'succeeded', stage: 'complete', completedPackages: 0, totalPackages: 0, logLines: [], createdAt: '', updatedAt: '' }
  const call = vi.fn(async (input: { action: string; packageName?: string; packageSpec?: string }) => {
    if (input.action === 'status') return { status: { phase: 'ready' }, inventory, task, runtimeRoot: inventory.runtimeRoot }
    if (input.action === 'scan_local') return { scan: { scanId: 'scan-1', state: 'complete', inventory } }
    if (input.action === 'configure') return { mirrorUrl: 'https://mirrors.ustc.edu.cn/pypi/simple', revision: 1, mirrorPresets: [] }
    if (input.action === 'search_package') return { packageCatalog: { name: 'pandas', summary: 'Data analysis', latestVersion: '2.2.0', versions: ['2.2.0', '2.1.0'] } }
    if (input.action === 'check_package_updates') return { inventory: { ...inventory, packages: [{ ...inventory.packages[0], latestVersion: '2.2.0', updateAvailable: true }] }, packageCatalog: { name: 'pandas', summary: 'Data analysis', latestVersion: '2.2.0', versions: ['2.2.0', '2.1.0', '2.0.0'] } }
    return { task: { ...task, taskId: 'task-2', state: 'queued' } }
  })
  const desktop = { pythonEnvironment: call, onMcpEnvironmentStatus: () => () => undefined }
  Object.defineProperty(window, 'zerowallDesktop', { configurable: true, writable: true, value: desktop })
  render(<PythonEnvironmentPanel {...({ t: (key: string) => key === 'python.shared.advanced' ? 'Advanced settings' : key } as never)} />)

  expect(await screen.findByText('100%')).toBeTruthy()
  expect(screen.getByText('All dependencies are already satisfied')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Package name'), { target: { value: 'pandas' } })
  fireEvent.click(screen.getByRole('button', { name: 'Search versions' }))
  expect(await screen.findByRole('combobox', { name: 'Select version' })).toBeTruthy()
  fireEvent.change(screen.getByRole('combobox', { name: 'Select version' }), { target: { value: '2.1.0' } })
  fireEvent.click(screen.getByRole('button', { name: 'Install selected version' }))
  await waitFor(() => expect(call).toHaveBeenCalledWith(expect.objectContaining({ action: 'install_package', packageSpec: 'pandas==2.1.0' })))

  fireEvent.click(screen.getByText(/View installed packages/u))
  fireEvent.click(screen.getByRole('button', { name: 'Check updates' }))
  await waitFor(() => expect(call).toHaveBeenCalledWith(expect.objectContaining({ action: 'check_package_updates', packageNames: ['pandas'] })))
  const packageVersion = await screen.findByRole('combobox', { name: 'Version for pandas' })
  fireEvent.change(packageVersion, { target: { value: '2.0.0' } })
  fireEvent.click(screen.getByRole('button', { name: 'Install selected version' }))
  await waitFor(() => expect(call).toHaveBeenCalledWith(expect.objectContaining({ action: 'install_package', packageSpec: 'pandas==2.0.0' })))
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
  await waitFor(() => expect(call).toHaveBeenCalledWith(expect.objectContaining({ action: 'uninstall_package', packageName: 'pandas', confirm: true })))
})

it('refreshes the installed package inventory after an uninstall completes', async () => {
  let scanCount = 0
  const oldInventory = { ...inventory, scannedAt: '2026-10-01T00:00:00.000Z' }
  const removedInventory = { ...inventory, scannedAt: '2026-10-02T00:00:00.000Z', packageCount: 0, packages: [] }
  const call = vi.fn(async (input: { action: string; packageName?: string }) => {
    if (input.action === 'status') return { status: { phase: 'ready' }, inventory: oldInventory, runtimeRoot: inventory.runtimeRoot }
    if (input.action === 'scan_local') {
      scanCount++
      return { scan: { scanId: `scan-${scanCount}`, state: 'complete', inventory: scanCount === 1 ? oldInventory : removedInventory } }
    }
    if (input.action === 'configure') return { mirrorUrl: 'https://mirrors.ustc.edu.cn/pypi/simple', revision: 1, mirrorPresets: [] }
    if (input.action === 'uninstall_package') return { task: { taskId: 'remove-task', action: 'uninstall_package', state: 'succeeded', logLines: [], createdAt: '', updatedAt: '' } }
    return {}
  })
  const desktop = { pythonEnvironment: call, onMcpEnvironmentStatus: () => () => undefined }
  Object.defineProperty(window, 'zerowallDesktop', { configurable: true, writable: true, value: desktop })
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  render(<PythonEnvironmentPanel {...({ t: (key: string) => key === 'python.shared.advanced' ? 'Advanced settings' : key } as never)} />)

  await waitFor(() => expect(scanCount).toBe(1))
  fireEvent.click(screen.getByText(/View installed packages/u))
  fireEvent.click(screen.getByRole('button', { name: 'Remove' }))

  await waitFor(() => expect(scanCount).toBeGreaterThan(1))
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull())
})
