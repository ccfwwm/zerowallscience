// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { PythonEnvironmentPanel } from '../src/client/PythonEnvironmentPanel.js'
import { en, zh } from '../src/client/locales.js'

afterEach(cleanup)
const t = (key: keyof typeof en) => en[key]
it('refreshes without installation and applies only the previewed plan', async () => {
  const request = vi.fn(async (input: { action: string }) => {
    if (input.action === 'status') return { status: { phase: 'ready' }, mirrorUrl: 'https://pypi.org/simple' }
    if (input.action === 'list_packages') return { inventory: { ready: true, version: '3.12.14', packageCount: 2, packages: [{ name: 'mcp', version: '2.3.0' }, { name: 'xlrd', version: '2.0.2' }], executable: 'injected-python' } }
    if (input.action === 'preview_sync') return { plan: { planId: 'reviewed-plan', changes: [{ name: 'requests', to: 'requests==2.34.2' }] } }
    return {}
  })
  render(<PythonEnvironmentPanel t={t} api={{ pythonEnvironment: request as never }} />)
  expect(await screen.findByText('injected-python')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Filter installed packages'), { target: { value: 'xld' } })
  expect(screen.getByText('xlrd')).toBeTruthy()
  expect(screen.queryByText('mcp')).toBeNull()
  fireEvent.change(screen.getByLabelText('Filter installed packages'), { target: { value: '' } })
  expect(request.mock.calls.every(([input]) => ['status', 'list_packages'].includes(input.action))).toBe(true)
  fireEvent.change(screen.getByLabelText('Package specification'), { target: { value: 'requests' } })
  fireEvent.click(screen.getByRole('button', { name: 'Preview dependency plan' }))
  expect(await screen.findByText('2.34.2')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Apply dependency plan' }))
  await waitFor(() => expect(request).toHaveBeenCalledWith(expect.objectContaining({ action: 'apply_sync', planId: 'reviewed-plan', confirm: true })))
})

it('keeps preparation failures visible and retries only after a user action', async () => {
  const request = vi.fn(async () => ({ status: { phase: 'failed', message: 'Offline wheels are missing' } }))
  render(<PythonEnvironmentPanel t={t} api={{ pythonEnvironment: request as never }} />)
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Offline wheels are missing')
  expect(request).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: 'Retry preparation' }))
  await waitFor(() => expect(request).toHaveBeenCalledWith(expect.objectContaining({ action: 'install_runtime', confirm: true })))
})

it('saves a mainland mirror without starting an installation', async () => {
  const request = vi.fn(async () => ({ status: { phase: 'failed' }, mirrorUrl: 'https://pypi.tuna.tsinghua.edu.cn/simple' }))
  render(<PythonEnvironmentPanel t={t} api={{ pythonEnvironment: request as never }} />)
  const preset = await screen.findByLabelText('Choose package mirror')
  fireEvent.change(preset, { target: { value: 'https://mirrors.aliyun.com/pypi/simple' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save package index' }))
  await screen.findByText('Saved')
  expect(request).toHaveBeenCalledWith(expect.objectContaining({ action: 'configure', mirrorUrl: 'https://mirrors.aliyun.com/pypi/simple', confirm: true }))
  expect(request.mock.calls.every(([input]) => ['status', 'configure'].includes(input.action))).toBe(true)
})

it('localizes an OCR failure and retries the shared preparation task', async () => {
  let recovered = false
  const request = vi.fn(async (input: { action: string }) => {
    if (input.action === 'install_runtime') recovered = true
    return { status: { phase: 'ready' }, ocr: { phase: recovered ? 'ready' : 'failed', code: 'OCR_DOWNLOAD_FAILED', message: 'Internal download error', receivedBytes: recovered ? 1048576 : 0, totalBytes: 1048576 } }
  })
  render(<PythonEnvironmentPanel t={key => zh[key]} api={{ pythonEnvironment: request as never }} />)
  const alert = await screen.findByRole('alert')
  expect(alert.textContent).toMatchInlineSnapshot('"模型下载失败，请检查网络或模型镜像后重试"')
  expect(request.mock.calls.every(([input]) => ['status', 'list_packages'].includes(input.action))).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: '重试准备' }))
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  expect(screen.getByText('已就绪 · 1.0 / 1.0 MiB')).toBeTruthy()
})

it('searches partial package names, filters versions, and previews the selected exact version', async () => {
  const request = vi.fn(async (input: { action: string; packageName?: string }) => {
    if (input.action === 'status') return { status: { phase: 'ready' } }
    if (input.action === 'list_packages') return { inventory: { ready: true, uvVersion: 'uv 0.9.0', packages: [] } }
    if (input.action === 'search_package') return input.packageName ? { packageCatalog: { name: 'numpy', summary: 'Arrays', versions: ['2.4.0', '2.3.1'], latestVersion: '2.4.0' } } : { packageMatches: [{ name: 'numpy' }] }
    return {}
  })
  render(<PythonEnvironmentPanel t={t} api={{ pythonEnvironment: request as never }} />)
  expect(await screen.findByText('uv 0.9.0')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Package specification'), { target: { value: 'numpy==2.3.1' } })
  fireEvent.click(screen.getByRole('button', { name: 'Search packages' }))
  await screen.findByText('Arrays')
  await waitFor(() => expect(request).toHaveBeenCalledWith(expect.objectContaining({ action: 'search_package', packageName: 'numpy' })))
  fireEvent.change(screen.getByLabelText('Package specification'), { target: { value: 'num' } })
  fireEvent.click(screen.getByRole('button', { name: 'Search packages' }))
  fireEvent.click(await screen.findByRole('button', { name: 'numpy' }))
  await screen.findByText('Arrays')
  fireEvent.change(screen.getByLabelText('Filter versions'), { target: { value: '231' } })
  expect(screen.queryByRole('option', { name: '2.4.0' })).toBeNull()
  expect(screen.getByRole('option', { name: '2.3.1' })).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Choose a version'), { target: { value: '2.3.1' } })
  fireEvent.click(screen.getByRole('button', { name: 'Preview dependency plan' }))
  await waitFor(() => expect(request).toHaveBeenCalledWith(expect.objectContaining({ action: 'preview_sync', packageSpec: 'numpy==2.3.1' })))
})
