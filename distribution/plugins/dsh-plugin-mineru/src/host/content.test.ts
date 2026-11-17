import { describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import { createHash } from 'node:crypto'
import { normalizeContent } from './content.js'
import { DEFAULTS } from './config.ts'
import { writeResult } from './io.ts'

describe('MinerU OCR handoff', () => {

  it('preserves v1 text, table HTML, page and bbox', () => {
    const row = { type: 'table', table_body: '<table><tr><td>12</td></tr></table>', page_idx: 2, bbox: [1,2,3,4] }
    expect(normalizeContent([row])[0]).toMatchObject(row)
  })
  it('normalizes v2 chart paths, text and structured tables', () => {
    const rows = normalizeContent([[{ type: 'paragraph', content: { paragraph_content: [{content:'n=12, p=0.04'}] } },
      { type: 'chart', content: { image_source: {path:'images/figure.jpg'}, chart_caption:[{content:'Fig. 1'}] }, bbox:[10,20,30,40] },
      { type: 'table', content: {html:'<table></table>'} }]])
    expect(rows[0]).toMatchObject({text:'n=12, p=0.04',page_idx:0})
    expect(rows[1]).toMatchObject({img_path:'images/figure.jpg',image_caption:'Fig. 1',bbox:[10,20,30,40]})
    expect(rows[2]?.table_body).toBe('<table></table>')
  })
  it('preserves reference list text in v2', () => {
    expect(normalizeContent([[{type:'list',content:{list_items:[{item_content:[{content:'Reference 2026'}]}]}}]])[0]?.text).toBe('Reference 2026')
  })

  it('writes normalized v2-only artifacts and records OCR metadata', async () => {
    const dir = await mkdtemp(join(tmpdir(),'mineru-640-'))
    const zip = new JSZip()
    zip.file('nested/full.md','OCR p=0.04')
    zip.file('nested/test_content_list_v2.json',JSON.stringify([[{type:'paragraph',content:{paragraph_content:[{content:'OCR p=0.04'}]},bbox:[1,2,3,4]}]]))
    const result = await writeResult(DEFAULTS,'session',dir,'scan.pdf','precision','task',undefined,await zip.generateAsync({type:'uint8array'}),Date.now())
    const manifest = JSON.parse(await readFile(join(result.runDir,'parse-manifest.json'),'utf8'))
    expect(manifest.ocr).toEqual({provider:'mineru',requested:true,state:'done'})
    expect(JSON.parse(await readFile(manifest.contentList,'utf8'))[0]).toMatchObject({text:'OCR p=0.04',page_idx:0})
  })

})
