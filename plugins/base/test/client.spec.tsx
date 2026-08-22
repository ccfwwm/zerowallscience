// @vitest-environment jsdom

import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { UpdateButton } from '../src/client/UpdateButton.js'
import type { DesktopUpdateStatus, ZeroWallDesktopApi } from '../src/client/desktop-api.js'
import { translator } from './locale.js'

let statusListener: ((status: DesktopUpdateStatus) => void) | undefined

function api(initial: DesktopUpdateStatus): ZeroWallDesktopApi {
  return {
    info: vi.fn(), chooseDirectory: vi.fn(),
    getUpdateStatus: vi.fn().mockResolvedValue(initial),
    checkForUpdates: vi.fn().mockResolvedValue({ phase: 'upToDate', currentVersion: initial.currentVersion }),
    downloadUpdate: vi.fn().mockResolvedValue({ phase: 'downloading', currentVersion: initial.currentVersion, version: initial.version, percent: 0 }),
    installUpdate: vi.fn().mockResolvedValue(true),
    onUpdateStatus: vi.fn(listener => { statusListener = listener; return () => { statusListener = undefined } }),
  }
}

afterEach(() => { cleanup(); delete window.zerowallDesktop; statusListener = undefined })

describe('desktop update button', () => {
  it('checks for updates from the sidebar action', async () => {
    const desktop = api({ phase: 'idle', currentVersion: '3.0.1' })
    window.zerowallDesktop = desktop
    render(<UpdateButton wide t={translator()} />)
    fireEvent.click(screen.getByRole('button', { name: '检查应用更新' }))
    expect(await screen.findByRole('dialog', { name: '应用更新' })).toBeTruthy()
    await waitFor(() => expect(desktop.checkForUpdates).toHaveBeenCalledOnce())
  })

  it('opens automatically when startup checking discovers a version and closes on immediate Escape', async () => {
    window.zerowallDesktop = api({ phase: 'idle', currentVersion: '3.0.0' })
    render(<UpdateButton wide t={translator()} />)
    await waitFor(() => expect(statusListener).toBeTypeOf('function'))
    statusListener?.({ phase: 'available', currentVersion: '3.0.0', version: '3.0.1' })
    expect(await screen.findByRole('dialog', { name: '发现新版本' })).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: '发现新版本' })).toBeNull()
    expect(screen.getByRole('button', { name: '检查应用更新' }).isConnected).toBe(true)
  })

  it('downloads an available update and installs only after explicit confirmation', async () => {
    const desktop = api({ phase: 'available', currentVersion: '3.0.0', version: '3.0.1' })
    window.zerowallDesktop = desktop
    render(<UpdateButton wide t={translator()} />)
    expect(await screen.findByRole('dialog', { name: '发现新版本' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '下载更新' }))
    await waitFor(() => expect(desktop.downloadUpdate).toHaveBeenCalledOnce())
    statusListener?.({ phase: 'downloaded', currentVersion: '3.0.0', version: '3.0.1', percent: 100 })
    fireEvent.click(await screen.findByRole('button', { name: '重启并安装' }))
    await waitFor(() => expect(desktop.installUpdate).toHaveBeenCalledOnce())
  })
})
