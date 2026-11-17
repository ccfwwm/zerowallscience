/** Page planning and subset remapping, adapted from dsh-mineru 0.1.18 (MIT; see THIRD-PARTY-LICENSES). */
import { readFile } from 'node:fs/promises'
import { PDFDocument } from 'pdf-lib'
import { MineruError } from './errors.ts'
import type { ContentRow } from './content.ts'

/** Read the PDF page tree. @param file - Admitted local PDF. @returns Total pages, or undefined for unreadable/encrypted PDFs. */
export async function pdfPages(file: string): Promise<number | undefined> {
  try { return (await PDFDocument.load(await readFile(file), { updateMetadata: false })).getPageCount() }
  catch (error) {
    // Page-count failure leaves the original file intact; the cloud may still parse it.
    if (!(error instanceof Error)) throw error
    return undefined
  }
}

/** Expand ascending ranges. @param spec - API page selection. @param total - Known document length. @returns One-based pages. */
export function requestedPages(spec: string, total?: number): number[] {
  const pages: number[] = []
  let previous = 0
  for (const part of spec.split(',')) {
    const match = /^(\d+)(?:\s*-\s*(-?\d+))?$/u.exec(part.trim())
    if (!match) throw new MineruError('MINERU_PAGE_RANGE', '页码范围应为升序、不重叠的 2,4-6 或 2--2。')
    const first = Number(match[1])
    let last = match[2] === undefined ? first : Number(match[2])
    if (last < 0) {
      if (total === undefined) throw new MineruError('MINERU_PAGE_RANGE', '倒数页码需要可读取页数的本地 PDF。')
      last = total + last + 1
    }
    if (first <= previous || first < 1 || last < first || last > (total ?? 100000) || pages.length + last - first + 1 > 100000) throw new MineruError('MINERU_PAGE_RANGE', '页码范围倒置、重叠或超出文档范围。')
    for (let page = first; page <= last; page++) pages.push(page)
    previous = last
  }
  return pages
}

/** Render ascending pages as API ranges. @param pages - One-based pages. @returns Canonical selection. */
export function pageSpec(pages: number[]): string {
  const ranges: [number, number][] = []
  for (const page of pages) {
    const last = ranges.at(-1)
    if (last && page === last[1] + 1) last[1] = page
    else ranges.push([page, page])
  }
  return ranges.map(([first, last]) => first === last ? String(first) : `${first}-${last}`).join(',')
}

/** Map cloud subset indexes to physical document pages. @param rows - Normalized content. @param pages - Requested pages. @returns Mapped content. */
export function remapPages(rows: ContentRow[], pages: number[]): ContentRow[] {
  return rows.map(row => ({ ...row, page_idx: typeof row.page_idx === 'number' && Number.isInteger(row.page_idx) && pages[row.page_idx] !== undefined ? pages[row.page_idx]! - 1 : -1 }))
}

/** Render extra page-anchored Markdown. @param rows - Normalized content. @returns Text and coverage warnings. */
export function anchoredDocument(rows: ContentRow[]): { markdown: string; warnings: string[] } {
  const counters = new Map<number, number>()
  const warnings = new Set<string>()
  const blocks: string[] = []
  for (const row of rows) {
    const page = typeof row.page_idx === 'number' ? row.page_idx + 1 : 0
    if (page < 1) { warnings.add('部分内容缺少可核实的物理页码，未生成页码锚点。'); continue }
    const index = (counters.get(page) ?? 0) + 1
    counters.set(page, index)
    if (['header', 'footer', 'page_number'].includes(String(row.type))) continue
    const image = typeof row.img_path === 'string' ? `![${String(row.image_caption ?? '')}](${row.img_path})` : ''
    const body = [row.table_body ?? row.text ?? '', image, row.table_caption ?? ''].filter(Boolean).join('\n\n')
    blocks.push(`<!-- p${page} b${index} -->\n${body}`)
  }
  return { markdown: blocks.join('\n\n') + '\n', warnings: [...warnings] }
}
