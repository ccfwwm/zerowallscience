import { api } from './api'
export const PPT_REFERENCE_MIME = 'application/x-zerowall-ppt-reference'
export interface PptReferenceTarget {
  sessionId: string; key: string; page: string; ids?: string[]; region?: [number, number, number, number]; version?: string
}
/** Uses the host composer's structured chip protocol, preserving its live selection. */
export function insertReference(ctx: any, sessionId: string, reference: { ref: string; label: string }): boolean {
  try {
    const scope = ctx.sessions.scope(sessionId)
    const input = ctx.get('conversation')?.input.for(scope)
    if (!scope || !input) return false
    const before = input.state.getSnapshot()
    if (before.draftRev === undefined) return false
    const el = document.querySelector<HTMLTextAreaElement>('#root [data-slot="conversation"] textarea[data-phase], #root [data-slot="conversation"] textarea')
    const start = el && el.value === before.draft ? el.selectionStart : before.draft.length
    const end = el && el.value === before.draft ? el.selectionEnd : before.draft.length
    scope.emit('slash/input-insert-reference', {
      reference: { source: 'reference', ref: reference.ref, label: reference.label, appearance: 'file', clipboardText: reference.ref },
      span: { draftRev: before.draftRev, start, end },
    })
    return input.state.getSnapshot().draftRev !== before.draftRev
  } catch { return false }
}
export async function referenceTarget(ctx: any, target: PptReferenceTarget): Promise<boolean> {
  const reference = await api.reference(target)
  return insertReference(ctx, target.sessionId, reference)
}
export function installReferenceDrop(ctx: any, currentSession: () => string | null): () => void {
  const composer = (event: DragEvent) => event.target instanceof Element && event.target.closest('[data-slot="conversation"]')
  const over = (event: DragEvent) => {
    if (composer(event) && event.dataTransfer?.types.includes(PPT_REFERENCE_MIME)) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy' }
  }
  const drop = (event: DragEvent) => {
    if (!composer(event)) return
    const raw = event.dataTransfer?.getData(PPT_REFERENCE_MIME)
    if (!raw) return
    event.preventDefault(); event.stopPropagation()
    try {
      const target = JSON.parse(raw) as PptReferenceTarget
      if (target.sessionId !== currentSession()) return
      void referenceTarget(ctx, target).catch(error => console.warn('[PPT Research Master] reference:', error))
    } catch {}
  }
  document.addEventListener('dragover', over, true); document.addEventListener('drop', drop, true)
  return () => { document.removeEventListener('dragover', over, true); document.removeEventListener('drop', drop, true) }
}
