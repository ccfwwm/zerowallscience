import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { SessionId } from '@deepseek-ai/dsh-session'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { defineTool } from '@deepseek-ai/dsh-tools'
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import type { Context } from '@deepseek-ai/cordis'
import JSZip from 'jszip'
import { basename, extname, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { SecretBrokerClient } from '@zerowallscience/plugin-secrets'
import type { MineruApi, MineruArtifact, MineruBatchResult, MineruConfig, MineruConfigStatus, MineruConnectionTestResult, MineruMode, MineruParseResult, MineruRegistrationInput, MineruTaskResult } from '../shared/types.js'
import type { ArtifactRecord } from '@zerowallscience/research-store/types'

export type * from '../shared/types.js'
export const name = 'zerowall-mineru'
export const inject = ['settings', 'tools', 'sessions', 'zerowallFiles', 'zerowallResearch']
export const MINERU_SETTINGS_NS = 'zerowall-mineru' as SettingsNamespace
export const TOKEN_MANAGEMENT_URL = 'https://mineru.net/apiManage/token'
const TOKEN_KEY = 'zerowall.environment.mineru_api_token'
const MINERU_TOOL_NAMES = ['mineru_activate', 'mineru_parse', 'mineru_batch_parse', 'mineru_task'] as const
const DEFAULTS: MineruConfig = { apiBaseUrl: 'https://mineru.net', tokenCredential: 'MINERU_API_TOKEN', mode: 'auto', modelVersion: 'vlm', language: 'ch', enableTable: true, enableFormula: true, isOcr: false, extraFormats: [], timeoutMs: 600000, pollIntervalMs: 3000, pollJitterMs: 500, submitRatePerMinute: 40, dailyLimit: 5000, inlineMarkdownBytes: 12000, artifactRootName: '.dsh-mineru' }
const ConfigSchema: z<MineruConfig> = z.object({ apiBaseUrl: z.string().default(DEFAULTS.apiBaseUrl), tokenCredential: z.string().default(DEFAULTS.tokenCredential), mode: z.union(['auto', 'precision', 'agent'] as const).default(DEFAULTS.mode), modelVersion: z.union(['pipeline', 'vlm', 'MinerU-HTML'] as const).default(DEFAULTS.modelVersion), language: z.string().default(DEFAULTS.language), enableTable: z.boolean().default(true), enableFormula: z.boolean().default(true), isOcr: z.boolean().default(false), extraFormats: z.array(z.union(['docx', 'html', 'latex'] as const)).default([]), timeoutMs: z.number().default(DEFAULTS.timeoutMs), pollIntervalMs: z.number().default(DEFAULTS.pollIntervalMs), pollJitterMs: z.number().default(DEFAULTS.pollJitterMs), submitRatePerMinute: z.number().default(DEFAULTS.submitRatePerMinute), dailyLimit: z.number().default(DEFAULTS.dailyLimit), inlineMarkdownBytes: z.number().default(DEFAULTS.inlineMarkdownBytes), artifactRootName: z.string().default(DEFAULTS.artifactRootName) })
interface RunRecord { result?: MineruParseResult; taskId?: string; cwd: string }
const runs = new Map<string, RunRecord>()
function validateConfig(value: MineruConfig): MineruConfig { let url: URL; try { url = new URL(value.apiBaseUrl) } catch { throw new Error('MinerU API Base URL 无效。') } if (!['http:', 'https:'].includes(url.protocol) || value.apiBaseUrl.length > 2048 || url.pathname.toLowerCase().includes('/apimanage/token')) throw new Error('MinerU API Base URL 必须是有效的 http(s) 服务地址，不能填写 Token 管理页面。'); if (!['auto', 'precision', 'agent'].includes(value.mode)) throw new Error('MinerU 模式无效。'); if (!Number.isInteger(value.timeoutMs) || value.timeoutMs < 10000 || value.timeoutMs > 3600000) throw new Error('MinerU 超时必须在 10 秒到 1 小时之间。'); if (!Number.isInteger(value.pollIntervalMs) || value.pollIntervalMs < 500 || value.pollIntervalMs > 60000) throw new Error('MinerU 轮询间隔无效。'); if (!Number.isInteger(value.pollJitterMs) || value.pollJitterMs < 0 || value.pollJitterMs > 60000) throw new Error('MinerU 轮询抖动无效。'); if (!Number.isInteger(value.submitRatePerMinute) || value.submitRatePerMinute < 1 || value.submitRatePerMinute > 50) throw new Error('MinerU 提交限流必须在 1 到 50 次/分钟之间。'); if (!Number.isInteger(value.dailyLimit) || value.dailyLimit < 1 || value.dailyLimit > 5000) throw new Error('MinerU 每日额度必须在 1 到 5000 之间。'); if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(value.tokenCredential)) throw new Error('MinerU Token 引用名无效。'); if (!value.artifactRootName || value.artifactRootName.includes('/') || value.artifactRootName.includes('\\') || value.artifactRootName === '.' || value.artifactRootName === '..') throw new Error('MinerU Artifact 目录名无效。'); return value }
function cwdFor(ctx: Context, sessionId: string): string { const cwd = ctx.get('sessions')?.get(SessionId(sessionId))?.header.cwd; if (!cwd) throw new Error('当前会话没有工作区。'); return resolve(cwd) }
function inside(root: string, candidate: string): boolean { const rel = relative(resolve(root), resolve(candidate)); return rel === '' || (!rel.startsWith('..') && !/^(?:[A-Za-z]:[\\/]|[\\/])/u.test(rel)) }
function apiFor(mode: MineruMode, token?: string): MineruApi | 'local' { if (!token) return 'local'; return mode === 'agent' ? 'agent' : 'precision' }
function json(text: string): unknown { try { return JSON.parse(text) as unknown } catch { return undefined } }
function sha(data: Uint8Array | string): string { return createHash('sha256').update(data).digest('hex') }
function mime(path: string): string { return ({ '.md': 'text/markdown', '.json': 'application/json', '.pdf': 'application/pdf', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.html': 'text/html', '.tex': 'application/x-latex' } as Record<string, string>)[extname(path).toLowerCase()] ?? 'application/octet-stream' }
function kind(path: string): MineruArtifact['kind'] { const ext = extname(path).toLowerCase(); if (ext === '.md') return 'markdown'; if (ext === '.json') return 'json'; if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'].includes(ext)) return 'image'; if (ext === '.zip') return 'archive'; return 'export' }
async function artifacts(dir: string): Promise<MineruArtifact[]> { const result: MineruArtifact[] = []; async function visit(path: string): Promise<void> { for (const entry of await readdir(path, { withFileTypes: true })) { const item = join(path, entry.name); if (entry.isDirectory()) await visit(item); else { const info = await stat(item); result.push({ name: entry.name, path: item, mediaType: mime(item), bytes: info.size, checksum: sha(await readFile(item)), kind: kind(item) }) } } } await visit(dir); return result }
async function extractZip(data: Uint8Array, destination: string): Promise<void> { const zip = await JSZip.loadAsync(data, { checkCRC32: true }); const entries = Object.values(zip.files); if (entries.length > 10000) throw new Error('MinerU 结果 ZIP 条目过多。'); let total = 0; for (const entry of entries) { const name = entry.name.replaceAll('\\', '/'); if (entry.dir) continue; if (name.startsWith('/') || /^[A-Za-z]:/u.test(name) || name.split('/').includes('..')) throw new Error('MinerU 结果 ZIP 包含不安全路径。'); const output = resolve(destination, name); if (!inside(destination, output)) throw new Error('MinerU 结果 ZIP 路径越界。'); const bytes = await entry.async('uint8array'); total += bytes.byteLength; if (total > 512 * 1024 * 1024) throw new Error('MinerU 结果 ZIP 超过 512 MiB。'); await mkdir(resolve(output, '..'), { recursive: true }); await writeFile(output, bytes, { flag: 'wx' }).catch(async error => { if ((error as NodeJS.ErrnoException).code === 'EEXIST') await writeFile(output, bytes); else throw error }) } }
function preview(markdown: string, limit: number) { const bytes = Buffer.byteLength(markdown); if (bytes <= limit) return { markdown, truncated: false, bytes }; return { markdown: `${Buffer.from(markdown).subarray(0, limit).toString('utf8')}\n...(预览已截断，完整内容见 full.md)`, truncated: true, bytes } }
async function body(response: Response): Promise<any> { const value = json(await response.text()); if (!response.ok) throw new Error(`MinerU API 请求失败（HTTP ${response.status}）。`); if (value === undefined) throw new Error('MinerU API 返回了无效 JSON。'); return value }
async function request(url: string, init: RequestInit, signal: AbortSignal): Promise<Response> { let delay = 500; for (let attempt = 0; attempt < 4; attempt += 1) { const response = await fetch(url, { ...init, signal }); if (response.status !== 429 || attempt === 3) return response; await new Promise(resolvePromise => setTimeout(resolvePromise, Number(response.headers.get('retry-after') ?? 0) * 1000 || delay)); delay = Math.min(delay * 2, 8000) } throw new Error('MinerU API 请求失败。') }
async function sleepAbort(ms: number, signal: AbortSignal): Promise<void> { await new Promise<void>((resolvePromise, reject) => { if (signal.aborted) { reject(signal.reason ?? new Error('MinerU 操作已取消。')); return } const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolvePromise() }, ms); const abort = () => { clearTimeout(timer); reject(signal.reason ?? new Error('MinerU 操作已取消。')) }; signal.addEventListener('abort', abort, { once: true }) }) }
function payloadData(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object') throw new Error('MinerU API 返回格式无效。'); const record = value as Record<string, unknown>; if (record.code !== undefined && record.code !== 0 && record.code !== '0') throw new Error(`MinerU API 错误：${String(record.msg ?? record.code).slice(0, 300)}`); const data = record.data; return data && typeof data === 'object' ? data as Record<string, unknown> : record }
async function downloadBytes(url: string, signal: AbortSignal, limit = 1024 * 1024 * 1024): Promise<Uint8Array> { const response = await request(url, { method: 'GET' }, signal); if (!response.ok || !response.body) throw new Error(`MinerU 结果下载失败（HTTP ${response.status}）。`); const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let total = 0; for (;;) { const part = await reader.read(); if (part.done) break; total += part.value.byteLength; if (total > limit) throw new Error('MinerU 结果超过大小限制。'); chunks.push(part.value) } const result = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength } return result }
async function remoteParse(cfg: MineruConfig, api: MineruApi, token: string | undefined, filePath: string | undefined, sourceUrl: string | undefined, signal: AbortSignal): Promise<{ taskId?: string; markdown?: string; archive?: Uint8Array }> {
  const root = cfg.apiBaseUrl.replace(/\/+$/u, ''); const auth: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {}; let taskId: string | undefined; let batchId: string | undefined
  if (api === 'precision' && filePath) {
    const bytes = await readFile(filePath); const response = await request(`${root}/api/v4/file-urls/batch`, { method: 'POST', headers: { ...auth, accept: 'application/json', 'content-type': 'application/json' }, body: JSON.stringify({ files: [{ name: basename(filePath), is_ocr: cfg.isOcr }], model_version: cfg.modelVersion, language: cfg.language, enable_table: cfg.enableTable, enable_formula: cfg.enableFormula, ...(cfg.extraFormats.length ? { extra_formats: cfg.extraFormats } : {}) }) }, signal); const data = payloadData(await response.json() as unknown); batchId = typeof data.batch_id === 'string' ? data.batch_id : undefined; const urls = Array.isArray(data.file_urls) ? data.file_urls : []; const uploadUrl = typeof urls[0] === 'string' ? urls[0] : undefined; if (!batchId || !uploadUrl) throw new Error('Precision API 没有返回批量上传地址。'); const upload = await request(uploadUrl, { method: 'PUT', body: bytes }, signal); if (!upload.ok) throw new Error(`MinerU 文件上传失败（HTTP ${upload.status}）。`)
  } else {
    const endpoint = api === 'precision' ? '/api/v4/extract/task' : `/api/v1/agent/parse/${filePath ? 'file' : 'url'}`; const bodyValue = api === 'precision' ? { url: sourceUrl, model_version: cfg.modelVersion, language: cfg.language, enable_table: cfg.enableTable, enable_formula: cfg.enableFormula, is_ocr: cfg.isOcr, ...(cfg.extraFormats.length ? { extra_formats: cfg.extraFormats } : {}) } : { ...(filePath ? { file_name: basename(filePath) } : { url: sourceUrl }), language: cfg.language, enable_table: cfg.enableTable, enable_formula: cfg.enableFormula, is_ocr: cfg.isOcr }
    const response = await request(`${root}${endpoint}`, { method: 'POST', headers: { ...auth, accept: 'application/json', 'content-type': 'application/json' }, body: JSON.stringify(bodyValue) }, signal); const data = payloadData(await response.json() as unknown); taskId = typeof data.task_id === 'string' ? data.task_id : undefined; if (!taskId) throw new Error('MinerU API 没有返回任务 ID。'); if (api === 'agent' && filePath) { const uploadUrl = typeof data.file_url === 'string' ? data.file_url : undefined; if (!uploadUrl) throw new Error('Agent API 没有返回上传地址。'); const upload = await request(uploadUrl, { method: 'PUT', body: await readFile(filePath) }, signal); if (!upload.ok) throw new Error(`MinerU 文件上传失败（HTTP ${upload.status}）。`) }
  }
  const deadline = Date.now() + cfg.timeoutMs; for (;;) { if (Date.now() > deadline) throw new Error(`MinerU 任务等待超时；请使用 mineru_task 恢复 taskId=${taskId ?? batchId ?? ''}。`); await sleepAbort(cfg.pollIntervalMs, signal); const queryPath = batchId ? `/api/v4/extract-results/batch/${encodeURIComponent(batchId)}` : api === 'precision' ? `/api/v4/extract/task/${encodeURIComponent(taskId!)}` : `/api/v1/agent/parse/${encodeURIComponent(taskId!)}`; const response = await request(`${root}${queryPath}`, { method: 'GET', headers: auth }, signal); const data = payloadData(await response.json() as unknown); if (batchId) { const rows = Array.isArray(data.extract_result) ? data.extract_result as unknown[] : []; const row = rows[0] as Record<string, unknown> | undefined; if (!row || !['done', 'failed'].includes(String(row.state))) continue; if (String(row.state) === 'failed') throw new Error(String(row.err_msg ?? 'MinerU 解析失败。')); const zipUrl = typeof row.full_zip_url === 'string' ? row.full_zip_url : undefined; const resolvedTaskId = typeof row.task_id === 'string' ? row.task_id : batchId; return zipUrl ? { ...(resolvedTaskId ? { taskId: resolvedTaskId } : {}), archive: await downloadBytes(zipUrl, signal) } : { ...(resolvedTaskId ? { taskId: resolvedTaskId } : {}) }
    } const state = String(data.state ?? ''); if (state !== 'done' && state !== 'failed') continue; if (state === 'failed') throw new Error(String(data.err_msg ?? 'MinerU 解析失败。')); if (api === 'precision') { const zipUrl = typeof data.full_zip_url === 'string' ? data.full_zip_url : undefined; return zipUrl ? { ...(taskId ? { taskId } : {}), archive: await downloadBytes(zipUrl, signal) } : { ...(taskId ? { taskId } : {}) } } const markdownUrl = typeof data.markdown_url === 'string' ? data.markdown_url : undefined; if (!markdownUrl) return { ...(taskId ? { taskId } : {}) }; return { ...(taskId ? { taskId } : {}), markdown: new TextDecoder().decode(await downloadBytes(markdownUrl, signal, 64 * 1024 * 1024)) }
  }
}
async function writeResult(cfg: MineruConfig, sessionId: string, cwd: string, sourceName: string, api: MineruApi, taskId: string | undefined, markdown: string | undefined, archive: Uint8Array | undefined, started: number): Promise<MineruParseResult> { const dir = resolve(cwd, cfg.artifactRootName, 'artifacts', `run-${Date.now()}-${randomUUID().slice(0, 8)}`); await mkdir(dir, { recursive: true }); if (archive) await extractZip(archive, dir); const text = markdown ?? await readFile(resolve(dir, 'full.md'), 'utf8').catch(() => '# MinerU 解析结果\n\n服务未返回可读 Markdown。'); await writeFile(resolve(dir, 'full.md'), text, 'utf8'); await writeFile(resolve(dir, 'run.json'), JSON.stringify({ plugin: 'zerowall-mineru', sessionId, source: sourceName, api, taskId: taskId ?? null, createdAt: new Date().toISOString() }, null, 2), 'utf8'); return { ok: true, api, mode: cfg.mode, modelVersion: cfg.modelVersion, ...(taskId ? { taskId } : {}), sourceName, runDir: dir, durationMs: Date.now() - started, preview: preview(text, cfg.inlineMarkdownBytes), artifacts: await artifacts(dir) } }

declare module '@deepseek-ai/cordis' { interface Context { zerowallMineru: ZeroWallMineruService } }
export class ZeroWallMineruService extends TypertRemoteService {
  static inject = inject
  private readonly scope
  private readonly secrets = new SecretBrokerClient()
  constructor(private readonly hostCtx: Context) {
    super(hostCtx, 'zerowallMineru')
    this.scope = hostCtx.settings.register(MINERU_SETTINGS_NS, ConfigSchema)
    hostCtx.tools.register(defineTool({
      name: 'mineru_activate', description: '激活 MinerU 文档解析工具集。', parameters: {},
      output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => { const data = value as { api?: string; tokenConfigured?: boolean }; return [{ type: 'text', text: `MinerU 已激活：${data.api ?? 'agent'} API，Token ${data.tokenConfigured ? '已配置' : '未配置'}。` }] } },
      execute: async () => { const status = await this.getConfigStatus(); return { api: status.api, tokenConfigured: status.tokenConfigured, tools: ['mineru_parse', 'mineru_batch_parse', 'mineru_task'] } as unknown as Record<string, JsonValue> },
    }))
    hostCtx.tools.register(defineTool({
      name: 'mineru_parse', description: '将工作区文件或 HTTP(S) 文档解析为结构化 Markdown。',
      parameters: { source: { type: 'string', required: true }, mode: { type: 'string' }, language: { type: 'string' }, modelVersion: { type: 'string' } },
      output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => { const data = value as { sourceName?: string; preview?: { markdown?: string } }; return [{ type: 'text', text: `MinerU 解析完成：${data.sourceName ?? ''}\n${data.preview?.markdown ?? ''}` }] }, presentationMeta: (_args, value) => value },
      execute: async (args, exec) => { const input: { sessionId: string; source: string; overrides: Partial<MineruConfig>; signal: AbortSignal; mode?: MineruMode } = { sessionId: String(exec.agent?.session.id ?? ''), source: String(args.source ?? ''), overrides: args as Partial<MineruConfig>, signal: exec.signal }; if (args.mode !== undefined) input.mode = args.mode as MineruMode; return this.parse(input) as unknown as Record<string, JsonValue> },
    }))
    hostCtx.tools.register(defineTool({
      name: 'mineru_batch_parse', description: '使用 Precision API 批量解析多个文件。', parameters: { sources: { type: 'array', required: true, items: { type: 'string' } } },
      output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => { const data = value as { succeeded?: number; failed?: number }; return [{ type: 'text', text: `MinerU 批量解析完成：成功 ${data.succeeded ?? 0}，失败 ${data.failed ?? 0}。` }] } },
      execute: async (args, exec) => { const values = Array.isArray(args.sources) ? args.sources.slice(0, 1000).map(String) : []; const results: MineruParseResult[] = []; let failed = 0; for (const source of values) { try { results.push(await this.parse({ sessionId: String(exec.agent?.session.id ?? ''), source, mode: 'precision', signal: exec.signal })) } catch { failed += 1 } } return { ok: true, api: 'precision', results, succeeded: results.length, failed } satisfies MineruBatchResult as unknown as Record<string, JsonValue> },
    }))
    hostCtx.tools.register(defineTool({
      name: 'mineru_task', description: '查询之前提交的 MinerU 任务。', parameters: { taskId: { type: 'string', required: true }, api: { type: 'string', required: true }, wait: { type: 'boolean' } },
      output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => { const data = value as { taskId?: string; state?: string }; return [{ type: 'text', text: `MinerU 任务 ${data.taskId ?? ''}：${data.state ?? 'pending'}` }] } },
      execute: async (args, exec) => this.task({ sessionId: String(exec.agent?.session.id ?? ''), taskId: String(args.taskId), api: String(args.api) as MineruApi, wait: args.wait === true, signal: exec.signal }) as unknown as Record<string, JsonValue>,
    }))
    for (const tool of MINERU_TOOL_NAMES) {
      if (hostCtx.tools.get(tool) === undefined) throw new Error(`MinerU Host tool registration failed: ${tool}`)
    }
  }
  private config(): MineruConfig { return validateConfig({ ...DEFAULTS, ...this.scope.get() }) }
  private async token(): Promise<string | undefined> {
    let value: string | undefined
    try { value = await this.secrets.get(TOKEN_KEY) } catch { value = undefined }
    return value?.trim() || undefined
  }
  @Remote('getConfigStatus') async getConfigStatus(): Promise<MineruConfigStatus> { const cfg = this.config(); const token = await this.token(); const registeredTools = MINERU_TOOL_NAMES.filter(tool => this.hostCtx.tools.get(tool) !== undefined); return { ...cfg, api: apiFor(cfg.mode, token), tokenConfigured: token !== undefined, tokenManagementUrl: TOKEN_MANAGEMENT_URL, available: registeredTools.length === MINERU_TOOL_NAMES.length, registeredTools } }
  @Remote('updateConfig') async updateConfig(input: Partial<MineruConfig>): Promise<MineruConfigStatus> { const next = validateConfig({ ...this.config(), ...input }); await this.scope.replace(next); return this.getConfigStatus() }
  @Remote('setToken') async setToken(value: string): Promise<MineruConfigStatus> { if (!value.trim()) throw new Error('MinerU Token 不能为空。'); await this.secrets.set(TOKEN_KEY, value.trim()); return this.getConfigStatus() }
  @Remote('clearToken') async clearToken(): Promise<MineruConfigStatus> { await this.secrets.delete(TOKEN_KEY); return this.getConfigStatus() }
  @Remote('testConnection') async testConnection(): Promise<MineruConnectionTestResult> {
    const cfg = this.config()
    const token = await this.token()
    const api = apiFor(cfg.mode, token)
    if (api === 'local') return { ok: true, api: 'local', tokenConfigured: false }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15000)
    const root = cfg.apiBaseUrl.replace(/\/+$/u, '')
    try {
      const response = api === 'precision'
        ? await fetch(`${root}/api/v4/file-urls/batch`, {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, accept: 'application/json', 'content-type': 'application/json' },
          // Empty validation input does not allocate a file URL or parse task.
          body: JSON.stringify({ files: [] }),
          signal: controller.signal,
        })
        : await fetch(`${root}/api/v1/agent/parse/url`, {
          method: 'POST',
          headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), accept: 'application/json', 'content-type': 'application/json' },
          // The endpoint is POST-only. Invalid empty input verifies routing
          // without submitting a document or allocating a parse task.
          body: '{}',
          signal: controller.signal,
        })
      if (response.status === 401 || response.status === 403) throw new Error(`MinerU ${api === 'precision' ? 'Token' : 'Agent'} 检测失败：认证未通过。`)
      if (response.status === 404 || response.status === 405) throw new Error(`MinerU ${api === 'precision' ? 'Precision' : 'Agent'} API 地址不存在（HTTP ${response.status}）。`)
      if (!response.ok && api === 'precision' && ![400, 422].includes(response.status)) throw new Error(`MinerU Precision API 检测失败（HTTP ${response.status}）。`)
      if (!response.ok && api === 'agent' && ![400, 422].includes(response.status)) throw new Error(`MinerU Agent API 检测失败（HTTP ${response.status}）。`)
      return { ok: true, api, tokenConfigured: true }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw new Error('MinerU 连接检测超时，请检查网络或 API Base URL。')
      throw error
    } finally {
      clearTimeout(timer)
    }
  }
  @Remote('testToken') async testToken(): Promise<{ ok: true; api: 'precision' }> {
    const token = await this.token(); if (!token) throw new Error('尚未配置 MinerU Token。')
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 15000)
    try {
      // This endpoint only allocates a short-lived upload URL; no document is
      // uploaded and no parse task is created. A non-2xx response is failure.
      const response = await fetch(`${this.config().apiBaseUrl.replace(/\/+$/u, '')}/api/v4/file-urls/batch`, { method: 'POST', headers: { authorization: `Bearer ${token}`, accept: 'application/json', 'content-type': 'application/json' }, body: JSON.stringify({ files: [{ name: '__zerowall_token_probe__.txt', is_ocr: false }] }), signal: controller.signal })
      if (!response.ok) throw new Error(`MinerU Token 测试失败（HTTP ${response.status}）。`)
      return { ok: true, api: 'precision' }
    } catch (error) { if (error instanceof Error && error.name === 'AbortError') throw new Error('MinerU Token 测试超时，请检查网络或 API Base URL。'); throw error }
    finally { clearTimeout(timer) }
  }
  @Remote('testAgent') async testAgent(): Promise<{ ok: true; api: 'agent' }> {
    const token = await this.token(); const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 15000)
    try {
      const response = await fetch(`${this.config().apiBaseUrl.replace(/\/+$/u, '')}/api/v1/agent/parse/url`, { method: 'POST', headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), accept: 'application/json', 'content-type': 'application/json' }, body: JSON.stringify({}), signal: controller.signal })
      if (!response.ok && ![400, 422].includes(response.status)) throw new Error(`MinerU Agent API 测试失败（HTTP ${response.status}）。`)
      return { ok: true, api: 'agent' }
    } catch (error) { if (error instanceof Error && error.name === 'AbortError') throw new Error('MinerU Agent API 测试超时，请检查网络或 API Base URL。'); throw error }
    finally { clearTimeout(timer) }
  }
  async parse(input: { sessionId: string; source: string; mode?: MineruMode; overrides?: Partial<MineruConfig>; signal?: AbortSignal }): Promise<MineruParseResult> { const cwd = cwdFor(this.hostCtx, input.sessionId); const source = input.source.trim(); if (!source) throw new Error('MinerU source 不能为空。'); const cfg = validateConfig({ ...this.config(), ...(input.overrides ?? {}), ...(input.mode ? { mode: input.mode } : {}) }); const isUrl = /^https?:\/\//iu.test(source); let filePath: string | undefined; let sourceName = source; if (isUrl) sourceName = source; else if (/^file-sha256:[a-f0-9]{64}$/u.test(source)) { const files = this.hostCtx.get('zerowallFiles') as { materialize(input: { sessionId: string; attachmentId: string }): Promise<{ path: string; name: string }> } | undefined; if (!files) throw new Error('当前运行时没有文件附件服务。'); const materialized = await files.materialize({ sessionId: input.sessionId, attachmentId: source }); filePath = materialized.path; sourceName = materialized.name } else { filePath = resolve(cwd, source); if (!inside(cwd, filePath) || !(await stat(filePath)).isFile()) throw new Error('MinerU 只能读取当前工作区内的普通文件。'); sourceName = basename(filePath) } const token = await this.token(); const api = apiFor(cfg.mode, token); if (api === 'local') throw new Error('尚未配置 MinerU Token；请调用 extract_uploaded_file 的 local 或 auto 模式使用本地快速解析。'); const started = Date.now(); const remote = await remoteParse(cfg, api, token, filePath, isUrl ? source : undefined, input.signal ?? new AbortController().signal); const result = await writeResult(cfg, input.sessionId, cwd, sourceName, api, remote.taskId, remote.markdown, remote.archive, started); runs.set(remote.taskId ?? result.runDir, { result, ...(remote.taskId ? { taskId: remote.taskId } : {}), cwd }); return result }
  @Remote('getRun') getRun(input: { taskId: string }): MineruParseResult | undefined { return [...runs.values()].find(item => item.taskId === input.taskId)?.result }
  @Remote('listRuns') listRuns(): MineruParseResult[] { return [...runs.values()].flatMap(item => item.result ? [item.result] : []) }
  async task(input: { sessionId: string; taskId: string; api: MineruApi; wait: boolean; signal?: AbortSignal }): Promise<MineruTaskResult> { const found = this.getRun({ taskId: input.taskId }); if (found) return { ok: true, api: input.api, taskId: input.taskId, state: 'done', result: found }; const cfg = this.config(); const token = await this.token(); if (input.api === 'precision' && !token) throw new Error('查询 Precision 任务需要 MinerU Token。'); const root = cfg.apiBaseUrl.replace(/\/+$/u, ''); const deadline = Date.now() + (input.wait ? cfg.timeoutMs : 0); for (;;) { const path = input.api === 'precision' ? `/api/v4/extract/task/${encodeURIComponent(input.taskId)}` : `/api/v1/agent/parse/${encodeURIComponent(input.taskId)}`; const response = await request(`${root}${path}`, { method: 'GET', headers: token ? { authorization: `Bearer ${token}` } : {} }, input.signal ?? new AbortController().signal); const data = payloadData(await response.json() as unknown); const state = String(data.state ?? 'pending'); if (state === 'done') { return { ok: true, api: input.api, taskId: input.taskId, state: 'done' } } if (state === 'failed') return { ok: true, api: input.api, taskId: input.taskId, state: 'failed', error: String(data.err_msg ?? 'MinerU 解析失败。') }; if (!input.wait || Date.now() >= deadline) return { ok: true, api: input.api, taskId: input.taskId, state: 'pending' }; await sleepAbort(cfg.pollIntervalMs, input.signal ?? new AbortController().signal) } }
  @Remote('registerArtifact') async registerArtifact(input: MineruRegistrationInput): Promise<ArtifactRecord> { const cwd = cwdFor(this.hostCtx, input.sessionId); const path = resolve(cwd, input.artifactPath); if (!inside(cwd, path) || !(await stat(path)).isFile()) throw new Error('MinerU Artifact 不在当前工作区。'); const research = this.hostCtx.get('zerowallResearch') as { projectForSession(input: { sessionId: string }): { id: string; rootPath: string } | undefined; createArtifact(input: { projectId: string; name: string; uri: string; mediaType: string; checksum: string; metadata: Record<string, unknown> }): ArtifactRecord }; const project = research.projectForSession({ sessionId: input.sessionId }); if (!project || project.id !== input.projectId || !inside(project.rootPath, path)) throw new Error('项目或 Artifact 授权无效。'); return research.createArtifact({ projectId: project.id, name: input.name ?? basename(path), uri: pathToFileURL(path).href, mediaType: input.mediaType ?? mime(path), checksum: sha(await readFile(path)), metadata: { source: input.source ?? null, taskId: input.taskId ?? null, checksum: sha(await readFile(path)), registeredAt: new Date().toISOString() } }) }
}
export function apply(ctx: Context): void { ctx.plugin(ZeroWallMineruService) }
export default { name, inject, apply }
export { validateConfig, apiFor, extractZip }
