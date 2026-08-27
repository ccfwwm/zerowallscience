import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import PptxGenJS from 'pptxgenjs'
import type { PresentationRecord } from '@zerowallscience/research-store/types'

/** Export a ZeroWall presentation using its generated full-slide images. */
export async function writePresentation(presentation: PresentationRecord, uri: string): Promise<void> {
  const path = localFilePath(uri, 'Presentation export URI')
  await mkdir(dirname(path), { recursive: true })
  await writePptx(presentation, path)
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
