// Adapted from wenhongquan/dsh-open-file-viewer, MIT, commit 20aecc32cc597f6de094d2c7febddfb60f3ae1ef.
import { useEffect, useRef, useState } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { FileViewerProps } from 'dsh-better-sidebar/client/service'
import { createViewer, imagePlugin, videoPlugin, audioPlugin, pdfPlugin, officePlugin, archivePlugin, emailPlugin, drawingPlugin, xmindPlugin, cadPlugin, model3dPlugin, gisPlugin, epubPlugin, xpsPlugin, ofdPlugin, assetPlugin, fallbackPlugin } from '@open-file-viewer/core'
import * as pdfjs from 'viewer-pdfjs'
import viewerCss, { assetVersion } from 'zerowall:viewer-style'
import { readPreviewBytes, type ByteWindow } from './bounded-read.js'
import { NATIVE_OFFICE_EXTENSIONS, openNativeViewer, workspaceFileAddress } from './file-routing.js'
export { openNativeViewer, workspaceFileAddress, prefersNativeOffice } from './file-routing.js'

export const VIEWER_EXTENSIONS = ['pdf', 'doc', 'docx', 'docm', 'odt', 'rtf', 'xls', 'xlsx', 'xlsm', 'xlsb', 'ods', 'csv', 'tsv', 'fods', 'ppt', 'pptx', 'pptm', 'pps', 'odp', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'heic', 'avif', 'tif', 'tiff', 'mp4', 'webm', 'mov', 'mp3', 'wav', 'ogg', 'flac', 'zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz', 'eml', 'msg', 'mbox', 'drawio', 'excalidraw', 'xmind', 'dxf', 'dwg', 'dwf', 'step', 'stp', 'iges', 'ifc', 'gltf', 'glb', 'obj', 'stl', 'fbx', 'dae', 'ply', '3mf', 'usd', 'usdz', 'geojson', 'topojson', 'kml', 'kmz', 'gpx', 'shp', 'epub', 'xps', 'oxps', 'ofd', 'ttf', 'otf', 'woff', 'woff2', 'psd', 'ai', 'eps'] as const
// Scientific workbenches own microscopy TIFF and scene/mesh formats. Never override those.
const SCIENCE_EXTENSIONS = new Set(['tif', 'tiff', 'stl', 'obj', 'ply'])
// These extensions have native DSH document renderers. Both sidebars must
// yield them, regardless of plugin load order or whether a workspace exists.
export const DEFAULT_VIEWER_EXTENSIONS = VIEWER_EXTENSIONS.filter(ext => !SCIENCE_EXTENSIONS.has(ext) && !NATIVE_OFFICE_EXTENSIONS.has(ext))
export function previewCapability(name: string): '基础预览' | '仅元数据' {
  return /\.(dwg|dwf|step|stp|iges|ifc|usd|usdz|ai|eps)$/iu.test(name) ? '仅元数据' : '基础预览'
}
const root = `/zerowall/viewer-assets/${assetVersion}/`
function localGisPlugin(): ReturnType<typeof gisPlugin> {
  const plugin = gisPlugin()
  return { ...plugin, async render(ctx) {
    // The core's width:auto/height:auto SVG rule overrides Leaflet's size
    // attributes and clips large polygons to a default SVG viewport. Retain
    // Leaflet's pixel dimensions after creation, zoom and container resizing.
    const sizeLayers = () => {
      for (const svg of ctx.viewport.querySelectorAll<SVGSVGElement>('.leaflet-overlay-pane > svg')) {
        for (const dimension of ['width', 'height'] as const) {
          const pixels = Number(svg.getAttribute(dimension))
          if (pixels > 0) svg.style[dimension] = `${pixels}px`
        }
        svg.style.maxWidth = 'none'; svg.style.maxHeight = 'none'
      }
    }
    const observer = new MutationObserver(sizeLayers)
    observer.observe(ctx.viewport, { subtree: true, childList: true, attributes: true, attributeFilter: ['width', 'height'] })
    try {
      const instance = await plugin.render(ctx)
      sizeLayers()
      return { ...instance, destroy() { observer.disconnect(); instance.destroy?.() } }
    } catch (cause) { observer.disconnect(); throw cause }
  } }
}
function plugins() {
  const pdf = { pdfjs: pdfjs as any, workerSrc: root + 'build/pdf.worker.mjs', cMapUrl: root + 'cmaps/', standardFontDataUrl: root + 'standard_fonts/', wasmUrl: root + 'wasm/', webFallbackScripts: 'never' as const }
  return [imagePlugin(), videoPlugin(), audioPlugin(), pdfPlugin(pdf), officePlugin({ pdf, docx: { ignoreFonts: false } }), epubPlugin(), xpsPlugin(), ofdPlugin(), archivePlugin(), emailPlugin(), drawingPlugin(), xmindPlugin(), cadPlugin({ libreDwg: false, webglDwg: false }), model3dPlugin(), localGisPlugin(), assetPlugin(), fallbackPlugin()]
}

