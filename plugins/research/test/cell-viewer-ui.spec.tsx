// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CellViewer } from '../src/client/cell-viewer.js'

beforeEach(() => { vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null) })
afterEach(() => { cleanup(); vi.restoreAllMocks() })
const viewer = { id: 'v1', assetId: 'a1', tool: 'cells', version: 1, state: { sourceSha256: 'sha', embedding: 'X_umap', cellLimit: 2000 } }
const preview = { summary: { encodingType: 'anndata', nObs: 4, nVars: 3, obsColumns: [{ name: 'condition', kind: 'string' }], varColumns: [], varNames: ['G1', 'G2', 'G3'], embeddings: [{ key: 'X_umap', dimensions: 2 }], backed: true }, embedding: { key: 'X_umap', dimensions: 2, points: [{ index: 0, x: 0, y: 1 }, { index: 1, x: 1, y: 0 }] }, cells: [{ index: 0, id: 'c1', obs: { condition: 'A' } }] }

it('opens a backed cell asset and renders its embedding', async () => {
  const scienceViewer = vi.fn(async input => input.action === 'list' ? { ok: true, value: { assets: [{ id: 'a1', name: 'cells.h5ad' }], viewers: [] } } : { ok: true, value: { cell: { preview, viewer } } })
  render(<CellViewer remote={{ scienceViewer } as any} sessionId="s1" />)
  fireEvent.change(await screen.findByLabelText('H5AD 数据资产'), { target: { value: 'a1' } })
  fireEvent.click(screen.getByRole('button', { name: '打开' }))
  await waitFor(() => expect(screen.getByRole('img', { name: 'X_umap scatter' })).toBeTruthy())
  expect(screen.getByText(/4 cells × 3 genes/)).toBeTruthy()
  expect(scienceViewer).toHaveBeenCalledWith(expect.objectContaining({ action: 'cell_open', assetId: 'a1', embeddingLimit: 100000 }))
  fireEvent.change(screen.getByLabelText('基因'), { target: { value: 'G2' } })
  fireEvent.click(screen.getByRole('button', { name: '刷新查看' }))
  await waitFor(() => expect(scienceViewer).toHaveBeenCalledWith(expect.objectContaining({ action: 'cell_read', viewerId: 'v1', expectedVersion: 1, gene: 'G2' })))
})

it('clears the previous plot when a replacement H5AD fails to open', async () => {
  const scienceViewer = vi.fn(async input => {
    if (input.action === 'list') return { ok: true, value: { assets: [{ id: 'a1', name: 'first.h5ad' }, { id: 'a2', name: 'new.h5ad' }], viewers: [] } }
    if (input.assetId === 'a2') return { ok: false, error: { message: 'Unreadable H5AD index' } }
    return { ok: true, value: { cell: { preview, viewer } } }
  })
  render(<CellViewer remote={{ scienceViewer } as any} sessionId="s1" viewOnly />)
  fireEvent.change(await screen.findByLabelText('H5AD 数据资产'), { target: { value: 'a1' } })
  await screen.findByRole('img', { name: 'X_umap scatter' })
  fireEvent.change(screen.getByLabelText('H5AD 数据资产'), { target: { value: 'a2' } })
  expect(screen.queryByRole('img', { name: 'X_umap scatter' })).toBeNull()
  await screen.findByText('打开失败')
  expect(screen.queryByRole('img', { name: 'X_umap scatter' })).toBeNull()
  expect(scienceViewer).toHaveBeenCalledWith(expect.objectContaining({ action: 'cell_open', assetId: 'a2' }))
})

