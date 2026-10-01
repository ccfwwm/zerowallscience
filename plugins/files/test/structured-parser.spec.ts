import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import * as XLSX from 'xlsx'
import { parseDocument } from '../src/host/local-parser.js'
import { readPreviewBytes, PREVIEW_WINDOW_BYTES } from '../src/client/bounded-read.js'

describe('structured attachment parsing', () => {
  it('keeps DOCX paragraph/table boundaries, headings and source relationships', async () => {
    const zip = new JSZip()
    zip.file('word/document.xml', '<w:document xmlns:w="w"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Title</w:t></w:r></w:p><w:p><w:r><w:t>Paragraph</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Cell A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Cell B</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>')
    zip.file('word/_rels/document.xml.rels', '<Relationships><Relationship Id="rImage" Type="office/image" Target="media/image1.png"/></Relationships>')
    const value = await parseDocument('sample.docx', '', await zip.generateAsync({ type: 'uint8array' }))
    expect(value.text).toContain('# Title\n\nParagraph')
    expect(value.text).toContain('Cell A\n\tCell B')
    expect(value.text).toContain('word/media/image1.png')
  })
  it('uses PPTX relationship order, not slide file numbering, and retains notes', async () => {
    const zip = new JSZip()
    zip.file('ppt/presentation.xml', '<p:presentation xmlns:p="p" xmlns:r="r"><p:sldIdLst><p:sldId r:id="rB" id="99"/><p:sldId r:id="rA" id="42"/></p:sldIdLst></p:presentation>')
    zip.file('ppt/_rels/presentation.xml.rels', '<Relationships><Relationship Id="rA" Type="office/slide" Target="slides/slide1.xml"/><Relationship Id="rB" Type="office/slide" Target="slides/slide9.xml"/></Relationships>')
    zip.file('ppt/slides/slide1.xml', '<p:sld xmlns:p="p" xmlns:a="a"><a:p><a:r><a:t>Last slide</a:t></a:r></a:p></p:sld>')
    zip.file('ppt/slides/slide9.xml', '<p:sld xmlns:p="p" xmlns:a="a"><a:p><a:r><a:t>First slide</a:t></a:r></a:p></p:sld>')
    zip.file('ppt/slides/_rels/slide9.xml.rels', '<Relationships><Relationship Id="rN" Type="office/notesSlide" Target="../notesSlides/notesSlide2.xml"/><Relationship Id="rI" Type="office/image" Target="../media/image2.png"/></Relationships>')
    zip.file('ppt/notesSlides/notesSlide2.xml', '<p:notes xmlns:p="p" xmlns:a="a"><a:p><a:r><a:t>Speaker notes</a:t></a:r></a:p></p:notes>')
    const value = await parseDocument('sample.pptx', '', await zip.generateAsync({ type: 'uint8array' }))
    expect(value.slideCount).toBe(2)
    expect(value.text.indexOf('First slide')).toBeLessThan(value.text.indexOf('Last slide'))
    expect(value.text).toContain('Speaker notes')
    expect(value.text).toContain('ppt/media/image2.png')
  })
  it('keeps addresses, formula and cached value separately', async () => {
    const book = XLSX.utils.book_new()
    const sheet = XLSX.utils.aoa_to_sheet([['value', 3], ['sum', 6]])
    sheet.B2 = { t: 'n', v: 6, f: 'B1*2' }
    XLSX.utils.book_append_sheet(book, sheet, 'Sheet3')
    const value = await parseDocument('sample.xlsx', '', XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }))
    expect(value).toMatchObject({ sheetCount: 1, cellCount: 4 })
    expect(value.text).toContain('"address":"B2","type":"n","rawValue":6')
    expect(value.text).toContain('"formula":"B1*2","cachedValue":6')
  })
})
describe('bounded preview reading', () => {
  it('starts with a byte window and reads every byte with stable versions', async () => {
    const bytes = new Uint8Array(PREVIEW_WINDOW_BYTES + 17).fill(9)
    const calls: number[] = []
    const output = await readPreviewBytes(async (offset, length) => { calls.push(length); return { data: bytes.slice(offset, offset + length), bytes: bytes.length, version: 'v1', eof: offset + length >= bytes.length } }, new AbortController().signal)
    expect(calls).toEqual([PREVIEW_WINDOW_BYTES, PREVIEW_WINDOW_BYTES])
    expect(output).toEqual(bytes)
  })
  it('rejects file changes, oversized files, cancellation and empty non-EOF reads', async () => {
    let n = 0
    await expect(readPreviewBytes(async () => ({ data: new Uint8Array(1), version: String(n++), eof: false }), new AbortController().signal)).rejects.toThrow('发生变化')
    await expect(readPreviewBytes(async () => ({ data: new Uint8Array(), bytes: 60 * 1024 * 1024, version: 'v1', eof: true }), new AbortController().signal)).rejects.toThrow('50 MiB')
    await expect(readPreviewBytes(async () => ({ data: new Uint8Array(), version: 'v1', eof: false }), new AbortController().signal)).rejects.toThrow('停滞')
    const controller = new AbortController(); controller.abort()
    await expect(readPreviewBytes(async () => { throw new Error('must not read') }, controller.signal)).rejects.toThrow()
  })
})
