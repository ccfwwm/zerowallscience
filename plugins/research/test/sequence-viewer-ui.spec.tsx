// @vitest-environment jsdom
import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SequenceViewer } from '../src/client/sequence-viewer.js'

afterEach(cleanup)
const ok = (value: unknown) => ({ ok: true, value })
const state = { recordIndex: 0, start: 1, count: 2400, selectionStart: 1, selectionEnd: 12 }
const viewer = { id: 'v1', assetId: 'a1', tool: 'sequence', version: 1, state }
const window = { sequence: 'ATGGAATTCTAA', start: 1, end: 12, recordIndex: 0, records: [{ index: 0, name: 'reference', length: 12, gcPercent: 25 }] }

it('selects bases, blocks analysis until saved and submits the current revision', async () => {
  const scienceViewer = vi.fn(async input => {
    if (input.action === 'list') return ok({ assets: [{ id: 'a1', name: 'reference', uri: 'file:///ref.fa' }], viewers: [viewer] })
    if (input.action === 'read') return ok({ viewer, window })
    if (input.action === 'save') return ok({ viewer: { ...viewer, version: 2, state: input.state }, window })
    if (input.action === 'analyze') return ok({ analysis: { operation: 'translate', start: 4, end: 9, sequence: 'EF', notes: [] } })
    return ok({})
  })
  render(<SequenceViewer remote={{ scienceViewer } as any} sessionId="s1" />)
  fireEvent.click(await screen.findByRole('tab', { name: 'reference · v1' }))
  fireEvent.click(await screen.findByLabelText('碱基 4 G'))
  fireEvent.click(screen.getByLabelText('碱基 9 C'), { shiftKey: true })
  expect((screen.getByRole('button', { name: '分析选择区域' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: '保存并查看' }))
  await waitFor(() => expect((screen.getByRole('button', { name: '分析选择区域' }) as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(screen.getByRole('button', { name: '分析选择区域' }))
  expect(await screen.findByText('EF')).toBeTruthy()
  expect(scienceViewer).toHaveBeenCalledWith({ sessionId: 's1', action: 'analyze', viewerId: 'v1', expectedVersion: 2, operation: 'translate' })
  expect(scienceViewer).toHaveBeenCalledWith(expect.objectContaining({ action: 'save', state: { ...state, selectionStart: 4, selectionEnd: 9 } }))
})

it('shows source-change rejection without fabricating a view', async () => {
  const scienceViewer = vi.fn(async input => input.action === 'list' ? ok({ viewers: [viewer] }) : { ok: false, error: { code: 'VALIDATION', message: 'Source file changed' } })
  render(<SequenceViewer remote={{ scienceViewer } as any} sessionId="s1" />)
  fireEvent.click(await screen.findByRole('tab'))
  expect(await screen.findByRole('status')).toHaveProperty('textContent', expect.stringContaining('Source file changed'))
  expect(screen.queryByLabelText('碱基视图')).toBeNull()
})