export function UniversalPreview({ name, bytes, retry, fallback, nativeFallback }: { name: string; bytes: Uint8Array; retry?: () => void; fallback?: () => void; nativeFallback?: () => void }) {
  const host = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string>()
  const [stage, setStage] = useState('加载渲染器')
  useEffect(() => {
    const container = host.current
    if (!container) return
    let live = true
    let viewer: ReturnType<typeof createViewer> | undefined
    setError(undefined); setStage('初始化渲染器')
    container.replaceChildren()
    try {
      const buffer = new ArrayBuffer(bytes.byteLength)
      new Uint8Array(buffer).set(bytes)
      viewer = createViewer({ container, file: buffer, fileName: name, width: '100%', height: '100%', fit: 'contain', toolbar: true, theme: 'auto', plugins: plugins(), onError: cause => { if (live) setError(cause.message) } })
      setStage('渲染文件')
      const frame = requestAnimationFrame(() => { if (live) viewer?.resize() })
      return () => { live = false; cancelAnimationFrame(frame); viewer?.destroy() }
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    return () => { live = false; viewer?.destroy() }
  }, [bytes, name])
  const download = () => {
    const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes)]))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 300 }}>
    <div style={{ padding: 8 }}>通用查看器 · {previewCapability(name)} · {bytes.length.toLocaleString()} 字节
      <button onClick={download}>下载原文件</button>{retry && <button onClick={retry}>重试</button>}{nativeFallback && <button onClick={() => { try { nativeFallback() } catch (cause) { setError(String(cause)) } }}>原生查看器</button>}{fallback && <button onClick={fallback}>Office→PDF</button>}
    </div>
    {error && <div role="alert" style={{ padding: 12 }}>预览失败（{stage}）：{error}。基础预览可能无法还原复杂版面；原文件可下载。</div>}
    <div ref={host} style={{ flex: 1, minHeight: 260, overflow: 'hidden', position: 'relative' }} />
  </div>
}
type Envelope<T> = { ok: true; value: T } | { ok: false; error: { message: string } }
export interface WorkspaceRemote { readBytes(sessionId: string, path: string, options: { range: { offset: number; length: number } }, signal: AbortSignal): Promise<Envelope<ByteWindow>> }
export async function loadWorkspacePreview(remote: WorkspaceRemote, sessionId: string, path: string, signal: AbortSignal) {
  return readPreviewBytes(async (offset, length) => {
    const result = await remote.readBytes(sessionId, path, { range: { offset, length } }, signal)
    if (!result.ok) throw new Error(result.error.message)
    return result.value
  }, signal)
}
export function installUniversalViewer(ctx: Context, remote: WorkspaceRemote): void {
  const files = ctx.get('remote.zerowallFiles') as { renderWorkspaceOffice(input: { sessionId: string; path: string }, signal: AbortSignal): Promise<Envelope<{ data: string; missingFonts: string[] }>> }
  ctx.effect(() => {
    const style = document.createElement('style'); style.textContent = viewerCss; style.dataset.zerowallViewer = '1'; document.head.append(style)
    // The GIS renderer otherwise requests Leaflet CSS from jsDelivr. Install
    // its bundled CSS under the upstream marker so geometry works offline.
    const existing = document.getElementById('ofv-leaflet-css')
    const leaflet = existing ?? document.createElement('link')
    if (!existing) { leaflet.id = 'ofv-leaflet-css'; (leaflet as HTMLLinkElement).rel = 'stylesheet'; (leaflet as HTMLLinkElement).href = root + 'leaflet/leaflet.css'; document.head.append(leaflet) }
    return () => { style.remove(); if (!existing) leaflet.remove() }
  })
  ctx.effect(() => ctx.betterSidebar.registerFileViewer({ id: 'zerowall:universal', title: '通用文件查看器', exts: DEFAULT_VIEWER_EXTENSIONS, priority: 50, fetchStrategy: 'custom', load: (path, scope, signal) => loadWorkspacePreview(remote, scope.sessionId, path, signal ?? new AbortController().signal), component: (props: FileViewerProps) => <NativePreview address={workspaceFileAddress(props.scope.sessionId, props.path)} initialBytes={props.customData as Uint8Array} /> }))
  const tabs = ctx.get('sidebarRightTabs') as { register(definition: unknown): () => void }
  const slots = ctx.get('slots') as { register(definition: unknown, component: unknown): () => void; inject(name: string, callback: () => void): void }
  const parse = (address: string) => {
    const match = /^dsh-resource:\/\/file\/session\/([^/]+)\/(.+)$/u.exec(address)
    if (!match) return undefined
    try { return { sessionId: decodeURIComponent(match[1]!), path: match[2]!.split('/').map(decodeURIComponent).join('/') } } catch { return undefined }
  }
  function NativePreview({ address, initialPdf = false, initialBytes }: { address: string; initialPdf?: boolean; initialBytes?: Uint8Array }) {
    const [bytes, setBytes] = useState<Uint8Array | undefined>(initialBytes)
    const [error, setError] = useState<string>()
    const [retry, setRetry] = useState(0)
    const [pdf, setPdf] = useState(initialPdf)
    const [warning, setWarning] = useState<string>()
    const ref = parse(address)
    useEffect(() => {
      const controller = new AbortController()
      if (initialBytes && !pdf && retry === 0) { setBytes(initialBytes); return () => controller.abort() }
      setBytes(undefined); setError(undefined)
      setWarning(undefined)
      if (ref) {
        const task = pdf ? files.renderWorkspaceOffice(ref, controller.signal).then(result => {
          if (!result.ok) throw new Error(result.error.message)
          if (result.value.missingFonts.length) setWarning(`缺少字体：${result.value.missingFonts.join(', ')}`)
          return Uint8Array.from(atob(result.value.data), char => char.charCodeAt(0))
        }) : loadWorkspacePreview(remote, ref.sessionId, ref.path, controller.signal)
        void task.then(value => { if (!controller.signal.aborted) setBytes(value) }).catch(cause => { if (!controller.signal.aborted) setError(String(cause)) })
      }
      return () => controller.abort()
    }, [address, retry, pdf, initialBytes])
    if (!ref) return <div role="alert">文件地址无效。</div>
    if (error) return <div role="alert">文件读取失败：{error}<button onClick={() => setRetry(v => v + 1)}>重试</button></div>
    if (!bytes) return <div>正在分段读取文件…</div>
    return <>{warning && <div role="status">{warning}</div>}<UniversalPreview name={pdf ? 'Office-converted.pdf' : ref.path.split(/[\\/]/u).pop()!} bytes={bytes} retry={() => setRetry(v => v + 1)} nativeFallback={() => openNativeViewer(ctx, address)} {...(/\.(docx?|pptx?|xlsx?)$/iu.test(ref.path) && !pdf ? { fallback: () => setPdf(true) } : {})} /></>
  }
  ctx.effect(() => tabs.register({ id: 'zerowall:universal-native', kind: 'zerowall-universal', patterns: DEFAULT_VIEWER_EXTENSIONS.map(ext => `dsh-resource://file/**/*.${ext}`), priority: 'extension', canOpen: (address: string) => { const ref = parse(address); return !!ref && DEFAULT_VIEWER_EXTENSIONS.includes(ref.path.split('.').pop()?.toLowerCase() as any) }, title: (address: string) => parse(address)?.path.split(/[\\/]/u).pop() ?? address }))
  slots.inject('sidebar.right.pane.tab', () => { ctx.effect(() => slots.register({ name: 'sidebar.right.pane.tab', key: 'zerowall:universal-native' }, ({ useTabInfo }: { useTabInfo(): { tab: { contentId: string } } }) => <NativePreview address={useTabInfo().tab.contentId} />)) })
  ctx.effect(() => ctx.betterSidebar.registerTab({ id: 'zerowall:universal-file', title: '通用预览', hidden: true, component: props => <NativePreview address={(props.tab.meta as any).address} initialPdf={(props.tab.meta as any).mode === 'office-pdf'} /> }))
  ctx.effect(() => {
    const switchViewer = (event: Event) => {
      const detail = (event as CustomEvent<{ address: string; mode?: string }>).detail
      const ref = parse(detail.address)
      if (ref) ctx.betterSidebar.openTab({ type: 'zerowall:universal-file', id: `zerowall:universal-file:${detail.address}:${detail.mode}`, title: ref.path.split(/[\\/]/u).pop()!, meta: detail }, { sessionId: ref.sessionId })
    }
    window.addEventListener('zerowall:viewer-switch', switchViewer)
    return () => window.removeEventListener('zerowall:viewer-switch', switchViewer)
  })
}
