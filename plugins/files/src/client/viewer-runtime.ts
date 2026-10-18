// Loaded on the first actual preview, as a local classic script. Keep every
// existing renderer and its offline resources in this independently signed file.
import { createViewer, imagePlugin, videoPlugin, audioPlugin, pdfPlugin, officePlugin, archivePlugin, emailPlugin, drawingPlugin, xmindPlugin, cadPlugin, model3dPlugin, gisPlugin, epubPlugin, xpsPlugin, ofdPlugin, assetPlugin, fallbackPlugin } from '@open-file-viewer/core'
import * as pdfjs from 'viewer-pdfjs'
import { assetVersion } from 'zerowall:viewer-style'

const root = `/zerowall/viewer-assets/${assetVersion}/`
function localGisPlugin(): ReturnType<typeof gisPlugin> {
  const plugin = gisPlugin()
  return { ...plugin, async render(ctx) {
    const sizeLayers = () => {
      for (const svg of ctx.viewport.querySelectorAll<SVGSVGElement>('.leaflet-overlay-pane > svg')) {
        for (const dimension of ['width', 'height'] as const) { const pixels = Number(svg.getAttribute(dimension)); if (pixels > 0) svg.style[dimension] = `${pixels}px` }
        svg.style.maxWidth = 'none'; svg.style.maxHeight = 'none'
      }
    }
    const observer = new MutationObserver(sizeLayers)
    observer.observe(ctx.viewport, { subtree: true, childList: true, attributes: true, attributeFilter: ['width', 'height'] })
    try { const instance = await plugin.render(ctx); sizeLayers(); return { ...instance, destroy() { observer.disconnect(); instance.destroy?.() } } }
    catch (cause) { observer.disconnect(); throw cause }
  } }
}
function plugins() {
  const pdf = { pdfjs: pdfjs as any, workerSrc: root + 'build/pdf.worker.mjs', cMapUrl: root + 'cmaps/', standardFontDataUrl: root + 'standard_fonts/', wasmUrl: root + 'wasm/', webFallbackScripts: 'never' as const }
  return [imagePlugin(), videoPlugin(), audioPlugin(), pdfPlugin(pdf), officePlugin({ pdf, docx: { ignoreFonts: false } }), epubPlugin(), xpsPlugin(), ofdPlugin(), archivePlugin(), emailPlugin(), drawingPlugin(), xmindPlugin(), cadPlugin({ libreDwg: false, webglDwg: false }), model3dPlugin(), localGisPlugin(), assetPlugin(), fallbackPlugin()]
}
const registry = (globalThis as any).__ZEROWALL_VIEWER_RUNTIMES__ ??= {}
registry[process.env.ZEROWALL_VERSION] = { createViewer, plugins }
