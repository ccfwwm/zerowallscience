// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { ClaudeCodeAction, type ClaudeCodeActionInjected } from '../src/client/ClaudeCodeAction.js'
import { bindClaudeCodeRemote } from '../src/client/view.js'
import { apply, inject } from '../src/client/view.js'
import { ClaudeCodeSettingsSection } from '../src/client/ClaudeCodeSettingsSection.js'
import { ClaudePermissionSelect } from '../src/client/ClaudePermissionSelect.js'
import { en, zh } from '../src/client/locales.js'
import type { ClaudeCodeStatus, ClaudeCodeTurn, ClaudePermissionView } from '../src/shared/types.js'

afterEach(() => {
  cleanup()
  delete (window as Window & { zerowallDesktop?: unknown }).zerowallDesktop
})

describe('composer permission selection', () => {
  const translate = (dictionary: Record<string, string>) => (key: string, args?: Record<string, string>) =>
    (dictionary[key] ?? key).replace(/\{(\w+)\}/g, (match, name: string) => args?.[name] ?? match)
  const t = translate(zh)
  const view: ClaudePermissionView = { active: true, source: 'plugin', mode: 'default', hostPreset: 'workspace-write',
    hostSandbox: 'workspace-write', hostApproval: 'on-request', nativeOptions: [{ value: 'auto', name: 'Auto Review' }] }
  it('exposes all six Claude modes and shows current execution versus next turn', async () => {
    const selectPermission = vi.fn(async () => ({ ...view, mode: 'plan' as const, runningMode: 'default' as const }))
    render(<ClaudePermissionSelect {...({ loadPermission: async () => view, selectPermission, locked: true, t } as never)} />)
    const selector = await screen.findByRole('button', { name: 'Claude 会话权限' }) as HTMLButtonElement
    await waitFor(() => expect(selector.disabled).toBe(false))
    fireEvent.click(selector)
    expect(selector.disabled).toBe(false)
    expect(screen.getAllByRole('menuitem').map(option => option.textContent)).toEqual(['默认', '不询问', '允许编辑', '自动', '计划模式', '跳过权限检查'])
    fireEvent.click(screen.getByRole('menuitem', { name: '计划模式' }))
    await waitFor(() => expect(selector.textContent).toBe('计划模式'))
    expect(selectPermission).toHaveBeenCalledWith('plan')
    expect(selector.title).toContain('Claude 当前模式：默认；下一轮：计划模式')
  })
  it('uses canonical Host options for native control and exposes load failures', async () => {
    const mounted = render(<ClaudePermissionSelect {...({ loadPermission: async () => ({ ...view, source: 'native', hostPreset: 'auto' }), selectPermission: vi.fn(), locked: false, t } as never)} />)
    const selector = await screen.findByRole('button', { name: 'ZeroWall 会话权限' })
    await waitFor(() => expect(selector.textContent).toBe('自动审查'))
    fireEvent.click(selector)
    expect(screen.getByRole('menuitem', { name: '自动审查' })).toBeTruthy()
    mounted.unmount()
    render(<ClaudePermissionSelect {...({ loadPermission: async () => { throw new Error('private diagnostic') }, selectPermission: vi.fn(), locked: false, t } as never)} />)
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', '无法读取会话权限，请重试。')
  })
  it('follows language changes and preserves custom Host names', async () => {
    const loadPermission = async () => ({ ...view, source: 'native' as const, nativeOptions: [
      { value: 'workspace-write', name: 'workspace-write' }, { value: 'danger-full-access', name: 'Full access' },
      { value: 'custom-team', name: '团队审批' },
    ] })
    const props = { loadPermission, selectPermission: vi.fn(), locked: false }
    const mounted = render(<ClaudePermissionSelect {...({ ...props, t } as never)} />)
    const selector = await screen.findByRole('button', { name: 'ZeroWall 会话权限' })
    await waitFor(() => expect(selector.textContent).toBe('工作区内修改'))
    fireEvent.keyDown(selector, { key: 'ArrowDown' })
    expect(screen.getAllByRole('menuitem').map(option => option.textContent)).toEqual(['工作区内修改', '完全权限', '团队审批'])
    mounted.rerender(<ClaudePermissionSelect {...({ ...props, t: translate(en) } as never)} />)
    expect(screen.getByRole('button', { name: 'ZeroWall session permissions' }).textContent).toBe('Workspace Write')
    expect(screen.getAllByRole('menuitem').map(option => option.textContent)).toEqual(['Workspace Write', 'Full access', '团队审批'])
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
  })
  it('localizes Claude modes in English and retains cancellation without writing permissions', async () => {
    const selectPermission = vi.fn()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<ClaudePermissionSelect {...({ loadPermission: async () => view, selectPermission, locked: false, t: translate(en) } as never)} />)
    const selector = await screen.findByRole('button', { name: 'Claude session permissions' }) as HTMLButtonElement
    await waitFor(() => expect(selector.disabled).toBe(false))
    fireEvent.click(selector)
    expect(screen.getAllByRole('menuitem').map(option => option.textContent)).toEqual(['Default', 'Don’t ask', 'Accept edits', 'Auto', 'Plan', 'Bypass permissions'])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Bypass permissions' }))
    expect(confirm).toHaveBeenCalledWith(en.permissionConfirm)
    expect(selectPermission).not.toHaveBeenCalled()
  })
})

