// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, act, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { zh, en } from '../../base/src/client/locales.js'
import { PythonEnvironmentPanel } from '../src/client/PythonEnvironmentPanel.js'
afterEach(cleanup)
vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
const info = (snapshotId: string, count: number) => ({ snapshotId, environmentVersion: snapshotId, version: '3.12.10', ready: true, packageCount: count, officialPackageCount: count, packages: Array.from({ length: count }, (_, i) => ({ name: `package-${String(i).padStart(3, '0')}`, version: '1.0', source: 'core' as const, health: 'locked' as const })) })
describe('Python dependency panel', () => {
  it('renders English controls and structured progress without Chinese backend messages', async () => {
    window.zerowallDesktop = {
      getMcpPythonInfo: async () => info('old', 131),
      getMcpEnvironmentStatus: async () => ({ phase: 'installing', message: '正在解压', activeEnvironment: { snapshotId: 'old' }, updateJob: { completedFiles: 128, totalFiles: 63655 } }),
    } as any
    const { container } = render(<PythonEnvironmentPanel t={((key: string) => en[key as keyof typeof en] ?? key) as any} />)
    await screen.findByText('131')
    expect(screen.getByLabelText('Search dependencies')).toBeTruthy()
    expect(container.textContent).not.toMatch(/\p{Script=Han}/u)
    fireEvent.click(screen.getAllByRole('button', { name: 'Details' })[0]!)
    expect(screen.getByRole('dialog', { name: 'Package details' })).toBeTruthy()
    expect(container.textContent).not.toMatch(/\p{Script=Han}/u)
  })
  it('refreshes a background generation and virtualizes the list without checking the feed on search', async () => {
    let listener: any; let current = info('1.3.0', 131)
    const check = vi.fn(); const load = vi.fn(async () => current)
    window.zerowallDesktop = { getMcpPythonInfo: load, checkMcpEnvironment: check, onMcpEnvironmentStatus: (cb: any) => { listener = cb; return () => {} } } as any
    render(<PythonEnvironmentPanel t={((key: string) => zh[key as keyof typeof zh] ?? key) as any} />)
    await screen.findByText('131'); expect(screen.getAllByRole('listitem').length).toBeLessThan(25)
    await act(async () => { current = info('1.4.0', 387); listener({ phase: 'ready', activeEnvironment: { snapshotId: '1.4.0', environmentVersion: '1.4.0' }, updated: true }) })
    await screen.findByText('387')
    fireEvent.change(screen.getByLabelText('搜索依赖'), { target: { value: 'package-300' } })
    expect(screen.getAllByRole('listitem')).toHaveLength(1); expect(check).not.toHaveBeenCalled()
    expect(screen.getByText('package-300')).toBeTruthy()
  })
  it('does not replace the new snapshot with an older in-flight response', async () => {
    let listener: any; let release!: (value: any) => void
    const load = vi.fn().mockImplementationOnce(() => new Promise(resolve => { release = resolve })).mockResolvedValue(info('new', 387))
    window.zerowallDesktop = { getMcpPythonInfo: load, onMcpEnvironmentStatus: (cb: any) => { listener = cb; return () => {} } } as any
    render(<PythonEnvironmentPanel t={((key: string) => zh[key as keyof typeof zh] ?? key) as any} />)
    await act(async () => listener({ phase: 'ready', activeEnvironment: { snapshotId: 'new', environmentVersion: '1.4.0' } }))
    await screen.findByText('387')
    await act(async () => release(info('old', 131)))
    await waitFor(() => expect(screen.queryByText('131')).toBeNull())
  })
})
