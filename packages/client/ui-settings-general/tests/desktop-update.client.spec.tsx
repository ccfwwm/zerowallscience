// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { DesktopUpdateIndicator, updateCopy } from '../src/client/DesktopUpdateIndicator.tsx'
import { HostRuntimeUpdateRow } from '../src/client/UpdatesSection.tsx'
import type { DesktopUpdateBridge, DesktopUpdatePresentation } from '../src/types.ts'
import { DesktopUpdateSource } from '../src/client/desktop-update-source.ts'
import { en, zh } from '../src/client/locales.ts'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

type SettingsTranslate = PropsLocale<'settings'>['t']

function translate(dictionary: typeof zh | typeof en): SettingsTranslate {
  const messages: Readonly<Record<string, string>> = dictionary
  return (key, params) => Object.entries(params ?? {})
    .reduce((message, [name, value]) => message.replaceAll(`{${name}}`, String(value)),
      messages[key] ?? key)
}

function fixture() {
  let listener: ((state: DesktopUpdatePresentation) => void) | undefined
  const status = Promise.withResolvers<DesktopUpdatePresentation>()
  const unsubscribe = vi.fn()
  const open = vi.fn(async () => {})
  const runtimeCheck = vi.fn(async () => {})
  const runtimeStage = vi.fn(async () => {})
  const runtimeRestart = vi.fn(async () => {})
  const bridge: DesktopUpdateBridge = {
    status: () => status.promise,
    open,
    hostRuntimeCheck: runtimeCheck,
    hostRuntimeStage: runtimeStage,
    hostRuntimeRestart: runtimeRestart,
    subscribe: (next) => { listener = next; return unsubscribe },
  }
  const source = new DesktopUpdateSource(bridge)
  const subscribe = (notify: () => void) => source.store.subscribe(notify)
  const snapshot = () => source.store.getSnapshot()
  function Indicator({ wide = true, hidden = false, dictionary = zh }: {
    wide?: boolean
    hidden?: boolean
    dictionary?: typeof zh | typeof en
  }) {
    const state = useSyncExternalStore(subscribe, snapshot)
    return <DesktopUpdateIndicator wide={wide} hidden={hidden} t={translate(dictionary)}
      view={state} onOpen={() => { void source.open() }} />
  }
  const view = render(<Indicator />)
  const unmount = view.unmount
  view.unmount = () => { source.dispose(); unmount() }
  return { open, status, unsubscribe, view, Indicator, source, bridge, runtimeCheck, runtimeStage, runtimeRestart,
    emit: async (state: DesktopUpdatePresentation) => {
      await act(async () => { listener?.(state) })
    } }
}


it('shows the installed version during idle, checking, progress and failures', async () => {
  const f = fixture()
  try {
    for (const phase of ['idle', 'checking', 'downloading', 'verifying', 'installing', 'error'] as const) {
      await f.emit({ phase, installedVersion: '9.1.8', failure: 'check' })
      const button = screen.getByRole('button', { name: 'v9.1.8' })
      expect(button.textContent).toBe('v9.1.8')
      expect(button.querySelector('svg')).toBeNull()
      expect(screen.queryByText('重试更新')).toBeNull()
      expect(screen.queryByText('正在检查更新…')).toBeNull()
    }
  } finally { f.view.unmount(); f.status.resolve({ phase: 'idle' }) }
})

it('marks plugin updates with an upward arrow while retaining the version and navigation', () => {
  const onOpen = vi.fn()
  render(<DesktopUpdateIndicator wide hidden={false} t={translate(zh)}
    view={{ failed: false, opening: false, presentation: { phase: 'idle', installedVersion: '9.1.8' } }} onOpen={onOpen}
    summary={{ operation: 'idle', sources: [{ id: 'plugins', available: 2, ready: false, busy: false, failed: false, checked: true }] }} />)
  const button = screen.getByRole('button', { name: 'v9.1.8 · 有更新' })
  expect(button.hasAttribute('data-update-available')).toBe(true)
  expect(button.textContent).toContain('有更新')
  expect(button.querySelector('svg')).not.toBeNull()
  fireEvent.click(button)
  expect(onOpen).toHaveBeenCalledOnce()
})

it('keeps the newest carrier event and ignores late status and teardown completions', async () => {
  const f = fixture()
  await f.emit({ phase: 'available', installedVersion: '9.1.8', version: '9.1.9' })
  await act(async () => { f.status.resolve({ phase: 'idle', installedVersion: '9.1.7' }) })
  expect(screen.getByRole('button', { name: 'v9.1.8 · 有更新' })).toBeTruthy()
  f.view.rerender(<f.Indicator hidden />)
  expect(screen.queryByRole('button')).toBeNull()
  const retained = f.source.store.getSnapshot()
  f.view.unmount()
  await f.emit({ phase: 'error' })
  expect(f.source.store.getSnapshot()).toBe(retained)
  expect(f.unsubscribe).toHaveBeenCalledOnce()
})

