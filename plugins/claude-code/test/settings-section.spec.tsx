// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ClaudeCodeSettingsSection } from '../src/client/ClaudeCodeSettingsSection.js'
import type { ClaudeCodeSettingsApi, ClaudeCodeStatus } from '../src/shared/types.js'

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
})
