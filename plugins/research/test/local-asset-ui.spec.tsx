// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { LocalAssetPanel } from '../src/client/local-asset-panel.js'
afterEach(cleanup)
it('registers through the session-scoped Host and displays the result without creating a study', async () => {
  const registerLocalAsset = vi.fn().mockResolvedValue({ ok: true, value: { name: 'example.gbk' } })
  render(<LocalAssetPanel remote={{ registerLocalAsset } as any} sessionId="s1" />)
  fireEvent.change(screen.getByLabelText('科研文件路径'), { target: { value: 'data/example.gbk' } })
  fireEvent.click(screen.getByRole('button', { name: '登记文件资产' }))
  expect((await screen.findByRole('status')).textContent).toContain('已登记 example.gbk')
  expect(registerLocalAsset).toHaveBeenCalledExactlyOnceWith({ sessionId: 's1', path: 'data/example.gbk' })
})
