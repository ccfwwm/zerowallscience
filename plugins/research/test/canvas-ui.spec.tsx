// @vitest-environment jsdom
import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CanvasViewer } from '../src/client/canvas-viewer.js'
afterEach(() => { cleanup(); localStorage.clear() })
it('edits panels, ranges and colors, persists drafts and submits the edited project', async () => {
  const remote = { scienceViewer: vi.fn().mockResolvedValue({ ok: true, value: { canvas: { canvas: { svg: '<svg><text>rendered</text></svg>' } } } }) }
  const component = render(<CanvasViewer remote={remote as any} sessionId="canvas-test" />)
  fireEvent.click(screen.getByRole('button', { name: '添加面板' }))
  fireEvent.change(screen.getByLabelText('面板标题'), { target: { value: '' } })
  expect(screen.getByLabelText('面板标题')).toBeDefined()
  fireEvent.change(screen.getByLabelText('面板标题'), { target: { value: 'Validation cohort' } })
  fireEvent.change(screen.getByLabelText('系列1颜色'), { target: { value: '#ff0000' } })
  fireEvent.click(screen.getByLabelText('xRange自动'))
  fireEvent.change(screen.getByLabelText('xRange上限'), { target: { value: '10' } })
  fireEvent.click(screen.getByRole('button', { name: '预览 SVG' }))
  await screen.findByText('rendered')
  const request = remote.scienceViewer.mock.calls[0]![0] as any
  expect(request.canvas.spec.panels[0].title).toBe('Validation cohort')
  expect(request.canvas.spec.panels[0].xRange).toEqual([0, 10])
  expect(request.canvas.spec.panels[0].series[0].color).toBe('#ff0000')
  component.unmount()
  render(<CanvasViewer remote={remote as any} sessionId="canvas-test" />)
  expect((screen.getByLabelText('科研画布 JSON') as HTMLTextAreaElement).value).toContain('Validation cohort')
  fireEvent.change(screen.getByLabelText('当前面板'), { target: { value: '1' } })
  fireEvent.click(screen.getByRole('button', { name: '删除当前面板' }))
  await waitFor(() => expect(JSON.parse((screen.getByLabelText('科研画布 JSON') as HTMLTextAreaElement).value).panels).toEqual([]))
})
it('keeps invalid project JSON editable and displays Host rejection', async () => {
  const remote = { scienceViewer: vi.fn().mockResolvedValue({ ok: false, error: { message: 'source is not in project' } }) }
  render(<CanvasViewer remote={remote as any} sessionId="canvas-test" />)
  fireEvent.click(screen.getByRole('button', { name: '导出 SVG/PNG/PDF' }))
  await screen.findByText(/source is not in project/)
  fireEvent.change(screen.getByLabelText('科研画布 JSON'), { target: { value: '{' } })
  expect(screen.queryByLabelText('画布编辑器')).toBeNull()
  expect((screen.getByLabelText('科研画布 JSON') as HTMLTextAreaElement).value).toBe('{')
})

it('selects a registered project image and preserves explicit scale calibration on submission', async () => {
  const remote = { listDataAssets: vi.fn().mockResolvedValue({ ok: true, value: [] }), listArtifacts: vi.fn().mockResolvedValue({ ok: true, value: [{ id: 'result-png', name: 'HE overlay', mediaType: 'image/png', uri: 'file:///overlay.png' }] }), scienceViewer: vi.fn().mockResolvedValue({ ok: true, value: { canvas: { canvas: { svg: '<svg><text>image result</text></svg>' } } } }) }
  render(<CanvasViewer remote={remote as any} sessionId="canvas-image" projectId="p1" />)
  fireEvent.change(screen.getByLabelText('面板类型'), { target: { value: 'image' } })
  await screen.findByRole('option', { name: 'HE overlay · 产物' })
  fireEvent.change(screen.getByLabelText('项目图像'), { target: { value: 'artifact:result-png' } })
  fireEvent.click(screen.getByLabelText('显示比例尺'))
  fireEvent.change(screen.getByLabelText('标尺长度'), { target: { value: '25' } })
  fireEvent.change(screen.getByLabelText('每像素物理单位'), { target: { value: '0.5' } })
  fireEvent.change(screen.getByLabelText('标定来源'), { target: { value: 'Stage micrometer' } })
  fireEvent.click(screen.getByRole('button', { name: '预览 SVG' }))
  await screen.findByText('image result')
  expect(remote.scienceViewer.mock.calls[0]![0].canvas.spec.image).toEqual({ kind: 'artifact', id: 'result-png', scaleBar: { length: 25, unitsPerPixel: 0.5, unit: 'µm', calibrationSource: 'Stage micrometer' } })
})
