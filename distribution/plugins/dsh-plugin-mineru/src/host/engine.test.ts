import { Context } from '@deepseek-ai/cordis'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PDFDocument } from 'pdf-lib'
import JSZip from 'jszip'
import { MineruEngine } from './engine.ts'
import { DEFAULTS } from './config.ts'
import { RequestBudget } from './transport.ts'
import { recordPath, saveRecord } from './records.ts'

const json = (data: object): Response => new Response(JSON.stringify({ code: 0, data }))
let ctx: Context
let cwd: string
let stop: AbortController
let engines: MineruEngine[]
beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'mineru-engine-'))
  ctx = new Context()
  ctx.provide('sessions', { get: () => ({ header: { cwd }, snapshotEvents: () => [] }) } as never)
  stop = new AbortController()
  engines = []
  vi.spyOn(RequestBudget.prototype, 'acquire').mockResolvedValue(undefined)
})
afterEach(async () => {
  stop.abort()
  await Promise.all(engines.map(engine => engine.drain()))
  await ctx.fiber.dispose()
  vi.restoreAllMocks(); vi.unstubAllGlobals()
  await rm(cwd, { recursive: true, force: true })
})
function engine(token?: string): MineruEngine {
  const value = new MineruEngine(ctx, () => DEFAULTS, async () => token, stop.signal)
  engines.push(value)
  return value
}
async function archive(text: string, page = 0): Promise<Uint8Array> {
  const zip = new JSZip()
  zip.file('full.md', text + '\n![figure](images/same.png)')
  zip.file('images/same.png', text)
  zip.file('test_content_list.json', JSON.stringify([{ type: 'text', text, page_idx: page, bbox: [1, 2, 3, 4] }, { type: 'image', img_path: 'images/same.png', page_idx: page }]))
  return zip.generateAsync({ type: 'uint8array' })
}

