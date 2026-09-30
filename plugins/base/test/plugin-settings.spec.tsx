// @vitest-environment jsdom

import React, { type ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { PluginSettingsSection } from '../src/client/PluginSettingsSection.js'
import { translator } from './locale.js'

afterEach(() => {
  cleanup()
  delete document.body.dataset.zerowallFocusFileViewers
})

describe('plugin configuration shortcuts', () => {
  it('keeps only the Better Sidebar file viewer setting in Settings', () => {
    const onOpen = vi.fn()
    window.addEventListener('zerowall:open-settings', onOpen)
    render(<PluginSettingsSection {...({ t: translator() } as ComponentProps<typeof PluginSettingsSection>)} />)
    expect(screen.queryByRole('button', { name: /Free Search/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /File Review/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /侧边栏文件预览/ }))

    expect((onOpen.mock.calls[0]?.[0] as CustomEvent).detail).toBe('better-sidebar')
    expect(document.body.dataset.zerowallFocusFileViewers).toBe('true')
    window.removeEventListener('zerowall:open-settings', onOpen)
  })
})
