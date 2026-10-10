// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { UpdateButton } from '../src/client/UpdateButton.js'
import { translator } from './locale.js'

afterEach(() => { cleanup(); delete window.zerowallDesktop })

describe('update notifications', () => {
  it.each(['plugin', 'skill'] as const)('opens for a %s update and leaves installation to the user', async kind => {
    const downloadUpdate = vi.fn(), installUpdate = vi.fn(), startJob = vi.fn()
    window.zerowallDesktop = {
      getUpdateStatus: async () => ({ phase: 'upToDate', currentVersion: '8.1.0', version: '8.0.9' }),
      onUpdateStatus: () => () => {},
      getResourceUpdateStatus: async () => ({ phase: 'available', updateCount: 1, kinds: { [kind]: 1 } }),
      onResourceUpdateStatus: () => () => {}, downloadUpdate, installUpdate, resources: { startJob },
    } as any
    const onOpen = vi.fn()
    window.addEventListener('zerowall:open-settings', onOpen)
    render(<UpdateButton wide t={translator()} />)
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy())
    expect(screen.getByRole('status')).toBeTruthy()
    expect(screen.queryByText('8.0.9')).toBeNull()
    expect(screen.getByRole('dialog').querySelector('[data-phase="available"]')).toBeTruthy()
    expect(downloadUpdate).not.toHaveBeenCalled()
    expect(installUpdate).not.toHaveBeenCalled()
    expect(startJob).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: translator()('update.viewResources') }))
    expect((onOpen.mock.calls[0]?.[0] as CustomEvent).detail).toBe('zerowall-extension-center')
    window.removeEventListener('zerowall:open-settings', onOpen)
  })
  it('opens when a desktop update arrives after initial status', async () => {
    let notify: (status: any) => void = () => {}
    const downloadUpdate = vi.fn()
    window.zerowallDesktop = {
      getUpdateStatus: async () => ({ phase: 'idle', currentVersion: '8.0.9' }),
      onUpdateStatus: (listener: typeof notify) => { notify = listener; return () => {} }, downloadUpdate,
    } as any
    render(<UpdateButton wide t={translator()} />)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    act(() => notify({ phase: 'available', currentVersion: '8.0.9', version: '8.1.0' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy())
    expect(downloadUpdate).not.toHaveBeenCalled()
  })
})
