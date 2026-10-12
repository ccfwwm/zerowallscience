import { useCallback } from 'react'
let target: HTMLElement | null = null
const listeners = new Set<() => void>()
const openListeners = new Set<() => void>()
export const accountSurface = {
  open() { for (const listener of openListeners) listener() },
  subscribeOpen(listener: () => void) { openListeners.add(listener); return () => { openListeners.delete(listener) } },
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
  getSnapshot: () => target,
}
// Keep one mounted controller for the settings page and sidebar dialog.
export function AccountSection() {
  const attach = useCallback((node: HTMLDivElement | null) => { target = node; for (const listener of listeners) listener() }, [])
  return <div ref={attach} />
}
