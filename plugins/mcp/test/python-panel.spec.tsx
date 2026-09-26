// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, act, fireEvent, waitFor, cleanup, within } from '@testing-library/react'
import { zh, en } from '../../base/src/client/locales.js'
import { PythonEnvironmentPanel } from '../src/client/PythonEnvironmentPanel.js'
afterEach(cleanup)
vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
const info = (snapshotId: string, count: number) => ({ snapshotId, environmentVersion: snapshotId, version: '3.12.10', ready: true, packageCount: count, officialPackageCount: count, packages: Array.from({ length: count }, (_, i) => ({ name: `package-${String(i).padStart(3, '0')}`, version: '1.0', source: 'core' as const, health: 'locked' as const })) })
// Advanced tools stay collapsed on first paint. Open the native details element
// explicitly because jsdom does not consistently dispatch its toggle event.
const openAdvanced = () => {
  const summary = screen.queryByText('高级设置') ?? screen.queryByText('Advanced settings')
  const details = summary?.closest('details')
  if (details && !details.open) { details.open = true; fireEvent(details, new Event('toggle')) }
}
const reveal = (value = 'package') => { openAdvanced(); fireEvent.change(screen.getByLabelText('搜索依赖'), { target: { value } }) }
// The panel copy carries {placeholders} for the package counts, so the test dictionary must
// interpolate them exactly like the real locale translator instead of echoing the raw key text.
const translator = (dictionary: Record<string, string>) => ((key: string, params?: Record<string, unknown>) => {
  let value = dictionary[key] ?? key
  for (const [name, replacement] of Object.entries(params ?? {})) value = value.replaceAll(`{${name}}`, String(replacement))
  return value
}) as any
const zhT = translator(zh); const enT = translator(en)

