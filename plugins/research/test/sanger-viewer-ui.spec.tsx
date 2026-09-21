// @vitest-environment jsdom
import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SangerViewer } from '../src/client/sanger-viewer.js'

afterEach(cleanup)
const ok = (value: unknown) => ({ ok: true, value })
const viewer = { id: 'v1', assetId: 'a1', tool: 'sequence', version: 1, state: { traceTool: 'sanger', sourceSha256: 'sha', threshold: .8, window: 5 } }
const trace = { format: 'scf', version: '3.00', sampleCount: 4, sampleSize: 1, sourceSha256: 'sha', bases: [{ position: 1, peak: 1, calls: { A: 255, C: 0, G: 0, T: 0 }, base: 'A', quality: 1 }], channels: { A: [0, 4, 0], C: [0, 1, 0], G: [0, 2, 0], T: [0, 3, 0] }, notes: [] }

it('opens a trace, sends threshold/window/reference and renders results', async () => {
  const scienceViewer = vi.fn(async input => {
    if (input.action === 'list') return ok({ assets: [{ id: 'a1', name: 'read.scf', uri: 'file:///read.scf' }], viewers: [viewer] })
    if (input.action === 'sanger_open') return ok({ sanger: { trace, viewer } })
    if (input.action === 'sanger_analyze') return ok({ sanger: { trace, analysis: { trim: { threshold: .7, window: 3, start: 1, end: 1, sequence: 'A', qualities: [1] }, notes: ['trimmed'], reference: { sequence: 'A', alignedRead: 'A', alignedReference: 'A', mismatches: [], identity: 1, notes: [] } }, viewer } })
    return ok({})
  })
  render(<SangerViewer remote={{ scienceViewer } as any} sessionId="s1" />)
  fireEvent.change(await screen.findByLabelText('Sanger 资产'), { target: { value: 'a1' } })
  fireEvent.click(await screen.findByRole('button', { name: '打开峰图' }))
  await waitFor(() => expect(screen.getByLabelText('四色峰图')).toBeTruthy())
  fireEvent.change(screen.getByLabelText('端点概率阈值'), { target: { value: '0.7' } })
  fireEvent.change(screen.getByLabelText('质量窗口'), { target: { value: '3' } })
  fireEvent.change(screen.getByLabelText('Sanger 参考序列'), { target: { value: 'A' } })
  fireEvent.click(screen.getByRole('button', { name: '裁剪并比对' }))
  expect(await screen.findByText('trimmed')).toBeTruthy()
  expect(scienceViewer).toHaveBeenCalledWith(expect.objectContaining({ action: 'sanger_analyze', viewerId: 'v1', expectedVersion: 1, threshold: .7, window: 3, reference: 'A' }))
})
