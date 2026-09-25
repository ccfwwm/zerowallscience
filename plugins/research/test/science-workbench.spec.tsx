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
    expect(document.querySelector('#science-panel-sequence')?.hasAttribute('hidden')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '返回科研工作台' }))
    fireEvent.click(screen.getByRole('button', { name: /序列\/Motif.*进入查看器/u }))
    expect(document.querySelector('#science-panel-sequence')?.hasAttribute('hidden')).toBe(false)
    view.unmount()
    render(<ScienceWorkbench {...props} />)
    await waitFor(() => expect(screen.getByRole('region', { name: '科研工具' })).toBeTruthy())
    expect(document.querySelector('#science-panel-sequence')?.hasAttribute('hidden')).toBe(true)
    expect(screen.queryByRole('tablist', { name: '专业工具标签' })).toBeNull()
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

  it('unwraps and deduplicates replayed workbench events', async () => {
    const { props } = fixture()
    let calls = 0
    ;(props.remote as any).scienceWorkbenchEvents = vi.fn().mockImplementation(async () => {
      calls += 1
      return ok({ protocol: 'science-workbench/1', sessionId: 's1', events: calls === 1 ? [{ protocol: 'science-workbench/1', eventId: 'e1', sequence: 1, sessionId: 's1', type: 'tab.open', tool: 'flow', payload: {}, createdAt: new Date().toISOString() }] : [], lastSequence: 20, hasMore: false })
    })
    render(<ScienceWorkbench {...props} />)
    await waitFor(() => expect(document.querySelector('#science-panel-flow')?.hasAttribute('hidden')).toBe(true))
    expect(screen.getByRole('region', { name: '科研工具' })).toBeTruthy()
    expect((props.remote as any).scienceWorkbenchEvents).toHaveBeenCalledWith({ sessionId: 's1', afterSequence: 0, limit: 100 })
  })
})
