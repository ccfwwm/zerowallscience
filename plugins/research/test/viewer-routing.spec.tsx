// @vitest-environment jsdom
import { expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { scienceViewerRouteDefinition, ScienceViewerTurnRoute } from '../src/client/viewer-routing.js'

const toolCall = (args: Record<string, unknown>, callId = 'call-1') => ({
  type: 'tool/call',
  data: { name: 'science_viewer_panel', arguments: JSON.stringify(args), callId, turn: 4 },
}) as any

const toolResult = (callId: string, result: unknown, error = false) => ({
  type: 'tool/result',
  data: {
    ...(error ? { error: 'tool failed' } : {}),
    message: {
      source: { kind: 'tool', callId },
      content: [{ type: 'text', text: JSON.stringify(result) }],
    },
  },
}) as any

it('opens one viewer from the successful conversation result and ignores duplicate delivery', async () => {
  const call = toolCall({ action: 'open', tool: 'imagej', asset_id: 'asset-7', run_id: 'run-3', request_id: 'request-2' })
  const initial = scienceViewerRouteDefinition.start({} as any, { event: call } as any)
  expect(initial.pending['call-1']).toMatchObject({ action: 'open', tool: 'imagej', assetId: 'asset-7' })
  expect(initial.routes).toEqual([])

  const accepted = { status: 'accepted', action: 'open', tool: 'imagej' }
  const first = scienceViewerRouteDefinition.update({ state: initial } as any, { event: toolResult('call-1', accepted) } as any)
  const repeated = scienceViewerRouteDefinition.update({ state: first } as any, { event: toolResult('call-1', accepted) } as any)
  expect(first.routes).toEqual(repeated.routes)
  expect(scienceViewerRouteDefinition.buildLocationData({ state: first } as any, 'turn')).toMatchObject({
    kind: 'turn', turn: 4, value: { routes: [{ callId: 'call-1', tool: 'imagej', assetId: 'asset-7', runId: 'run-3' }] },
  })

  const openViewer = vi.fn()
  const turn = { data: { get: () => ({ routes: first.routes }) } }
  const view = render(<ScienceViewerTurnRoute turn={turn as any} sessionId="session-1" openViewer={openViewer} />)
  await waitFor(() => expect(openViewer).toHaveBeenCalledOnce())
  view.rerender(<ScienceViewerTurnRoute turn={turn as any} sessionId="session-1" openViewer={openViewer} />)
  expect(openViewer).toHaveBeenCalledWith('session-1', expect.objectContaining({ callId: 'call-1', assetId: 'asset-7' }))
  expect(openViewer).toHaveBeenCalledOnce()
  cleanup()
})

it('does not open a viewer for failed calls or analysis actions', () => {
  const open = toolCall({ action: 'open', tool: 'he', asset_id: 'asset-8' }, 'failed-call')
  const initial = scienceViewerRouteDefinition.start({} as any, { event: open } as any)
  const failed = scienceViewerRouteDefinition.update({ state: initial } as any, {
    event: toolResult('failed-call', { status: 'accepted', action: 'open', tool: 'he' }, true),
  } as any)
  expect(failed.routes).toEqual([])

  const analysis = scienceViewerRouteDefinition.start({} as any, {
    event: toolCall({ action: 'analyze', tool: 'he', asset_id: 'asset-8' }, 'analysis-call'),
  } as any)
  expect(analysis.pending).toEqual({})
})
