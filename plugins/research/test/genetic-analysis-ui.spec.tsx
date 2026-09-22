// @vitest-environment jsdom
import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { GeneticAnalysisPanel } from '../src/client/genetic-analysis-panel.js'

afterEach(cleanup)
function fixture(exploratory = true) {
  const remote = { runGeneticAnalysis: vi.fn().mockResolvedValue({ ok: true, value: { status: 'running', analysisComplete: false, run: { id: 'run-1' } } }), refreshGeneticAnalysis: vi.fn().mockResolvedValue({ ok: true, value: { status: 'succeeded', methodStatus: 'succeeded', analysisComplete: true, run: { id: 'run-1' }, evidence: { id: 'evidence-1' }, result: { analyses: { wald: { beta: 0.25, se: 0.05, ci_low: 0.152, ci_high: 0.348, p_value: 0.000000573 } } } } }) }
  const props = { remote, sessionId: 'session-1', study: { id: 'study-1', currentPlanId: 'plan-1', gate1: 'pending' }, documents: [
    { id: 'contract-1', kind: 'dataset-contract', version: 2, payload: {} },
    { id: 'plan-1', kind: 'analysis-plan', version: 3, payload: { method: 'wald-ratio', inputs: ['contract-1'], taskIds: ['task-1'], genetics: { analysis: 'mr', methods: ['wald'] } } }
  ], tasks: [{ id: 'task-1', name: '单工具 MR', status: 'ready', exploratory }, { id: 'unrelated', name: '未绑定任务', status: 'ready', exploratory }], onChanged: vi.fn().mockResolvedValue(undefined) } as any
  return { props, remote }
}
it('submits persisted records with stable idempotency and displays only returned numeric estimates after refresh', async () => {
  const { props, remote } = fixture(); render(<GeneticAnalysisPanel {...props} />)
  expect(screen.queryByText(/未绑定任务/u)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '提交遗传分析' }))
  await screen.findByText('run-1')
  expect(remote.runGeneticAnalysis).toHaveBeenCalledWith({ sessionId: 'session-1', studyId: 'study-1', planId: 'plan-1', contractId: 'contract-1', taskId: 'task-1', expectedPlanVersion: 3, requestId: 'genetics-task-1-plan-1-v3-c2' })
  expect(screen.queryByRole('table', { name: '遗传分析数值' })).toBeNull()
  await waitFor(() => expect(screen.getByRole('button', { name: '提交遗传分析' })).toHaveProperty('disabled', false))
  fireEvent.click(screen.getByRole('button', { name: '提交遗传分析' }))
  await waitFor(() => expect(remote.runGeneticAnalysis).toHaveBeenCalledTimes(2))
  expect(remote.runGeneticAnalysis.mock.calls[1]).toEqual(remote.runGeneticAnalysis.mock.calls[0])
  await waitFor(() => expect(screen.getByRole('button', { name: '刷新遗传状态与产物' })).toHaveProperty('disabled', false))
  fireEvent.click(screen.getByRole('button', { name: '刷新遗传状态与产物' }))
  expect(await screen.findByRole('table', { name: '遗传分析数值' })).toHaveProperty('textContent', expect.stringContaining('0.2500000'))
  expect(screen.getByText('evidence-1')).toBeTruthy()
  expect(remote.refreshGeneticAnalysis).toHaveBeenCalledWith({ sessionId: 'session-1', studyId: 'study-1', runId: 'run-1' })
})
it('recovers the bound Run after reopening without a current genetics plan or a new submission', async () => {
  const { props, remote } = fixture(false)
  props.documents = []; props.tasks[0].runId = 'run-1'; props.study.gate1 = 'pending'
  const view = render(<GeneticAnalysisPanel {...props} />); view.unmount()
  render(<GeneticAnalysisPanel {...props} />)
  expect(screen.getByRole('button', { name: '提交遗传分析' })).toHaveProperty('disabled', true)
  expect(screen.getByLabelText('遗传已绑定 Run')).toHaveProperty('value', 'run-1')
  fireEvent.click(screen.getByRole('button', { name: '刷新遗传状态与产物' }))
  await screen.findByText('evidence-1')
  expect(remote.runGeneticAnalysis).not.toHaveBeenCalled()
  expect(remote.refreshGeneticAnalysis).toHaveBeenCalledWith({ sessionId: 'session-1', studyId: 'study-1', runId: 'run-1' })
})
it('keeps the freeze gate for new confirmatory runs while allowing historical retrieval', async () => {
  const { props, remote } = fixture(false); props.tasks[0].runId = 'run-1'
  const view = render(<GeneticAnalysisPanel {...props} />)
  expect(screen.getByRole('button', { name: '提交遗传分析' })).toHaveProperty('disabled', true)
  expect(screen.getByRole('button', { name: '刷新遗传状态与产物' })).toHaveProperty('disabled', false)
  fireEvent.click(screen.getByRole('button', { name: '提交遗传分析' })); expect(remote.runGeneticAnalysis).not.toHaveBeenCalled()
  view.rerender(<GeneticAnalysisPanel {...props} study={{ ...props.study, gate1: 'approved', currentFreezeId: 'freeze-1' }} />)
  expect(screen.getByRole('button', { name: '提交遗传分析' })).toHaveProperty('disabled', false)
})
it('retains partial/blocked status, method stopping reasons and source errors without inventing evidence', async () => {
  const { props, remote } = fixture(); props.tasks[0].runId = 'run-1'
  remote.refreshGeneticAnalysis.mockResolvedValueOnce({ ok: true, value: { status: 'failed', methodStatus: 'partial', analysisComplete: false, evidence: null, inputsCurrent: false, result: { analyses: { wald: { beta: 0.25 } }, stoppedMethods: { egger: 'At least 3 instruments required.' } } } } as any)
  render(<GeneticAnalysisPanel {...props} />)
  fireEvent.click(screen.getByRole('button', { name: '刷新遗传状态与产物' }))
  await screen.findByText(/方法状态：partial/u)
  expect(screen.getByText(/At least 3 instruments/u)).toBeTruthy()
  expect(screen.getByText(/本次未登记新的科学证据/u)).toBeTruthy()
  expect(screen.getByText(/历史结果不能直接/u)).toBeTruthy()
  expect(screen.getAllByText('未提供')).toHaveLength(4)
  await waitFor(() => expect(screen.getByRole('button', { name: '提交遗传分析' })).toHaveProperty('disabled', false))
  remote.runGeneticAnalysis.mockResolvedValueOnce({ ok: true, value: { status: 'blocked', errors: ['Allele harmonization is not verified.'] } } as any)
  fireEvent.click(screen.getByRole('button', { name: '提交遗传分析' }))
  await screen.findByText('Allele harmonization is not verified.')
  expect(screen.queryByRole('table', { name: '遗传分析数值' })).toBeNull()
})
it('does not apply a late result from a closed study to another study', async () => {
  const { props, remote } = fixture(); let complete!: (value: unknown) => void
  remote.runGeneticAnalysis.mockImplementationOnce(() => new Promise(resolve => { complete = resolve }) as any)
  const view = render(<GeneticAnalysisPanel {...props} />)
  fireEvent.click(screen.getByRole('button', { name: '提交遗传分析' })); view.unmount()
  complete({ ok: true, value: { status: 'succeeded', run: { id: 'old-run' } } })
  await Promise.resolve(); await Promise.resolve()
  expect(props.onChanged).not.toHaveBeenCalled()
})
