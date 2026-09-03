/**
 * The DOM overlay: shows the vscode-icons theme images beside the
 * better-sidebar explorer row / editor-tab icons (react-icons VscFile /
 * VscFolder / VscFolderOpened), served by the plugin route.
 *
 * Row anchoring — the core renders file rows with `title={entry.path}`
 * (folders have no title) and every row carries a `.explorerName` label
 * span; the CSS Modules pattern `[hash]_[local]` keeps the local name in
 * the class, so `[class*="explorerName"]` is a stable, hash-free anchor.
 * Tab anchoring — every tab carries a `.tabTitle` label span; the icon is
 * the first svg before it. A tab is treated as a file tab when its title
 * resolves to a non-default icon (built-in tabs like Git/Terminal resolve
 * to the default and are left alone).
 *
 * CRITICAL — never replace React-managed nodes: the core renders these
 * icons as controlled React elements, and swapping them out breaks React's
 * DOM bookkeeping (its fiber tree still points at the old svg; the next
 * commit calls removeChild on a detached node and the whole tree blows up).
 * Instead each overlaid icon keeps the original svg IN PLACE with
 * `display:none` and inserts our `<img>` beside it — React can update and
 * remove its node freely, and a rebuilt svg is re-hidden by the next scan.
 * Everything is restored on dispose (hot reload / disable). Scheme flips
 * (body[data-ds-dark-theme]) re-resolve in place.
 */
import { ICON_THEME } from './icons-manifest.generated.ts'
import { baseName, iconUrl, resolveFileIcon, resolveFolderIcon } from './resolve-icon.ts'
import { isDarkScheme, subscribeScheme } from './scheme.ts'

/** Marker attribute on overlay <img> elements (own-row detection). */
const MARK = 'data-dsh-better-sidebar-icons'

/** react-icons VscFolderOpened path `d` prefix (the closed folder glyph
 *  diverges in the first command; VscFile never starts with this). */
const FOLDER_OPEN_D = 'M2 4.5V9.10022L2.92389'

/** The row icon size the core renders (VscFile/VscFolder at size={14}). */
const ROW_ICON_SIZE = 14

type RowKind = 'file' | 'folder' | 'root' | 'tab'

interface Overlaid {
  img: HTMLImageElement
  orig: SVGElement
  kind: RowKind
  name: string
  open: boolean
}

function resolve(kind: RowKind, name: string, open: boolean, light: boolean): string {
  if (kind === 'file' || kind === 'tab') return resolveFileIcon(name, light)
  if (kind === 'folder') return resolveFolderIcon(name, open, light)
  return open ? ICON_THEME.defaults.rootFolderOpen : ICON_THEME.defaults.rootFolder
}

/** The rendered size of one svg icon (falls back to the row size). */
function sizeOf(icon: SVGElement, fallback: number): number {
  const width = Number(icon.getAttribute('width'))
  return Number.isFinite(width) && width > 0 ? width : fallback
}

function makeImg(file: string, size: number): HTMLImageElement {
  const img = document.createElement('img')
  img.src = iconUrl(file)
  img.alt = ''
  img.draggable = false
  img.width = size
  img.height = size
  img.style.flexShrink = '0'
  img.setAttribute(MARK, '1')
  return img
}

export interface IconOverlay {
  /** Begin watching for the host mount and start overlaying. */
  start(): void
  /** Restore every touched element and stop watching. */
  dispose(): void
}

