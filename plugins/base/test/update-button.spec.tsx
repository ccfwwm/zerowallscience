// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { UpdateButton } from '../src/client/UpdateButton.js'
import { translator } from './locale.js'

afterEach(() => { cleanup(); delete window.zerowallDesktop })

describe('update notifications', () => {
  it.each(['plugin', 'skill', 'mcp'] as const)('shows a %s update only in the sidebar and opens the Extension Center on click', async kind => {
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
    const trigger = await screen.findByRole('button', { name: translator()('update.resourcesVersionAvailable', { count: 1 }) })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByText('8.0.9')).toBeNull()
    expect(trigger.querySelector('i')).toBeTruthy()
    expect(downloadUpdate).not.toHaveBeenCalled()
    expect(installUpdate).not.toHaveBeenCalled()
    expect(startJob).not.toHaveBeenCalled()
    fireEvent.click(trigger)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect((onOpen.mock.calls[0]?.[0] as CustomEvent).detail).toBe('zerowall-extension-center')
    window.removeEventListener('zerowall:open-settings', onOpen)
  })
  it('opens when a desktop update arrives after initial status', async () => {
    let notify: (status: any) => void = () => {}
    let notifyResources: (status: any) => void = () => {}
    const downloadUpdate = vi.fn()
    window.zerowallDesktop = {
      getUpdateStatus: async () => ({ phase: 'idle', currentVersion: '8.0.9' }),
      onUpdateStatus: (listener: typeof notify) => { notify = listener; return () => {} }, downloadUpdate,
      getResourceUpdateStatus: async () => ({ phase: 'available', updateCount: 4, kinds: { plugin: 3, skill: 1 } }),
      onResourceUpdateStatus: (listener: typeof notifyResources) => { notifyResources = listener; return () => {} },
    } as any
    render(<UpdateButton wide={false} t={translator()} />)
    const trigger = await screen.findByRole('button', { name: translator()('update.resourcesVersionAvailable', { count: 4 }) })
    expect(trigger.querySelector('span')).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
    act(() => notify({ phase: 'available', currentVersion: '8.0.9', version: '8.1.0' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy())
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByRole('button', { name: translator()('update.viewResources') })).toBeTruthy()
    expect(downloadUpdate).not.toHaveBeenCalled()
    fireEvent.keyDown(window, { key: 'Escape' })
    act(() => notifyResources({ phase: 'available', updateCount: 5, kinds: { plugin: 3, skill: 2 } }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: translator()('update.newVersion') })).toBeTruthy()
    act(() => notify({ phase: 'upToDate', currentVersion: '8.1.0' }))
    expect(screen.getByRole('button', { name: translator()('update.resourcesVersionAvailable', { count: 5 }) })).toBeTruthy()
    act(() => notifyResources({ phase: 'upToDate', updateCount: 0, kinds: { plugin: 0, skill: 0 } }))
    expect(screen.getByRole('button', { name: translator()('update.trigger') }).querySelector('i')).toBeNull()
  })
})