it('routes installer readiness to installation and extension restart to the feature carrier', async () => {
  const f = fixture()
  const install = vi.fn(async () => {})
  const prepare = vi.fn(async () => {})
  f.bridge.restart = install
  f.bridge.prepare = prepare
  try {
    await f.emit({ phase: 'available', version: '9.1.9' })
    await act(async () => { await f.source.open() })
    expect(prepare).toHaveBeenCalledOnce()
    await f.emit({ phase: 'ready', version: '9.1.9', hostRuntime: { phase: 'staged' } })
    await act(async () => { await f.source.open() })
    expect(install).toHaveBeenCalledOnce()
    expect(f.runtimeRestart).not.toHaveBeenCalled()
    await f.source.restart()
    expect(f.runtimeRestart).toHaveBeenCalledOnce()
    expect(install).toHaveBeenCalledOnce()
  } finally { f.view.unmount(); f.status.resolve({ phase: 'idle' }) }
})

it('checks Runtime without activating a prepared candidate and retains failed preparation', async () => {
  const f = fixture()
  try {
    await f.emit({ phase: 'idle', hostRuntime: { phase: 'idle', activeVersion: '9.1.8' } })
    await act(async () => { expect(await f.source.hostRuntimeUpdate(false)).toBe(true) })
    expect(f.runtimeCheck).toHaveBeenCalledOnce()
    await f.emit({ phase: 'idle', hostRuntime: { phase: 'available', candidateVersion: '9.1.10' } })
    await act(async () => { expect(await f.source.source('runtime').prepare()).toBe(false) })
    expect(f.runtimeRestart).not.toHaveBeenCalled()
    await f.emit({ phase: 'idle', hostRuntime: { phase: 'staged' } })
    expect(await f.source.source('runtime').prepare()).toBe(true)
    expect(f.runtimeRestart).not.toHaveBeenCalled()
  } finally { f.view.unmount(); f.status.resolve({ phase: 'idle' }) }
})

it('renders no indicator outside Desktop and retains bridge failures in settings state', async () => {
  const source = new DesktopUpdateSource(undefined)
  render(<DesktopUpdateIndicator wide hidden={false} t={translate(zh)} view={source.store.getSnapshot()} onOpen={() => {}} />)
  expect(screen.queryByRole('button')).toBeNull()
  source.dispose()
  const f = fixture()
  await act(async () => { f.status.reject(new Error('IPC unavailable')) })
  expect(f.source.store.getSnapshot().failed).toBe(true)
  expect(screen.queryByText('重试更新')).toBeNull()
  f.view.unmount()
})

it('shows download bytes, extraction and verification before offering runtime restart', () => {
  const action = vi.fn()
  let presentation: DesktopUpdatePresentation = { phase: 'idle', hostRuntime: { phase: 'downloading',
    activeVersion: '9.1.12', candidateVersion: '9.1.13', percent: 25, downloadedBytes: 1048576, totalBytes: 4194304 } }
  const props = { t: translate(zh), openHostRuntimeUpdate: action,
    useDesktopUpdate: <T,>(selector: (view: import('../src/types.ts').DesktopUpdateView) => T): T => selector({ failed: false, opening: false, presentation }) }
  const view = render(<HostRuntimeUpdateRow {...props} />)
  expect(screen.getByRole('status').textContent).toBe('正在下载 25%（1.0 / 4.0 MB）')
  expect(screen.getByRole('progressbar').getAttribute('value')).toBe('25')
  expect(screen.getByRole<HTMLButtonElement>('button').disabled).toBe(true)
  expect(screen.queryByText('检查更新')).toBeNull()
  for (const phase of ['extracting', 'verifying', 'staged'] as const) {
    presentation = { ...presentation, hostRuntime: { ...presentation.hostRuntime!, phase } }
    view.rerender(<HostRuntimeUpdateRow {...props} />)
    expect(screen.getByRole<HTMLButtonElement>('button').disabled).toBe(phase !== 'staged')
  }
  fireEvent.click(screen.getByRole('button', { name: '重启并应用' }))
  expect(action).toHaveBeenCalledWith(false)
})


it('keeps the download configuration error visible in update status', () => {
  expect(updateCopy({ phase: 'idle', configurationError: 'format' }, translate(zh)).detail)
    .toBe('更新已暂停：配置文件格式有误')
  expect(updateCopy({ phase: 'downloading', percent: 58, configurationError: 'cleanup' }, translate(zh)).detail)
    .toBe('更新已暂停：无法清理旧更新，请重启应用')
})

it('coalesces updater actions while a download is pending', async () => {
  const f = fixture()
  const available = { phase: 'available', version: '9.1.9' } as const
  const download = Promise.withResolvers<undefined>()
  try {
    await act(async () => { f.status.resolve(available) })
    f.open.mockImplementationOnce(() => download.promise)
    fireEvent.click(screen.getByRole('button', { name: '打开更新中心 · 有更新' }))
    await f.emit({ phase: 'downloading', percent: 12, version: available.version })
    const updateCenter = screen.getByRole('button', { name: '打开更新中心' })
    fireEvent.click(updateCenter)
    fireEvent.click(updateCenter)
    expect(f.open).toHaveBeenCalledOnce()
    expect(f.source.store.getSnapshot().opening).toBe(true)
    await act(async () => { download.resolve(undefined) })
    expect(f.source.store.getSnapshot().opening).toBe(false)
  } finally {
    f.view.unmount()
    download.resolve(undefined)
  }
})
