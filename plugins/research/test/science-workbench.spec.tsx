// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ScienceWorkbench } from '../src/client/view.js'
import { scienceToolForImportedPath } from '../src/client/imported-science-file.js'

afterEach(() => { cleanup(); localStorage.clear() })
const ok = (value: unknown) => ({ ok: true, value })
const study = (id: string) => ({ id, projectId: 'p1', title: `研究 ${id}`, phase: 'planning', status: 'active', gate1: 'pending', gate2: 'pending', version: 8 })
function fixture() {
  const remote = {
    projectForSession: vi.fn().mockResolvedValue(ok({ id: 'p1' })),
    listResearchStudies: vi.fn().mockResolvedValue(ok([study('a'), study('b')])),
    getActiveResearchStudy: vi.fn().mockResolvedValue(ok(study('a'))),
    getResearchStudySnapshot: vi.fn(async id => ok({ study: study(id), documents: [], freezes: [] })),
    probeScientificEngines: vi.fn().mockResolvedValue(ok([])),
    setActiveResearchStudy: vi.fn().mockResolvedValue(ok(study('b'))),
    approveResearchGate: vi.fn().mockResolvedValue({ ok: false, error: { code: 'VALIDATION', message: 'Current plan is incomplete' } }),
  }
  return { remote, props: { remote, scope: { sessionId: 's1', cwd: 'C:/p1' }, tab: {}, visible: true } as any }
}

