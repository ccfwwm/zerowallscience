// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apply, inject } from '../src/client/view.js'
import { ClaudeCodeSettingsSection } from '../src/client/ClaudeCodeSettingsSection.js'
import { ClaudePermissionSelect } from '../src/client/ClaudePermissionSelect.js'
import { en, zh } from '../src/client/locales.js'
import type { ClaudePermissionView } from '../src/shared/types.js'

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
  const useProjection = () => ({})
  it('exposes all six Claude modes and shows current execution versus next turn', async () => {
    const selectPermission = vi.fn(async () => ({ ...view, mode: 'plan' as const, runningMode: 'default' as const }))
    render(<ClaudePermissionSelect {...({ loadPermission: async () => view, selectPermission, locked: true, t, useProjection } as never)} />)
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
    const mounted = render(<ClaudePermissionSelect {...({ loadPermission: async () => ({ ...view, source: 'native', hostPreset: 'auto' }), selectPermission: vi.fn(), locked: false, t, useProjection } as never)} />)
    const selector = await screen.findByRole('button', { name: 'ZeroWall 会话权限' })
    await waitFor(() => expect(selector.textContent).toBe('自动审查'))
    fireEvent.click(selector)
    expect(screen.getByRole('menuitem', { name: '自动审查' })).toBeTruthy()
    mounted.unmount()
    render(<ClaudePermissionSelect {...({ loadPermission: async () => { throw new Error('private diagnostic') }, selectPermission: vi.fn(), locked: false, t, useProjection } as never)} />)
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', '无法读取会话权限，请重试。')
  })
  it('follows language changes and preserves custom Host names', async () => {
    const loadPermission = async () => ({ ...view, source: 'native' as const, nativeOptions: [
      { value: 'workspace-write', name: 'workspace-write' }, { value: 'danger-full-access', name: 'Full access' },
      { value: 'custom-team', name: '团队审批' },
    ] })
    const props = { loadPermission, selectPermission: vi.fn(), locked: false, useProjection }
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
    render(<ClaudePermissionSelect {...({ loadPermission: async () => view, selectPermission, locked: false, t: translate(en), useProjection } as never)} />)
    const selector = await screen.findByRole('button', { name: 'Claude session permissions' }) as HTMLButtonElement
    await waitFor(() => expect(selector.disabled).toBe(false))
    fireEvent.click(selector)
    expect(screen.getAllByRole('menuitem').map(option => option.textContent)).toEqual(['Default', 'Don’t ask', 'Accept edits', 'Auto', 'Plan', 'Bypass permissions'])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Bypass permissions' }))
    expect(confirm).toHaveBeenCalledWith(en.permissionConfirm)
    expect(selectPermission).not.toHaveBeenCalled()
  })
  it('waits for the current Session permission projection before loading', async () => {
    const loadPermission = vi.fn(async () => { throw new Error('session is not ready') })
    render(<ClaudePermissionSelect {...({ loadPermission, selectPermission: vi.fn(), locked: false, t,
      useProjection: () => undefined } as never)} />)
    await Promise.resolve()
    expect(loadPermission).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('Claude Code client entry points', () => {
  it('registers composer permissions, transcripts and settings without a conversation header action', async () => {
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
    expect(calls.map(call => call.name)).toEqual(['conversation.input.permission', 'conversation.chat.node', 'settings.section', 'plugins.bundle.config'])
    expect(uiConversation.events.register).toHaveBeenCalledWith(expect.objectContaining({ kind: 'zerowall-claude-transcript' }))
    expect(calls[2]?.options).toMatchObject({ id: 'zerowall-claude-code', order: 35, locale: 'zerowall.claude-code' })
    expect(calls[2]?.component).toBe(ClaudeCodeSettingsSection)
    expect(calls[0]?.options.locale).toBe('zerowall.claude-code')
    expect(remote.settingsStatus).not.toHaveBeenCalled()
    expect(sidebar.registerTab).not.toHaveBeenCalled()
    expect((window as Window & { zerowallDesktop?: unknown }).zerowallDesktop).toBeUndefined()
  })
})
