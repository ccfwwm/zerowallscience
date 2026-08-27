import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, StandardFonts, type PDFFont, rgb } from 'pdf-lib'
import PptxGenJS from 'pptxgenjs'
import type { PresentationRecord } from '@zerowallscience/research-store/types'

/** Export a ZeroWall presentation using its generated full-slide images. */
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

async function writePdf(presentation: PresentationRecord, path: string): Promise<void> {
  const document = await PDFDocument.create()
  document.registerFontkit(fontkit)
  const slides = presentation.slides.length > 0 ? presentation.slides : [{ id: 'title', title: presentation.title, body: '', assetUris: [] }]
  for (const item of slides) {
    const page = document.addPage([960, 540])
    const image = fileUriPath(item.visualUri ?? '')
    if (image && existsSync(image)) {
      page.drawImage(await document.embedPng(await readFile(image)), { x: 0, y: 0, width: 960, height: 540 })
    } else {
      const font = await pdfFont(document)
      page.drawRectangle({ x: 0, y: 0, width: 960, height: 540, color: rgb(0.97, 0.98, 0.98) })
      page.drawText(item.title, { x: 54, y: 455, size: 27, font, color: rgb(0.09, 0.14, 0.18), maxWidth: 840 })
      page.drawText(item.body, { x: 58, y: 405, size: 18, font, color: rgb(0.2, 0.27, 0.31), maxWidth: 835 })
    }
  }
  await writeFile(path, await document.save())
}

async function pdfFont(document: PDFDocument): Promise<PDFFont> {
  const candidates = process.platform === 'win32' ? ['C:/Windows/Fonts/simhei.ttf', 'C:/Windows/Fonts/arial.ttf'] : process.platform === 'darwin' ? ['/System/Library/Fonts/Supplemental/Arial Unicode.ttf', '/Library/Fonts/Arial Unicode.ttf'] : ['/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.otf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']
  const path = candidates.find(existsSync)
  return path === undefined ? document.embedFont(StandardFonts.Helvetica) : document.embedFont(await readFile(path), { subset: !path.toLowerCase().endsWith('.ttc') })
}

function localFilePath(uri: string, label: string): string { const path = fileUriPath(uri); if (path === undefined) throw new Error(`${label} must use a file URI.`); return path }
function fileUriPath(uri: string): string | undefined { try { const parsed = new URL(uri); return parsed.protocol === 'file:' ? fileURLToPath(parsed) : undefined } catch { return undefined } }
