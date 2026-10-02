// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { createElement, type ComponentType } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
vi.mock('@open-file-viewer/core', () => {
  const factory = () => ({})
  return { createViewer: () => ({ resize() {}, destroy() {} }), ...Object.fromEntries(['imagePlugin', 'videoPlugin', 'audioPlugin', 'pdfPlugin', 'officePlugin', 'archivePlugin', 'emailPlugin', 'drawingPlugin', 'xmindPlugin', 'cadPlugin', 'model3dPlugin', 'gisPlugin', 'epubPlugin', 'xpsPlugin', 'ofdPlugin', 'assetPlugin', 'fallbackPlugin'].map(name => [name, factory])) }
})
vi.mock('viewer-pdfjs', () => ({}))
import { installUniversalViewer, DEFAULT_VIEWER_EXTENSIONS } from '../src/client/universal-viewer.js'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
it('opens a native sidebar resource through the public tab hook, then explicitly switches to the native renderer', async () => {
  vi.stubGlobal('requestAnimationFrame', () => 1); vi.stubGlobal('cancelAnimationFrame', () => {})
  let Body!: ComponentType<any>
  const openResource = vi.fn()
  const disposers: Array<() => void> = []
  const slots = { inject: (_name: string, fn: () => void) => fn(), register: (_definition: unknown, component: ComponentType<any>) => { Body = component; return () => {} } }
  const registerTab = vi.fn(() => () => {})
  const registerFileViewer = vi.fn(() => () => {})
  const ctx = {
    effect: (fn: () => void | (() => void)) => { const result = fn(); if (result) disposers.push(result) },
    get: (name: string) => ({ slots, sidebarRightTabs: { register: registerTab }, sidebarRight: { openResource }, 'remote.zerowallFiles': {} })[name],
    betterSidebar: { registerFileViewer, registerTab: () => () => {}, openTab() {} },
  }
  const readBytes = vi.fn(async () => ({ ok: true as const, value: { data: new Uint8Array([1, 2]), bytes: 2, eof: true, version: 'v1' } }))
  installUniversalViewer(ctx as any, { readBytes })
  for (const ext of ['shp', 'geojson', 'topojson', 'kml', 'kmz', 'gpx']) {
    expect(registerFileViewer.mock.calls[0][0].exts).toContain(ext)
    expect(registerTab.mock.calls[0][0].canOpen('dsh-resource://file/session/session-1/test.' + ext)).toBe(true)
  }
  expect(document.querySelector('#ofv-leaflet-css')?.getAttribute('href')).toMatch(/^\/zerowall\/viewer-assets\/[a-f0-9]{64}\/leaflet\/leaflet.css$/u)
  for (const ext of ['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'csv', 'tsv', 'md', 'html', 'txt', 'stl']) {
    expect(DEFAULT_VIEWER_EXTENSIONS).not.toContain(ext)
    expect(registerFileViewer.mock.calls[0][0].exts).not.toContain(ext)
    expect(registerTab.mock.calls[0][0].canOpen('dsh-resource://file/session/session-1/test.' + ext)).toBe(false)
  }
  const address = 'dsh-resource://file/session/session-1/%E7%A7%91%E7%A0%94%23%E7%BB%93%E6%9E%9C.zip'
  render(createElement(Body, { useTabInfo: () => ({ tab: { contentId: address } }) }))
  await screen.findByText(/通用查看器/u)
  expect(readBytes.mock.calls[0]?.slice(0, 2)).toEqual(['session-1', '科研#结果.zip'])
  fireEvent.click(screen.getByRole('button', { name: '原生查看器' }))
  await waitFor(() => expect(openResource).toHaveBeenCalledWith(address, { kind: 'text' }))
  expect(screen.queryByRole('button', { name: 'Office→PDF' })).toBeNull()
  disposers.forEach(dispose => dispose())
})

it('converts an explicit Office fallback through the scope-bound Remote and cancels on close', async () => {
  vi.stubGlobal('requestAnimationFrame', () => 1); vi.stubGlobal('cancelAnimationFrame', () => {})
  const disposers: Array<() => void> = []
  let Body!: ComponentType<any>
  const renderWorkspaceOffice = vi.fn(async () => ({ ok: true as const, value: { data: btoa('%PDF-1.7'), missingFonts: [] } }))
  const slots = { inject() {}, register: () => () => {} }
  const ctx = {
    effect: (fn: () => void | (() => void)) => { const dispose = fn(); if (dispose) disposers.push(dispose) },
    get: (name: string) => ({ slots, sidebarRightTabs: { register: () => () => {} }, 'remote.zerowallFiles': { renderWorkspaceOffice } })[name],
    betterSidebar: { registerFileViewer: () => () => {}, registerTab: (definition: any) => { Body = definition.component; return () => {} }, openTab() {} },
  }
  const readBytes = vi.fn()
  installUniversalViewer(ctx as any, { readBytes })
  const view = render(createElement(Body, { tab: { meta: { address: 'dsh-resource://file/session/no-workspace/C%3A/%E7%A7%91%E7%A0%94.pptx', mode: 'office-pdf' } } }))
  await screen.findByText(/通用查看器/u)
  const [input, signal] = renderWorkspaceOffice.mock.calls[0] as any
  expect(input).toEqual({ sessionId: 'no-workspace', path: 'C:/科研.pptx' })
  expect(signal).toBeInstanceOf(AbortSignal)
  expect(signal.aborted).toBe(false)
  expect(readBytes).not.toHaveBeenCalled()
  view.unmount()
  expect(signal.aborted).toBe(true)
  disposers.forEach(dispose => dispose())
})
