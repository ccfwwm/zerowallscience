// @vitest-environment jsdom
import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HeViewer } from '../src/client/he-viewer.js'

afterEach(cleanup)
const ok = (value: unknown) => ({ ok: true, value })
const viewer = { id: 'v1', assetId: 'a1', tool: 'image', version: 1, state: { heTool: 'he', sourceSha256: 'sha' } }
const he = { width: 20, height: 15, pages: 1, format: 'tiff', notes: [] }

it('opens a slide, sends original-pixel ROI coordinates and renders metrics', async () => {
  const scienceViewer = vi.fn(async input => {
    if (input.action === 'list') return ok({ assets: [{ id: 'a1', name: 'slide.svs', uri: 'file:///slide.svs' }], viewers: [viewer] })
    if (input.action === 'he_open') return ok({ he: { he, viewer } })
    if (input.action === 'he_analyze') return ok({ he: { analysis: { format: 'zerowall-he-analysis', version: 1, width: 2, height: 2, region: input.region, pixels: 4, meanRgb: { r: 1, g: 2, b: 3 }, nucleiLikePixels: 1, nucleiLikeFraction: .25, flags: [], notes: ['screening'] }, viewer } })
    return ok({})
  })
  render(<HeViewer remote={{ scienceViewer } as any} sessionId="s1" />)
  fireEvent.change(await screen.findByLabelText('HE 资产'), { target: { value: 'a1' } })
  fireEvent.click(screen.getByRole('button', { name: '打开切片' }))
  await waitFor(() => expect(screen.getByText(/20×15/)).toBeTruthy())
  fireEvent.change(screen.getByLabelText('HE x'), { target: { value: '2' } }); fireEvent.change(screen.getByLabelText('HE y'), { target: { value: '3' } }); fireEvent.change(screen.getByLabelText('HE width'), { target: { value: '2' } }); fireEvent.change(screen.getByLabelText('HE height'), { target: { value: '2' } })
  fireEvent.click(screen.getByRole('button', { name: '统计 ROI' }))
  expect(await screen.findByText(/核样本启发式比例/)).toBeTruthy()
  expect(scienceViewer).toHaveBeenCalledWith(expect.objectContaining({ action: 'he_analyze', viewerId: 'v1', expectedVersion: 1, region: { x: 2, y: 3, width: 2, height: 2, page: 0 } }))
})