const installed: ClaudeCodeStatus = { desktop: true, installed: true, version: '2.1.309', rollbackAvailable: true, running: false }
const finished: ClaudeCodeTurn = { id: 'turn', provider: 'platform', model: 'selected-model', running: false, output: 'Done', exitCode: 0, skills: 1, mcp: 1, skipped: [] }
function actions(overrides: Partial<ClaudeCodeActionInjected> = {}): ClaudeCodeActionInjected {
  return {
    getStatus: vi.fn(async () => installed), read: vi.fn(async () => null),
    stop: vi.fn(async () => {}), install: vi.fn(async () => installed), rollback: vi.fn(async () => installed),
    uninstall: vi.fn(async () => ({ ...installed, installed: false })), clear: vi.fn(async () => {}), ...overrides,
  }
}
function openPanel(api: ClaudeCodeActionInjected) {
  const inputActions = { setDraft: vi.fn(), submit: vi.fn() }
  render(<ClaudeCodeAction {...api} {...({ inputActions } as never)} />)
  fireEvent.click(screen.getByRole('button', { name: 'Claude Code' }))
  return inputActions
}

describe('Claude Code conversation panel', () => {
  it('reads state on opening and waits for an explicit installation click', async () => {
    const api = actions({ getStatus: vi.fn(async () => ({ ...installed, installed: false, rollbackAvailable: false })) })
    const input = openPanel(api)
    await screen.findByRole('button', { name: '安装 CLI' })
    expect(api.getStatus).toHaveBeenCalledOnce()
    expect(api.install).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '安装 CLI' }))
    await screen.findByText('CLI 2.1.309')
    expect(api.install).toHaveBeenCalledOnce()
    expect(input.setDraft).not.toHaveBeenCalled()
    expect(input.submit).not.toHaveBeenCalled()
  })

  it('uses the main composer and displays the native session, route and diagnostics', async () => {
    const api = actions({ read: vi.fn(async () => ({ ...finished, nativeSessionId: 'native-session', resumed: true })) })
    const input = openPanel(api)
    await screen.findByText('CLI 2.1.309')
    await screen.findByText('Done')
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByText('native-session')).toBeTruthy()
    expect(screen.getByText(/续接原会话/)).toBeTruthy()
    expect(screen.getByText(/请在主输入框/)).toBeTruthy()
    expect(screen.getByText(/platform · selected-model/)).toBeTruthy()
    expect(input.setDraft).not.toHaveBeenCalled()
    expect(input.submit).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '清空' }))
    await waitFor(() => expect(api.clear).toHaveBeenCalledOnce())
  })

  it('shows the actual turn executable instead of a subsequently changed installed path', async () => {
    const api = actions({ getStatus: vi.fn(async () => ({ ...installed, executablePath: 'C:\\ZeroWall data\\new\\claude.exe' })),
      read: vi.fn(async () => ({ ...finished, executablePath: 'C:\\ZeroWall data\\active\\claude.exe' })) })
    openPanel(api)
    await screen.findByText('运行诊断')
    expect(screen.getByText('C:\\ZeroWall data\\active\\claude.exe')).toBeTruthy()
    expect(screen.queryByText('C:\\ZeroWall data\\new\\claude.exe')).toBeNull()
    expect(api.install).not.toHaveBeenCalled()
  })

  it('does not install CLI in non-Desktop environments', async () => {
    const api = actions({ getStatus: vi.fn(async () => ({ ...installed, desktop: false, installed: false, rollbackAvailable: false })) })
    openPanel(api)
    await screen.findByText('仅 ZeroWall Desktop 支持')
    expect((screen.getByRole('button', { name: '安装 CLI' }) as HTMLButtonElement).disabled).toBe(true)
    expect(api.install).not.toHaveBeenCalled()
  })

  it('allows stopping a running task and reports skipped resources', async () => {
    const api = actions({ getStatus: vi.fn(async () => ({ ...installed, running: true })), read: vi.fn(async () => ({ ...finished, running: true, skipped: ['MCP managed: managed-server'] })) })
    openPanel(api)
    await screen.findByText(/资源同步详情/)
    fireEvent.click(screen.getByRole('button', { name: '停止' }))
    await waitFor(() => expect(api.stop).toHaveBeenCalledOnce())
    expect(screen.queryByRole('button', { name: '运行' })).toBeNull()
  })

  it('replaces untrusted errors with a safe message', async () => {
    const api = actions({ install: vi.fn(async () => { throw new Error('当前路由 sensitive-host-token') }) })
    openPanel(api)
    await screen.findByText('CLI 2.1.309')
    fireEvent.click(screen.getByRole('button', { name: '更新 CLI' }))
    const error = await screen.findByRole('alert')
    expect(error.textContent).toContain('操作失败')
    expect(screen.queryByText('sensitive-host-token')).toBeNull()
  })

  it('can stop while the main composer request is preparing', async () => {
    const api = actions({ getStatus: vi.fn(async () => ({ ...installed, running: true })),
      stop: vi.fn(async () => { throw new Error('Claude Code 任务已停止。') }) })
    openPanel(api)
    await screen.findByText('CLI 2.1.309')
    fireEvent.click(await screen.findByRole('button', { name: '停止' }))
    await waitFor(() => expect(api.stop).toHaveBeenCalledOnce())
    expect((await screen.findByRole('alert')).textContent).toBe('Claude Code 任务已停止。')
  })

  it('binds every remote operation to the displayed Session', async () => {
    const ok = <T,>(value: T) => Promise.resolve({ ok: true as const, value })
    const remote = {
      status: vi.fn(() => ok(installed)), read: vi.fn(() => ok(finished)), stop: vi.fn(() => ok(undefined)),
      installCli: vi.fn(() => ok(installed)), rollback: vi.fn(() => ok(installed)), uninstall: vi.fn(() => ok(installed)), clear: vi.fn(() => ok(undefined)),
    }
    const api = bindClaudeCodeRemote(remote, 'session-A' as SessionId)
    await api.getStatus(); await api.read(); await api.stop()
    await api.install(); await api.rollback(); await api.uninstall(); await api.clear()
    for (const method of ['status', 'read', 'stop', 'installCli', 'rollback', 'uninstall', 'clear'] as const) expect(remote[method]).toHaveBeenCalledWith('session-A')
  })
})

