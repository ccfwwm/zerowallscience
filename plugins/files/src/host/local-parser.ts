import { createRequire } from 'node:module'
import { posix } from 'node:path'
import JSZip from 'jszip'
import * as XLSX from 'xlsx'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

export const LOCAL_PARSER_VERSION = 'office-structured-2'
const { XMLParser } = createRequire(import.meta.url)('fast-xml-parser') as typeof import('fast-xml-parser')
const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false })
const ordered = new XMLParser({ ignoreAttributes: false, preserveOrder: true, parseTagValue: false })
const list = <T>(value: T | T[] | undefined): T[] => value === undefined ? [] : Array.isArray(value) ? value : [value]
type Node = Record<string, any>
export interface ParsedDocument {
  text: string; parser: string; status: 'parsed' | 'needs_vision' | 'stored'
  pageCount?: number; sheetCount?: number; cellCount?: number; slideCount?: number; warning?: string
}
function texts(node: unknown): string {
  if (Array.isArray(node)) return node.map(texts).join('')
  if (!node || typeof node !== 'object') return ''
  return Object.entries(node).map(([key, value]) => key === 'w:t' || key === 'a:t'
    ? list(value as Node[]).map(v => String(v['#text'] ?? '')).join('')
    : key === 'w:tab' ? '\t' : key === 'w:br' || key === 'a:br' ? '\n' : key === 'a:p' || key === 'w:p' ? texts(value) + '\n' : texts(value)).join('')
}
async function xmlFile(zip: JSZip, path: string, inOrder = false): Promise<Node> {
  const entry = zip.file(path)
  if (!entry) throw new Error(`Office part missing: ${path}`)
  if ((entry as any)._data?.uncompressedSize > 32 * 1024 * 1024) throw new Error(`Office part exceeds 32 MiB: ${path}`)
  return (inOrder ? ordered : parser).parse(await entry.async('string')) as Node
}
async function relationships(zip: JSZip, part: string): Promise<Map<string, Node>> {
  const path = posix.join(posix.dirname(part), '_rels', posix.basename(part) + '.rels')
  if (!zip.file(path)) return new Map()
  const values = list((await xmlFile(zip, path)).Relationships?.Relationship) as Node[]
  return new Map(values.map(v => [v['@_Id'], { ...v, path: v['@_TargetMode'] === 'External' ? v['@_Target'] : posix.normalize(posix.join(posix.dirname(part), v['@_Target'])) }]))
}
function refs(rels: Map<string, Node>): string {
  return [...rels].filter(([, v]) => /\/(image|hyperlink)$/u.test(v['@_Type'])).map(([id, v]) => `- ${id}: ${v.path} (${v['@_Type'].split('/').pop()})`).join('\n')
}
export async function parseDocument(name: string, mediaType: string, data: Uint8Array): Promise<ParsedDocument> {
  if (mediaType.startsWith('image/')) return { text: '', parser: 'image', status: 'needs_vision', warning: 'Image text requires OCR; original image is retained.' }
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase()
  if (['.xlsx', '.xls', '.csv', '.tsv'].includes(ext)) {
    const book = XLSX.read(data, { type: 'array', cellFormula: true, cellText: true, cellDates: false })
    let cellCount = 0
    const sections = book.SheetNames.map(sheet => {
      const ws = book.Sheets[sheet]!
      const cells = Object.keys(ws).filter(key => !key.startsWith('!')).map(address => {
        const cell = ws[address]!
        cellCount++
        return JSON.stringify({ address, type: cell.t, rawValue: cell.v ?? null, displayValue: cell.w ?? null, formula: cell.f ?? null, cachedValue: cell.f ? cell.v ?? null : null })
      })
      return `## Sheet: ${sheet}\nRange: ${ws['!ref'] ?? 'empty'}\n${cells.join('\n')}`
    })
    return { text: sections.join('\n\n'), parser: 'xlsx', status: cellCount ? 'parsed' : 'needs_vision', sheetCount: book.SheetNames.length, cellCount, ...(cellCount ? {} : { warning: 'Workbook has no readable cells.' }) }
  }
  if (ext === '.docx' || ext === '.pptx') {
    const zip = await JSZip.loadAsync(data)
    if (Object.keys(zip.files).length > 20_000) throw new Error('Office archive exceeds the entry limit.')
    if (Object.values(zip.files).reduce((sum, file) => sum + ((file as any)._data?.uncompressedSize ?? 0), 0) > 250 * 1024 * 1024) throw new Error('Office archive exceeds the expanded size limit.')
    if (ext === '.docx') {
      const document = await xmlFile(zip, 'word/document.xml', true) as unknown as Node[]
      const body = document.find(n => n['w:document'])?.['w:document']?.find((n: Node) => n['w:body'])?.['w:body'] as Node[] | undefined
      if (!body) throw new Error('DOCX body is missing.')
      const blocks = body.map(block => {
        if (block['w:p']) {
          const heading = JSON.stringify(block['w:p']).match(/Heading([1-6])/iu)
          return `${heading ? '#'.repeat(Number(heading[1])) + ' ' : ''}${texts(block['w:p'])}`
        }
        if (block['w:tbl']) return (block['w:tbl'] as Node[]).filter(n => n['w:tr']).map(n => (n['w:tr'] as Node[]).filter(c => c['w:tc']).map(c => texts(c['w:tc'])).join('\t')).join('\n')
        return ''
      })
      const text = blocks.filter(Boolean).join('\n\n') + '\n\n## Image and hyperlink references\n' + refs(await relationships(zip, 'word/document.xml'))
      return { text, parser: 'docx', status: blocks.some(Boolean) ? 'parsed' : 'needs_vision', ...(!blocks.some(Boolean) ? { warning: 'No extractable document text; OCR or layout analysis is needed.' } : {}) }
    }
    const presentation = await xmlFile(zip, 'ppt/presentation.xml', true) as unknown as Node[]
    const rels = await relationships(zip, 'ppt/presentation.xml')
    const slideIds = presentation.find(n => n['p:presentation'])?.['p:presentation']?.find((n: Node) => n['p:sldIdLst'])?.['p:sldIdLst']?.filter((n: Node) => n['p:sldId']) as Node[] ?? []
    const slides: string[] = []
    let readableText = false
    for (const id of slideIds) {
      const slide = rels.get(id[':@']?.['@_r:id'])
      if (!slide) throw new Error('PPTX slide relationship is missing.')
      const content = await xmlFile(zip, slide.path, true)
      const slideRels = await relationships(zip, slide.path)
      const note = [...slideRels.values()].find(v => /\/notesSlide$/u.test(v['@_Type']))
      const slideText = texts(content)
      const notes = note ? texts(await xmlFile(zip, note.path, true)) : ''
      readableText ||= !!(slideText.trim() || notes.trim())
      slides.push(`## Slide ${slides.length + 1}\nPart: ${slide.path}\n${slideText}\n\n### Notes\n${notes}\n\n### Image and hyperlink references\n${refs(slideRels)}`)
    }
    return { text: slides.join('\n\n'), parser: 'pptx', status: readableText ? 'parsed' : 'needs_vision', slideCount: slides.length, pageCount: slides.length }
  }
  if (ext === '.pdf') {
    const pdf = await getDocument({ data: Uint8Array.from(data), useWorkerFetch: false, isEvalSupported: false }).promise
    try {
      const pages: string[] = []
      for (let n = 1; n <= pdf.numPages; n++) {
        const content = await (await pdf.getPage(n)).getTextContent()
        const text = content.items.map(v => 'str' in v ? v.str : '').join(' ').trim()
        if (text) pages.push(`## Page ${n}\n${text}`)
      }
      return { text: pages.join('\n\n'), parser: 'pdfjs', status: pages.length ? 'parsed' : 'needs_vision', pageCount: pdf.numPages, ...(pages.length ? { warning: 'Local text only; layout, formulas and OCR were not verified.' } : { warning: 'No extractable PDF text; OCR is required.' }) }
    } finally { await pdf.destroy() }
  }
  const text = textContent(data)
  if (text !== undefined) { if (ext === '.json') JSON.parse(text); return { text, parser: ext === '.json' ? 'json' : 'text', status: 'parsed' } }
  return { text: '', parser: 'raw', status: 'stored', warning: `No local text parser for ${mediaType}; use preview or OCR.` }
}
export function textContent(data: Uint8Array): string | undefined {
  let text: string
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(data) } catch { return undefined }
  if (text.includes('\u0000')) return undefined
  const control = [...text].filter(c => c.charCodeAt(0) < 32 && !'\n\r\t'.includes(c)).length
  return text.length && control / text.length > 0.01 ? undefined : text.replace(/\r\n/g, '\n')
}
