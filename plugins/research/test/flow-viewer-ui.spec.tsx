// @vitest-environment jsdom
import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { FlowViewer } from '../src/client/flow-viewer.js'

afterEach(cleanup)
const ok = (value: unknown) => ({ ok: true, value })
const viewer = { id: 'v1', assetId: 'a1', tool: 'flow', version: 1, state: { sourceSha256: 'sha', transform: 'none', cofactor: 5, applyCompensation: false } }
const dataset = { format: 'fcs', version: '3.0', datatype: 'F', byteOrder: 'little', eventCount: 2, channels: [{ index: 0, name: 'FSC-A', shortName: 'FSC-A', range: 1024, bits: 32 }, { index: 1, name: 'SSC-A', shortName: 'SSC-A', range: 1024, bits: 32 }], events: [[1, 2], [3, 4]], keywords: {}, sourceSha256: 'sha', notes: [] }

it('opens FCS, adds a gate, analyzes and exports', async () => {
  const scienceViewer = vi.fn(async input => {
    if (input.action === 'list') return ok({ assets: [{ id: 'a1', name: 'sample.fcs', uri: 'file:///sample.fcs' }], viewers: [viewer] })
    if (input.action === 'flow_open') return ok({ flow: { dataset, viewer } })
    if (input.action === 'flow_analyze') return ok({ flow: { dataset, viewer, analysis: { transform: 'none', cofactor: 5, compensationApplied: false, eventCount: 2, preview: [{ 'FSC-A': 1, 'SSC-A': 2 }], gates: [{ id: 'gate-1', name: 'Gate 1', count: 1, fractionOfParent: .5, fractionOfTotal: .5 }], notes: [] } } })
    return ok({})
  })
  render(<FlowViewer remote={{ scienceViewer } as any} sessionId="s1" />)
  fireEvent.change(await screen.findByLabelText('流式资产'), { target: { value: 'a1' } })
  fireEvent.click(screen.getByRole('button', { name: '打开 FCS' }))
  await waitFor(() => expect(screen.getByLabelText('流式散点预览')).toBeTruthy())
  fireEvent.click(screen.getByRole('button', { name: '新增矩形门' }))
  fireEvent.click(screen.getByRole('button', { name: '计算门控' }))
  expect(await screen.findByText(/Gate 1/)).toBeTruthy()
  expect(scienceViewer).toHaveBeenCalledWith(expect.objectContaining({ action: 'flow_analyze', viewerId: 'v1', expectedVersion: 1, gates: [expect.objectContaining({ id: 'gate-1' })] }))
})

it('submits selected FCS assets and an optional FlowJo workspace as a batch', async () => {
  const scienceViewer = vi.fn(async input => {
    if (input.action === 'list') return ok({ assets: [{ id: 'a1', name: 'sample-1.fcs', uri: 'file:///sample-1.fcs' }, { id: 'a2', name: 'sample-2.fcs', uri: 'file:///sample-2.fcs' }, { id: 'w1', name: 'gates.wsp', uri: 'file:///gates.wsp' }], viewers: [] })
    if (input.action === 'flow_batch_submit') return ok({ flow: { run: { id: 'run-1', status: 'submitted', progress: 0, version: 1 } } })
    if (input.action === 'flow_batch_status') return ok({ flow: { run: { id: 'run-1', status: 'succeeded', progress: 1, version: 2 }, batch: { items: [{ assetId: 'a1', analysis: {} }, { assetId: 'a2', error: 'missing channel' }], notes: [] }, artifact: { name: 'batch-result.json', uri: 'file:///batch.json', checksum: 'sha' } } })
    return ok({})
  })
  render(<FlowViewer remote={{ scienceViewer } as any} sessionId="s1" />)
  await screen.findByRole('group', { name: 'FCS 批处理' })
  fireEvent.click(screen.getByLabelText('sample-1.fcs'))
  fireEvent.click(screen.getByLabelText('sample-2.fcs'))
  fireEvent.change(screen.getByLabelText('批处理 FlowJo WSP'), { target: { value: 'w1' } })
  fireEvent.click(screen.getByRole('button', { name: '运行批处理' }))
  await waitFor(() => expect(scienceViewer).toHaveBeenCalledWith(expect.objectContaining({ action: 'flow_batch_submit', assetIds: ['a1', 'a2'], importAssetId: 'w1', requestId: expect.stringMatching(/^flow-batch-/u) })))
  await waitFor(() => expect(scienceViewer).toHaveBeenCalledWith(expect.objectContaining({ action: 'flow_batch_status', runId: 'run-1' })), { timeout: 2000 })
  expect(await screen.findByText(/missing channel/)).toBeTruthy()
})
