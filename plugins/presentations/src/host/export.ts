import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, extname } from 'node:path'
import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, StandardFonts, type PDFFont, rgb } from 'pdf-lib'
import PptxGenJS from 'pptxgenjs'
import type { PresentationRecord } from '@zerowallscience/research-store/types'

export async function writePresentation(presentation: PresentationRecord, format: 'pptx' | 'pdf', uri: string): Promise<void> {
  const path = localFilePath(uri, 'Presentation export URI')
  await mkdir(dirname(path), { recursive: true })
  if (format === 'pptx') await writePptx(presentation, path)
  else await writePdf(presentation, path)
}

async function writePptx(presentation: PresentationRecord, path: string): Promise<void> {
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.author = 'ZeroWall Science'
  pptx.subject = presentation.title
  pptx.title = presentation.title
  pptx.company = 'ZeroWall Science'
  pptx.theme = {
    headFontFace: 'Microsoft YaHei', bodyFontFace: 'Microsoft YaHei',
  }
  const accent = color(presentation.style.accent, '315B7D')
  const background = color(presentation.style.background, 'F7F9FA')
  const slides = presentation.slides.length > 0 ? presentation.slides : [{ id: 'title', title: presentation.title, body: '', assetUris: [] }]
  for (const [index, item] of slides.entries()) {
    const slide = pptx.addSlide()
    slide.background = { color: background }
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.18, h: 7.5, line: { color: accent, transparency: 100 }, fill: { color: accent } })
    slide.addText(item.title, { x: 0.65, y: 0.55, w: 8.1, h: 0.65, fontFace: 'Microsoft YaHei', fontSize: 25, bold: true, color: '17232D', margin: 0 })
    slide.addText(item.body, { x: 0.72, y: 1.48, w: item.assetUris.length > 0 ? 7.4 : 11.6, h: 4.95, fontFace: 'Microsoft YaHei', fontSize: 17, color: '33434F', breakLine: false, margin: 0.04, valign: 'top' })
    const image = item.assetUris.map(fileUriPath).find(candidate => candidate !== undefined && existsSync(candidate) && ['.png', '.jpg', '.jpeg', '.gif'].includes(extname(candidate).toLowerCase()))
    if (image !== undefined) slide.addImage({ path: image, x: 8.55, y: 1.48, w: 4.15, h: 4.65 })
    slide.addText(`${index + 1} / ${slides.length}`, { x: 11.45, y: 7.03, w: 1.15, h: 0.22, fontSize: 9, color: '74818B', align: 'right', margin: 0 })
    if (item.notes) slide.addNotes(item.notes)
  }
  await pptx.writeFile({ fileName: path })
}

async function writePdf(presentation: PresentationRecord, path: string): Promise<void> {
  const document = await PDFDocument.create()
  document.registerFontkit(fontkit)
  const font = await pdfFont(document)
  const slides = presentation.slides.length > 0 ? presentation.slides : [{ id: 'title', title: presentation.title, body: '', assetUris: [] }]
  for (const [index, slide] of slides.entries()) {
    const page = document.addPage([960, 540])
    page.drawRectangle({ x: 0, y: 0, width: 960, height: 540, color: rgb(0.97, 0.98, 0.98) })
    page.drawRectangle({ x: 0, y: 0, width: 12, height: 540, color: rgb(0.19, 0.36, 0.49) })
    page.drawText(slide.title, { x: 54, y: 455, size: 27, font, color: rgb(0.09, 0.14, 0.18), maxWidth: 840 })
    let y = 405
    for (const line of wrapText(slide.body, font, 18, 835)) {
      page.drawText(line, { x: 58, y, size: 18, font, color: rgb(0.2, 0.27, 0.31), maxWidth: 835 })
      y -= 28
      if (y < 52) break
    }
    page.drawText(`${index + 1} / ${slides.length}`, { x: 850, y: 24, size: 10, font, color: rgb(0.45, 0.51, 0.55) })
  }
  await writeFile(path, await document.save())
}

async function pdfFont(document: PDFDocument): Promise<PDFFont> {
  const candidates = process.platform === 'win32'
    ? ['C:/Windows/Fonts/simhei.ttf', 'C:/Windows/Fonts/arial.ttf']
    : process.platform === 'darwin'
      ? ['/System/Library/Fonts/Supplemental/Arial Unicode.ttf', '/Library/Fonts/Arial Unicode.ttf']
      : ['/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.otf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']
  const path = candidates.find(existsSync)
  if (path === undefined) return await document.embedFont(StandardFonts.Helvetica)
  return await document.embedFont(await readFile(path), { subset: !path.toLowerCase().endsWith('.ttc') })
}

function wrapText(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = []
  for (const paragraph of text.split(/\r?\n/)) {
    let line = ''
    for (const character of paragraph) {
      const candidate = `${line}${character}`
      if (line !== '' && font.widthOfTextAtSize(candidate, size) > width) { lines.push(line); line = character }
      else line = candidate
    }
    lines.push(line)
  }
  return lines
}

function color(value: unknown, fallback: string): string { return typeof value === 'string' && /^[0-9a-fA-F]{6}$/.test(value.replace(/^#/, '')) ? value.replace(/^#/, '').toUpperCase() : fallback }
function localFilePath(uri: string, label: string): string { const path = fileUriPath(uri); if (path === undefined) throw new Error(`${label} must use a file URI.`); return path }
function fileUriPath(uri: string): string | undefined {
  try { const parsed = new URL(uri); return parsed.protocol === 'file:' ? decodeURIComponent(parsed.pathname).replace(/^\/([A-Za-z]:)/, '$1') : undefined } catch { return undefined }
}
