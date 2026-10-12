// @vitest-environment jsdom
import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { render, screen, act, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { zh, en } from '../../base/src/client/locales.js'
import { PythonEnvironmentPanel } from '../src/client/PythonEnvironmentPanel.js'

afterEach(cleanup)
const translator = (dictionary: Record<string, string>) => ((key: string) => dictionary[key] ?? key) as any
const ready = { ready: true, coreReady: true, inventoryComplete: true, runtimeRoot: 'C:/installation/Python', version: '3.12.10', packageCount: 171, officialPackageCount: 43, corePackageCount: 43, sciencePackageCount: 529, scienceInstalledPackageCount: 171, missingCorePackages: [], scannedAt: '2026-10-12T12:00:00Z', packages: [{ name: 'pandas', version: '1.0.0' }] }
function fixture(inventory: any = ready, initialTask?: any) {
  let current = inventory, task = initialTask, listener: any
  const request = vi.fn(async (input: any) => {
    if (input.action === 'status') return { runtimeRoot: ready.runtimeRoot, inventory: current, status: { phase: 'ready' }, task }
    if (input.action === 'scan_local') return { scanId: 'scan', scan: { scanId: 'scan', state: 'complete', inventory: current } }
    if (input.action === 'configure') return { revision: input.mirrorUrl ? 8 : 7, mirrorUrl: input.mirrorUrl ?? 'https://mirrors.ustc.edu.cn/pypi/simple' }
    if (input.action === 'open_shell') return { opened: true }
    if (input.action === 'cancel') { task = { ...task, state: 'cancelled', message: '任务已取消' }; return { task } }
    if (input.action === 'sync' || input.action === 'install_package') {
      task = { taskId: 'new', requestId: input.requestId, action: input.action, layer: input.layer, state: 'queued', stage: 'queued', message: '正在准备 Python 依赖任务。', completedPackages: 0, logLines: [] }
      return { task }
    }
    return {}
  })
  window.zerowallDesktop = { pythonEnvironment: request, onMcpEnvironmentStatus: (value: any) => { listener = value; return () => {} } } as any
  return { request, inventory: (value: any) => { current = value }, emit: (value: any) => listener(value) }
}
it('uses one path, one mirror selector and direct layer buttons, keeping technical details collapsed', async () => {
  const { request } = fixture()
  const { container } = render(<PythonEnvironmentPanel t={translator(zh)} />)
  await screen.findByText('43 / 43')
  expect(screen.getByText('可用')).toBeTruthy()
  expect(container.textContent).not.toContain('%LOCALAPPDATA%')
  expect(screen.getAllByRole('combobox')).toHaveLength(1)
  expect(screen.getByText('高级设置').closest('details')?.open).toBe(false)
  expect(request.mock.calls.some(([value]) => ['sync', 'install_package', 'apply_sync'].includes(value.action))).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: '安装科研依赖' }))
  await waitFor(() => expect(request).toHaveBeenCalledWith(expect.objectContaining({ action: 'sync', layer: 'science', confirm: true })))
})
it('shows unknown detection without a repair warning and permits direct installation of a missing runtime', async () => {
  const { request } = fixture({ ready: false, inventoryComplete: false, packages: [] })
  render(<PythonEnvironmentPanel t={translator(zh)} />)
  await waitFor(() => expect(request).toHaveBeenCalledWith(expect.objectContaining({ action: 'scan_local' })))
  expect(screen.queryByText('基础依赖未齐')).toBeNull()
  const install = screen.getByRole('button', { name: '安装基础依赖' })
  expect((install as HTMLButtonElement).disabled).toBe(false)
  fireEvent.click(install)
  await waitFor(() => expect(request).toHaveBeenCalledWith(expect.objectContaining({ action: 'sync', layer: 'core', confirm: true })))
})
it('does not lose installed core counts on failed or late refreshes, and accepts an actual new uninstall', async () => {
  const runtime = fixture()
  render(<PythonEnvironmentPanel t={translator(zh)} />)
  await screen.findByText('43 / 43')
  runtime.inventory({ ...ready, ready: false, inventoryComplete: false, packages: [] })
  fireEvent.click(screen.getByRole('button', { name: '检测 / 刷新' }))
  await waitFor(() => expect(screen.getByText('43 / 43')).toBeTruthy())
  await act(async () => runtime.emit({ packageInventory: { ...ready, scannedAt: '2026-10-12T11:00:00Z', corePackageCount: 0, missingCorePackages: ['pandas'] } }))
  expect(screen.getByText('43 / 43')).toBeTruthy()
  await act(async () => runtime.emit({ packageInventory: { ...ready, scannedAt: '2026-10-12T12:01:00Z', corePackageCount: 42, missingCorePackages: ['pandas'] } }))
  expect(screen.getByText('基础依赖未齐')).toBeTruthy()
})
it('opens Shell through the independently updated worker action and searches local versions without feed checks', async () => {
  const { request } = fixture()
  render(<PythonEnvironmentPanel t={translator(zh)} />)
  await screen.findByText('43 / 43')
  fireEvent.click(screen.getByRole('button', { name: '打开 Python 命令行' }))
  await waitFor(() => expect(request).toHaveBeenCalledWith(expect.objectContaining({ action: 'open_shell' })))
  fireEvent.change(screen.getByLabelText('搜索已安装包'), { target: { value: 'PANDAS' } })
  expect(screen.getByText('1.0.0')).toBeTruthy()
  expect(request.mock.calls.some(([value]) => value.action === 'check_manifest')).toBe(false)
})
it('counts successful installs rather than preparation progress, and cancels an active task', async () => {
  const { request } = fixture(ready, { taskId: 'task', action: 'sync', state: 'running', stage: 'installing', progress: 95, completedPackages: 1, totalPackages: 3, currentPackage: 'idna', logLines: ['Installing idna'], message: '正在安装 idna' })
  render(<PythonEnvironmentPanel t={translator(zh)} />)
  await screen.findByText('33%')
  expect(screen.getByText('查看安装日志').closest('details')?.open).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: '取消安装' }))
  await waitFor(() => expect(request).toHaveBeenCalledWith(expect.objectContaining({ action: 'cancel', taskId: 'task' })))
  await waitFor(() => expect(screen.queryByRole('button', { name: '取消安装' })).toBeNull())
})
it('keeps failed packages retryable, preserves the mirror revision and saves an explicit version request', async () => {
  const { request } = fixture(ready, { taskId: 'failed', action: 'sync', state: 'partial', stage: 'partial', message: '部分完成', logLines: [], result: { skippedPackages: [{ name: 'attrs', message: 'No matching distribution' }] } })
  render(<PythonEnvironmentPanel t={translator(zh)} />)
  await screen.findByText('失败 1 个包')
  fireEvent.change(screen.getByRole('combobox', { name: '下载镜像' }), { target: { value: 'custom' } })
  fireEvent.change(screen.getByLabelText('镜像网址'), { target: { value: 'https://pypi.org/simple' } })
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  await waitFor(() => expect(request).toHaveBeenCalledWith(expect.objectContaining({ action: 'configure', mirrorUrl: 'https://pypi.org/simple', expectedRevision: 7 })))
  fireEvent.change(screen.getByLabelText('包名'), { target: { value: 'attrs==25.4.0' } })
  fireEvent.click(screen.getByRole('button', { name: '安装' }))
  await waitFor(() => expect(request).toHaveBeenCalledWith(expect.objectContaining({ action: 'install_package', packageSpec: 'attrs==25.4.0', confirm: true })))
})
it('renders English controls and installed versions without Chinese copy', async () => {
  fixture()
  const { container } = render(<PythonEnvironmentPanel t={translator(en)} />)
  await screen.findByText('43 / 43')
  expect(screen.getByRole('button', { name: 'Install science dependencies' })).toBeTruthy()
  expect(container.textContent).not.toMatch(/\p{Script=Han}/u)
})
