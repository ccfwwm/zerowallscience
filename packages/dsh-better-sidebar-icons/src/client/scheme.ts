/**
 * The live color scheme (dark vs light) for icon resolution: the app's theme
 * presenter toggles body[data-ds-dark-theme] at runtime, and the overlay
 * must switch to the light icon variants in place. One SHARED
 * MutationObserver backs every subscriber (a deep explorer tree mounts
 * hundreds of icons; per-icon observers would be pure waste).
 */

export function isDarkScheme(): boolean {
  return typeof document !== 'undefined' && document.body.hasAttribute('data-ds-dark-theme')
}

type SchemeListener = () => void
const schemeListeners = new Set<SchemeListener>()
let schemeObserver: MutationObserver | undefined

function ensureSchemeObserver(): void {
  if (schemeObserver !== undefined || typeof document === 'undefined') return
  schemeObserver = new MutationObserver(() => {
    for (const listener of schemeListeners) listener()
  })
  schemeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
}

/** Subscribe to scheme flips; returns a disposer. */
export function subscribeScheme(listener: SchemeListener): () => void {
  schemeListeners.add(listener)
  ensureSchemeObserver()
  return () => { schemeListeners.delete(listener) }
}
