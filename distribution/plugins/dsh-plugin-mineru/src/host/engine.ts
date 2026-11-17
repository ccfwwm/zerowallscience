/** Session-authorized extraction, batch identity, durable chunk recovery and artifact collection. */
import { brandString } from '@deepseek-ai/dsh-brand'
import type { MineruRunId } from '../shared/types.ts'
import { randomUUID } from 'node:crypto'
import { readFile, writeFile, stat } from 'node:fs/promises'
import { basename, dirname, extname, join, relative } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import JSZip from 'jszip'
import type { MineruApi, MineruBatchResult, MineruConfig, MineruMode, MineruParseOptions, MineruParseResult, MineruTaskResult } from '../shared/types.ts'
import { apiFor, validateConfig } from './config.ts'
import { MineruError, failure } from './errors.ts'
import { artifacts, cwdFor, inside, resolveMineruSource, sha, verifyResult, writeResult } from './io.ts'
import { normalizeContent, type ContentRow } from './content.ts'
import { anchoredDocument, pageSpec, pdfPages, remapPages, requestedPages } from './pages.ts'
import { optionsSchema, readRecord, recordPath, runSchema, saveRecord, taskSchema, type PendingRun, type PendingTask } from './records.ts'
import { downloadBytes, request, RequestBudget, responseData, sleepAbort } from './transport.ts'

export interface ParseInput {
  sessionId: string
  source: string
  mode?: MineruMode
  overrides?: MineruParseOptions
  signal?: AbortSignal
  onTaskSubmitted?: (id: string) => Promise<void>
}
export interface TaskInput { sessionId: string; taskId?: string; runId?: string; api?: MineruApi; wait: boolean; signal?: AbortSignal }
type Source = Awaited<ReturnType<typeof resolveMineruSource>>

/** Owns request budgets, in-flight operations and per-record recovery exclusion. */
export class MineruEngine {
  private readonly budget = new RequestBudget()
  private readonly operations = new Set<Promise<unknown>>()
  private readonly recovering = new Map<string, Promise<MineruTaskResult>>()
  constructor(private readonly ctx: Context, private readonly configuration: () => MineruConfig,
    private readonly token: () => Promise<string | undefined>, private readonly stopped: AbortSignal) {}

