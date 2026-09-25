// @vitest-environment jsdom
import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MoleculeViewer } from '../src/client/molecule-viewer.js'
import { INITIAL_MOLECULE_STATE } from '../src/shared/molecule.js'

afterEach(() => { cleanup(); delete window.__ZeroWallMoleculeRuntime })
const ok = (value: unknown) => ({ ok: true, value })

it('keeps the Molstar container mounted across opening another structure', async () => {
  const disposed = vi.fn()
  const create = vi.fn(async () => ({ dispose: disposed, apply: vi.fn(), camera: () => INITIAL_MOLECULE_STATE.camera, png: vi.fn(), reset: vi.fn() }))
  window.__ZeroWallMoleculeRuntime = { version: '5.11.0', create } as any
  const assets = [
    { id: 'a1', name: 'first.pdb', uri: 'file:///first.pdb' },
    { id: 'a2', name: 'second.pdb', uri: 'file:///second.pdb' },
  ]
  const scienceViewer = vi.fn(async (input: { action: string; molecule?: { assetId?: string } }) => input.action === 'list'
    ? ok({ assets, viewers: [] })
    : ok({ molecule: { viewer: { id: input.molecule?.assetId, assetId: input.molecule?.assetId, version: 1, state: {} }, summary: { title: input.molecule?.assetId, format: 'pdb', atomCount: 1, chains: [], residues: [], atoms: [] }, state: INITIAL_MOLECULE_STATE, source: 'ATOM' } }))
  render(<MoleculeViewer remote={{ scienceViewer } as any} sessionId="s1" viewOnly />)
  const canvas = screen.getByTestId('molecule-canvas')
  fireEvent.change(await screen.findByLabelText('分子资产'), { target: { value: 'a1' } })
  await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
  expect(create.mock.calls[0]?.[0]).toBe(canvas)
  fireEvent.change(screen.getByLabelText('分子资产'), { target: { value: 'a2' } })
  await waitFor(() => expect(create).toHaveBeenCalledTimes(2))
  expect(create.mock.calls[1]?.[0]).toBe(canvas)
  expect(disposed).toHaveBeenCalled()
})
