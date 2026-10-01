import { describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import { createHash } from 'node:crypto'
import { normalizeContent } from './content.js'
import { DEFAULTS, remoteParse, writeResult, ZeroWallMineruService } from './index.js'

describe('MinerU OCR handoff', () => {
  it('resumes an interrupted file upload on the original task and rejects changed input', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'mineru-upload-resume-'))
    const path = join(cwd, 'source.pdf'); const bytes = Buffer.from('original scan')
    await writeFile(path, bytes); await mkdir(join(cwd, '.dsh-mineru/tasks'), { recursive: true })
    const record = { api: 'precision', batch: true, taskId: 'batch', sourceName: 'source.pdf', config: DEFAULTS, upload: { path, url: 'https://upload.test/original', sha256: createHash('sha256').update(bytes).digest('hex'), complete: false } }
    const recordPath = join(cwd, '.dsh-mineru/tasks/batch.json')
    await writeFile(recordPath, JSON.stringify(record))
    const service = { hostCtx: { get: () => ({ get: () => ({ header: { cwd } }) }) }, token: async () => 'test-token' }
    const zip = new JSZip(); zip.file('full.md', 'Recovered upload OCR')
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(''))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, data: { extract_result: [{ state: 'done', full_zip_url: 'https://results.test/archive' }] } })))
      .mockResolvedValueOnce(new Response(new Uint8Array(await zip.generateAsync({ type: 'uint8array' })).buffer))
    vi.stubGlobal('fetch', fetcher)
    try {
      const args = { sessionId: 'session', taskId: 'batch', api: 'precision' as const, wait: false }
      const result = await ZeroWallMineruService.prototype.task.call(service as any, args)
      expect(result).toMatchObject({ taskId: 'batch', state: 'done' })
      expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ method: 'PUT' })
      expect(fetcher.mock.calls.some(call => call[1]?.method === 'POST')).toBe(false)
      expect(JSON.parse(await readFile(recordPath, 'utf8')).upload.complete).toBe(true)
      await ZeroWallMineruService.prototype.task.call(service as any, args)
      expect(fetcher).toHaveBeenCalledTimes(3)
      await writeFile(recordPath, JSON.stringify(record)); await writeFile(path, 'changed')
      await expect(ZeroWallMineruService.prototype.task.call(service as any, args)).rejects.toThrow('原文件已修改')
      expect(fetcher).toHaveBeenCalledTimes(3)
    } finally { vi.unstubAllGlobals() }
  })
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
  it('resumes a persisted batch after restart and downloads its artifacts once', async () => {
    const cwd = await mkdtemp(join(tmpdir(),'mineru-resume-'))
    await mkdir(join(cwd,'.dsh-mineru/tasks'),{recursive:true})
    await writeFile(join(cwd,'.dsh-mineru/tasks/batch.json'),JSON.stringify({api:'precision',batch:true,taskId:'batch',sourceName:'source.pdf',config:DEFAULTS}))
    const zip=new JSZip();zip.file('full.md','Recovered OCR text')
    const bytes=await zip.generateAsync({type:'uint8array'})
    const fetcher=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({code:0,data:{extract_result:[{state:'done',full_zip_url:'https://results.test/archive'}]}})))
      .mockResolvedValueOnce(new Response(new Uint8Array(bytes).buffer))
    vi.stubGlobal('fetch',fetcher)
    const service={hostCtx:{get:()=>({get:()=>({header:{cwd}})})},token:async()=>'test-token'}
    try {
      const args={sessionId:'session',taskId:'batch',api:'precision' as const,wait:false}
      const result=await ZeroWallMineruService.prototype.task.call(service as any,args)
      expect(result.state).toBe('done');expect(result.result?.artifacts.some(a=>a.name==='parse-manifest.json')).toBe(true)
      expect(fetcher.mock.calls[0]?.[0]).toContain('/extract-results/batch/batch')
      const again=await ZeroWallMineruService.prototype.task.call(service as any,args)
      expect(again.result?.runDir).toBe(result.result?.runDir);expect(fetcher).toHaveBeenCalledTimes(2)
    } finally {vi.unstubAllGlobals()}
  })
  it('writes normalized v2-only artifacts and records OCR provenance', async () => {
    const dir = await mkdtemp(join(tmpdir(),'mineru-640-'))
    const zip = new JSZip()
    zip.file('nested/full.md','OCR p=0.04')
    zip.file('nested/test_content_list_v2.json',JSON.stringify([[{type:'paragraph',content:{paragraph_content:[{content:'OCR p=0.04'}]},bbox:[1,2,3,4]}]]))
    const result = await writeResult(DEFAULTS,'session',dir,'scan.pdf','precision','task',undefined,await zip.generateAsync({type:'uint8array'}),Date.now())
    const manifest = JSON.parse(await readFile(join(result.runDir,'parse-manifest.json'),'utf8'))
    expect(manifest.ocr).toEqual({provider:'mineru',requested:true,state:'done'})
    expect(JSON.parse(await readFile(manifest.contentList,'utf8'))[0]).toMatchObject({text:'OCR p=0.04',page_idx:0})
  })
  it('submits OCR and preserves batch identity through converting and done', async () => {
    const responses = [new Response(JSON.stringify({code:0,data:{batch_id:'batch',file_urls:['https://upload.test/file']}})),
      new Response(''),new Response(JSON.stringify({code:0,data:{extract_result:[{state:'converting'}]}})),
      new Response(JSON.stringify({code:0,data:{extract_result:[{state:'done',task_id:'individual',full_zip_url:'https://results.test/result'}]}})),new Response('zip')]
    const fetcher = vi.fn().mockImplementation(async () => responses.shift())
    vi.stubGlobal('fetch',fetcher)
    try {
      const submitted = vi.fn(async () => {})
      const result = await remoteParse({...DEFAULTS,pollIntervalMs:1},'precision','test-secret',new URL('./content.test.ts',import.meta.url).pathname.replace(/^\/(\w:)/u,'$1'),undefined,new AbortController().signal,submitted)
      expect(result.taskId).toBe('batch')
      expect(submitted).toHaveBeenNthCalledWith(1,'batch',true,expect.objectContaining({ complete:false, url:'https://upload.test/file' }))
      expect(submitted).toHaveBeenLastCalledWith('batch',true,expect.objectContaining({ complete:true }))
      expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toMatchObject({files:[{is_ocr:true}],model_version:'vlm'})
      expect(fetcher.mock.calls[2]![0]).toContain('/extract-results/batch/batch')
    } finally { vi.unstubAllGlobals() }
  })
})
