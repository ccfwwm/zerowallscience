// @vitest-environment jsdom
import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ReadOnlyHeViewer, ReadOnlyImageViewer } from '../src/client/read-only-image-viewers.js'
import { BrainViewer } from '../src/client/brain-viewer.js'
import { ScientificEngineCenter } from '../src/client/scientific-engine-center.js'
import { WorkbenchSelectionContext } from '../src/client/workbench-selection.js'

afterEach(cleanup)
const ok = (value: unknown) => ({ ok: true, value })

it('opens the selected image and shows loaded state without analysis controls', async () => {
  const asset = { id: 'image-1', name: 'sample.png', uri: 'file:///project/sample.png' }
  const viewer = { id: 'viewer-1', assetId: asset.id, tool: 'image', version: 1, state: { page: 0, zoom: 1, panX: 0, panY: 0 } }
  const image = { sourceSha256: 'a'.repeat(64), coordinates: { width: 12, height: 8, pages: 1 }, format: 'png', channels: 3, depth: 'uchar', page: 0, previewWidth: 12, previewHeight: 8, pngBase64: 'AQID', notes: [] }
  const scienceViewer = vi.fn(async (input: { action: string }) => ok(input.action === 'list' ? { assets: [asset], viewers: [] } : { viewer, image }))
  render(<WorkbenchSelectionContext.Provider value={{ assetId: asset.id, revision: 1 }}><ReadOnlyImageViewer remote={{ scienceViewer } as any} sessionId="session-1" /></WorkbenchSelectionContext.Provider>)
  expect(await screen.findByRole('img', { name: 'sample.png' })).toHaveProperty('src', 'data:image/png;base64,AQID')
  expect(scienceViewer).toHaveBeenCalledWith(expect.objectContaining({ action: 'image_open', assetId: asset.id, sessionId: 'session-1' }))
  expect(screen.getByText('已加载')).toBeTruthy()
  expect(screen.queryByRole('button', { name: /ROI|分析|导出/u })).toBeNull()
})

it('reads the first bounded HE tile after opening a selected slide', async () => {
  const asset = { id: 'slide-1', name: 'slide.svs', uri: 'file:///project/slide.svs' }
  const viewer = { id: 'viewer-2', assetId: asset.id, tool: 'image', version: 1, state: { heTool: 'he' } }
  const he = { width: 8000, height: 6000, pages: 2, format: 'svs', engine: 'openslide', levels: [{ level: 0, downsample: 1 }, { level: 1, downsample: 4 }], notes: [] }
  const tile = { region: { x: 0, y: 0, width: 8000, height: 6000, page: 1 }, width: 2000, height: 1500, downsample: 4, coverageLevel0: { width: 8000, height: 6000 }, pngBase64: 'AQID' }
  const scienceViewer = vi.fn(async (input: { action: string }) => ok(input.action === 'list' ? { assets: [asset], viewers: [] } : { he: input.action === 'he_open' ? { he, viewer } : { tile, viewer } }))
  render(<WorkbenchSelectionContext.Provider value={{ assetId: asset.id, revision: 1 }}><ReadOnlyHeViewer remote={{ scienceViewer } as any} sessionId="session-1" /></WorkbenchSelectionContext.Provider>)
  await screen.findByRole('img', { name: 'slide.svs' })
  expect(scienceViewer).toHaveBeenCalledWith(expect.objectContaining({ action: 'he_open', assetId: asset.id }))
  expect(scienceViewer).toHaveBeenCalledWith(expect.objectContaining({ action: 'he_read', viewerId: viewer.id, region: { x: 0, y: 0, width: 8000, height: 6000, page: 1 } }))
  await waitFor(() => expect(screen.getByText('已加载')).toBeTruthy())
  expect(screen.queryByRole('button', { name: /ROI|分析|导出/u })).toBeNull()
})

it('opens BrainGlobe only on request and reads a slice only on request', async () => {
  const viewer = { id: 'brain-viewer', assetId: 'atlas-1', tool: 'brain', version: 1, state: {} }
  const summary = { atlas: 'allen_mouse_25um', species: 'Mus musculus', resolution: [25, 25, 25], shape: [2, 2, 2], regionCount: 1, version: '1' }
  const slice = { axis: 0, index: 0, downsample: 8, width: 2, height: 2, pngBase64: 'AQID' }
  const scienceViewer = vi.fn(async (input: { action: string }) => ok(
    input.action === 'brain_open' ? { brain: { viewer, summary } } :
      input.action === 'list' ? { assets: [], viewers: [] } :
        { brain: { viewer: { ...viewer, version: 2 }, slice } },
  ))
  const view = render(<BrainViewer remote={{ scienceViewer } as any} sessionId="session-1" viewOnly />)
  expect(screen.getByRole('button', { name: '打开脑图谱' })).toBeTruthy()
  expect(scienceViewer).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '打开脑图谱' }))
  await screen.findByText('allen_mouse_25um · Mus musculus · 25 × 25 × 25 µm')
  expect(scienceViewer.mock.calls.map(([input]) => input.action)).toEqual(['brain_open'])
  view.rerender(<BrainViewer remote={{ scienceViewer } as any} sessionId="session-1" viewOnly />)
  expect(scienceViewer.mock.calls.map(([input]) => input.action)).toEqual(['brain_open'])
  fireEvent.click(screen.getByRole('button', { name: '读取切片' }))
  await screen.findByRole('img', { name: '脑图谱切片 0' })
  expect(scienceViewer.mock.calls.map(([input]) => input.action)).toEqual(['brain_open', 'brain_analyze'])
})

it('keeps a retained BrainGlobe tab idle until the user opens it', async () => {
  const scienceViewer = vi.fn(async () => ok({ assets: [] }))
  const remote = { scienceViewer }
  const view = render(<BrainViewer remote={remote as any} sessionId="session-1" viewOnly active={false} />)
  await waitFor(() => expect(scienceViewer).not.toHaveBeenCalled())
  view.rerender(<BrainViewer remote={remote as any} sessionId="session-1" viewOnly active />)
  expect(screen.getByRole('button', { name: '打开脑图谱' })).toBeTruthy()
  expect(scienceViewer).not.toHaveBeenCalled()
})

it('shows shared scientific paths without offering configuration that its runner ignores', async () => {
  const python = 'C:\\Users\\scientist\\AppData\\Roaming\\zerowall-science\\Python\\python.exe'
  const ids = ['fiji', 'napari', 'brain-globe', 'he-python', 'he-stardist', 'remote-r'] as const
  const configs = ids.map(id => ({ id, enabled: true, source: 'default', status: 'unknown', ...(id === 'remote-r' ? { remoteEndpoint: 'http://rmcp.example/mcp' } : id === 'fiji' ? { installDirectory: 'C:\\Fiji' } : { pythonPath: python }) }))
  const remote = { getScientificEngineConfigs: vi.fn(async () => ok(configs)) }
  render(<ScientificEngineCenter remote={remote as any} sessionId="session-1" showLaunch={false} />)
  await waitFor(() => expect((screen.getByRole('textbox', { name: 'napari 路径' }) as HTMLInputElement).value).toBe(python))
  expect((screen.getByRole('textbox', { name: 'BrainGlobe 路径' }) as HTMLInputElement).readOnly).toBe(true)
  expect((screen.getByRole('textbox', { name: 'HE StarDist 路径' }) as HTMLInputElement).readOnly).toBe(true)
  expect((screen.getByRole('textbox', { name: '远程 R 路径' }) as HTMLInputElement).value).toBe('http://rmcp.example/mcp')
  expect(screen.getAllByRole('button', { name: '保存' })).toHaveLength(2)
})
