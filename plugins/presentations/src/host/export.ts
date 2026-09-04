import { existsSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import PptxGenJS from 'pptxgenjs'
import type { PresentationRecord } from '@zerowallscience/research-store/types'
import type { EditableObject, EditableSlideManifest } from '../shared/types.js'

/** Export a ZeroWall presentation using its generated full-slide images. */
export async function writePresentation(presentation: PresentationRecord, uri: string): Promise<void> {
  const path = localFilePath(uri, 'Presentation export URI')
  await mkdir(dirname(path), { recursive: true })
  await writePptx(presentation, path)
}

/** Create a native-object-first PPTX from page manifests. Legacy image-only export remains above. */
export async function writeEditablePresentation(presentation: PresentationRecord, uri: string): Promise<{ nativeObjectCount: number; rasterizedObjectCount: number }> {
  const path = localFilePath(uri, 'Editable presentation export URI')
  await mkdir(dirname(path), { recursive: true })
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.author = 'ZeroWall Science'
  pptx.subject = presentation.title
  pptx.title = presentation.title
  pptx.company = 'ZeroWall Science'
  let nativeObjectCount = 0
  let rasterizedObjectCount = 0
  const slides = presentation.slides.length > 0 ? presentation.slides : [{ id: 'title', title: presentation.title, body: '', assetUris: [] }]
  for (const item of slides) {
    const slide = pptx.addSlide()
    const manifest = await readManifest(item.editableManifestUri)
    if (manifest) {
      for (const object of [...manifest.objects].sort((a, b) => (a.z ?? 0) - (b.z ?? 0))) {
        if (object.visible === false) continue
        assertEditableRaster(object, manifest.canvas)
        addEditableObject(slide, object, manifest.source)
        if (object.kind === 'image' || object.kind === 'svg') rasterizedObjectCount += 1
        else nativeObjectCount += 1
      }
      continue
    }
    const image = fileUriPath(item.visualUri ?? '')
    slide.background = { color: 'FFFFFF' }
    slide.addText(item.title, { x: 0.55, y: 0.45, w: 5.55, h: 0.55, fontFace: 'Aptos Display', fontSize: 25, bold: true, color: '17324D', margin: 0, fit: 'shrink', objectName: `${item.id}.title` })
    nativeObjectCount += 1
    const body = item.body.trim()
    if (body) {
      slide.addText(body, { x: 0.65, y: 1.25, w: 5.2, h: 4.9, fontFace: 'Aptos', fontSize: 16, color: '30465C', breakLine: false, valign: 'top', margin: 0.04, fit: 'shrink', objectName: `${item.id}.body` })
      nativeObjectCount += 1
    }
    if (image && existsSync(image)) {
      slide.addShape(pptx.ShapeType.roundRect, { x: 6.25, y: 0.7, w: 6.45, h: 5.95, rectRadius: 0.08, fill: { color: 'F1F6FA' }, line: { color: 'C7D8E6', width: 1 }, objectName: `${item.id}.visual-frame` })
      slide.addImage({ path: image, x: 6.38, y: 0.83, w: 6.19, h: 5.69, sizing: { type: 'contain', w: 6.19, h: 5.69 }, objectName: `${item.id}.visual-reference` })
      nativeObjectCount += 1
      rasterizedObjectCount += 1
    }
    if (item.notes) slide.addNotes(item.notes)
  }
  await pptx.writeFile({ fileName: path })
  return { nativeObjectCount, rasterizedObjectCount }
}

async function readManifest(uri: string | undefined): Promise<EditableSlideManifest | undefined> {
  if (!uri) return undefined
  const path = fileUriPath(uri)
  if (!path || !existsSync(path)) return undefined
  try {
    const value = JSON.parse(await readFile(path, 'utf8')) as EditableSlideManifest
    if (value.version !== 1 || !Array.isArray(value.objects)) return undefined
    return value
  } catch {
    return undefined
  }
}

function addEditableObject(slide: PptxGenJS.Slide, object: EditableObject, source?: EditableSlideManifest['source']): void {
  // Manifest coordinates are points on a 960x540 canvas; PptxGenJS uses
  // inches, so 72 points map to one inch on the 13.333x7.5 wide slide.
  const base = { x: object.x / 72, y: object.y / 72, w: object.w / 72, h: object.h / 72, objectName: object.objectId }
  if (object.kind === 'text') {
    slide.addText(object.text ?? '', { ...base, fontFace: object.fontFace ?? 'Aptos', fontSize: (object.fontSize ?? 18) * 0.75, color: normalizeColor(object.color), margin: 0, fit: 'shrink', bold: (object.fontSize ?? 0) >= 24 })
    return
  }
  if (object.kind === 'image' && object.imageUri) {
    const path = fileUriPath(object.imageUri)
    if (path && existsSync(path)) {
      const rect = object.sourceRectPx
      const sourceWidth = source?.widthPx ?? 0
      const sourceHeight = source?.heightPx ?? 0
      const sizing = rect && sourceWidth > 0 && sourceHeight > 0
        ? { type: 'crop' as const, w: base.w, h: base.h, x: (rect[0] / sourceWidth) * base.w, y: (rect[1] / sourceHeight) * base.h }
        : { type: 'contain' as const, w: base.w, h: base.h }
      slide.addImage({ ...base, path, sizing })
    }
    return
  }
  if (object.kind === 'svg' && object.imageUri) {
    const path = fileUriPath(object.imageUri)
    if (path && existsSync(path)) slide.addImage({ ...base, path, sizing: { type: 'contain', w: base.w, h: base.h } })
    return
  }
  if (object.kind === 'line' || object.kind === 'connector') {
    slide.addShape('line', { ...base, line: { color: normalizeColor(object.line), width: object.lineWidth ?? 1 } })
    return
  }
  if (object.kind === 'table') {
    slide.addTable([[{ text: object.text ?? '' }]], { ...base, border: { type: 'solid', color: normalizeColor(object.line, 'B7C6D4'), pt: object.lineWidth ?? 1 }, fill: { color: normalizeColor(object.fill, 'FFFFFF') }, color: normalizeColor(object.color) })
    return
  }
  if (object.kind === 'chart') {
    // A chart without a data series is not a valid editable chart. Keep a
    // native frame rather than silently inserting a raster image.
    slide.addShape('rect', { ...base, fill: { color: normalizeColor(object.fill, 'FFFFFF'), transparency: 100 }, line: { color: normalizeColor(object.line, 'B7C6D4'), width: object.lineWidth ?? 1 } })
    return
  }
  slide.addShape(object.kind === 'shape' ? 'roundRect' : 'rect', { ...base, fill: { color: normalizeColor(object.fill, 'FFFFFF'), transparency: object.fill ? 0 : 100 }, line: { color: normalizeColor(object.line, 'B7C6D4'), width: object.lineWidth ?? 1 } })
}

function assertEditableRaster(object: EditableObject, canvas: { widthPt: number; heightPt: number }): void {
  if (object.kind !== 'image' && object.kind !== 'svg') return
  const coverage = (object.w * object.h) / (canvas.widthPt * canvas.heightPt)
  if (coverage >= 0.9 || (object.x <= 0 && object.y <= 0 && object.w >= canvas.widthPt && object.h >= canvas.heightPt)) {
    throw new Error(`Editable rebuild refuses full-slide raster object: ${object.objectId}`)
  }
  if (!object.rasterReason?.trim()) throw new Error(`Raster object ${object.objectId} requires rasterReason.`)
  if (object.editability !== undefined && object.editability !== 'atomic-raster') throw new Error(`Raster object ${object.objectId} must be marked atomic-raster.`)
}

function normalizeColor(value: string | undefined, fallback = '000000'): string {
  const cleaned = (value ?? '').replace(/^#/u, '').trim()
  return /^[0-9A-F]{6}$/iu.test(cleaned) ? cleaned.toUpperCase() : fallback
}

async function writePptx(presentation: PresentationRecord, path: string): Promise<void> {
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.author = 'ZeroWall Science'
  pptx.subject = presentation.title
  pptx.title = presentation.title
  pptx.company = 'ZeroWall Science'
  const slides = presentation.slides.length > 0 ? presentation.slides : [{ id: 'title', title: presentation.title, body: '', assetUris: [] }]
  for (const item of slides) {
    const slide = pptx.addSlide()
    const image = fileUriPath(item.visualUri ?? '')
    if (!image || !existsSync(image)) throw new Error(`未找到第“${item.title}”页的视觉图片，无法导出 PPTX。`)
    slide.addImage({ path: image, x: 0, y: 0, w: 13.333, h: 7.5 })
    if (item.notes) slide.addNotes(item.notes)
  }
  await pptx.writeFile({ fileName: path })
}

function localFilePath(uri: string, label: string): string { const path = fileUriPath(uri); if (path === undefined) throw new Error(`${label} must use a file URI.`); return path }
function fileUriPath(uri: string): string | undefined { try { const parsed = new URL(uri); return parsed.protocol === 'file:' ? fileURLToPath(parsed) : undefined } catch { return undefined } }