it('ignores a late open result after choosing a different H5AD', async () => {
  let finishOld!: (value: unknown) => void
  const scienceViewer = vi.fn(async input => {
    if (input.action === 'list') return { ok: true, value: { assets: [{ id: 'a1', name: 'old.h5ad' }, { id: 'a2', name: 'new.h5ad' }], viewers: [] } }
    if (input.assetId === 'a1') return await new Promise(resolve => { finishOld = resolve })
    return { ok: true, value: { cell: { preview, viewer: { ...viewer, assetId: 'a2' } } } }
  })
  render(<CellViewer remote={{ scienceViewer } as any} sessionId="s1" viewOnly />)
  fireEvent.change(await screen.findByLabelText('H5AD 数据资产'), { target: { value: 'a1' } })
  await waitFor(() => expect(scienceViewer).toHaveBeenCalledWith(expect.objectContaining({ action: 'cell_open', assetId: 'a1' })))
  fireEvent.change(screen.getByLabelText('H5AD 数据资产'), { target: { value: 'a2' } })
  await screen.findByRole('img', { name: 'X_umap scatter' })
  finishOld({ ok: false, error: { message: 'Old file failed' } })
  await waitFor(() => expect(screen.queryByText(/Old file failed/u)).toBeNull())
  expect((screen.getByLabelText('H5AD 数据资产') as HTMLSelectElement).value).toBe('a2')
})

it('still draws a decimated embedding when WebGL is unavailable above the SVG ceiling', async () => {
  const points = Array.from({ length: 12000 }, (_, index) => ({ index, x: index % 100, y: (index * 7) % 100 }))
  const large = { ...preview, embedding: { key: 'X_umap', dimensions: 2, points } }
  const scienceViewer = vi.fn(async input => input.action === 'list' ? { ok: true, value: { assets: [{ id: 'a1', name: 'cells.h5ad' }], viewers: [] } } : { ok: true, value: { cell: { preview: large, viewer } } })
  render(<CellViewer remote={{ scienceViewer } as any} sessionId="s1" />)
  fireEvent.change(await screen.findByLabelText('H5AD 数据资产'), { target: { value: 'a1' } })
  fireEvent.click(screen.getByRole('button', { name: '打开' }))
  // Regression: the fallback used to stop at 10,000 points, so a WebGL-less machine
  // got an empty rectangle. It now strides through the list and says how many it drew.
  await waitFor(() => expect(screen.getByText(/SVG 回退按步长抽稀显示 4,000 \/ 12,000 点/)).toBeTruthy())
  const svg = screen.getByRole('img', { name: 'X_umap scatter' })
  expect(svg.querySelectorAll('circle').length).toBeGreaterThan(0)
})

it('maps letterboxed SVG clicks into embedding coordinates and exports the saved set', async () => {
  let version = 1
  const scienceViewer = vi.fn(async input => {
    if (input.action === 'list') return { ok: true, value: { assets: [{ id: 'a1', name: 'cells.h5ad', uri: 'file:///cells.h5ad' }], viewers: [] } }
    if (input.action === 'cell_select') return { ok: true, value: { cell: { preview, viewer: { ...viewer, version: ++version, state: { ...viewer.state, selection: input.cellSelection } }, selection: { geometry: input.cellSelection, count: 2, total: 4, previewIndices: [0,1], sample: [] } } } }
    return { ok: true, value: { cell: { preview, viewer: { ...viewer, version } } } }
  })
  render(<CellViewer remote={{ scienceViewer } as any} sessionId="s1" />)
  fireEvent.change(await screen.findByLabelText('H5AD 数据资产'), { target: { value: 'a1' } })
  fireEvent.click(screen.getByRole('button', { name: '打开' }))
  const svg = await screen.findByRole('img', { name: 'X_umap scatter' })
  svg.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 1040, bottom: 280, width: 1040, height: 280, toJSON() {} })
  fireEvent.click(screen.getByRole('button', { name: '绘制多边形选区' }))
  for (const [clientX, clientY] of [[284,24],[756,24],[756,256],[284,256]]) fireEvent.click(svg, { clientX, clientY })
  fireEvent.click(screen.getByRole('button', { name: '保存选区并核验全量细胞' }))
  await waitFor(() => expect(scienceViewer).toHaveBeenCalledWith(expect.objectContaining({ action: 'cell_select', viewerId: 'v1', expectedVersion: 1, cellSelection: { embedding: 'X_umap', axes: [0,1], polygon: [[0,1],[1,1],[1,0],[0,0]] } })))
  expect(await screen.findByText(/选区匹配全部 4 个细胞中的 2 个/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '导出选中细胞 CSV' }))
  await waitFor(() => expect(scienceViewer).toHaveBeenCalledWith(expect.objectContaining({ action: 'cell_export_selection', expectedVersion: 2 })))
})
