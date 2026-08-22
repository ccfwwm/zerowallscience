// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ResearchWorkbenchButton } from '../src/client/ResearchWorkbenchButton.js'
import { translator } from '../../base/test/locale.js'

afterEach(() => cleanup())
const empty = { contexts: [], assets: [], runs: [], artifacts: [], papers: [], decisions: [], edges: [], publications: [], presentations: [] }
function props() { return {
  wide: true,
  t: translator(),
  listProjects: vi.fn().mockResolvedValue([{ id: 'p1', name: 'Genome', rootPath: 'C:/genome' }]),
  load: vi.fn().mockResolvedValue({ ...empty, assets: [{ id: 'a1', name: 'Samples', uri: 'file:///samples.xlsx', mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }] }),
  createExecutionContext: vi.fn(), probeExecutionContext: vi.fn().mockResolvedValue({ ok: true, message: 'ok' }),
  submitRun: vi.fn(), cancelRun: vi.fn(), pauseRun: vi.fn(), resumeRun: vi.fn(), readRunLog: vi.fn().mockResolvedValue(''), harvestRun: vi.fn(),
  createDataAsset: vi.fn(), createArtifact: vi.fn(), createPaper: vi.fn(), createDecision: vi.fn(), createEdge: vi.fn(),
  createPublication: vi.fn(), freezePublication: vi.fn(), validatePublication: vi.fn(), reproducePublication: vi.fn(), exportPublication: vi.fn(),
  createPresentation: vi.fn(), updatePresentation: vi.fn(), generatePresentation: vi.fn(), pausePresentation: vi.fn(), resumePresentation: vi.fn(), cancelPresentation: vi.fn(), exportPresentation: vi.fn(), previewFile: vi.fn(),
} }

describe('Research workbench', () => {
  it('loads project research views and classifies scientific preview formats', async () => {
    const actions = props(); render(<ResearchWorkbenchButton {...actions} />)
    fireEvent.click(screen.getByRole('button', { name: '科研工作台' }))
    await waitFor(() => expect(actions.load).toHaveBeenCalledWith('p1'))
    fireEvent.click(screen.getByRole('button', { name: /数据资产/ }))
    expect(screen.getByText('Samples')).toBeTruthy()
    expect(screen.getByText('TABLE')).toBeTruthy()
  })

  it('closes immediately on one window Escape press', () => {
    render(<ResearchWorkbenchButton {...props()} />)
    fireEvent.click(screen.getByRole('button', { name: '科研工作台' }))
    expect(screen.getByRole('dialog', { name: '科研工作台' })).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: '科研工作台' })).toBeNull()
  })

  it('uses one Escape press for only the topmost file preview', async () => {
    const actions = props()
    actions.previewFile.mockResolvedValue({ uri: 'file:///samples.xlsx', mediaType: 'text/csv', byteSize: 8, base64: btoa('a,b\n1,2') })
    render(<ResearchWorkbenchButton {...actions} />)
    fireEvent.click(screen.getByRole('button', { name: '科研工作台' }))
    await waitFor(() => expect(actions.load).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: /数据资产/ }))
    fireEvent.click(screen.getByRole('button', { name: '预览' }))
    await waitFor(() => expect(screen.getByText(/a,b/)).toBeTruthy())
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByText(/a,b/)).toBeNull()
    expect(screen.getByRole('dialog', { name: '科研工作台' })).toBeTruthy()
  })

  it('submits a durable run from the selected project', async () => {
    const actions = props()
    render(<ResearchWorkbenchButton {...actions} />)
    fireEvent.click(screen.getByRole('button', { name: '科研工作台' }))
    await waitFor(() => expect(actions.load).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: '新建' }))
    fireEvent.change(screen.getByLabelText('名称'), { target: { value: 'Analyze samples' } })
    fireEvent.change(screen.getByLabelText('命令'), { target: { value: 'python analyze.py' } })
    fireEvent.click(screen.getByRole('button', { name: /保存/ }))
    await waitFor(() => expect(actions.submitRun).toHaveBeenCalledWith({
      projectId: 'p1', name: 'Analyze samples', command: 'python analyze.py', workingDirectory: 'C:/genome',
    }))
  })

  it('closes only the topmost record editor on Escape', async () => {
    render(<ResearchWorkbenchButton {...props()} />)
    fireEvent.click(screen.getByRole('button', { name: '科研工作台' }))
    await screen.findByRole('button', { name: '新建' })
    fireEvent.click(screen.getByRole('button', { name: '新建' }))
    expect(screen.getByRole('form', { name: '提交运行任务' })).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('form', { name: '提交运行任务' })).toBeNull()
    expect(screen.getByRole('dialog', { name: '科研工作台' })).toBeTruthy()
  })
})
