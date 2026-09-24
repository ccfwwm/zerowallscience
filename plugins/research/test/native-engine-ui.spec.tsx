// @vitest-environment jsdom
import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NativeEnginePanel } from '../src/client/native-engine-panel.js'

afterEach(cleanup)
const ok = (value: unknown) => ({ ok: true, value })
function fixture() {
  return {
    scienceViewer: vi.fn().mockResolvedValue(ok({ assets: [{ id: 'image', name: 'Image A', location: 'local', uri: 'file:///test.tif' }, { id: 'macro', name: 'Macro', location: 'local', uri: 'file:///test.ijm' }] })),
    listScientificEngineLaunches: vi.fn().mockResolvedValue(ok([])),
    launchScientificEngine: vi.fn().mockResolvedValue(ok({ message: '进程已启动；GUI 待检查。' })),
  }
}
it('launches only the selected registered image through the session RPC', async () => {
  const remote = fixture()
  render(<NativeEnginePanel remote={remote as any} sessionId="s1" />)
  await screen.findByRole('option', { name: 'Image A' })
  expect(screen.queryByRole('option', { name: 'Macro' })).toBeNull()
  fireEvent.change(screen.getByLabelText('图像资产'), { target: { value: 'image' } })
  fireEvent.click(screen.getByRole('button', { name: '打开 Fiji' }))
  await screen.findByText('进程已启动；GUI 待检查。')
  expect(remote.launchScientificEngine).toHaveBeenCalledWith({ sessionId: 's1', engine: 'fiji', assetId: 'image' })
})
it('shows RPC failure instead of declaring the native engine ready', async () => {
  const remote = fixture()
  remote.launchScientificEngine.mockResolvedValue({ ok: false, error: { code: 'VALIDATION', message: 'Engine missing' } })
  render(<NativeEnginePanel remote={remote as any} sessionId="s1" />)
  fireEvent.click(screen.getByRole('button', { name: '打开 napari' }))
  await screen.findByText(/Engine missing/)
  expect(screen.queryByText('进程已启动；GUI 待检查。')).toBeNull()
})
it('discards launch responses after switching to a different project session', async () => {
  const remote = fixture()
  let finish!: (value: unknown) => void
  remote.launchScientificEngine.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const view = render(<NativeEnginePanel remote={remote as any} sessionId="s1" />)
  fireEvent.click(screen.getByRole('button', { name: '打开 Fiji' }))
  view.rerender(<NativeEnginePanel remote={remote as any} sessionId="s2" />)
  finish(ok({ message: '旧项目启动成功' }))
  await waitFor(() => expect(remote.listScientificEngineLaunches).toHaveBeenCalledWith({ sessionId: 's2' }))
  expect(screen.queryByText('旧项目启动成功')).toBeNull()
})
