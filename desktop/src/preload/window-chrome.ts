import { ipcRenderer } from 'electron'

/** Preload owns chrome so it is available before the Host, in errors and on navigation. */
export function mountWindowChrome(): void {
  if (process.platform !== 'win32' || window.top !== window) return
  const mount = () => {
    document.documentElement.dataset.zerowallChrome = 'integrated'
    const style = document.createElement('style')
    style.textContent = `
      html[data-zerowall-chrome] body { --zw-chrome-height:48px; }
      #zerowall-window-controls { position:fixed; top:10px; left:12px; display:flex; align-items:center; gap:1px; height:28px; z-index:2147483646; -webkit-app-region:no-drag; }
      #zerowall-window-controls button { display:grid; place-items:center; width:24px; height:28px; margin:0; padding:0; border:0; background:transparent; cursor:default; -webkit-app-region:no-drag; }
      #zerowall-window-controls i { display:grid; place-items:center; width:15px; height:15px; border-radius:50%; background:var(--light); box-shadow:inset 0 0 0 1px #0002, 0 1px 2px #00000018; color:#342726; font-style:normal; transition:filter .16s ease, opacity .16s ease, transform .16s ease; }
      #zerowall-window-controls .control-icon { display:block; width:8px; height:8px; overflow:visible; stroke:var(--ink); stroke-width:1.55; stroke-linecap:round; stroke-linejoin:round; fill:none; pointer-events:none; }
      #zerowall-window-controls button:hover i, #zerowall-window-controls button:focus-visible i { filter:brightness(.96) saturate(1.08); transform:scale(1.08); }
      #zerowall-window-controls button:active i { transform:scale(.94); }
      #zerowall-window-controls button:focus-visible { outline:2px solid #6578d0; outline-offset:-1px; border-radius:6px; }
      #zerowall-window-controls[data-focused=false] i { opacity:1; filter:none; }
      #zerowall-window-controls [data-action=close] i { --ink:#6e2926; }
      #zerowall-window-controls [data-action=minimize] i { --ink:#6a4a00; }
      #zerowall-window-controls [data-action=toggle-maximize] i { --ink:#145b2a; }
      #zerowall-window-drag { position:fixed; top:0; left:88px; right:0; height:8px; z-index:2147483645; -webkit-app-region:drag; }
      html[data-zerowall-chrome] header:has([data-conversation-header-corner]) > div:first-child { min-height:40px; -webkit-app-region:drag; }
      html[data-zerowall-chrome] header button, html[data-zerowall-chrome] header input, html[data-zerowall-chrome] header [role=tab] { -webkit-app-region:no-drag; }
      html[data-zerowall-chrome] [data-sidebar-header] { padding-top:40px; height:92px; -webkit-app-region:drag; }
      html[data-zerowall-chrome] [data-sidebar-rail=true] [data-sidebar-header] { padding-top:22px; height:58px; }
      html[data-zerowall-chrome] [data-sidebar-collapsed=true] > div:nth-of-type(2) { padding-top:8px; }
      html[data-zerowall-chrome] [data-sidebar-collapsed=true] header:has([data-conversation-header-corner]) > div:first-child { padding-left:40px; }
      html[data-zerowall-chrome] div:has(> [data-shell-overlay]) button,
      html[data-zerowall-chrome] div:has(> [data-shell-overlay]) input,
      html[data-zerowall-chrome] div:has(> [data-shell-overlay]) a,
      html[data-zerowall-chrome] div:has(> [data-shell-overlay]) [role=tab] { -webkit-app-region:no-drag; }
    `
    document.head.append(style)
    const controls = document.createElement('div')
    controls.id = 'zerowall-window-controls'
    controls.setAttribute('aria-label', '窗口控制')
    controls.setAttribute('role', 'group')
    for (const [action, title, color, kind] of [
      ['close', '收起到托盘', '#ff5f57', 'close'],
      ['minimize', '最小化', '#febc2e', 'minimize'],
      ['toggle-maximize', '最大化', '#28c840', 'maximize'],
    ] as const) {
      const button = document.createElement('button')
      button.type = 'button'; button.title = title; button.setAttribute('aria-label', title)
      button.dataset.action = action
      button.style.setProperty('--light', color)
      const dot = document.createElement('i')
      dot.append(createWindowControlIcon(kind))
      button.append(dot)
      button.onclick = () => { void ipcRenderer.invoke('desktop:window-control', action).catch(() => undefined) }
      controls.append(button)
    }
    const drag = document.createElement('div'); drag.id = 'zerowall-window-drag'
    document.body.append(drag, controls)
    const update = (_event: unknown, state: { maximized: boolean; focused: boolean }) => {
      controls.dataset.focused = String(state.focused)
      const button = controls.querySelector<HTMLButtonElement>('[data-action=toggle-maximize]')!
      const title = state.maximized ? '还原窗口' : '最大化'
      button.title = title; button.setAttribute('aria-label', title)
      const icon = button.querySelector<SVGSVGElement>('.control-icon')!
      icon.dataset.state = state.maximized ? 'restore' : 'maximize'
      icon.replaceWith(createWindowControlIcon(state.maximized ? 'restore' : 'maximize'))
    }
    ipcRenderer.on('desktop:window-state', update)
    void ipcRenderer.invoke('desktop:window-control', 'state').then(state => update(null, state)).catch(() => undefined)
    window.addEventListener('unload', () => ipcRenderer.removeListener('desktop:window-state', update), { once: true })
  }
  window.addEventListener('DOMContentLoaded', mount, { once: true })
}

function createWindowControlIcon(kind: 'close' | 'minimize' | 'maximize' | 'restore'): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 16 16')
  svg.setAttribute('aria-hidden', 'true')
  svg.classList.add('control-icon')
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', kind === 'close' ? 'M4 4l8 8M12 4l-8 8'
    : kind === 'minimize' ? 'M3 8h10'
      : kind === 'restore' ? 'M5 6h6v6H5zM7 4h5v5'
        : 'M3 3h10v10H3z')
  svg.append(path)
  return svg
}