  /** Wait until all cancelled operations have settled. */
  async drain(): Promise<void> { await Promise.allSettled([...this.operations]) }
  private track<T>(operation: () => Promise<T>): Promise<T> {
    this.stopped.throwIfAborted()
    const promise = operation()
    this.operations.add(promise)
    void promise.then(() => this.operations.delete(promise), () => this.operations.delete(promise))
    return promise
  }
  private signal(timeoutMs: number, signal?: AbortSignal): AbortSignal {
    return AbortSignal.any([this.stopped, AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : [])])
  }
  private async api(cfg: MineruConfig, endpoint: string, token: string | undefined, signal: AbortSignal, body?: object, files = 1): Promise<Record<string, unknown>> {
    await this.budget.acquire(cfg, body ? 'submit' : 'poll', body ? files : 0, signal)
    return responseData(await request(cfg.apiBaseUrl.replace(/\/+$/u, '') + endpoint, {
      method: body ? 'POST' : 'GET', headers: { accept: 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }, signal))
  }
  private async prepare(input: ParseInput, token: string | undefined): Promise<{ source: Source; cfg: MineruConfig; options: MineruParseOptions; api: MineruApi; pages?: number[] }> {
    const options = optionsSchema.parse(input.overrides ?? {})
    const cfg = validateConfig({ ...this.configuration(), ...Object.fromEntries(Object.entries(options).filter(([key]) => !['anchor', 'pageRange', 'pageRanges'].includes(key))), ...(input.mode ? { mode: input.mode } : {}) })
    const api = apiFor(cfg.mode, token)
    const source = await resolveMineruSource(this.ctx, input.sessionId, input.source)
    const extension = extname(source.filePath ? source.sourceName : new URL(source.url!).pathname).toLowerCase()
    if (api === 'agent' && (['.html', '.htm', '.doc', '.ppt', '.xls'].includes(extension) || cfg.extraFormats.length)) throw new MineruError('MINERU_UNSUPPORTED_TYPE', '此格式或导出选项需要 Precision Token。')
    if (['.html', '.htm'].includes(extension)) cfg.modelVersion = 'MinerU-HTML'
    if (api === 'agent') cfg.modelVersion = 'pipeline'
    let total: number | undefined
    if (source.filePath) {
      const bytes = (await stat(source.filePath)).size
      if (!bytes || bytes > (api === 'precision' ? 200 : 10) * 1024 * 1024) throw new MineruError('MINERU_FILE_SIZE', `MinerU ${api} 文件为空或超过 ${api === 'precision' ? 200 : 10} MB。`)
      if (extension === '.pdf') total = await pdfPages(source.filePath)
    }
    if (api === 'agent' && options.pageRanges) throw new MineruError('MINERU_PAGE_RANGE', 'Agent 使用 pageRange；Precision 使用 pageRanges。')
    if (api === 'precision' && options.pageRange) throw new MineruError('MINERU_PAGE_RANGE', 'Precision 使用 pageRanges。')
    if (options.pageRange && !/^\d+(?:-\d+)?$/u.test(options.pageRange)) throw new MineruError('MINERU_PAGE_RANGE', 'Agent pageRange 应为 1-10 或单页。')
    const pages = options.pageRanges ? requestedPages(options.pageRanges, total) : options.pageRange ? requestedPages(options.pageRange, total) : total ? Array.from({ length: total }, (_, index) => index + 1) : undefined
    if (api === 'agent' && pages && pages.length > 20) throw new MineruError('MINERU_PAGE_LIMIT', 'Agent 最多解析 20 页；请配置 Precision Token 或指定 pageRange。')
    if (api === 'precision' && pages && pages.length > 200 && !source.filePath) throw new MineruError('MINERU_PAGE_LIMIT', '远程 URL 每次最多选择 200 页；本地 PDF 支持自动分片。')
    return { source, cfg, options, api, ...(pages ? { pages } : {}) }
  }
  private common(cfg: MineruConfig): object {
    return { language: cfg.language, enable_table: cfg.enableTable, enable_formula: cfg.enableFormula, ...(cfg.extraFormats.length ? { extra_formats: cfg.extraFormats } : {}) }
  }
  private async submit(input: ParseInput, prepared: Awaited<ReturnType<MineruEngine['prepare']>>, token: string | undefined, signal: AbortSignal): Promise<PendingTask> {
    const { source, cfg, api, options, pages } = prepared
    const local = source.filePath !== undefined
    const body = local && api === 'precision'
      ? { ...this.common(cfg), model_version: cfg.modelVersion, files: [{ name: source.sourceName, is_ocr: cfg.isOcr, ...(options.pageRanges ? { page_ranges: options.pageRanges } : {}) }] }
      : { ...this.common(cfg), ...(local ? { file_name: source.sourceName } : { url: source.url }), is_ocr: cfg.isOcr,
        ...(api === 'precision' ? { model_version: cfg.modelVersion, ...(options.pageRanges ? { page_ranges: options.pageRanges } : {}) } : options.pageRange ? { page_range: options.pageRange } : {}) }
    const endpoint = api === 'precision' ? local ? '/api/v4/file-urls/batch' : '/api/v4/extract/task' : `/api/v1/agent/parse/${local ? 'file' : 'url'}`
    const data = await this.api(cfg, endpoint, api === 'precision' ? token : undefined, signal, body)
    const taskId = local && api === 'precision' ? data.batch_id : data.task_id
    if (typeof taskId !== 'string') throw new MineruError('MINERU_SUBMISSION_UNKNOWN', 'MinerU 提交响应缺少任务编号；先检查服务端任务，避免重复提交。')
    const record: PendingTask = { schema: 2, taskId, api, batch: local && api === 'precision', sourceName: source.sourceName, source: input.source, sessionId: input.sessionId, config: cfg, options, ...(pages ? { pages } : {}) }
    if (local) {
      const uploadUrl = api === 'precision' && Array.isArray(data.file_urls) ? data.file_urls[0] : data.file_url
      if (typeof uploadUrl !== 'string') throw new MineruError('MINERU_INVALID_RESPONSE', 'MinerU 未提供文件上传地址。', taskId)
      record.upload = { url: uploadUrl, path: source.filePath!, sha256: sha(await readFile(source.filePath!)), complete: false }
    }
    await saveRecord(recordPath(cwdFor(this.ctx, input.sessionId), 'tasks', taskId), record)
    await input.onTaskSubmitted?.(taskId)
    return record
  }
  /** Parse a document, retaining submitted identities on timeout. @param input - Session, source and options. @returns Checksummed artifacts. */
  parse(input: ParseInput): Promise<MineruParseResult> {
    return this.track(async () => {
      const token = await this.token()
      const prepared = await this.prepare(input, token)
      if (prepared.api === 'precision' && prepared.pages && prepared.pages.length > 200 && (!prepared.source.filePath || extname(prepared.source.sourceName).toLowerCase() !== '.pdf')) throw new MineruError('MINERU_PAGE_LIMIT', '自动分片仅支持可读取页数的本地 PDF；其他来源每次最多选择 200 页。')
      if (prepared.api === 'precision' && prepared.source.filePath && prepared.pages && prepared.pages.length > 200) {
        const run: PendingRun = { schema: 1, runId: brandString<MineruRunId>('run-' + randomUUID()), sessionId: input.sessionId, source: input.source, sourceName: prepared.source.sourceName,
          sha256: sha(await readFile(prepared.source.filePath)), config: prepared.cfg, options: prepared.options, chunks: [] }
        for (let index = 0; index < prepared.pages.length; index += 200) run.chunks.push({ pages: prepared.pages.slice(index, index + 200) })
        await this.saveRun(run)
        try { return (await this.task({ sessionId: input.sessionId, runId: run.runId, wait: true, signal: input.signal })).result! }
        catch (error) { throw new MineruError(failure(error).code, `MinerU 长文档尚未完成；使用 mineru_task 的 runId=${run.runId} 恢复。`, run.runId, { cause: error }) }
      }
      const signal = this.signal(prepared.cfg.timeoutMs, input.signal)
      const record = await this.submit(input, prepared, token, signal)
      try { return (await this.collect(record, input.sessionId, true, signal)).result! }
      catch (error) { throw new MineruError(failure(error).code, `MinerU 任务尚未完成；使用 mineru_task 恢复 taskId=${record.taskId}（${record.api}）。`, record.taskId, { cause: error }) }
    })
  }
  private async collect(record: PendingTask, sessionId: string, wait: boolean, signal: AbortSignal): Promise<MineruTaskResult> {
    if (record.sessionId && record.sessionId !== sessionId) throw new MineruError('MINERU_TASK_OWNER', '该任务属于其他会话。')
    if (record.result) { await verifyResult(record.result, cwdFor(this.ctx, sessionId)); return { ok: true, api: record.api, taskId: record.taskId, state: 'done', result: record.result } }
    const cwd = cwdFor(this.ctx, sessionId)
    const file = recordPath(cwd, 'tasks', record.taskId)
    const token = await this.token()
    if (record.api === 'precision') apiFor('precision', token)
    if (record.upload && !record.upload.complete) {
      if (!wait) return { ok: true, api: record.api, taskId: record.taskId, state: 'waiting-file' }
      const authorized = await resolveMineruSource(this.ctx, sessionId, record.source ?? record.upload.path)
      if (authorized.filePath !== record.upload.path || sha(await readFile(authorized.filePath)) !== record.upload.sha256) throw new MineruError('MINERU_SOURCE_CHANGED', 'MinerU 恢复上传失败：原文件已修改或授权已失效。', record.taskId)
      const response = await request(record.upload.url, { method: 'PUT', body: new Uint8Array(await readFile(authorized.filePath)) }, signal)
      if (!response.ok) throw new MineruError('MINERU_UPLOAD', 'MinerU 原任务上传失败；上传地址可能过期，保留任务编号。', record.taskId)
      record.upload.complete = true
      await saveRecord(file, record)
    }
    for (;;) {
      const endpoint = record.batch ? '/api/v4/extract-results/batch/' : record.api === 'precision' ? '/api/v4/extract/task/' : '/api/v1/agent/parse/'
      const data = await this.api(record.config, endpoint + encodeURIComponent(record.remoteId ?? record.taskId), record.api === 'precision' ? token : undefined, signal)
      const rows = Array.isArray(data.extract_result) ? data.extract_result.filter((row): row is Record<string, unknown> => row !== null && typeof row === 'object') : []
      const row = record.batch ? record.dataId ? rows.find(row => row.data_id === record.dataId) : rows[0] : data
      const state = row?.state ?? 'pending'
      if (!['waiting-file', 'uploading', 'pending', 'running', 'converting', 'done', 'failed'].includes(String(state))) throw new MineruError('MINERU_INVALID_RESPONSE', 'MinerU 返回未知任务状态。', record.taskId)
      if (state === 'failed') throw new MineruError('MINERU_PARSE_FAILED', 'MinerU 服务端解析失败；请核对文件格式、大小与配额。', record.taskId)
      if (state === 'done' && row) {
        const archive = typeof row.full_zip_url === 'string' ? await downloadBytes(row.full_zip_url, signal) : undefined
        const markdown = typeof row.markdown_url === 'string' ? new TextDecoder().decode(await downloadBytes(row.markdown_url, signal, 64 * 1024 * 1024)) : undefined
        const result = await writeResult(record.config, sessionId, cwd, record.sourceName, record.api, record.taskId, markdown, archive, Date.now())
        await this.enrich(result, record.options, record.pages)
        record.result = result
        await saveRecord(file, record)
        return { ok: true, api: record.api, taskId: record.taskId, state: 'done', result }
      }
      if (!wait) return { ok: true, api: record.api, taskId: record.taskId, state: state as MineruTaskResult['state'] }
      await sleepAbort(record.config.pollIntervalMs + Math.floor(Math.random() * (record.config.pollJitterMs + 1)), signal)
    }
  }
  private async enrich(result: MineruParseResult, options: MineruParseOptions, pages?: number[]): Promise<void> {
    const normalized = result.artifacts.find(item => item.path === join(result.runDir, 'content-list.normalized.json')) ?? result.artifacts.find(item => item.name === 'content-list.normalized.json')
    let rows: ContentRow[] = normalized ? normalizeContent(JSON.parse(await readFile(normalized.path, 'utf8'))) : []
    if (normalized && pages && options.pageRanges) {
      rows = remapPages(rows, pages)
      await writeFile(normalized.path, JSON.stringify(rows, null, 2) + '\n')
    }
    if (options.anchor) {
      if (!rows.length) result.anchor = { warnings: ['此结果没有结构化内容列表，无法生成可核实的页码锚点。'] }
      else {
        const rendered = anchoredDocument(rows)
        const markdown = result.artifacts.find(item => item.path === join(result.runDir, 'full.md')) ?? result.artifacts.find(item => item.name === 'full.md') ?? result.artifacts.find(item => item.kind === 'markdown')
        const file = join(dirname(markdown!.path), 'document.md')
        await writeFile(file, rendered.markdown)
        result.anchor = { path: file, warnings: rendered.warnings }
      }
    }
    result.artifacts = await artifacts(result.runDir)
    const file = join(result.runDir, 'parse-manifest.json')
    const manifest: unknown = JSON.parse(await readFile(file, 'utf8'))
    if (!manifest || typeof manifest !== 'object') throw new MineruError('MINERU_ARTIFACT', '解析清单无效。')
    await writeFile(file, JSON.stringify({ ...manifest, ...(result.runId ? { runId: result.runId, chunks: result.chunks } : {}), ...(result.anchor ? { anchor: result.anchor } : {}), artifacts: result.artifacts.filter(item => !['parse-manifest.json', 'run.json'].includes(item.name)).map(item => ({ path: item.path, checksum: item.checksum })) }, null, 2) + '\n')
    result.artifacts = await artifacts(result.runDir)
  }
  /** Resume an existing task or local long-document run. @param input - Identity and polling choice. @returns Current state or collected result. */
  task(input: TaskInput): Promise<MineruTaskResult> {
    const key = `${input.sessionId}/${input.runId ?? input.taskId}`
    const prior = this.recovering.get(key)
    if (prior) return prior
    const operation = this.track(async () => {
      const cwd = cwdFor(this.ctx, input.sessionId)
      if (input.runId) {
        const run = await readRecord(recordPath(cwd, 'runs', input.runId), runSchema)
        if (run.sessionId !== input.sessionId) throw new MineruError('MINERU_TASK_OWNER', '该运行属于其他会话。')
        return this.resumeRun(run, input.wait, input.signal)
      }
      if (!input.taskId) throw new MineruError('MINERU_TASK_ID', '请提供 taskId 或 runId。')
      const record = await readRecord(recordPath(cwd, 'tasks', input.taskId), taskSchema)
      if (input.api && input.api !== record.api) throw new MineruError('MINERU_TASK_API', '任务 API 与原任务记录不匹配。')
      return this.collect(record, input.sessionId, input.wait, this.signal(record.config.timeoutMs, input.signal))
    })
    this.recovering.set(key, operation)
    void operation.then(() => this.recovering.delete(key), () => this.recovering.delete(key))
    return operation
  }
  private saveRun(run: PendingRun): Promise<void> { return saveRecord(recordPath(cwdFor(this.ctx, run.sessionId), 'runs', run.runId), run) }
  private async resumeRun(run: PendingRun, wait: boolean, signal?: AbortSignal): Promise<MineruTaskResult> {
    if (run.result) { await verifyResult(run.result, cwdFor(this.ctx, run.sessionId)); return { ok: true, api: 'precision', taskId: run.runId, runId: run.runId, state: 'done', result: run.result } }
    const source = await resolveMineruSource(this.ctx, run.sessionId, run.source)
    if (!source.filePath || sha(await readFile(source.filePath)) !== run.sha256) throw new MineruError('MINERU_SOURCE_CHANGED', '长文档原文件已改变；保留原运行记录。', run.runId)
    const token = await this.token()
    apiFor('precision', token)
    const results: MineruParseResult[] = []
    for (const chunk of run.chunks) {
      const lifetime = this.signal(run.config.timeoutMs, signal)
      if (chunk.submissionUnknown) throw new MineruError('MINERU_SUBMISSION_UNKNOWN', '某分片的提交结果未知；请先检查服务端任务，避免重复提交。', run.runId)
      if (!chunk.taskId) {
        if (!wait) return { ok: true, api: 'precision', taskId: run.runId, runId: run.runId, state: 'pending' }
        const options = { ...run.options, pageRanges: pageSpec(chunk.pages) }
        const input: ParseInput = { sessionId: run.sessionId, source: run.source }
        chunk.submissionUnknown = true
        await this.saveRun(run)
        const task = await this.submit({ ...input, onTaskSubmitted: async id => { chunk.taskId = id; chunk.submissionUnknown = false; await this.saveRun(run) } },
          { source, cfg: run.config, options, api: 'precision', pages: chunk.pages }, token, lifetime)
        chunk.taskId = task.taskId
      }
      const task = await readRecord(recordPath(cwdFor(this.ctx, run.sessionId), 'tasks', chunk.taskId), taskSchema)
      const collected = await this.collect(task, run.sessionId, wait, lifetime)
      if (!collected.result) return { ...collected, taskId: run.runId, runId: run.runId }
      results.push(collected.result)
    }
    const zip = new JSZip()
    const markdown: string[] = []
    const rows: ContentRow[] = []
    for (let index = 0; index < results.length; index++) {
      const result = results[index]!
      const prefix = `chunks/chunk-${index + 1}/`
      for (const item of result.artifacts) {
        if (!inside(result.runDir, item.path)) throw new MineruError('MINERU_ARTIFACT', '分片产物路径越界。')
        zip.file(prefix + relative(result.runDir, item.path).replaceAll('\\', '/'), await readFile(item.path))
      }
      const md = result.artifacts.find(item => item.path === join(result.runDir, 'full.md')) ?? result.artifacts.find(item => item.name === 'full.md') ?? result.artifacts.find(item => item.kind === 'markdown')
      const base = prefix + relative(result.runDir, dirname(md!.path)).replaceAll('\\', '/').replace(/\/$/u, '')
      const content = (await readFile(md!.path, 'utf8')).replace(/(!\[[^\]]*\]\()([^\s)]+)(\))/gu, (_match, start: string, target: string, end: string) => `${start}${/^(?:https?:|data:|#)/u.test(target) ? target : `${base}/${target}`}${end}`)
      markdown.push(`<!-- chunk ${index + 1}: pages ${pageSpec(run.chunks[index]!.pages)} -->\n${content}`)
      const list = result.artifacts.find(item => item.name === 'content-list.normalized.json')
      if (list) rows.push(...normalizeContent(JSON.parse(await readFile(list.path, 'utf8'))).map(row => ({ ...row, ...(typeof row.img_path === 'string' ? { img_path: `${base}/${row.img_path}` } : {}) })))
    }
    zip.file('full.md', markdown.join('\n\n'))
    zip.file('content_list.json', JSON.stringify(rows))
    const result = await writeResult(run.config, run.sessionId, cwdFor(this.ctx, run.sessionId), run.sourceName, 'precision', undefined, undefined, await zip.generateAsync({ type: 'uint8array' }), Date.now())
    result.runId = run.runId
    result.chunks = run.chunks.map(chunk => ({ pages: chunk.pages, taskId: chunk.taskId! }))
    await this.enrich(result, run.options)
    run.result = result
    await this.saveRun(run)
    return { ok: true, api: 'precision', taskId: run.runId, runId: run.runId, state: 'done', result }
  }
  /** Submit true API batches and retain per-source errors. @param sessionId - Owner. @param sources - Up to 1000 documents. @param options - Shared options. @param signal - Caller cancellation. @returns Successes and recoverable failures. */
  batch(sessionId: string, sources: string[], options: MineruParseOptions, signal?: AbortSignal): Promise<MineruBatchResult> {
    return this.track(async () => {
      if (!sources.length || sources.length > 1000) throw new MineruError('MINERU_BATCH_SIZE', '每次批量解析需要 1 至 1000 个来源。')
      const token = await this.token()
      apiFor('precision', token)
      const result: MineruBatchResult = { ok: true, api: 'precision', results: [], succeeded: 0, failed: 0, failures: [] }
      const groups = new Map<string, { input: ParseInput; prepared: Awaited<ReturnType<MineruEngine['prepare']>> }[]>()
      for (const source of sources) {
        const input: ParseInput = { sessionId, source, mode: 'precision', overrides: options }
        try {
          const prepared = await this.prepare(input, token)
          if (prepared.pages && prepared.pages.length > 200) throw new MineruError('MINERU_PAGE_LIMIT', '批量接口每份文件最多 200 页；请对长文档单独调用 mineru_parse。')
          const key = `${prepared.source.filePath ? 'local' : 'url'}/${prepared.cfg.modelVersion}`
          const group = groups.get(key) ?? []
          group.push({ input, prepared }); groups.set(key, group)
        } catch (error) { result.failures.push({ source, ...failure(error) }) }
      }
      for (const group of groups.values()) for (let offset = 0; offset < group.length; offset += 50) {
        const members = group.slice(offset, offset + 50)
        const cfg = members[0]!.prepared.cfg
        const lifetime = this.signal(cfg.timeoutMs, signal)
        const local = Boolean(members[0]!.prepared.source.filePath)
        const ids = members.map(() => randomUUID())
        let data: Record<string, unknown>
        try {
          data = await this.api(cfg, local ? '/api/v4/file-urls/batch' : '/api/v4/extract/task/batch', token, lifetime,
            { ...this.common(cfg), model_version: cfg.modelVersion, files: members.map((member, index) => ({
              ...(local ? { name: member.prepared.source.sourceName } : { url: member.prepared.source.url }), data_id: ids[index], is_ocr: cfg.isOcr,
              ...(options.pageRanges ? { page_ranges: options.pageRanges } : {}),
            })) }, members.length)
          if (typeof data.batch_id !== 'string') throw new MineruError('MINERU_SUBMISSION_UNKNOWN', '批量提交未返回任务编号；请先检查服务端任务。')
        } catch (error) {
          this.stopped.throwIfAborted(); signal?.throwIfAborted()
          result.failures.push(...members.map(member => ({ source: member.input.source, ...failure(error) })))
          continue
        }
        const records: PendingTask[] = []
        for (let index = 0; index < members.length; index++) {
          const { input, prepared } = members[index]!
          const record: PendingTask = { schema: 2, taskId: ids[index]!, remoteId: String(data.batch_id), dataId: ids[index], api: 'precision', batch: true,
            sourceName: prepared.source.sourceName, source: input.source, sessionId, config: cfg, options, ...(prepared.pages ? { pages: prepared.pages } : {}) }
          if (local) {
            const url = Array.isArray(data.file_urls) ? data.file_urls[index] : undefined
            if (typeof url !== 'string') { result.failures.push({ source: input.source, code: 'MINERU_UPLOAD_URL', message: '批量任务缺少上传地址。', taskId: String(data.batch_id) }); continue }
            record.upload = { url, path: prepared.source.filePath!, sha256: sha(await readFile(prepared.source.filePath!)), complete: false }
          }
          await saveRecord(recordPath(cwdFor(this.ctx, sessionId), 'tasks', record.taskId), record)
          records.push(record)
        }
        // Upload every member before waiting on any member; one slow parse cannot expire the remaining signed URLs.
        for (const record of records) if (record.upload) {
          try {
            const authorized = await resolveMineruSource(this.ctx, sessionId, record.source!)
            const bytes = await readFile(authorized.filePath!)
            if (sha(bytes) !== record.upload.sha256) throw new MineruError('MINERU_SOURCE_CHANGED', '批量上传前文件已改变。', record.taskId)
            const uploaded = await request(record.upload.url, { method: 'PUT', body: new Uint8Array(bytes) }, lifetime)
            if (!uploaded.ok) throw new MineruError('MINERU_UPLOAD', '批量成员上传失败，可使用原任务编号恢复。', record.taskId)
            record.upload.complete = true
            await saveRecord(recordPath(cwdFor(this.ctx, sessionId), 'tasks', record.taskId), record)
          } catch (error) { result.failures.push({ source: record.source!, ...failure(error), taskId: record.taskId }) }
        }
        for (const record of records) {
          if (result.failures.some(item => item.taskId === record.taskId)) continue
          try { result.results.push((await this.collect(record, sessionId, true, lifetime)).result!) }
          catch (error) {
            this.stopped.throwIfAborted(); signal?.throwIfAborted()
            result.failures.push({ source: record.source!, ...failure(error), taskId: record.taskId })
          }
        }
      }
      result.succeeded = result.results.length
      result.failed = result.failures.length
      return result
    })
  }
}
