import { useLayoutEffect, useState, type RefObject, type CSSProperties } from 'react'

/** Keep portaled menus above their trigger where possible and inside the viewport. */
export function useFloatingPanel(open: boolean, anchor: RefObject<HTMLElement>, panel: RefObject<HTMLElement>) {
  const [position, setPosition] = useState<CSSProperties>({ visibility: 'hidden', left: 0, top: 0 })
  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const rect = anchor.current?.getBoundingClientRect()
      const menu = panel.current
      if (!rect || !menu) return
      const margin = 12
      const top = rect.top - menu.offsetHeight - 8
      const left = Math.max(margin, Math.min(rect.right - menu.offsetWidth, window.innerWidth - menu.offsetWidth - margin))
      const nextTop = Math.max(margin, Math.min(top >= margin ? top : rect.bottom + 8, window.innerHeight - menu.offsetHeight - margin))
      setPosition(previous => previous.left === left && previous.top === nextTop && previous.visibility !== 'hidden' ? previous : { left, top: nextTop })
    }
    place()
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(place)
    if (panel.current) observer?.observe(panel.current)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => { observer?.disconnect(); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true) }
  }, [open, anchor, panel])
  return position
}
