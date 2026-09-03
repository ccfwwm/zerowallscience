// @vitest-environment jsdom
/**
 * DOM overlay tests (src/client/override.ts): the overlay shows the
 * vscode-icons theme images beside the better-sidebar explorer row svg
 * icons (VscFile / VscFolder / VscFolderOpened shapes) and editor-tab
 * icons. Pins row detection (title ⇒ file, folder path shape ⇒ open/closed,
 * no role ⇒ root), tab detection (title resolves to a real file), the
 * React-rebuild re-apply loop (original svg stays in place, hidden; a
 * rebuilt svg is re-hidden; exactly one overlay img per element), scheme
 * flips, and unload restoration.
 *
 * The overlay NEVER replaces React-managed nodes (that breaks React's DOM
 * bookkeeping): the original svg keeps its position with display:none and
 * our img is inserted beside it.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createIconOverlay } from '../src/client/override.ts'

const FOLDER_CLOSED_D = 'M2 4.5V6H5.58579'
const FOLDER_OPEN_D = 'M2 4.5V9.10022L2.92389'
const FILE_D = 'M1 1H15V15H1Z'
const MARK = 'data-dsh-better-sidebar-icons'

const srcPath = (img: HTMLImageElement | null | undefined): string =>
  img === null || img === undefined ? '' : new URL(img.src).pathname

function makeSvg(d: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', d)
  svg.appendChild(path)
  return svg
}

function fileRow(name: string, path: string): HTMLDivElement {
  const row = document.createElement('div')
  row.setAttribute('role', 'button')
  row.setAttribute('tabindex', '0')
  row.setAttribute('title', path)
  row.appendChild(makeSvg(FILE_D))
  const span = document.createElement('span')
  span.className = 'abc_explorerName'
  span.textContent = name
  row.appendChild(span)
  return row
}

function folderRow(name: string, open: boolean): HTMLDivElement {
  const row = document.createElement('div')
  row.setAttribute('role', 'button')
  row.appendChild(makeSvg(open ? FOLDER_OPEN_D : FOLDER_CLOSED_D))
  const span = document.createElement('span')
  span.className = 'abc_explorerName'
  span.textContent = name
  row.appendChild(span)
  return row
}

function rootRow(name: string): HTMLDivElement {
  const row = document.createElement('div')
  row.className = 'abc_explorerRow'
  row.appendChild(makeSvg(FOLDER_OPEN_D))
  const span = document.createElement('span')
  span.className = 'abc_explorerName'
  span.textContent = name
  row.appendChild(span)
  return row
}

function tabRow(title: string, iconD: string): HTMLDivElement {
  const tab = document.createElement('div')
  tab.setAttribute('title', title)
  tab.appendChild(makeSvg(iconD))
  const span = document.createElement('span')
  span.className = 'abc_tabTitle'
  span.textContent = title
  tab.appendChild(span)
  const close = document.createElement('button')
  close.appendChild(makeSvg('M1 1L15 15'))
  tab.appendChild(close)
  return tab
}

function mountHost(rows: HTMLElement[]): HTMLElement {
  const host = document.createElement('div')
  host.setAttribute('data-dsh-better-sidebar', '')
  for (const row of rows) host.appendChild(row)
  document.body.appendChild(host)
  return host
}

const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 10))

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('row overlay', () => {
  it('keeps the original svg in place (hidden) and inserts the img beside it', async () => {
    const host = mountHost([fileRow('package.json', '/workspace/package.json')])
    const overlay = createIconOverlay()
    overlay.start()
    await tick()
    const row = host.firstElementChild as HTMLElement
    const img = row.querySelector<HTMLImageElement>(`img[${MARK}]`)
    expect(img).not.toBeNull()
    expect(srcPath(img)).toBe('/dsh-better-sidebar-icons/icons/file_type_npm.svg')
    expect(img!.width).toBe(14)
    // The React-managed svg is still a direct child, just hidden.
    const svgs = Array.from(row.children).filter((c): c is SVGSVGElement => c instanceof SVGElement)
    expect(svgs.length).toBe(1)
    expect(svgs[0]!.style.display).toBe('none')
  })

  it('overlays folder rows with closed/open variants (path shape ⇒ state)', async () => {
    const host = mountHost([folderRow('src', false), folderRow('src', true)])
    const overlay = createIconOverlay()
    overlay.start()
    await tick()
    const imgs = host.querySelectorAll<HTMLImageElement>(`img[${MARK}]`)
    expect(imgs.length).toBe(2)
    expect(srcPath(imgs[0])).toBe('/dsh-better-sidebar-icons/icons/folder_type_src.svg')
    expect(srcPath(imgs[1])).toBe('/dsh-better-sidebar-icons/icons/folder_type_src_opened.svg')
  })

  it('overlays the root row with the root folder icon (no role ⇒ root, opened)', async () => {
    const host = mountHost([rootRow('workspace')])
    const overlay = createIconOverlay()
    overlay.start()
    await tick()
    const img = host.querySelector<HTMLImageElement>(`img[${MARK}]`)
    expect(img).not.toBeNull()
    expect(srcPath(img)).toBe('/dsh-better-sidebar-icons/icons/default_root_folder_opened.svg')
  })

  it('ignores role=button chrome without an explorerName label', async () => {
    const host = mountHost([])
    const button = document.createElement('button')
    button.setAttribute('role', 'button')
    button.setAttribute('title', 'referenceFile')
    button.appendChild(makeSvg(FILE_D))
    host.appendChild(button)
    const overlay = createIconOverlay()
    overlay.start()
    await tick()
    expect(host.querySelector(`img[${MARK}]`)).toBeNull()
  })

  it('re-hides a svg React rebuilds beside the img, keeping exactly one overlay', async () => {
    const host = mountHost([fileRow('main.py', '/workspace/main.py')])
    const overlay = createIconOverlay()
    overlay.start()
    await tick()
    expect(host.querySelectorAll(`img[${MARK}]`).length).toBe(1)
    // Simulate a React rebuild: React re-inserts its svg before the img
    // (the img is an unknown node to React, so the svg lands in front).
    const row = host.firstElementChild as HTMLElement
    const img = row.querySelector(`img[${MARK}]`) as HTMLImageElement
    row.insertBefore(makeSvg(FILE_D), img)
    await tick()
    // eslint-disable-next-line no-console
    console.log('DEBUG re-hides: imgs=', host.querySelectorAll(`img[${MARK}]`).length,
      'children=', Array.from(row.children).map(c => c.tagName).join(','),
      'svgDisplay=', Array.from(row.children).filter(c => c instanceof SVGElement).map(s => (s as SVGElement).style.display).join(','))
    const imgs = host.querySelectorAll<HTMLImageElement>(`img[${MARK}]`)
    expect(imgs.length).toBe(1)
    expect(srcPath(imgs[0])).toBe('/dsh-better-sidebar-icons/icons/file_type_python.svg')
    const svgs = Array.from(row.children).filter((c): c is SVGSVGElement => c instanceof SVGElement)
    // The original hidden svg stays in place (React can still manage it) and
    // the rebuilt one is hidden too: every svg is hidden, one img shows.
    expect(svgs.length).toBe(2)
    expect(svgs.every(s => s.style.display === 'none')).toBe(true)
  })

  it('restores the original svg (display back, img removed) on dispose', async () => {
    const host = mountHost([fileRow('package.json', '/workspace/package.json'), folderRow('src', false)])
    const overlay = createIconOverlay()
    overlay.start()
    await tick()
    expect(host.querySelectorAll(`img[${MARK}]`).length).toBe(2)
    overlay.dispose()
    expect(host.querySelector(`img[${MARK}]`)).toBeNull()
    for (const row of host.children) {
      const svgs = Array.from(row.children).filter((c): c is SVGSVGElement => c instanceof SVGElement)
      expect(svgs.length).toBe(1)
      expect(svgs[0]!.style.display).not.toBe('none')
    }
  })

  it('starts once the host mounts (async sidebar)', async () => {
    const overlay = createIconOverlay()
    overlay.start()
    await tick()
    expect(document.querySelector(`img[${MARK}]`)).toBeNull()
    const host = mountHost([fileRow('index.ts', '/workspace/index.ts')])
    await tick()
    const img = host.querySelector<HTMLImageElement>(`img[${MARK}]`)
    expect(img).not.toBeNull()
    expect(srcPath(img)).toBe('/dsh-better-sidebar-icons/icons/file_type_typescript.svg')
    overlay.dispose()
  })

  it('flips icon variants on scheme change (body[data-ds-dark-theme])', async () => {
    document.body.removeAttribute('data-ds-dark-theme')
    const host = mountHost([fileRow('hello.ada', '/workspace/hello.ada')])
    const overlay = createIconOverlay()
    overlay.start()
    await tick()
    const img = host.querySelector<HTMLImageElement>(`img[${MARK}]`)
    expect(srcPath(img)).toBe('/dsh-better-sidebar-icons/icons/file_type_light_ada.svg')
    document.body.setAttribute('data-ds-dark-theme', '')
    await tick()
    expect(srcPath(img)).toBe('/dsh-better-sidebar-icons/icons/file_type_ada.svg')
    overlay.dispose()
  })
})

describe('tab overlay', () => {
  it('overlays a file tab whose title resolves to a real file icon', async () => {
    const host = mountHost([tabRow('main.ts', FILE_D)])
    const overlay = createIconOverlay()
    overlay.start()
    await tick()
    const img = host.querySelector<HTMLImageElement>(`img[${MARK}]`)
    expect(img).not.toBeNull()
    expect(srcPath(img)).toBe('/dsh-better-sidebar-icons/icons/file_type_typescript.svg')
  })

  it('leaves built-in tabs (non-file titles) untouched', async () => {
    const host = mountHost([tabRow('Git', FILE_D), tabRow('Terminal', FILE_D), tabRow('Files', FILE_D)])
    const overlay = createIconOverlay()
    overlay.start()
    await tick()
    expect(host.querySelector(`img[${MARK}]`)).toBeNull()
  })

  it('restores tab icons on dispose', async () => {
    const host = mountHost([tabRow('notes.md', FILE_D)])
    const overlay = createIconOverlay()
    overlay.start()
    await tick()
    expect(host.querySelector(`img[${MARK}]`)).not.toBeNull()
    overlay.dispose()
    expect(host.querySelector(`img[${MARK}]`)).toBeNull()
    const tab = host.firstElementChild as HTMLElement
    expect(tab.firstElementChild!.tagName.toLowerCase()).toBe('svg')
  })
})
