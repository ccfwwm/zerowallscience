// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { ClaudeCodeAction, type ClaudeCodeActionInjected } from '../src/client/ClaudeCodeAction.js'
import { bindClaudeCodeRemote } from '../src/client/view.js'
import { apply, inject } from '../src/client/view.js'
import { ClaudeCodeSettingsSection } from '../src/client/ClaudeCodeSettingsSection.js'
import type { ClaudeCodeStatus, ClaudeCodeTurn } from '../src/shared/types.js'

afterEach(() => cleanup())

const installed: ClaudeCodeStatus = { desktop: true, installed: true, version: '2.1.309', rollbackAvailable: true, running: false }
const finished: ClaudeCodeTurn = { id: 'turn', provider: 'platform', model: 'selected-model', running: false, output: 'Done', exitCode: 0, skills: 1, mcp: 1, skipped: [] }
function actions(overrides: Partial<ClaudeCodeActionInjected> = {}): ClaudeCodeActionInjected {
  return {
    getStatus: vi.fn(async () => installed), read: vi.fn(async () => null), start: vi.fn(async () => finished),
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
    expect(api.start).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '安装 CLI' }))
    await screen.findByText('CLI 2.1.309')
    expect(api.install).toHaveBeenCalledOnce()
    expect(input.setDraft).not.toHaveBeenCalled()
    expect(input.submit).not.toHaveBeenCalled()
  })

  it('uses a separate prompt and displays the route and output from the Host', async () => {
    const api = actions()
    const input = openPanel(api)
    await screen.findByText('CLI 2.1.309')
    fireEvent.change(screen.getByRole('textbox', { name: 'Claude Code 任务' }), { target: { value: '  Edit this project  ' } })
    fireEvent.click(screen.getByRole('button', { name: '运行' }))
    await screen.findByText('Done')
    expect(api.start).toHaveBeenCalledWith('Edit this project')
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
    await screen.findByText(/未同步资源/)
    fireEvent.click(screen.getByRole('button', { name: '停止' }))
    await waitFor(() => expect(api.stop).toHaveBeenCalledOnce())
    expect((screen.getByRole('button', { name: '运行' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('replaces untrusted errors with a safe message', async () => {
    const api = actions({ start: vi.fn(async () => { throw new Error('当前路由 sensitive-host-token') }) })
    openPanel(api)
    await screen.findByText('CLI 2.1.309')
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Run' } })
    fireEvent.click(screen.getByRole('button', { name: '运行' }))
    const error = await screen.findByRole('alert')
    expect(error.textContent).toContain('操作失败')
    expect(screen.queryByText('sensitive-host-token')).toBeNull()
  })

  it('can stop while the Host is preparing the first turn', async () => {
    let rejectStart!: (reason: Error) => void
    const api = actions({ start: vi.fn(() => new Promise((_resolve, reject) => { rejectStart = reject })) })
    openPanel(api)
    await screen.findByText('CLI 2.1.309')
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Run' } })
    fireEvent.click(screen.getByRole('button', { name: '运行' }))
    fireEvent.click(await screen.findByRole('button', { name: '停止' }))
    await waitFor(() => expect(api.stop).toHaveBeenCalledOnce())
    rejectStart(new Error('Claude Code 任务已停止。'))
    expect((await screen.findByRole('alert')).textContent).toBe('Claude Code 任务已停止。')
  })

  it('binds every remote operation to the displayed Session', async () => {
    const ok = <T,>(value: T) => Promise.resolve({ ok: true as const, value })
    const remote = {
      status: vi.fn(() => ok(installed)), start: vi.fn(() => ok(finished)), read: vi.fn(() => ok(finished)), stop: vi.fn(() => ok(undefined)),
      installCli: vi.fn(() => ok(installed)), rollback: vi.fn(() => ok(installed)), uninstall: vi.fn(() => ok(installed)), clear: vi.fn(() => ok(undefined)),
    }
    const api = bindClaudeCodeRemote(remote, 'session-A' as SessionId)
    await api.getStatus(); await api.start('Task'); await api.read(); await api.stop()
    await api.install(); await api.rollback(); await api.uninstall(); await api.clear()
    expect(remote.start).toHaveBeenCalledWith('session-A', 'Task')
    for (const method of ['status', 'read', 'stop', 'installCli', 'rollback', 'uninstall', 'clear'] as const) expect(remote[method]).toHaveBeenCalledWith('session-A')
  })
})

describe('Claude Code client entry points', () => {
  it('registers the Claude Code settings page and the existing session action', () => {
    const calls: Array<{ name: string; options: Record<string, unknown>; component: unknown }> = []
    const remote = {
      settingsStatus: vi.fn(), settingsInstall: vi.fn(), settingsRollback: vi.fn(), settingsUninstall: vi.fn(),
    }
    const slots = {
      inject: vi.fn((_name: string, callback: () => void) => callback()),
      register: vi.fn((options: Record<string, unknown>, component: unknown) => { calls.push({ name: String(options.name), options, component }) }),
    }
    const ctx = {
      locale: { register: vi.fn(), bind: vi.fn(() => (key: string) => key) },
      effect: vi.fn(effect => effect()), slots,
      get: vi.fn(() => remote),
    }
    expect(inject).toContain('locale')
    apply(ctx as never)
    expect(calls.map(call => call.name)).toEqual(['conversation.session.header.actions', 'settings.section'])
    expect(calls[1]?.options).toMatchObject({ id: 'zerowall-claude-code', order: 35, locale: 'zerowall.claude-code' })
    expect(calls[1]?.component).toBe(ClaudeCodeSettingsSection)
    expect(remote.settingsStatus).not.toHaveBeenCalled()
  })
})
