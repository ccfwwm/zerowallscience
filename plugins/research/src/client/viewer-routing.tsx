import { useEffect, useRef } from 'react'
import type { ConversationNodeDefinition } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionEventLike } from '@deepseek-ai/dsh-api-session-controller/client'
import type { BetterSidebarService } from 'dsh-better-sidebar/client/service'

export type ScienceViewerRoute = {
  callId: string
  tool: 'imagej' | 'he' | 'molecule' | 'sanger' | 'flow' | 'canvas' | 'cells' | 'sequence' | 'brainglobe'
  assetId?: string
  viewerId?: string
  runId?: string
  requestId?: string
}

type PendingOpen = Omit<ScienceViewerRoute, 'callId'> & { action: 'open' | 'focus' }
type ViewerRouteState = { turn: number; pending: Record<string, PendingOpen>; routes: ScienceViewerRoute[] }

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ConversationTurnDataMap { 'zerowall-science-viewer-route': ViewerRouteState }
}

const scienceTools = new Set<ScienceViewerRoute['tool']>(['imagej', 'he', 'molecule', 'sanger', 'flow', 'canvas', 'cells', 'sequence', 'brainglobe'])

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function parseObject(value: unknown): Record<string, unknown> | undefined {
  const direct = object(value)
  if (direct) return direct
  if (typeof value !== 'string') return undefined
  try { return object(JSON.parse(value)) } catch { return undefined }
}

function requestedOpen(event: SessionEventLike): PendingOpen | undefined {
  if (event.type !== 'tool/call' || event.data.name !== 'science_viewer_panel') return undefined
  const args = parseObject(event.data.arguments)
  const tool = args?.tool
  if ((args?.action !== 'open' && args?.action !== 'focus') || typeof tool !== 'string' || !scienceTools.has(tool as ScienceViewerRoute['tool'])) return undefined
  return {
    action: args.action,
    tool: tool as ScienceViewerRoute['tool'],
    ...(typeof args.asset_id === 'string' ? { assetId: args.asset_id } : {}),
    ...(typeof args.viewer_id === 'string' ? { viewerId: args.viewer_id } : {}),
    ...(typeof args.run_id === 'string' ? { runId: args.run_id } : {}),
    ...(typeof args.request_id === 'string' ? { requestId: args.request_id } : {}),
  }
}

function findAcceptedResult(value: unknown, expected: PendingOpen, seen = new Set<object>(), depth = 0): boolean {
  if (depth > 8 || value === null || value === undefined) return false
  if (typeof value === 'string') return findAcceptedResult(parseObject(value), expected, seen, depth + 1)
  if (Array.isArray(value)) return value.some(item => findAcceptedResult(item, expected, seen, depth + 1))
  const item = object(value)
  if (!item || seen.has(item)) return false
  seen.add(item)
  if (item.isError === true) return false
  if (item.status === 'accepted' && item.action === expected.action && item.tool === expected.tool) return true
  return Object.values(item).some(child => findAcceptedResult(child, expected, seen, depth + 1))
}

export const scienceViewerRouteDefinition: ConversationNodeDefinition<ViewerRouteState> = {
  kind: 'zerowall-science-viewer-route',
  match(event) {
    if (event.type === 'tool/call' && event.data.name === 'science_viewer_panel') return { id: String(event.data.callId), role: 'start' }
    if (event.type === 'tool/result' && event.data.message.source.kind === 'tool') return { id: String(event.data.message.source.callId), role: 'update' }
    return null
  },
  start(_context, match) {
    const event = match.event
    if (event.type !== 'tool/call') throw new Error('Science viewer route must start with its tool call.')
    const pending = requestedOpen(event)
    return { turn: event.data.turn, pending: pending ? { [String(event.data.callId)]: pending } : {}, routes: [] }
  },
  update(context, match) {
    const event = match.event
    if (event.type !== 'tool/result' || event.data.error) return context.state
    const callId = String(event.data.message.source.callId)
    const expected = context.state.pending[callId]
    if (!expected || !findAcceptedResult(event.data.message.content, expected)) return context.state
    const routes = context.state.routes.some(route => route.callId === callId)
      ? context.state.routes
      : [...context.state.routes, { ...expected, callId }]
    return { ...context.state, routes }
  },
  buildLocationData(context, scope) {
    if (scope !== 'turn' || !context.state?.routes.length) return null
    return { kind: 'turn', turn: context.state.turn, key: 'zerowall-science-viewer-route', value: context.state }
  },
}

export function ScienceViewerTurnRoute({ turn, sessionId, openViewer }: PropsRuntime<'conversation.chat.turnTail'> & { openViewer: (sessionId: string, route: ScienceViewerRoute) => void }): null {
  const routes = turn.data.get('zerowall-science-viewer-route')?.routes ?? []
  const opened = useRef(new Set<string>())
  useEffect(() => {
    for (const route of routes) {
      const key = `${sessionId}:${route.callId}`
      if (opened.current.has(key)) continue
      opened.current.add(key)
      openViewer(sessionId, route)
    }
  }, [openViewer, routes, sessionId])
  return null
}

export function openScienceViewer(sidebar: BetterSidebarService, sessionId: string, route: ScienceViewerRoute): void {
  sidebar.openTab({
    type: 'zerowall:science-viewers',
    title: '科学查看器',
    meta: { ...route, requestId: route.requestId ?? route.callId },
  }, { sessionId })
}

