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
    fireEvent.click(screen.getByRole('button', { name: '选择文件' }))
    await waitFor(() => expect(remote.importLocalAsset).toHaveBeenCalledExactlyOnceWith({ sessionId: 's1', sourcePath: 'C:/outside/sample.fasta' }))
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Motif 序列工作台' }).getAttribute('aria-selected')).toBe('true'))
    expect(await screen.findByRole('status')).toHaveProperty('textContent', expect.stringContaining('sample.fasta'))
  })

  it.each([
    ['sample.png', 'image_open', 'ImageJ'],
    ['slide.svs', 'he_open', 'HE 查看器'],
  ] as const)('imports %s, refreshes its assets and opens it with %s', async (name, action, tabName) => {
    const { remote, props } = fixture()
    const sourcePath = `C:/outside/${name}`
    const asset = { id: 'asset-picked', name, uri: `file:///C:/project/.zerowall/imports/${name}`, mediaType: name.endsWith('.svs') ? 'image/tiff' : 'image/png' }
    remote.importLocalAsset = vi.fn().mockResolvedValue(ok(asset))
    remote.scienceViewer = vi.fn(async input => input.action === 'list' ? ok({ assets: [asset], viewers: [] }) : ok({}))
    Object.defineProperty(window, 'zerowallDesktop', { configurable: true, value: { chooseScienceFile: vi.fn().mockResolvedValue(sourcePath) } })
    render(<ScienceWorkbench {...props} />)
    await screen.findByText('研究 a')
    fireEvent.click(screen.getByRole('button', { name: '选择文件' }))
    await waitFor(() => expect(remote.importLocalAsset).toHaveBeenCalledExactlyOnceWith({ sessionId: 's1', sourcePath }))
    await waitFor(() => expect(screen.getByRole('tab', { name: tabName }).getAttribute('aria-selected')).toBe('true'))
    await waitFor(() => expect(remote.scienceViewer).toHaveBeenCalledWith(expect.objectContaining({ action, assetId: 'asset-picked', sessionId: 's1' })))
  })

  it('opens only selected tool panels, retains them across tab switches and restores per session', async () => {
    const { props } = fixture()
    props.remote.scienceViewer = vi.fn().mockResolvedValue(ok({ assets: [], viewers: [] }))
    const view = render(<ScienceWorkbench {...props} />)
    await screen.findByText('研究 a')
    fireEvent.click(screen.getByRole('tab', { name: 'Motif 序列工作台' }))
    await screen.findByLabelText('序列资产')
    const initialCalls = props.remote.scienceViewer.mock.calls.length
    fireEvent.click(screen.getByRole('tab', { name: '流式细胞' }))
    expect(screen.getByRole('tab', { name: '流式细胞' }).getAttribute('aria-selected')).toBe('true')
    expect(document.querySelector('#science-panel-sequence')?.hasAttribute('hidden')).toBe(true)
    fireEvent.click(screen.getByRole('tab', { name: 'Motif 序列工作台' }))
    expect(props.remote.scienceViewer.mock.calls.length).toBe(initialCalls + 1)
    view.unmount()
    render(<ScienceWorkbench {...props} />)
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Motif 序列工作台' }).getAttribute('aria-selected')).toBe('true'))
    expect(screen.getAllByRole('tab')).toHaveLength(10)
  })
  it('registers an ordinary workspace explicitly without requiring a research protocol', async () => {
    const { remote, props } = fixture()
    remote.projectForSession.mockResolvedValueOnce(ok(undefined))
    const registerSessionProject = vi.fn().mockResolvedValue(ok({ id: 'p1' }))
    render(<ScienceWorkbench {...props} remote={{ ...remote, registerSessionProject }} />)
    fireEvent.click(await screen.findByRole('button', { name: '登记当前工作区' }))
    await screen.findByText('研究 a')
    expect(registerSessionProject).toHaveBeenCalledExactlyOnceWith({ sessionId: 's1' })
    expect(screen.queryByRole('button', { name: '登记当前工作区' })).toBeNull()
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
  it('keeps review rationale empty and surfaces host gate rejection', async () => {
    const { remote, props } = fixture()
    render(<ScienceWorkbench {...props} />)
    await screen.findByText('研究 a')
    // Research pages are sidebar cards of the 主页 tab since the shell rebuild. Scoped to
    // the sidebar nav because the 继续研究 panel links to the same pages by plain label.
    const researchPages = screen.getByRole('navigation', { name: '研究页面' })
    fireEvent.click(within(researchPages).getByRole('button', { name: /^研究计划/ }))
    expect((screen.getByLabelText('人工审阅理由') as HTMLTextAreaElement).value).toBe('')
    fireEvent.change(screen.getByLabelText('人工审阅理由'), { target: { value: '检查后发现计划不完整' } })
    fireEvent.click(screen.getByRole('button', { name: '人工批准门禁一' }))
    await waitFor(() => expect(remote.approveResearchGate).toHaveBeenCalledWith(expect.objectContaining({ expectedVersion: 8, rationale: '检查后发现计划不完整' })))
    expect(await screen.findByRole('status')).toHaveProperty('textContent', expect.stringContaining('Current plan is incomplete'))
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

  it('sends a current-tool request through the conversation bridge', async () => {
    const { props } = fixture()
    props.remote.scienceViewer = vi.fn().mockResolvedValue(ok({ assets: [], viewers: [] }))
    const onSendMessage = vi.fn().mockResolvedValue(undefined)
    render(<ScienceWorkbench {...props} onSendMessage={onSendMessage} />)
    await screen.findByText('研究 a')
    fireEvent.click(screen.getByRole('tab', { name: 'ImageJ' }))
    const input = screen.getByLabelText('工具助手消息')
    fireEvent.change(input, { target: { value: '打开这张 TIFF' } })
    fireEvent.click(screen.getByRole('button', { name: '发送到对话' }))
    await waitFor(() => expect(onSendMessage).toHaveBeenCalledWith('打开这张 TIFF'))
  })

  it('unwraps and deduplicates replayed workbench events', async () => {
    const { props } = fixture()
    let calls = 0
    ;(props.remote as any).scienceWorkbenchEvents = vi.fn().mockImplementation(async () => {
      calls += 1
      return ok({ protocol: 'science-workbench/1', sessionId: 's1', events: calls === 1 ? [{ protocol: 'science-workbench/1', eventId: 'e1', sequence: 1, sessionId: 's1', type: 'tab.open', tool: 'flow', payload: {}, createdAt: new Date().toISOString() }] : [], lastSequence: 20, hasMore: false })
    })
    render(<ScienceWorkbench {...props} />)
    await waitFor(() => expect(screen.getByRole('tab', { name: '流式细胞' }).getAttribute('aria-selected')).toBe('true'))
    expect((props.remote as any).scienceWorkbenchEvents).toHaveBeenCalledWith({ sessionId: 's1', afterSequence: 0, limit: 100 })
  })
})
