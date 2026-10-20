import { useLayoutEffect, useState, type ReactNode } from 'react'
import type { ISessions, SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import type { PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

declare module '@deepseek-ai/dsh-api-session-controller/client' {
  interface SessionReferenceSourceMap { ohStoryWorkbench: unknown }
}

export type WorkbenchSeatProps = PropsRuntime<'shell.overlay'> & PropsRenderSlots<'oh-story.workspace'> & {
  sessionController: Pick<ISessions, 'retain'>
  empty: () => ReactNode
}

/** Root overlays have no inherited Session scope. Own and pass the main view's reference explicitly. */
export function WorkbenchSeat({ SessionProvider, renderSlot, useSessions, sessionController, empty }: WorkbenchSeatProps) {
  const sessionId = useSessions(state => Object.values(state.byId).find(row => (row.retainedBy.mainView ?? 0) > 0)?.id)
  const [reference, setReference] = useState<SessionReference>()
  useLayoutEffect(() => {
    if (sessionId === undefined) { setReference(undefined); return }
    const owned = sessionController.retain(sessionId, { source: 'ohStoryWorkbench' })
    setReference(owned)
    return () => { owned.release() }
  }, [sessionId, sessionController])
  // Never render a previous Session's buffers while a new reference is being acquired.
  const selected = reference?.sessionId === sessionId ? reference : undefined
  return <SessionProvider session={selected} empty={empty}>{renderSlot('oh-story.workspace', {})}</SessionProvider>
}
