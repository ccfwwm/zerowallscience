import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { expect, it } from 'vitest'
import { DOMParser } from '@xmldom/xmldom'
import { preservePptxNotes } from '../src/host/presentation-export.js'

it('preserves editable slide/media parts while adding correctly escaped, idempotent speaker notes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zerowall-pptx-export-'))
  try {
    const path = join(root, 'deck.pptx'), slide = '<editable-slide/>', chart = '<editable-chart/>', image = new Uint8Array([1, 2, 3])
    await writeFile(path, zipSync({ '[Content_Types].xml': strToU8('<Types></Types>'), 'ppt/presentation.xml': strToU8('<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst></p:sldIdLst></p:presentation>'), 'ppt/slides/slide1.xml': strToU8(slide), 'ppt/charts/chart1.xml': strToU8(chart), 'ppt/media/image1.png': image }))
    const notes = ['出处 & 说明 <valid>\nDOI:10.1186/s12937-024-01017-0']
    expect(await preservePptxNotes(root, path, notes)).toMatchObject({ notesWritten: 1 })
    await preservePptxNotes(root, path, notes)
    const files = unzipSync(await readFile(path)), note = strFromU8(files['ppt/notesSlides/notesSlide1.xml']!)
    expect(strFromU8(files['ppt/slides/slide1.xml']!)).toBe(slide)
    expect(strFromU8(files['ppt/charts/chart1.xml']!)).toBe(chart)
    expect(files['ppt/media/image1.png']).toEqual(image)
    expect(note).toContain('出处 &amp; 说明 &lt;valid&gt;')
    expect(new DOMParser().parseFromString(note, 'application/xml').getElementsByTagName('a:t')[0]!.textContent).toBe('出处 & 说明 <valid>')
    expect(strFromU8(files['ppt/slides/_rels/slide1.xml.rels']!).match(/notesSlide"/gu)).toHaveLength(1)
    expect(strFromU8(files['ppt/presentation.xml']!).match(/notesMasterIdLst/gu)).toHaveLength(2)
  } finally { await rm(root, { recursive: true, force: true }) }
})
it('rejects notes/page mismatches without replacing the exported package', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zerowall-pptx-export-'))
  try {
    const path = join(root, 'deck.pptx'), bytes = zipSync({ '[Content_Types].xml': strToU8('<Types></Types>'), 'ppt/presentation.xml': strToU8('<p:presentation/>') })
    await writeFile(path, bytes)
    await expect(preservePptxNotes(root, path, ['missing page'])).rejects.toThrow('coverage mismatch')
    expect(await readFile(path)).toEqual(Buffer.from(bytes))
    expect(await preservePptxNotes(root, 'other.pdf', [])).toBeUndefined()
  } finally { await rm(root, { recursive: true, force: true }) }
})