describe('MinerU task and API behavior', () => {
  it('uses tokenless Agent, reports actual pipeline mode and reuses collected artifacts after restart', async () => {
    await writeFile(join(cwd, 'source.docx'), 'synthetic office document')
    const fetcher = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      expect(init.headers ?? {}).not.toHaveProperty('authorization')
      if (url.endsWith('/parse/file')) return json({ task_id: 'agent-one', file_url: 'https://upload.test/file' })
      if (url === 'https://upload.test/file') return new Response('')
      if (url.endsWith('/parse/agent-one')) return json({ state: 'done', markdown_url: 'https://result.test/full.md' })
      return new Response('Agent document')
    })
    vi.stubGlobal('fetch', fetcher)
    const result = await engine().parse({ sessionId: 'owner', source: 'source.docx', overrides: { anchor: true } })
    expect(result).toMatchObject({ api: 'agent', modelVersion: 'pipeline', taskId: 'agent-one', preview: { markdown: 'Agent document' } })
    expect(result.anchor?.warnings).toHaveLength(1)
    const resumed = await engine().task({ sessionId: 'owner', taskId: 'agent-one', wait: true })
    expect(resumed.result?.runDir).toBe(result.runDir)
    expect(fetcher).toHaveBeenCalledTimes(4)
    await expect(engine().parse({ sessionId: 'owner', source: 'source.docx', mode: 'precision' })).rejects.toMatchObject({ code: 'MINERU_TOKEN_REQUIRED' })
    expect(fetcher).toHaveBeenCalledTimes(4)
    await fsWriteCorruption(result)
    await expect(engine().task({ sessionId: 'owner', taskId: 'agent-one', wait: true })).rejects.toMatchObject({ code: 'MINERU_ARTIFACT' })
  })

  it('resumes a legacy upload without submitting and rejects a changed file before uploading', async () => {
    const file = join(cwd, 'source.pdf')
    await writeFile(file, 'original')
    const { sha } = await import('./io.ts')
    const record = { api: 'precision' as const, batch: true, taskId: 'legacy', sourceName: 'source.pdf', config: DEFAULTS, options: {}, upload: { path: file, url: 'https://upload.test/file', sha256: sha('original'), complete: false } }
    await saveRecord(recordPath(cwd, 'tasks', 'legacy'), record)
    const bytes = await archive('Recovered')
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('')).mockResolvedValueOnce(json({ extract_result: [{ state: 'done', full_zip_url: 'https://result.test/zip' }] })).mockResolvedValueOnce(new Response(new Uint8Array(bytes)))
    vi.stubGlobal('fetch', fetcher)
    expect((await engine('key').task({ sessionId: 'owner', taskId: 'legacy', wait: false })).state).toBe('waiting-file')
    expect(fetcher).not.toHaveBeenCalled()
    expect((await engine('key').task({ sessionId: 'owner', taskId: 'legacy', wait: true })).state).toBe('done')
    expect(fetcher.mock.calls.some(call => call[1]?.method === 'POST')).toBe(false)
    await saveRecord(recordPath(cwd, 'tasks', 'legacy'), record)
    await writeFile(file, 'changed')
    await expect(engine('key').task({ sessionId: 'owner', taskId: 'legacy', wait: true })).rejects.toMatchObject({ code: 'MINERU_SOURCE_CHANGED' })
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  it('uses true batches of at most 50 and selects out-of-order results by data_id', async () => {
    const batches = new Map<string, { data_id: string; url: string }[]>()
    const bytes = await archive('Batch text')
    const fetcher = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      if (init.method === 'POST') {
        expect(url).toContain('/extract/task/batch')
        const body = JSON.parse(String(init.body))
        expect(body.files.length).toBeLessThanOrEqual(50)
        const id = 'batch' + batches.size
        batches.set(id, body.files)
        return json({ batch_id: id })
      }
      if (url.includes('/extract-results/batch/')) {
        const id = url.split('/').at(-1)!
        return json({ extract_result: [...batches.get(id)!].reverse().map(row => ({ data_id: row.data_id, state: row.url.endsWith('bad.pdf') ? 'failed' : 'done', full_zip_url: 'https://result.test/zip' })) })
      }
      return new Response(new Uint8Array(bytes))
    })
    vi.stubGlobal('fetch', fetcher)
    const sources = [...Array.from({ length: 50 }, (_, index) => `https://docs.test/${index}.pdf`), 'https://docs.test/bad.pdf', '../outside.pdf']
    const result = await engine('key').batch('owner', sources, {})
    expect(batches.size).toBe(2)
    expect(result).toMatchObject({ succeeded: 50, failed: 2 })
    expect(result.failures.find(row => row.source.endsWith('bad.pdf'))).toMatchObject({ code: 'MINERU_PARSE_FAILED', taskId: expect.stringMatching(/^[a-f0-9-]{36}$/u) })
    expect(result.results[0]?.sourceName).toBe(sources[0])
    await expect(engine('key').batch('owner', Array(1001).fill('https://docs.test/a.pdf'), {})).rejects.toMatchObject({ code: 'MINERU_BATCH_SIZE' })
  })

  it('recovers a 201-page PDF with original page anchors and no duplicate submissions', async () => {
    const pdf = await PDFDocument.create()
    for (let index = 0; index < 201; index++) pdf.addPage([100, 100])
    await writeFile(join(cwd, 'long.pdf'), await pdf.save())
    const chunks = [await archive('First chunk'), await archive('Last chunk')]
    let submissions = 0
    let uploads = 0
    let failSecond = true
    const fetcher = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      if (init.method === 'POST') {
        submissions++
        const body = JSON.parse(String(init.body))
        expect(body.files[0].page_ranges).toBe(submissions === 1 ? '1-200' : '201')
        return json({ batch_id: 'chunk' + submissions, file_urls: ['https://upload.test/' + submissions] })
      }
      if (init.method === 'PUT') { uploads++; return new Response('') }
      if (url.includes('/extract-results/batch/chunk2') && failSecond) throw new Error('synthetic interruption')
      if (url.includes('/extract-results/batch/')) return json({ extract_result: [{ state: 'done', full_zip_url: 'https://result.test/' + (url.endsWith('chunk1') ? '1' : '2') }] })
      return new Response(new Uint8Array(chunks[url.endsWith('1') ? 0 : 1]!))
    })
    vi.stubGlobal('fetch', fetcher)
    let runId = ''
    try { await engine('key').parse({ sessionId: 'owner', source: 'long.pdf', overrides: { anchor: true } }) }
    catch (error) { runId = (error as { taskId: string }).taskId }
    expect(runId).toMatch(/^run-/u)
    expect(submissions).toBe(2)
    failSecond = false
    const result = (await engine('key').task({ sessionId: 'owner', runId, wait: true })).result!
    expect(submissions).toBe(2); expect(uploads).toBe(2)
    expect(result.chunks).toHaveLength(2)
    expect(await readFile(result.anchor!.path!, 'utf8')).toContain('<!-- p201 b1 -->')
    const list = result.artifacts.find(item => item.name === 'content-list.normalized.json' && !item.path.includes('chunk-'))!
    const rows = JSON.parse(await readFile(list.path, 'utf8'))
    expect(rows.map((row: { page_idx: number }) => row.page_idx)).toEqual([0, 0, 200, 200])
    const manifest = JSON.parse(await readFile(join(result.runDir, 'parse-manifest.json'), 'utf8'))
    expect(manifest.images).toHaveLength(2)
    await expect(engine('key').task({ sessionId: 'different', runId, wait: true })).rejects.toMatchObject({ code: 'MINERU_TASK_OWNER' })
  })

  it('cancels polling and drains before teardown while retaining the submitted task', async () => {
    let entered!: () => void
    const polling = new Promise<void>(resolve => { entered = resolve })
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      if (init.method === 'POST') return json({ task_id: 'cancelled' })
      entered()
      return new Promise<Response>((_resolve, reject) => init.signal!.addEventListener('abort', () => reject(init.signal!.reason), { once: true }))
    }))
    const current = engine()
    const operation = current.parse({ sessionId: 'owner', source: 'https://docs.test/short.pdf' })
    const settled = expect(operation).rejects.toMatchObject({ taskId: 'cancelled' })
    await polling
    stop.abort()
    await current.drain()
    await settled
    expect(JSON.parse(await readFile(recordPath(cwd, 'tasks', 'cancelled'), 'utf8')).taskId).toBe('cancelled')
  })
})

async function fsWriteCorruption(result: { artifacts: { kind: string; path: string }[] }): Promise<void> { await writeFile(result.artifacts.find(item => item.kind === 'markdown')!.path, 'changed') }
