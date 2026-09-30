// @vitest-environment jsdom

import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { GithubButton } from '../src/client/GithubButton.js'
import { WechatStatusButton } from '../src/client/WechatStatusButton.js'
import { translator } from './locale.js'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('sidebar footer actions', () => {
  it('keeps GitHub as a real link without a connection status dot', () => {
    render(<GithubButton wide t={translator()} />)
    const github = screen.getByRole('link', { name: 'GitHub 项目' })

    expect(github.getAttribute('href')).toBe('https://github.com/ccfwwm/zerowallscience')
    expect(github.getAttribute('data-zerowall-footer-action')).not.toBeNull()
    expect(github.querySelector('[data-zerowall-footer-status-dot]')).toBeNull()
  })

  it.each([
    [{ phase: 'logged-in', monitorRunning: true }, 'online', '已连接'],
    [{ phase: 'waiting-qr' }, 'waiting', '等待确认'],
    [{ phase: 'logged-out' }, 'offline', '未连接'],
  ] as const)('shows a WeChat status dot for %s', async (response, connection, accessibleStatus) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => response }))
    render(<WechatStatusButton wide t={translator()} />)
    const wechat = screen.getByRole('button', { name: /微信 WebChat/ })

    await waitFor(() => expect(wechat.getAttribute('data-connection')).toBe(connection))
    expect(wechat.getAttribute('aria-label')).toBe(`微信 WebChat · ${accessibleStatus}`)
    expect(wechat.querySelector('[data-zerowall-footer-status-dot]')).not.toBeNull()
    expect(wechat.getAttribute('data-zerowall-footer-action')).not.toBeNull()
  })

  it('opens the WeChat settings when its status action is clicked', () => {
    const onOpen = vi.fn()
    window.addEventListener('zerowall:open-settings', onOpen)
    render(<WechatStatusButton wide t={translator()} />)
    fireEvent.click(screen.getByRole('button', { name: '微信 WebChat · 未连接' }))

    expect(onOpen).toHaveBeenCalledOnce()
    expect((onOpen.mock.calls[0]?.[0] as CustomEvent).detail).toBe('wechat')
    window.removeEventListener('zerowall:open-settings', onOpen)
  })
})
