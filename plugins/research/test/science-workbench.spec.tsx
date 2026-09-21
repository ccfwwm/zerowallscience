// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ScienceWorkbench } from '../src/client/view.js'

afterEach(cleanup)
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
  it('loads the session project and persists explicit study selection', async () => {
    const { remote, props } = fixture()
    render(<ScienceWorkbench {...props} />)
    await screen.findByText('研究 a')
    expect(remote.projectForSession).toHaveBeenCalledWith({ sessionId: 's1' })
    fireEvent.change(screen.getByLabelText('选择研究'), { target: { value: 'b' } })
    await waitFor(() => expect(remote.setActiveResearchStudy).toHaveBeenCalledWith({ sessionId: 's1', studyId: 'b' }))
    await screen.findByText('研究 b')
  })
  it('keeps review rationale empty and surfaces host gate rejection', async () => {
    const { remote, props } = fixture()
    render(<ScienceWorkbench {...props} />)
    await screen.findByText('研究 a')
    fireEvent.click(screen.getByRole('button', { name: '研究计划', exact: true }))
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
})