describe('Python dependency panel', () => {
  it('distinguishes inventory loading from an unavailable runtime and a filtered empty list', async () => {
    let finish!: (value: unknown) => void
    const load = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve })).mockResolvedValue(info('ready', 1))
    window.zerowallDesktop = { getMcpPythonInfo: load } as any
    render(<PythonEnvironmentPanel t={zhT} />)
    expect(screen.getByText('正在刷新当前环境依赖清单…')).toBeTruthy()
    expect(screen.queryByText('没有匹配的依赖')).toBeNull()
    await act(async () => finish({ ready: false, packages: [] }))
    expect(screen.getByText('不可用')).toBeTruthy()
    expect(screen.getByText('ZeroWall Python 尚未就绪。')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '刷新环境状态' }))
    await act(async () => {})
    reveal()
    await screen.findByText('package-000')
    fireEvent.change(screen.getByLabelText('搜索依赖'), { target: { value: 'absent' } })
    expect(screen.getByText('没有匹配的依赖')).toBeTruthy()
  })

  it('renders English controls and structured progress without Chinese backend messages', async () => {
    window.zerowallDesktop = {
      getMcpPythonInfo: async () => info('old', 131),
      getMcpEnvironmentStatus: async () => ({ phase: 'installing', message: '正在解压', activeEnvironment: { snapshotId: 'old' }, updateJob: { completedFiles: 128, totalFiles: 63655 } }),
    } as any
    const { container } = render(<PythonEnvironmentPanel t={enT} />)
    await screen.findByText('131')
    openAdvanced()
    expect(screen.getByLabelText('Search dependencies')).toBeTruthy()
    expect(container.textContent).not.toMatch(/\p{Script=Han}/u)
    fireEvent.change(screen.getByLabelText('Search dependencies'), { target: { value: 'package' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Details' })[0]!)
    expect(screen.getByRole('dialog', { name: 'Package details' })).toBeTruthy()
    expect(container.textContent).not.toMatch(/\p{Script=Han}/u)
  })
  it('refreshes a background generation and virtualizes the list without checking the feed on search', async () => {
    let listener: any; let current = info('1.3.0', 131)
    const check = vi.fn(); const load = vi.fn(async () => current)
    window.zerowallDesktop = { getMcpPythonInfo: load, checkMcpEnvironment: check, onMcpEnvironmentStatus: (cb: any) => { listener = cb; return () => {} } } as any
    render(<PythonEnvironmentPanel t={zhT} />)
    await screen.findByText('131')
    await act(async () => { current = info('1.4.0', 387); listener({ phase: 'ready', activeEnvironment: { snapshotId: '1.4.0', environmentVersion: '1.4.0' }, updated: true }) })
    await screen.findByText('387')
    reveal('package-')
    fireEvent.change(screen.getByLabelText('搜索依赖'), { target: { value: 'package-' } })
    expect(screen.getAllByRole('listitem').length).toBeLessThan(25)
    fireEvent.change(screen.getByLabelText('搜索依赖'), { target: { value: 'package-300' } })
    expect(screen.getAllByRole('listitem')).toHaveLength(1); expect(check).not.toHaveBeenCalled()
    expect(screen.getByText('package-300')).toBeTruthy()
  })
  it('does not replace the new snapshot with an older in-flight response', async () => {
    let listener: any; let release!: (value: any) => void
    const load = vi.fn().mockImplementationOnce(() => new Promise(resolve => { release = resolve })).mockResolvedValue(info('new', 387))
    window.zerowallDesktop = { getMcpPythonInfo: load, onMcpEnvironmentStatus: (cb: any) => { listener = cb; return () => {} } } as any
    render(<PythonEnvironmentPanel t={zhT} />)
    await act(async () => listener({ phase: 'ready', activeEnvironment: { snapshotId: 'new', environmentVersion: '1.4.0' } }))
    await screen.findByText('387')
    await act(async () => release(info('old', 131)))
    await waitFor(() => expect(screen.queryByText('131')).toBeNull())
  })
  it('opens the installation plan when the plan snapshot differs from the active environment', async () => {
    // Regression: the panel used to drop this plan silently because the plan snapshot and the
    // active-environment snapshot only converge after a status event. The user saw nothing at all.
    const apply = vi.fn(async () => ({ taskId: 'task-1' }))
    window.zerowallDesktop = {
      getMcpPythonInfo: async () => info('gen-b', 1),
      getMcpEnvironmentStatus: async () => ({ phase: 'ready', activeEnvironment: { snapshotId: 'gen-a', environmentVersion: '1.0' } }),
      previewMcpPythonPackages: async () => ({ planId: 'plan-1', snapshotId: 'gen-b', requested: ['pyzotero'], changes: [{ name: 'pyzotero', to: '3.0.1' }] }),
      applyMcpPythonPackagePlan: apply,
    } as any
    render(<PythonEnvironmentPanel t={zhT} />)
    await act(async () => {})
    openAdvanced()
    fireEvent.change(screen.getByLabelText('添加依赖'), { target: { value: 'pyzotero' } })
    fireEvent.click(screen.getByRole('button', { name: '检查安装方案' }))
    expect(await screen.findByRole('dialog', { name: '依赖升级预览' })).toBeTruthy()
    expect(screen.getByText('环境在生成该方案后已变化，请重新检查安装方案后再应用。')).toBeTruthy()
    expect(screen.getByText(/pyzotero/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '应用升级' }))
    await waitFor(() => expect(apply).not.toHaveBeenCalled())
  })
  it('opens the installation plan when no status event has ever been delivered', async () => {
    // Without a status event the active snapshot is unknown; the plan must still be shown.
    window.zerowallDesktop = {
      getMcpPythonInfo: async () => info('gen-b', 1),
      previewMcpPythonPackages: async () => ({ planId: 'plan-2', snapshotId: 'gen-b', requested: ['brainglobe'], changes: [{ name: 'brainglobe', to: '1.0.0' }] }),
    } as any
    render(<PythonEnvironmentPanel t={zhT} />)
    await act(async () => {})
    openAdvanced()
    fireEvent.change(screen.getByLabelText('添加依赖'), { target: { value: 'brainglobe' } })
    fireEvent.click(screen.getByRole('button', { name: '检查安装方案' }))
    expect(await screen.findByRole('dialog', { name: '依赖升级预览' })).toBeTruthy()
    expect(screen.queryByText('环境在生成该方案后已变化，请重新检查安装方案后再应用。')).toBeNull()
  })
  it('shows a busy preview button instead of staying idle while the plan resolves', async () => {
    let release!: (value: any) => void
    window.zerowallDesktop = {
      getMcpPythonInfo: async () => info('gen-a', 1),
      previewMcpPythonPackages: () => new Promise(resolve => { release = resolve }),
    } as any
    render(<PythonEnvironmentPanel t={zhT} />)
    await act(async () => {})
    openAdvanced()
    fireEvent.change(screen.getByLabelText('添加依赖'), { target: { value: 'pyzotero==3.0.1' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '检查安装方案' })) })
    const busy = screen.getByRole('button', { name: '解析中…' })
    expect((busy as HTMLButtonElement).disabled).toBe(true)
    await act(async () => release({ planId: 'plan-3', snapshotId: 'gen-a', requested: ['pyzotero'], changes: [] }))
    expect(screen.getByRole('button', { name: '检查安装方案' })).toBeTruthy()
  })
  it('requires a preview before a dependency can be applied', async () => {
    window.zerowallDesktop = { getMcpPythonInfo: async () => info('gen-a', 1) } as any
    render(<PythonEnvironmentPanel t={zhT} />)
    await act(async () => {})
    openAdvanced()
    fireEvent.change(screen.getByLabelText('添加依赖'), { target: { value: 'pyzotero==3.0.1' } })
    expect(screen.queryByRole('button', { name: '安装' })).toBeNull()
    expect(screen.getByRole('button', { name: '检查安装方案' })).toBeTruthy()
  })
  it('presents the official inventory as a collapsed search surface rather than 387 first-paint rows', async () => {
    window.zerowallDesktop = { getMcpPythonInfo: async () => info('gen-a', 387) } as any
    render(<PythonEnvironmentPanel t={zhT} />)
    await screen.findByText('387')
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
    expect(screen.getByText(/可搜索依赖清单 · 已安装 387/u)).toBeTruthy()
    reveal('package-300')
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByText('package-300')).toBeTruthy()
  })
  it('checks and previews the signed manifest without mutation, and confirms before applying', async () => {
    const execute = vi.fn(async (request: any) => request.action === 'preview_sync' ? { requestId: request.requestId, plan: { planId: 'signed-plan', manifestRevision: '2026-09-23', snapshotId: 'gen-a', requested: [], changes: [{ name: 'numpy', from: '2.0.0', to: '2.1.0' }] } } : request.action === 'apply_sync' ? { requestId: request.requestId, taskId: 'sync-1' } : { requestId: request.requestId, revision: 4, mirrorUrl: 'https://pypi.tuna.tsinghua.edu.cn/simple' })
    const legacyUpdate = vi.fn(); const legacyInstall = vi.fn()
    window.zerowallDesktop = { getMcpPythonInfo: async () => info('gen-a', 1), pythonEnvironment: execute, updateMcpEnvironment: legacyUpdate, installMcpPythonPackage: legacyInstall } as any
    render(<PythonEnvironmentPanel t={zhT} />)
    await screen.findByText('1')
    openAdvanced()
    fireEvent.click(screen.getByRole('button', { name: '检查依赖清单' }))
    await waitFor(() => expect(execute).toHaveBeenCalledWith(expect.objectContaining({ action: 'check_manifest', requestId: expect.any(String) })))
    expect(execute.mock.calls.some(([request]) => request.action === 'apply_sync')).toBe(false)
    expect(legacyUpdate).not.toHaveBeenCalled(); expect(legacyInstall).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '预览同步' }))
    await screen.findByRole('dialog', { name: '依赖升级预览' })
    expect(execute.mock.calls.some(([request]) => request.action === 'apply_sync')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: '应用升级' }))
    await waitFor(() => expect(execute).toHaveBeenCalledWith(expect.objectContaining({ action: 'apply_sync', planId: 'signed-plan', manifestRevision: '2026-09-23', confirm: true })))
  })
  it('shows one mirror dropdown with the USTC default and keeps custom URLs in advanced settings', async () => {
    const execute = vi.fn(async (request: any) => request.action === 'diagnose'
      ? { requestId: request.requestId, diagnostics: { checkedAt: '2026-09-23', pip: { status: 'available', message: 'pip check 通过' } } }
      : { requestId: request.requestId, revision: 2, mirrorUrl: 'https://mirrors.ustc.edu.cn/pypi/simple', defaultMirrorUrl: 'https://mirrors.ustc.edu.cn/pypi/simple', mirrorPresets: [
          { id: 'aliyun', label: '阿里云 · mirrors.aliyun.com', indexUrl: 'https://mirrors.aliyun.com/pypi/simple', custom: false },
          { id: 'tuna', label: '清华大学 · pypi.tuna.tsinghua.edu.cn', indexUrl: 'https://pypi.tuna.tsinghua.edu.cn/simple', custom: false },
          { id: 'ustc', label: '中科大 · mirrors.ustc.edu.cn', indexUrl: 'https://mirrors.ustc.edu.cn/pypi/simple', custom: false },
          { id: 'tencent', label: '腾讯云', indexUrl: 'https://mirrors.cloud.tencent.com/pypi/simple', custom: false },
          { id: 'huawei', label: '华为云', indexUrl: 'https://repo.huaweicloud.com/repository/pypi/simple', custom: false },
          { id: 'pypi', label: '官方 PyPI', indexUrl: 'https://pypi.org/simple', custom: false },
        ] })
    window.zerowallDesktop = { getMcpPythonInfo: async () => ({ ...info('gen-a', 1), verification: { imports: true, pipCheck: true, message: 'OK' } }), pythonEnvironment: execute } as any
    render(<PythonEnvironmentPanel t={zhT} />)
    await screen.findByText('1')
    const mirror = screen.getByRole('combobox', { name: '软件专用镜像源' })
    expect(mirror.querySelectorAll('option')).toHaveLength(7)
    expect((mirror as HTMLSelectElement).value).toBe('ustc')
    expect(screen.queryByLabelText('自定义镜像源地址')).toBeNull()
    fireEvent.change(mirror, { target: { value: 'tuna' } })
    await waitFor(() => expect(execute).toHaveBeenCalledWith(expect.objectContaining({ action: 'configure', mirrorUrl: 'https://pypi.tuna.tsinghua.edu.cn/simple' })))
    fireEvent.change(mirror, { target: { value: 'custom' } })
    expect(await screen.findByLabelText('自定义镜像源地址')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '测试连接与证书' })).toBeNull()
  })
  it('saves application mirror configuration with its expected revision', async () => {
    const execute = vi.fn(async (request: any) => ({ requestId: request.requestId, revision: request.mirrorUrl ? 8 : 7, mirrorUrl: request.mirrorUrl ?? 'https://pypi.tuna.tsinghua.edu.cn/simple' }))
    window.zerowallDesktop = { getMcpPythonInfo: async () => info('gen-a', 1), pythonEnvironment: execute } as any
    render(<PythonEnvironmentPanel t={zhT} />)
    await screen.findByText('1')
    openAdvanced()
    fireEvent.change(screen.getByRole('combobox', { name: '软件专用镜像源' }), { target: { value: 'custom' } })
    fireEvent.change(screen.getByLabelText('自定义镜像源地址'), { target: { value: 'https://pypi.org/simple' } })
    fireEvent.click(screen.getByRole('button', { name: '保存镜像源' }))
    await waitFor(() => expect(execute).toHaveBeenCalledWith(expect.objectContaining({ action: 'configure', mirrorUrl: 'https://pypi.org/simple', expectedRevision: 7 })))
    fireEvent.click(screen.getByRole('button', { name: '恢复默认镜像源' }))
    // The host did not send `defaultMirrorUrl`, so the panel falls back to USTC.
    await waitFor(() => expect(execute).toHaveBeenCalledWith(expect.objectContaining({ action: 'configure', mirrorUrl: 'https://mirrors.ustc.edu.cn/pypi/simple', expectedRevision: 8 })))
  })
  it('shows only the runtimeRoot provided by the Host rather than fabricating it from a legacy executable', async () => {
    window.zerowallDesktop = { getMcpPythonInfo: async () => ({ ...info('gen-a', 1), executable: 'C:\\legacy\\slots\\a\\bio-tools\\python\\python.exe' }) } as any
    const { rerender } = render(<PythonEnvironmentPanel t={zhT} />)
    await screen.findByText('1')
    const path = within(screen.getByRole('region', { name: '共享 Python 路径' }))
    expect(path.getByText('共享路径尚未登记，请检查环境')).toBeTruthy()
    expect((path.getByRole('button', { name: '复制路径' }) as HTMLButtonElement).disabled).toBe(true)
    expect(path.queryByText(/slots/u)).toBeNull()
    window.zerowallDesktop.getMcpPythonInfo = async () => ({ ...info('gen-a', 1), runtimeRoot: 'C:\\Users\\user\\AppData\\Roaming\\zerowall-science\\Python' })
    rerender(<PythonEnvironmentPanel t={zhT} />)
    fireEvent.click(screen.getByRole('button', { name: '刷新环境状态' }))
    await waitFor(() => expect(path.getByText('C:\\Users\\user\\AppData\\Roaming\\zerowall-science\\Python')).toBeTruthy())
  })
  it('requires a second explicit confirmation to download a missing base runtime', async () => {
    const bootstrap = vi.fn(async () => ({ phase: 'downloading' }))
    window.zerowallDesktop = { getMcpPythonInfo: async () => ({ ready: false, packages: [] }), updateMcpEnvironment: bootstrap } as any
    render(<PythonEnvironmentPanel t={zhT} />)
    fireEvent.click(await screen.findByRole('button', { name: '安装 Python' }))
    expect(bootstrap).not.toHaveBeenCalled()
    const dialog = screen.getByRole('dialog', { name: '安装共享 Python 运行时' })
    expect(within(dialog).getByText('安装包附带的签名基础运行时')).toBeTruthy()
    expect(within(dialog).getByText('已签名清单指定的兼容版本')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: '安装基础环境' }))
    await waitFor(() => expect(bootstrap).toHaveBeenCalledTimes(1))
  })
  it('applies an explicitly requested package plan through the package API even when manifest sync is available', async () => {
    const execute = vi.fn(async (request: any) => ({ requestId: request.requestId, revision: 1, mirrorUrl: 'https://pypi.tuna.tsinghua.edu.cn/simple' }))
    const apply = vi.fn(async () => ({ taskId: 'package-install' }))
    window.zerowallDesktop = { getMcpPythonInfo: async () => info('gen-a', 1), pythonEnvironment: execute, previewMcpPythonPackages: async () => ({ planId: 'manual-plan', snapshotId: 'gen-a', requested: ['pydna'], changes: [{ name: 'pydna', to: '5.4.0' }] }), applyMcpPythonPackagePlan: apply } as any
    render(<PythonEnvironmentPanel t={zhT} />)
    await screen.findByText('1')
    openAdvanced()
    fireEvent.change(screen.getByLabelText('添加依赖'), { target: { value: 'pydna' } })
    fireEvent.click(screen.getByRole('button', { name: '检查安装方案' }))
    await screen.findByRole('dialog', { name: '依赖升级预览' })
    expect(apply).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '应用升级' }))
    await waitFor(() => expect(apply).toHaveBeenCalledWith('manual-plan'))
    expect(execute.mock.calls.some(([request]) => request.action === 'apply_sync')).toBe(false)
  })
  it('keeps a package physical snapshot path inside collapsed diagnostics', async () => {
    const snapshotPath = 'C:\\legacy\\slots\\a\\bio-tools\\python\\site-packages'
    const runtimeRoot = 'C:\\Users\\user\\AppData\\Roaming\\zerowall-science\\Python'
    window.zerowallDesktop = { getMcpPythonInfo: async () => ({ ...info('gen-a', 1), runtimeRoot, packages: [{ ...info('gen-a', 1).packages[0], location: snapshotPath }] }) } as any
    render(<PythonEnvironmentPanel t={zhT} />)
    await screen.findByText('1'); reveal()
    fireEvent.click(screen.getByRole('button', { name: '详情' }))
    const dialog = screen.getByRole('dialog', { name: '依赖详情' })
    expect(within(dialog).getByText(`${runtimeRoot}\\Lib\\site-packages`)).toBeTruthy()
    expect(within(dialog).getByText(snapshotPath).closest('details')?.open).toBe(false)
  })
  it('leaves a paused task untouched until the user chooses to resume it', async () => {
    const resume = vi.fn(async () => ({ phase: 'checking' }))
    window.zerowallDesktop = { getMcpPythonInfo: async () => info('gen-a', 1), getMcpEnvironmentStatus: async () => ({ phase: 'paused' }), updateMcpEnvironment: resume } as any
    render(<PythonEnvironmentPanel t={zhT} />)
    const button = await screen.findByRole('button', { name: '继续更新' })
    expect(resume).not.toHaveBeenCalled()
    fireEvent.click(button)
    await waitFor(() => expect(resume).toHaveBeenCalledTimes(1))
  })
  it('restores the persisted manifest check and operation history when reopening settings', async () => {
    const execute = vi.fn(async (request: any) => ({ requestId: request.requestId, ...(request.action === 'status' ? { dependencies: { revision: 3, manifestRevision: '2026-09-23.2', manifestSha256: 'a'.repeat(64), checkedAt: '2026-09-23T01:02:00Z', source: 'remote', changes: [{ name: 'numpy', from: '2.0.0', to: '2.1.0', required: true, capabilities: ['arrays'] }] }, events: [{ action: 'check_manifest', requestId: 'check-persisted', createdAt: '2026-09-23T01:02:00Z', status: 'succeeded' }, { action: 'apply_sync', requestId: 'apply-persisted', createdAt: '2026-09-23T01:03:00Z', status: 'failed', message: 'Hash mismatch' }] } : {}) }))
    window.zerowallDesktop = { getMcpPythonInfo: async () => info('gen-a', 1), pythonEnvironment: execute } as any
    render(<PythonEnvironmentPanel t={zhT} />)
    openAdvanced()
    await screen.findByText('待同步依赖：1')
    expect(screen.queryByText('清单版本: 2026-09-23.2')).toBeNull()
    expect(screen.getByText('待同步依赖：1')).toBeTruthy()
    expect(screen.getByText('操作记录 · 2')).toBeTruthy()
    expect(screen.getByText('Hash mismatch')).toBeTruthy()
    expect(execute.mock.calls.every(([request]) => ['list_packages', 'configure', 'status', 'diagnose'].includes(request.action))).toBe(true)
  })
  it('prefers the Host inventory metadata and filters by package capability', async () => {
    const legacy = vi.fn()
    const inventory = { ...info('gen-a', 2), packages: [{ ...info('gen-a', 2).packages[0], capabilities: ['image'], sha256: 'b'.repeat(64) }, { ...info('gen-a', 2).packages[1], capabilities: ['sequence'] }] }
    window.zerowallDesktop = { getMcpPythonInfo: legacy, pythonEnvironment: async (request: any) => ({ requestId: request.requestId, ...(request.action === 'list_packages' ? { inventory } : {}) }) } as any
    render(<PythonEnvironmentPanel t={zhT} />)
    await screen.findByText('2')
    fireEvent.change(screen.getByLabelText('相关能力'), { target: { value: 'image' } })
    expect(screen.getByText('package-000')).toBeTruthy()
    expect(screen.queryByText('package-001')).toBeNull()
    expect(legacy).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '详情' }))
    expect(screen.getByText('锁定 wheel SHA-256')).toBeTruthy()
    expect(screen.getByText('b'.repeat(64))).toBeTruthy()
  })
})
