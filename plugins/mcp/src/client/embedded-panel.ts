/** Fit inside Settings' actual scrollport, including user-resized dialogs. */
export function observeEmbeddedPanelSize(panel: HTMLElement): () => void {
  const ancestors: HTMLElement[] = []
  for (let parent = panel.parentElement; parent; parent = parent.parentElement) ancestors.push(parent)
  const fit = () => {
    // Visited settings tabs stay mounted while hidden. Keep the last useful
    // measurement until ResizeObserver sees the tab become visible again.
    if (panel.getClientRects().length === 0) return
    const top = panel.getBoundingClientRect().top
    let bottom = window.innerHeight
    for (const ancestor of ancestors) {
      const style = getComputedStyle(ancestor)
      if (!/^(auto|scroll|hidden|clip)$/u.test(style.overflowY)) continue
      const rect = ancestor.getBoundingClientRect()
      bottom = Math.min(bottom, rect.top + ancestor.clientTop + ancestor.clientHeight - (parseFloat(style.paddingBottom) || 0))
    }
    panel.style.setProperty('--mcp-panel-height', `${Math.max(0, Math.floor(bottom - top))}px`)
  }
  const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(fit)
  // The panel also changes size when a visited tab is shown or its header wraps.
  for (const element of [panel, ...ancestors]) observer?.observe(element)
  window.addEventListener('resize', fit)
  fit()
  return () => {
    observer?.disconnect()
    window.removeEventListener('resize', fit)
    panel.style.removeProperty('--mcp-panel-height')
  }
}
