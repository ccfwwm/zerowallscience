import { WINDOWS_TITLEBAR_HEIGHT } from './windows-layout.ts'
/** Synchronizes Windows context menus and caption colors with the application document. */
import { ipcRenderer } from 'electron'
import { DESKTOP_IPC } from './ipc.ts'
import { installWindowsMenu } from './preload-menu.ts'

/** Install the Windows-only titlebar marker and observe application language and palette changes. */
export function syncWindowsAppearance(): void {
  if (process.platform !== 'win32') return
  const mark = (): void => {
    const root = document.documentElement
    root.dataset.windowsTitlebar = ''
    root.style.setProperty('--dsh-windows-titlebar-height', `${WINDOWS_TITLEBAR_HEIGHT}px`)
  }
  // The root can be absent before the HTML parser creates it.
  if ((document.documentElement as HTMLElement | null) !== null) mark()
  const install = (): void => {
    mark()
    const root = document.documentElement
    const menu = installWindowsMenu()
    const probe = document.createElement('span')
    probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;background-color:var(--dsw-specific-titlebar-fill, var(--dsw-specific-sidebar-fill, transparent));color:var(--dsw-alias-label-primary)'
    document.body.append(probe)
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (context === null) throw new Error('Desktop caption requires a 2D canvas context')
    const nativeColor = (color: string): string => {
      context.clearRect(0, 0, 1, 1)
      context.fillStyle = color
      context.fillRect(0, 0, 1, 1)
      const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data
      return `rgba(${red}, ${green}, ${blue}, ${Number(alpha) / 255})`
    }
    let previous = ''
    let frame: number | undefined
    const send = (): void => {
      frame = undefined
      const ink = document.hasFocus() ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-secondary)'
      if (probe.style.color !== ink) probe.style.color = ink
      const style = getComputedStyle(probe)
      context.clearRect(0, 0, 1, 1)
      // A theme may not have arrived yet. Composite transparency onto an opaque first-frame palette.
      context.fillStyle = document.body.hasAttribute('data-ds-dark-theme') ? '#1b1b1c' : '#f9fafb'
      context.fillRect(0, 0, 1, 1)
      context.fillStyle = style.backgroundColor
      context.fillRect(0, 0, 1, 1)
      // Native caption buttons do not receive the document's modal mask.
      // Sample the adjacent strip and composite its covering mask over the titlebar palette.
      const layers = document.elementsFromPoint(Math.max(0, window.innerWidth - 160), WINDOWS_TITLEBAR_HEIGHT / 2)
      for (const layer of layers.reverse()) {
        const computed = getComputedStyle(layer)
        if (computed.position !== 'fixed' || layer === probe) continue
        context.fillStyle = computed.backgroundColor
        context.fillRect(0, 0, 1, 1)
      }
      const [red, green, blue] = context.getImageData(0, 0, 1, 1).data
      const color = `rgba(${red}, ${green}, ${blue}, 1)`
      const symbolColor = nativeColor(style.color)
      const values = [root.lang, color, symbolColor]
      const current = JSON.stringify(values)
      if (current === previous) return
      previous = current
      menu.update()
      ipcRenderer.send(DESKTOP_IPC.windowsAppearance, ...values)
    }
    const schedule = (): void => { frame ??= requestAnimationFrame(send) }
    const observer = new MutationObserver(schedule)
    observer.observe(root, { attributes: true, attributeFilter: ['lang'] })
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme', 'style'] })
    observer.observe(document.head, { childList: true, subtree: true, characterData: true })
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'open', 'aria-modal'] })
    document.head.addEventListener('load', schedule, true)
    window.addEventListener('focus', schedule)
    window.addEventListener('blur', schedule)
    window.addEventListener('resize', schedule)
    window.addEventListener('pagehide', () => {
      observer.disconnect()
      menu.dispose()
      probe.remove()
      if (frame !== undefined) cancelAnimationFrame(frame)
      document.head.removeEventListener('load', schedule, true)
      window.removeEventListener('focus', schedule)
      window.removeEventListener('blur', schedule)
      window.removeEventListener('resize', schedule)
    }, { once: true })
    send()
  }
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', install, { once: true })
  else install()
}
