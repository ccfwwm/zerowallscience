// @vitest-environment jsdom
import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { PilotEvaluationPanel } from '../src/client/pilot-evaluation-panel.js'
afterEach(cleanup)
const catalog = { plannedTrialCount: 48, conditions: ['generic-agent', 'zerowall-full'], tasks: [{ id: 'task', title: '加权参考', inputKind: 'real-data' }] }
it('loads the real host catalog and freezes a configuration without offering fake execution', async () => {
  let frozen = false
  const remote = { pilotEvaluation: vi.fn(async (input: any) => {
    if (input.action === 'freeze') { frozen = true; return { ok: true, value: { id: 'e1' } } }
    return { ok: true, value: input.action === 'catalog' ? catalog : { evaluations: frozen ? [{ evaluationId: 'e1', freezeHash: 'hash', trials: Array.from({ length: 48 }, (_, i) => ({ id: String(i), status: 'not-run' })), unknownCostTrials: 0, scoredTrials: 0 }] : [] } }
  }) }
  render(<PilotEvaluationPanel remote={remote} sessionId="s1" studyId="study1" />)
  await screen.findByText(/计划试次：48/u)
  fireEvent.change(screen.getByLabelText('先导冻结配置 JSON'), { target: { value: '{"model":"test"}' } })
  fireEvent.click(screen.getByRole('button', { name: '校验并冻结待运行矩阵' }))
  await screen.findByText('已冻结 48 个待运行单元。没有启动模型调用或生成评估成绩。')
  expect(remote.pilotEvaluation).toHaveBeenCalledWith({ sessionId: 's1', studyId: 'study1', action: 'freeze', spec: { model: 'test' } })
  expect(screen.getByText(/待运行 48 \/ 48/u)).toBeTruthy()
  expect(screen.queryByRole('button', { name: /开始执行|运行48/u })).toBeNull()
})
it('surfaces missing input/provenance from the host and never claims a freeze succeeded', async () => {
  const remote = { pilotEvaluation: vi.fn(async (input: any) => input.action === 'freeze' ? { ok: false, error: { code: 'VALIDATION', message: 'Policy provenance must reference actual request events.' } } : { ok: true, value: input.action === 'catalog' ? catalog : { evaluations: [] } }) }
  render(<PilotEvaluationPanel remote={remote} sessionId="s1" studyId="study1" />)
  await screen.findByText(/计划试次/u)
  fireEvent.change(screen.getByLabelText('先导冻结配置 JSON'), { target: { value: '{}' } })
  fireEvent.click(screen.getByRole('button', { name: '校验并冻结待运行矩阵' }))
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Policy provenance'))
  expect(screen.queryByText(/已冻结 48/u)).toBeNull()
})
