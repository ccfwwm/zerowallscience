// @vitest-environment jsdom
import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NhanesSurveyPanel } from '../src/client/nhanes-survey-panel.js'

afterEach(cleanup)
function fixture(exploratory = true) {
  const remote = { runNhanesSurvey: vi.fn().mockResolvedValue({ ok: true, value: { status: 'succeeded', analysisComplete: true, run: { id: 'run-1' }, artifact: { uri: 'file:///results/manifest.json' }, evidence: { id: 'evidence-1' } } }) }
  const props = { remote, sessionId: 'session-1', study: { id: 'study-1', currentPlanId: 'plan-1', gate1: 'pending' },
    documents: [{ id: 'contract-1', kind: 'dataset-contract', version: 2, payload: {} }, { id: 'plan-1', kind: 'analysis-plan', version: 3, payload: { method: 'survey-summary', inputs: ['contract-1'], taskIds: ['task-1'], nhanesSurvey: { kind: 'summary', variable: 'RIDAGEYR' } } }],
    tasks: [{ id: 'task-1', name: '年龄均值', status: 'ready', exploratory }, { id: 'unrelated', name: '未绑定任务', status: 'ready', exploratory }], onChanged: vi.fn().mockResolvedValue(undefined) } as any
  return { props, remote }
}
it('submits selected persisted records and reuses the same idempotency key after a retry', async () => {
  const { props, remote } = fixture()
  render(<NhanesSurveyPanel {...props} />)
  expect(screen.getByLabelText('NHANES 分析计划')).toHaveProperty('value', 'plan-1')
  expect(screen.getByLabelText('NHANES 数据契约')).toHaveProperty('value', 'contract-1')
  expect(screen.queryByText(/未绑定任务/u)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '执行 NHANES 分析' }))
  await screen.findByText('run-1')
  expect(remote.runNhanesSurvey).toHaveBeenCalledWith({ sessionId: 'session-1', studyId: 'study-1', contractId: 'contract-1', planId: 'plan-1', taskId: 'task-1', expectedPlanVersion: 3, requestId: 'nhanes-task-1-plan-1-v3-c2' })
  expect(screen.getByText('file:///results/manifest.json')).toBeTruthy()
  expect(screen.getByText(/科学复核：待人工复核/u)).toBeTruthy()
  await waitFor(() => expect(screen.getByRole('button', { name: '执行 NHANES 分析' })).toHaveProperty('disabled', false))
  fireEvent.click(screen.getByRole('button', { name: '执行 NHANES 分析' }))
  await waitFor(() => expect(remote.runNhanesSurvey).toHaveBeenCalledTimes(2))
  expect(remote.runNhanesSurvey.mock.calls[0]).toEqual(remote.runNhanesSurvey.mock.calls[1])
})
it('blocks confirmatory execution until the selected current plan is approved and frozen', () => {
  const { props, remote } = fixture(false)
  const rendered = render(<NhanesSurveyPanel {...props} />)
  expect(screen.getByRole('button', { name: '执行 NHANES 分析' })).toHaveProperty('disabled', true)
  fireEvent.click(screen.getByRole('button', { name: '执行 NHANES 分析' }))
  expect(remote.runNhanesSurvey).not.toHaveBeenCalled()
  rendered.rerender(<NhanesSurveyPanel {...props} study={{ ...props.study, gate1: 'approved', currentFreezeId: 'freeze-1' }} />)
  expect(screen.getByRole('button', { name: '执行 NHANES 分析' })).toHaveProperty('disabled', false)
})
it('surfaces server revision conflicts and scientific stopping reasons', async () => {
  const { props, remote } = fixture()
  remote.runNhanesSurvey.mockResolvedValueOnce({ ok: false, error: { code: 'CONFLICT', message: 'Analysis plan revision conflict: current 4.' } } as any)
  render(<NhanesSurveyPanel {...props} />)
  fireEvent.click(screen.getByRole('button', { name: '执行 NHANES 分析' }))
  expect(await screen.findByRole('status')).toHaveProperty('textContent', expect.stringContaining('revision conflict'))
  remote.runNhanesSurvey.mockResolvedValueOnce({ ok: true, value: { status: 'blocked', errors: ['Full dataset required.'] } } as any)
  fireEvent.click(screen.getByRole('button', { name: '执行 NHANES 分析' }))
  expect(await screen.findByText('Full dataset required.')).toBeTruthy()
})
it('discards a response from a closed study without refreshing the newly active study', async () => {
  const { props, remote } = fixture()
  let complete!: (value: unknown) => void
  remote.runNhanesSurvey.mockImplementationOnce(() => new Promise(resolve => { complete = resolve }) as any)
  const view = render(<NhanesSurveyPanel {...props} />)
  fireEvent.click(screen.getByRole('button', { name: '执行 NHANES 分析' }))
  view.unmount()
  complete({ ok: true, value: { status: 'succeeded' } })
  await Promise.resolve(); await Promise.resolve()
  expect(props.onChanged).not.toHaveBeenCalled()
})
