// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ClaudeCodeSettingsSection } from '../src/client/ClaudeCodeSettingsSection.js'
import { zh, en } from '../src/client/locales.js'
import type { ClaudeCodeSettingsApi, ClaudeCodeStatus, ClaudeGlobalSettingsView } from '../src/shared/types.js'

afterEach(() => cleanup())

const installed: ClaudeCodeStatus = {
  desktop: true, installed: true, version: '2.1.309', executablePath: 'C:\\ZeroWall\\claude.js',
  rollbackAvailable: true, running: false,
}

function renderSettings(api: ClaudeCodeSettingsApi) {
  return render(<ClaudeCodeSettingsSection {...({ t: (key: string) => key, ...api } as never)} />)
}

describe('Claude Code settings section', () => {
  it('reads the application-managed status and displays its executable path', async () => {
    const api: ClaudeCodeSettingsApi = {
      status: vi.fn(async () => installed), install: vi.fn(async () => installed),
      rollback: vi.fn(async () => installed), uninstall: vi.fn(async () => ({ ...installed, installed: false })),
    }
    renderSettings(api)
    await screen.findByText('C:\\ZeroWall\\claude.js')
    expect(api.status).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'update' })).toBeTruthy()
  })

  it('shows an actionable runtime recovery diagnostic when the managed CLI is unavailable', async () => {
    const diagnostic = 'Claude Code executable is missing; reinstall from plugin settings.'
    const api: ClaudeCodeSettingsApi = {
      status: vi.fn(async () => ({ ...installed, installed: false, rollbackAvailable: false, executablePath: undefined, diagnostic })),
      install: vi.fn(async () => installed), rollback: vi.fn(async () => installed), uninstall: vi.fn(async () => installed),
    }
    renderSettings(api)
    expect(await screen.findByText(diagnostic)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'install' })).toBeTruthy()
  })

  it('runs install and rollback from Settings without a session id', async () => {
    const next = { ...installed, version: '2.1.310' }
    const api: ClaudeCodeSettingsApi = {
      status: vi.fn(async () => ({ ...installed, installed: false, rollbackAvailable: false })),
      install: vi.fn(async () => next), rollback: vi.fn(async () => next), uninstall: vi.fn(async () => ({ ...next, installed: false })),
    }
    renderSettings(api)
    await screen.findByRole('button', { name: 'install' })
    fireEvent.click(screen.getByRole('button', { name: 'install' }))
    await waitFor(() => expect(api.install).toHaveBeenCalledOnce())
    await screen.findByRole('button', { name: 'rollback' })
    fireEvent.click(screen.getByRole('button', { name: 'rollback' }))
    await waitFor(() => expect(api.rollback).toHaveBeenCalledOnce())
  })

  it('blocks management while a turn is running', async () => {
    const api: ClaudeCodeSettingsApi = {
      status: vi.fn(async () => ({ ...installed, running: true })), install: vi.fn(async () => installed),
      rollback: vi.fn(async () => installed), uninstall: vi.fn(async () => installed),
    }
    renderSettings(api)
    const install = await screen.findByRole('button', { name: 'update' })
    expect((install as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('status').textContent).toBe('running')
  })

  it('renders dynamic native descriptors and saves a selected output style', async () => {
    const settings = { settings: [
      { key: 'outputStyle', kind: 'select' as const, value: 'Default', effect: 'new-session' as const, options: [
        { value: 'Default', label: 'Default', source: 'built-in' as const },
        { value: 'Reviewer', label: 'Reviewer', source: 'user' as const },
      ] },
    ] }
    const api: ClaudeCodeSettingsApi = {
      status: vi.fn(async () => installed), install: vi.fn(async () => installed),
      rollback: vi.fn(async () => installed), uninstall: vi.fn(async () => installed),
      globalSettings: vi.fn(async () => settings),
      updateGlobalSettings: vi.fn(async ({ outputStyle }) => ({ ...settings, settings: settings.settings.map(item => item.key === 'outputStyle' && outputStyle ? { ...item, value: outputStyle } : item) })),
    }
    renderSettings(api)
    await screen.findByText('setting_outputStyle')
    fireEvent.click(screen.getByRole('button', { name: 'setting_outputStyle' }))
    fireEvent.click(screen.getByRole('option', { name: 'Reviewer' }))
    await waitFor(() => expect(api.updateGlobalSettings).toHaveBeenCalledWith({ outputStyle: 'Reviewer' }))
    expect(screen.queryByLabelText('setting_worktreeBranchPrefix')).toBeNull()
    expect(screen.getAllByText('settingEffect')).toHaveLength(1)
  })

  it('uses the upstream keyboard listbox and preserves server-discovered style names', async () => {
    const settings: ClaudeGlobalSettingsView = { settings: [{ key: 'outputStyle', kind: 'select', value: 'Default', effect: 'new-session', options: [
      { value: 'Default', label: 'Default', source: 'built-in' }, { value: '我的审稿风格', label: '我的审稿风格', source: 'user' },
    ] }] }
    const api = apiWithSettings(settings)
    renderSettings(api)
    const trigger = await screen.findByRole('button', { name: 'setting_outputStyle' })
    trigger.focus()
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    expect(screen.getByRole('listbox', { name: 'setting_outputStyle' })).toBeTruthy()
    fireEvent.keyDown(trigger, { key: 'End' })
    fireEvent.keyDown(trigger, { key: 'Enter' })
    await waitFor(() => expect(api.updateGlobalSettings).toHaveBeenCalledWith({ outputStyle: '我的审稿风格' }))
    expect(document.activeElement).toBe(trigger)
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('commits text once on Enter and discards an Escape draft without saving', async () => {
    const api = apiWithSettings({ settings: [{ key: 'maxProcesses', kind: 'text', value: '4', maxLength: 2, effect: 'immediate' }] })
    renderSettings(api)
    const input = await screen.findByRole('textbox', { name: 'setting_maxProcesses' })
    input.focus()
    fireEvent.change(input, { target: { value: '8' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(api.updateGlobalSettings).toHaveBeenCalledOnce())
    expect(api.updateGlobalSettings).toHaveBeenCalledWith({ maxProcesses: '8' })
    await waitFor(() => expect((input as HTMLInputElement).disabled).toBe(false))
    input.focus()
    fireEvent.change(input, { target: { value: '12' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect((input as HTMLInputElement).value).toBe('8')
    expect(api.updateGlobalSettings).toHaveBeenCalledOnce()
  })

  it('saves common presets and keeps validated custom context and compaction inputs', async () => {
    const api = apiWithSettings({ settings: [
      { key: 'contextWindow', kind: 'number', value: 'auto', min: 1, max: 10000000, step: 1, effect: 'new-session', presets: [
        { value: 'auto', label: 'auto' }, { value: '200000', label: '200k' }, { value: '500000', label: '500k' }, { value: '1000000', label: '1m' },
      ] },
      { key: 'autoCompactWindow', kind: 'number', value: 'auto', min: 100000, max: 1000000, step: 1, effect: 'new-session', presets: [
        { value: 'auto', label: 'auto' }, { value: '100000', label: '100k' }, { value: '200000', label: '200k' }, { value: '500000', label: '500k' }, { value: '1000000', label: '1m' },
      ] },
    ] })
    renderSettings(api)
    const contextPreset = await screen.findByRole('combobox', { name: 'setting_contextWindow numericPresets' })
    fireEvent.change(contextPreset, { target: { value: '500000' } })
    await waitFor(() => expect(api.updateGlobalSettings).toHaveBeenCalledWith({ contextWindow: '500000' }))
    fireEvent.change(contextPreset, { target: { value: 'custom' } })
    const context = await screen.findByRole('spinbutton', { name: 'setting_contextWindow' })
    expect((context as HTMLInputElement).placeholder).toBe('auto')
    fireEvent.change(context, { target: { value: '750000' } })
    fireEvent.keyDown(context, { key: 'Enter' })
    await waitFor(() => expect(api.updateGlobalSettings).toHaveBeenCalledWith({ contextWindow: '750000' }))

    const compactPreset = screen.getByRole('combobox', { name: 'setting_autoCompactWindow numericPresets' })
    fireEvent.change(compactPreset, { target: { value: '200000' } })
    await waitFor(() => expect(api.updateGlobalSettings).toHaveBeenLastCalledWith({ autoCompactWindow: '200000' }))
    fireEvent.change(compactPreset, { target: { value: 'custom' } })
    const compact = await screen.findByRole('spinbutton', { name: 'setting_autoCompactWindow' })
    expect((compact as HTMLInputElement).min).toBe('100000')
    expect((compact as HTMLInputElement).max).toBe('1000000')
    fireEvent.change(compact, { target: { value: '99999' } })
    fireEvent.keyDown(compact, { key: 'Enter' })
    expect(await screen.findByText('numericInputInvalid')).toBeTruthy()
    expect(api.updateGlobalSettings).toHaveBeenLastCalledWith({ autoCompactWindow: '200000' })
  })

  it('uses native setting visibility rules and disables services the managed runtime does not provide', async () => {
    const options = (values: string[]) => values.map(value => ({ value, label: value, source: 'built-in' as const }))
    const api = apiWithSettings({ settings: [
      { key: 'renderer', kind: 'select', value: 'native', effect: 'next-turn', options: options(['plugin', 'native']) },
      { key: 'prose', kind: 'select', value: 'plain', effect: 'immediate', options: options(['plain', 'enhanced']) },
      { key: 'permissionSelector', kind: 'select', value: 'native', effect: 'immediate', options: options(['plugin', 'native']) },
      { key: 'permissionMode', kind: 'select', value: 'acceptEdits', effect: 'new-session', options: options(['plan', 'acceptEdits']) },
    ] })
    renderSettings(api)
    await screen.findByRole('button', { name: 'setting_renderer' })
    expect(screen.queryByLabelText('setting_prose')).toBeNull()
    expect(screen.queryByLabelText('setting_permissionMode')).toBeNull()
    expect(screen.queryByLabelText('setting_worktreeBranchPrefix')).toBeNull()
    expect(screen.queryByLabelText('setting_idleTimeoutMinutes')).toBeNull()
    expect(api.updateGlobalSettings).not.toHaveBeenCalled()
  })

  it('allows next-turn settings while a Claude turn is running and retains the runtime-management gate', async () => {
    const api = apiWithSettings({ settings: [{ key: 'renderer', kind: 'select', value: 'plugin', effect: 'next-turn', options: [
      { value: 'plugin', label: 'Plugin', source: 'built-in' }, { value: 'native', label: 'Native', source: 'built-in' },
    ] }] })
    api.status = vi.fn(async () => ({ ...installed, running: true }))
    renderSettings(api)
    const trigger = await screen.findByRole('button', { name: 'setting_renderer' })
    expect((screen.getByRole('button', { name: 'update' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('option', { name: 'Native' }))
    await waitFor(() => expect(api.updateGlobalSettings).toHaveBeenCalledWith({ renderer: 'native' }))
  })

  it.each([['zh', zh], ['en', en]])('localizes supported controls and capability boundaries in %s', async (_locale, dictionary) => {
    const api = apiWithSettings({ settings: [
      { key: 'maxProcesses', kind: 'text', value: '4', maxLength: 2, effect: 'immediate' },
    ] })
    const t = (key: string) => dictionary[key as keyof typeof dictionary] ?? key
    const view = render(<ClaudeCodeSettingsSection {...({ ...api, t } as never)} />)
    await screen.findByRole('textbox', { name: dictionary.setting_maxProcesses })
    expect(view.container.textContent).not.toMatch(/(?:worktreeBranchPrefix|idleTimeoutMinutes|planUsageUnavailable|jiraUnavailable|pluginUpdatesManaged)/)
    // The retired plan/Jira/plugin-update cards were intentionally removed;
    // the settings surface should contain only supported managed controls.
    expect(view.container.textContent).not.toContain('Claude 套餐用量')
    expect(view.container.textContent).not.toContain('Claude plan usage')
  })

  it('reports an unavailable settings service instead of displaying an endless loading state', async () => {
    renderSettings({ status: vi.fn(async () => installed), install: vi.fn(async () => installed), rollback: vi.fn(async () => installed), uninstall: vi.fn(async () => installed) })
    await screen.findByRole('alert')
    expect(screen.queryByText('globalSettingsLoading')).toBeNull()
  })
})

function apiWithSettings(initial: ClaudeGlobalSettingsView): ClaudeCodeSettingsApi {
  let settings = initial
  return {
    status: vi.fn(async () => installed), install: vi.fn(async () => installed), rollback: vi.fn(async () => installed), uninstall: vi.fn(async () => installed),
    globalSettings: vi.fn(async () => settings),
    updateGlobalSettings: vi.fn(async changes => {
      settings = { settings: settings.settings.map(setting => changes[setting.key] === undefined ? setting : { ...setting, value: changes[setting.key] }) }
      return settings
    }),
  }
}