describe('Claude Code client entry points', () => {
  it('registers conversation and settings controls without creating a terminal tab', async () => {
    const calls: Array<{ name: string; options: Record<string, unknown>; component: unknown }> = []
    const remote = {
      settingsStatus: vi.fn(), settingsInstall: vi.fn(), settingsRollback: vi.fn(), settingsUninstall: vi.fn(),
      settingsGet: vi.fn(async () => ({ ok: true, value: { prose: 'plain' } })),
    }
    const sidebar = { registerTab: vi.fn(() => vi.fn()) }
    const uiConversation = { events: { register: vi.fn() } }
    const slots = {
      entries: vi.fn(() => []), subscribe: vi.fn(() => () => {}),
      inject: vi.fn((_name: string, callback: () => void) => callback()),
      register: vi.fn((options: Record<string, unknown>, component: unknown) => { calls.push({ name: String(options.name), options, component }) }),
    }
    const ctx = {
      locale: { register: vi.fn(), bind: vi.fn(() => (key: string) => key) },
      effect: vi.fn(effect => effect()), slots,
      get: vi.fn((key: string) => key === 'uiConversation' ? uiConversation : remote),
    }
    expect(inject).toContain('locale')
    expect(inject).toContain('uiConversation')
    apply(ctx as never)
    expect(calls.map(call => call.name)).toEqual(['conversation.input.permission', 'conversation.chat.node', 'conversation.session.header.actions', 'settings.section'])
    expect(uiConversation.events.register).toHaveBeenCalledWith(expect.objectContaining({ kind: 'zerowall-claude-transcript' }))
    expect(calls[3]?.options).toMatchObject({ id: 'zerowall-claude-code', order: 35, locale: 'zerowall.claude-code' })
    expect(calls[3]?.component).toBe(ClaudeCodeSettingsSection)
    expect(calls[0]?.options.locale).toBe('zerowall.claude-code')
    expect(remote.settingsStatus).not.toHaveBeenCalled()
    expect(sidebar.registerTab).not.toHaveBeenCalled()
    expect((window as Window & { zerowallDesktop?: unknown }).zerowallDesktop).toBeUndefined()
  })
})