describe('Science 7 workbench', () => {
  it('routes imported microscopy, sequence, Sanger and molecule files to their matching tools', () => {
    expect(scienceToolForImportedPath('slide.svs')).toBe('he')
    expect(scienceToolForImportedPath('image.tiff')).toBe('imagej')
    expect(scienceToolForImportedPath('slide.tiff', 'he')).toBe('he')
    expect(scienceToolForImportedPath('sequence.gbk')).toBe('sequence')
    expect(scienceToolForImportedPath('trace.ab1')).toBe('sanger')
    expect(scienceToolForImportedPath('structure.cif')).toBe('molecule')
    expect(scienceToolForImportedPath('unsupported.bin')).toBeUndefined()
  })

  it('imports a project-external file and selects it in its viewer', async () => {
    const { remote, props } = fixture()
    remote.importLocalAsset = vi.fn().mockResolvedValue(ok({ id: 'asset-1', name: 'sample.fasta' }))
    remote.scienceViewer = vi.fn().mockResolvedValue(ok({ assets: [], viewers: [] }))
    Object.defineProperty(window, 'zerowallDesktop', { configurable: true, value: { chooseScienceFile: vi.fn().mockResolvedValue('C:/outside/sample.fasta') } })
    render(<ScienceWorkbench {...props} />)
    await screen.findByText('研究 a')
    fireEvent.click(screen.getByRole('button', { name: /序列\/Motif.*进入查看器/u }))
    fireEvent.click(screen.getByRole('button', { name: '选择文件' }))
    await waitFor(() => expect(remote.importLocalAsset).toHaveBeenCalledExactlyOnceWith({ sessionId: 's1', sourcePath: 'C:/outside/sample.fasta' }))
    await waitFor(() => expect(document.querySelector('#science-panel-sequence')?.hasAttribute('hidden')).toBe(false))
    expect(screen.getAllByRole('status').some(status => status.textContent?.includes('sample.fasta'))).toBe(true)
  })

  it.each([
    ['sample.png', 'image_open', 'ImageJ'],
    ['slide.svs', 'he_open', 'HE 切片'],
  ] as const)('imports %s, refreshes its assets and opens it with %s', async (name, action, tabName) => {
    const { remote, props } = fixture()
    const sourcePath = `C:/outside/${name}`
    const asset = { id: 'asset-picked', name, uri: `file:///C:/project/.zerowall/imports/${name}`, mediaType: name.endsWith('.svs') ? 'image/tiff' : 'image/png' }
    remote.importLocalAsset = vi.fn().mockResolvedValue(ok(asset))
    remote.scienceViewer = vi.fn(async input => input.action === 'list' ? ok({ assets: [asset], viewers: [] }) : ok({}))
    Object.defineProperty(window, 'zerowallDesktop', { configurable: true, value: { chooseScienceFile: vi.fn().mockResolvedValue(sourcePath) } })
    render(<ScienceWorkbench {...props} />)
    await screen.findByText('研究 a')
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`${tabName}.*进入查看器`, 'u') }))
    fireEvent.click(screen.getByRole('button', { name: '选择文件' }))
    await waitFor(() => expect(remote.importLocalAsset).toHaveBeenCalledExactlyOnceWith({ sessionId: 's1', sourcePath }))
    await waitFor(() => expect(document.querySelector(`#science-panel-${name.endsWith('.svs') ? 'he' : 'imagej'}`)?.hasAttribute('hidden')).toBe(false))
    await waitFor(() => expect(remote.scienceViewer).toHaveBeenCalledWith(expect.objectContaining({ action, assetId: 'asset-picked', sessionId: 's1' })))
  })

  it('imports a new H5AD while the cell viewer is open and replaces the displayed file', async () => {
    const { remote, props } = fixture()
    const first = { id: 'cells-first', name: 'first.h5ad', uri: 'file:///C:/project/.zerowall/imports/first.h5ad', mediaType: 'application/x-h5ad' }
    const second = { id: 'cells-second', name: 'second.h5ad', uri: 'file:///C:/project/.zerowall/imports/second.h5ad', mediaType: 'application/x-h5ad' }
    const assets = [first, second]
    const chooseScienceFile = vi.fn().mockResolvedValueOnce('C:/outside/first.h5ad').mockResolvedValueOnce('C:/outside/second.h5ad')
    remote.importLocalAsset = vi.fn(async ({ sourcePath }) => ok(sourcePath.includes('first') ? first : second))
    const preview = (count: number) => ({
      summary: { encodingType: 'anndata', nObs: count, nVars: 2, obsColumns: [], varColumns: [], varNames: ['G1', 'G2'], embeddings: [{ key: 'X_umap', dimensions: 2 }], backed: true },
      embedding: { key: 'X_umap', dimensions: 2, points: [{ index: 0, x: 0, y: 1 }, { index: 1, x: 1, y: 0 }] },
      cells: [],
    })
    remote.scienceViewer = vi.fn(async input => {
      if (input.action === 'list') return ok({ assets, viewers: [] })
      if (input.action === 'cell_open') {
        const asset = assets.find(item => item.id === input.assetId)!
        const count = asset.id === first.id ? 4 : 8
        return ok({ cell: { preview: preview(count), viewer: { id: `viewer-${asset.id}`, assetId: asset.id, tool: 'cells', version: 1, state: { embedding: 'X_umap' } } } })
      }
      return ok({})
    })
    Object.defineProperty(window, 'zerowallDesktop', { configurable: true, value: { chooseScienceFile } })
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    render(<ScienceWorkbench {...props} />)
    await screen.findByText('研究 a')
    fireEvent.click(screen.getByRole('button', { name: /细胞查看器.*进入查看器/u }))
    fireEvent.click(screen.getByRole('button', { name: '选择文件' }))
    await waitFor(() => expect(remote.importLocalAsset).toHaveBeenCalledExactlyOnceWith({ sessionId: 's1', sourcePath: 'C:/outside/first.h5ad' }))
    await waitFor(() => expect(remote.scienceViewer).toHaveBeenCalledWith(expect.objectContaining({ action: 'cell_open', assetId: 'cells-first', sessionId: 's1' })))
    await screen.findByText(/4 cells × 2 genes/u)
    fireEvent.click(screen.getByRole('button', { name: '更换文件' }))
    await waitFor(() => expect(remote.importLocalAsset).toHaveBeenCalledTimes(2))
    await screen.findByText(/8 cells × 2 genes/u)
    expect(remote.scienceViewer).toHaveBeenCalledWith(expect.objectContaining({ action: 'cell_open', assetId: 'cells-first', sessionId: 's1' }))
    expect(remote.scienceViewer).toHaveBeenCalledWith(expect.objectContaining({ action: 'cell_open', assetId: 'cells-second', sessionId: 's1' }))
    expect((screen.getByLabelText('H5AD 数据资产') as HTMLSelectElement).value).toBe('cells-second')
    vi.restoreAllMocks()
  })

  it('uses one central file picker for every viewer', async () => {
    const { remote, props } = fixture()
    remote.importLocalAsset = vi.fn().mockResolvedValue(ok({ id: 'image-asset', name: 'sample.png' }))
    remote.scienceViewer = vi.fn().mockResolvedValue(ok({ assets: [], viewers: [] }))
    const chooseScienceFile = vi.fn().mockResolvedValue('C:/outside/sample.png')
    Object.defineProperty(window, 'zerowallDesktop', { configurable: true, value: { chooseScienceFile } })
    render(<ScienceWorkbench {...props} />)
    await screen.findByText('研究 a')
    fireEvent.click(screen.getByRole('button', { name: /ImageJ 图像.*进入查看器/u }))
    fireEvent.click(screen.getByRole('button', { name: '选择文件' }))
    await waitFor(() => expect(chooseScienceFile).toHaveBeenCalledOnce())
    await waitFor(() => expect(remote.importLocalAsset).toHaveBeenCalledExactlyOnceWith({ sessionId: 's1', sourcePath: 'C:/outside/sample.png' }))
    expect(screen.queryByRole('button', { name: '选择 Zarr 目录' })).toBeNull()
  })

  it('opens only selected tool panels and returns to the card home on a fresh mount', async () => {
    const { props } = fixture()
    props.remote.scienceViewer = vi.fn().mockResolvedValue(ok({ assets: [], viewers: [] }))
    const view = render(<ScienceWorkbench {...props} />)
    await screen.findByText('研究 a')
    fireEvent.click(screen.getByRole('button', { name: /序列\/Motif.*进入查看器/u }))
    await screen.findByRole('button', { name: '选择文件' })
    fireEvent.click(screen.getByRole('button', { name: '返回科研工作台' }))
    fireEvent.click(screen.getByRole('button', { name: /流式细胞.*进入查看器/u }))
    expect(document.querySelector('#science-panel-flow')?.hasAttribute('hidden')).toBe(false)
    expect(document.querySelector('#science-panel-sequence')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '返回科研工作台' }))
    fireEvent.click(screen.getByRole('button', { name: /序列\/Motif.*进入查看器/u }))
    expect(document.querySelector('#science-panel-sequence')?.hasAttribute('hidden')).toBe(false)
    view.unmount()
    render(<ScienceWorkbench {...props} />)
    await waitFor(() => expect(screen.getByRole('region', { name: '科研工具' })).toBeTruthy())
    expect(document.querySelector('#science-panel-sequence')).toBeNull()
    expect(screen.queryByRole('tablist', { name: '专业工具标签' })).toBeNull()
  })
  it('does not revive a loaded brain atlas after returning to the cards', async () => {
    const { props } = fixture()
    const viewer = { id: 'atlas-viewer', assetId: 'atlas-asset', version: 1, state: {} }
    const summary = { atlas: 'allen_mouse_25um', species: 'Mus musculus', resolution: [25, 25, 25] }
    props.remote.scienceViewer = vi.fn(async input => ok(input.action === 'brain_open' ? { brain: { viewer, summary } } : { assets: [], viewers: [] }))
    render(<ScienceWorkbench {...props} />)
    await screen.findByText('研究 a')
    fireEvent.click(screen.getByRole('button', { name: /脑图谱.*进入查看器/u }))
    expect(props.remote.scienceViewer).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '打开脑图谱' }))
    await screen.findByText(/allen_mouse_25um · Mus musculus/u)
    fireEvent.click(screen.getByRole('button', { name: '返回科研工作台' }))
    fireEvent.click(screen.getByRole('button', { name: /脑图谱.*进入查看器/u }))
    expect(screen.getByRole('button', { name: '打开脑图谱' })).toBeTruthy()
    expect(screen.queryByText(/allen_mouse_25um · Mus musculus/u)).toBeNull()
    expect(props.remote.scienceViewer.mock.calls.map(([input]) => input.action)).toEqual(['brain_open'])
  })
  it('registers an ordinary workspace explicitly without requiring a research protocol', async () => {
    const { remote, props } = fixture()
    remote.projectForSession.mockResolvedValueOnce(ok(undefined))
    const registerSessionProject = vi.fn().mockResolvedValue(ok({ id: 'p1' }))
    render(<ScienceWorkbench {...props} remote={{ ...remote, registerSessionProject }} />)
    fireEvent.click(screen.getByRole('button', { name: /ImageJ 图像.*进入查看器/u }))
    await waitFor(() => expect(registerSessionProject).toHaveBeenCalledExactlyOnceWith({ sessionId: 's1' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: '登记当前工作区' })).toBeNull())
  })
  it('loads the session project and persists explicit study selection', async () => {
    const { remote, props } = fixture()
    render(<ScienceWorkbench {...props} />)
    await screen.findByText('研究 a')
    expect(remote.projectForSession).toHaveBeenCalledWith({ sessionId: 's1' })
    fireEvent.change(screen.getByLabelText('切换研究'), { target: { value: 'b' } })
    await waitFor(() => expect(remote.setActiveResearchStudy).toHaveBeenCalledWith({ sessionId: 's1', studyId: 'b' }))
    await screen.findByText('研究 b')
  })
  it('shows nine image cards without research operations on the home screen', async () => {
    const { props } = fixture()
    render(<ScienceWorkbench {...props} />)
    const home = screen.getByRole('region', { name: '科研工具' })
    expect(within(home).getAllByRole('button')).toHaveLength(9)
    expect(home.querySelectorAll('img')).toHaveLength(9)
    expect(screen.queryByRole('navigation', { name: '研究页面' })).toBeNull()
    expect(screen.queryByRole('button', { name: '人工批准门禁一' })).toBeNull()
  })
  it('discards late responses from the previous session', async () => {
    const { remote, props } = fixture()
    let resolveOld!: (value: unknown) => void
    remote.projectForSession.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve }))
    const view = render(<ScienceWorkbench {...props} />)
    view.rerender(<ScienceWorkbench {...props} scope={{ sessionId: 's2', cwd: 'C:/p2' }} />)
    await screen.findByText('研究 a')
    remote.listResearchStudies.mockResolvedValueOnce(ok([{ ...study('old'), title: '旧会话结果' }]))
    resolveOld(ok({ id: 'old-project' }))
    await waitFor(() => expect(remote.listResearchStudies).toHaveBeenCalledWith('old-project'))
    expect(screen.queryByText('旧会话结果')).toBeNull()
    expect(screen.getByText('研究 a')).toBeTruthy()
  })

  it('keeps conversation controls out of the default viewer', async () => {
    const { props } = fixture()
    props.remote.scienceViewer = vi.fn().mockResolvedValue(ok({ assets: [], viewers: [] }))
    const onSendMessage = vi.fn().mockResolvedValue(undefined)
    render(<ScienceWorkbench {...props} onSendMessage={onSendMessage} />)
    await screen.findByText('研究 a')
    fireEvent.click(screen.getByRole('button', { name: /ImageJ.*进入查看器/u }))
    expect(screen.queryByRole('button', { name: '发送到对话' })).toBeNull()
    expect(onSendMessage).not.toHaveBeenCalled()
  })

  it('ignores saved tool selections and historic workbench events', async () => {
    const { props } = fixture()
    localStorage.setItem('zerowall:science-tools:s1', JSON.stringify({ opened: ['flow', 'brainglobe'], active: 'brainglobe' }))
    ;(props.remote as any).scienceWorkbenchEvents = vi.fn().mockResolvedValue(ok({ events: [{ type: 'tab.open', tool: 'flow' }] }))
    props.remote.scienceViewer = vi.fn().mockResolvedValue(ok({ assets: [], viewers: [] }))
    render(<ScienceWorkbench {...props} />)
    await screen.findByText('研究 a')
    expect(screen.getByRole('region', { name: '科研工具' })).toBeTruthy()
    expect(document.querySelector('#science-panel-flow')).toBeNull()
    expect(document.querySelector('#science-panel-brainglobe')).toBeNull()
    expect((props.remote as any).scienceWorkbenchEvents).not.toHaveBeenCalled()
    expect(props.remote.scienceViewer).not.toHaveBeenCalled()
  })
  it('never converts workbench events from any tool into viewer navigation', async () => {
    const { props } = fixture()
    const scienceViewer = vi.fn().mockResolvedValue(ok({ assets: [], viewers: [] }))
    props.remote.scienceViewer = scienceViewer
    ;(props.remote as any).scienceWorkbenchEvents = vi.fn().mockResolvedValue(ok({ events: [
      { eventId: 'old', sequence: 1, type: 'tab.open', tool: 'brainglobe' },
      { eventId: 'live', sequence: 2, type: 'asset.selected', tool: 'imagej', assetId: 'atlas-asset' },
    ] }))
    render(<ScienceWorkbench {...props} />)
    await screen.findByText('研究 a')
    expect(screen.getByRole('region', { name: '科研工具' })).toBeTruthy()
    expect(document.querySelector('#science-panel-brainglobe')).toBeNull()
    expect(document.querySelector('#science-panel-imagej')).toBeNull()
    expect((props.remote as any).scienceWorkbenchEvents).not.toHaveBeenCalled()
    expect(scienceViewer).not.toHaveBeenCalled()
  })
})
