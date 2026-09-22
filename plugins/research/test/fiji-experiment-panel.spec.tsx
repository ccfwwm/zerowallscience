// @vitest-environment jsdom
import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { FijiExperimentPanel } from '../src/client/fiji-experiment-panel.js'
afterEach(cleanup)
const ok = (value: unknown) => ({ ok: true, value })
it('selects a registered image, runs segmentation, shows masks and reuses the retry key', async () => {
  const fijiExperiment = vi.fn(async () => ok({ run: { status: 'succeeded' }, result: { measurements: [{ remainingArea: 20, closurePercent: 80 }] }, artifacts: ['mask.png', 'overlay.png'].map(name => ({ name, projectId: 'p1', uri: `file:///p1/${name}` })) }))
  const remote = { scienceViewer: vi.fn(async () => ok({ assets: [{ id: 'a1', name: 'scratch.pgm', location: 'local', uri: 'file:///p1/scratch.pgm' }] })), fijiExperiment, preview: vi.fn(async () => ok({ base64: 'cG5n' })) }
  render(<FijiExperimentPanel remote={remote as any} sessionId="s1" />)
  fireEvent.change(screen.getByLabelText('实验输入'), { target: { value: 'image' } })
  await screen.findByRole('option', { name: 'scratch.pgm' })
  fireEvent.change(screen.getByLabelText('实验图像'), { target: { value: 'a1' } })
  fireEvent.click(screen.getByRole('button', { name: '分析图像' }))
  await screen.findByAltText('边界质控叠加')
  expect(screen.getByLabelText('实验结果').textContent).toContain('closurePercent')
  expect(fijiExperiment.mock.calls.filter(call => (call[0] as any).action === 'analyze')[0]?.[0]).toMatchObject({ sourceAssetId: 'a1', image: { kind: 'scratch-wound' } })
  await waitFor(() => expect(screen.getByRole('button', { name: '分析图像' })).toBeTruthy())
  fireEvent.click(screen.getByRole('button', { name: '分析图像' }))
  await waitFor(() => expect(fijiExperiment.mock.calls.filter(call => (call[0] as any).action === 'analyze')).toHaveLength(2))
  expect((fijiExperiment.mock.calls.filter(call => (call[0] as any).action === 'analyze')[1] as any)[0].requestId).toBe((fijiExperiment.mock.calls.filter(call => (call[0] as any).action === 'analyze')[0] as any)[0].requestId)
})
