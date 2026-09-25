// @vitest-environment jsdom
import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { FlowViewer } from '../src/client/flow-viewer.js'
import { SequenceViewer } from '../src/client/sequence-viewer.js'
import { SangerViewer } from '../src/client/sanger-viewer.js'

afterEach(cleanup)
const ok = (value: unknown) => ({ ok: true, value })
const assets = [
  { id: 'a1', name: 'first.dat', uri: 'file:///first.dat' },
  { id: 'a2', name: 'second.dat', uri: 'file:///second.dat' },
]
const namedAssets = (names: [string, string]) => assets.map((asset, index) => ({ ...asset, name: names[index]!, uri: `file:///${names[index]!}` }))

it('opens a different FCS asset after the first one has loaded', async () => {
  const dataset = (name: string) => ({ format: 'fcs', version: '3.0', datatype: 'F', byteOrder: 'little', eventCount: 1, channels: [{ index: 0, name, shortName: name, range: 100, bits: 32 }], events: [[1]], keywords: {}, sourceSha256: 'sha', notes: [] })
  const scienceViewer = vi.fn(async (input: { action: string; assetId?: string }) => input.action === 'list'
    ? ok({ assets: namedAssets(['first.fcs', 'second.fcs']), viewers: [] })
    : ok({ flow: { dataset: dataset(input.assetId ?? 'FSC-A'), viewer: { id: input.assetId, assetId: input.assetId, tool: 'flow', version: 1, state: {} } } }))
  render(<FlowViewer remote={{ scienceViewer } as any} sessionId="s1" viewOnly />)
  fireEvent.change(await screen.findByLabelText('流式资产'), { target: { value: 'a1' } })
  await screen.findByRole('img', { name: '流式散点预览' })
  fireEvent.change(screen.getByLabelText('流式资产'), { target: { value: 'a2' } })
  expect(screen.queryByRole('img', { name: '流式散点预览' })).toBeNull()
  await waitFor(() => expect(screen.getByText('second.fcs · 1 通道')).toBeTruthy())
  expect(scienceViewer).toHaveBeenCalledWith(expect.objectContaining({ action: 'flow_open', assetId: 'a2' }))
})

it('opens a different sequence after clearing the previous sequence view', async () => {
  const scienceViewer = vi.fn(async (input: { action: string; assetId?: string }) => input.action === 'list'
    ? ok({ assets: namedAssets(['first.fa', 'second.fa']), viewers: [] })
    : ok({ viewer: { id: input.assetId, assetId: input.assetId, tool: 'sequence', version: 1, state: { recordIndex: 0, start: 1, count: 60 } }, window: { sequence: input.assetId === 'a2' ? 'CCCC' : 'AAAA', start: 1, end: 4, recordIndex: 0, records: [{ index: 0, name: input.assetId ?? 'record', length: 4, gcPercent: 50 }] } }))
  render(<SequenceViewer remote={{ scienceViewer } as any} sessionId="s1" viewOnly />)
  fireEvent.change(await screen.findByLabelText('序列资产'), { target: { value: 'a1' } })
  expect((await screen.findByLabelText('碱基视图')).textContent).toContain('AAAA')
  fireEvent.change(screen.getByLabelText('序列资产'), { target: { value: 'a2' } })
  expect(screen.queryByLabelText('碱基视图')).toBeNull()
  await waitFor(() => expect(screen.getByLabelText('碱基视图').textContent).toContain('CCCC'))
  expect(scienceViewer).toHaveBeenCalledWith(expect.objectContaining({ action: 'open', assetId: 'a2' }))
})

it('opens a different Sanger trace after clearing the prior trace', async () => {
  const trace = (format: string) => ({ format, version: '3.00', sampleCount: 4, sampleSize: 1, sourceSha256: 'sha', bases: [], channels: { A: [0, 1, 0], C: [0, 1, 0], G: [0, 1, 0], T: [0, 1, 0] }, notes: [] })
  const scienceViewer = vi.fn(async (input: { action: string; assetId?: string }) => input.action === 'list'
    ? ok({ assets: namedAssets(['first.scf', 'second.ab1']), viewers: [] })
    : ok({ sanger: { trace: trace(input.assetId === 'a2' ? 'ab1' : 'scf'), viewer: { id: input.assetId, assetId: input.assetId, tool: 'sequence', version: 1, state: { traceTool: 'sanger' } } } }))
  render(<SangerViewer remote={{ scienceViewer } as any} sessionId="s1" viewOnly />)
  fireEvent.change(await screen.findByLabelText('Sanger 资产'), { target: { value: 'a1' } })
  await screen.findByRole('img', { name: '四色 Sanger 峰图' })
  fireEvent.change(screen.getByLabelText('Sanger 资产'), { target: { value: 'a2' } })
  expect(screen.queryByRole('img', { name: '四色 Sanger 峰图' })).toBeNull()
  await waitFor(() => expect(screen.getByText(/second\.ab1 · 4 samples/u)).toBeTruthy())
  expect(scienceViewer).toHaveBeenCalledWith(expect.objectContaining({ action: 'sanger_open', assetId: 'a2' }))
})