export function createIconOverlay(): IconOverlay {
  let disposed = false
  const overlays = new Map<HTMLImageElement, Overlaid>()
  let observer: MutationObserver | undefined
  let bodyObserver: MutationObserver | undefined
  let disposeScheme: (() => void) | undefined

  const refresh = (): void => {
    if (disposed) return
    const light = !isDarkScheme()
    for (const [img, o] of overlays) img.src = iconUrl(resolve(o.kind, o.name, o.open, light))
  }

  /** Hide the original svg in place and insert our img beside it. */
  const overlay = (host: HTMLElement, iconEl: SVGElement, kind: RowKind, name: string, open: boolean): void => {
    const img = makeImg(resolve(kind, name, open, !isDarkScheme()), sizeOf(iconEl, ROW_ICON_SIZE))
    iconEl.style.display = 'none'
    host.insertBefore(img, iconEl)
    overlays.set(img, { img, orig: iconEl, kind, name, open })
  }

  /** One file-tree row: anchor on its explorerName label. */
  const handleRow = (row: HTMLElement): void => {
    const svgs = Array.from(row.children).filter((c): c is SVGSVGElement => c instanceof SVGElement)
    if (svgs.length === 0) return
    if (row.querySelector(`[${MARK}]`) !== null) {
      // Already overlaid; React may have rebuilt a svg (in front of or
      // behind our img) — hide every svg in place.
      for (const svg of svgs) svg.style.display = 'none'
      return
    }
    const iconEl = svgs[0]!
    const nameEl = row.querySelector<HTMLElement>('[class*="explorerName"]')
    const name = (nameEl?.textContent ?? '').trim()
    if (name === '') return
    if (row.hasAttribute('title')) {
      overlay(row, iconEl, 'file', name, false)
      return
    }
    const d = iconEl.querySelector('path')?.getAttribute('d') ?? ''
    const open = d.startsWith(FOLDER_OPEN_D)
    // The tree root row has no role="button" (folder rows do).
    const kind: RowKind = row.hasAttribute('role') ? 'folder' : 'root'
    overlay(row, iconEl, kind, name, open)
  }

  /** One tab: anchor on its tabTitle label; the icon is the first svg
   *  before it. Only file tabs (title resolves to a non-default icon) are
   *  overlaid — built-in tabs resolve to the default and stay untouched. */
  const handleTab = (tab: HTMLElement, titleSpan: HTMLElement): void => {
    // Already overlaid? Our img sits somewhere before the title label —
    // check the whole run first (the hidden svg may be the nearest sibling).
    let ourImg = false
    for (let el = titleSpan.previousElementSibling; el !== null; el = el.previousElementSibling) {
      if (el instanceof HTMLImageElement && el.hasAttribute(MARK)) {
        ourImg = true
        break
      }
    }
    if (ourImg) {
      // Hide every svg React rendered between the img and the title label.
      for (let el = titleSpan.previousElementSibling; el !== null; el = el.previousElementSibling) {
        if (el instanceof SVGElement) el.style.display = 'none'
      }
      return
    }
    let icon: SVGElement | null = null
    for (let el = titleSpan.previousElementSibling; el !== null; el = el.previousElementSibling) {
      if (el instanceof SVGElement) {
        icon = el
        break
      }
    }
    if (icon === null) return
    const name = (titleSpan.textContent ?? '').trim()
    if (name === '') return
    // Only recognizable files: built-in tab titles resolve to the default.
    if (resolveFileIcon(baseName(name), !isDarkScheme()) === ICON_THEME.defaults.file) return
    overlay(tab, icon, 'tab', name, false)
  }

  const scan = (): void => {
    if (disposed) return
    const host = document.querySelector('[data-dsh-better-sidebar]')
    if (host === null) return
    for (const el of host.querySelectorAll<HTMLElement>('[role="button"], [class*="explorerRow"]')) {
      if (el.querySelector('[class*="explorerName"]') !== null) {
        try {
          handleRow(el)
        } catch {
          // Overlay errors must never escape into the observer (a throw in
          // a MutationObserver callback would poison the page). Skip the row.
        }
      }
    }
    for (const span of host.querySelectorAll<HTMLElement>('[class*="tabTitle"]')) {
      const tab = span.parentElement
      if (tab !== null) {
        try {
          handleTab(tab, span)
        } catch {
          // Same guard as rows: a tab overlay failure skips that tab only.
        }
      }
    }
  }

  const attach = (host: Element): void => {
    observer = new MutationObserver(scan)
    observer.observe(host, { childList: true, subtree: true })
    disposeScheme = subscribeScheme(refresh)
    scan()
  }

  return {
    start() {
      const host = document.querySelector('[data-dsh-better-sidebar]')
      if (host !== null) {
        attach(host)
        return
      }
      // Host not mounted yet: watch the body until the sidebar appears.
      bodyObserver = new MutationObserver(() => {
        const found = document.querySelector('[data-dsh-better-sidebar]')
        if (found === null) return
        bodyObserver?.disconnect()
        bodyObserver = undefined
        attach(found)
      })
      bodyObserver.observe(document.body, { childList: true, subtree: true })
    },
    dispose() {
      disposed = true
      observer?.disconnect()
      observer = undefined
      bodyObserver?.disconnect()
      bodyObserver = undefined
      disposeScheme?.()
      disposeScheme = undefined
      for (const [img, o] of overlays) {
        o.orig.style.display = ''
        img.remove()
      }
      overlays.clear()
    },
  }
}

// Re-export for tests/tools: keep the basename helper reachable.
export { baseName }
