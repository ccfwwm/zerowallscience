/** MinerU Host plugin: credentials, settings, skill discovery and model tools. */
import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-skill'
import type {} from '@zerowall/dsh-plugin-environment'
import { SecretBrokerClient } from '@zerowall/dsh-plugin-ai-cloud/secrets'
import type { MineruApi, MineruConfig, MineruConfigStatus, MineruConnectionTestResult, MineruMode, MineruParseResult, MineruTaskResult } from '../shared/types.ts'
import { ConfigSchema, DEFAULTS, validateConfig } from './config.ts'
import { MineruEngine, type ParseInput, type TaskInput } from './engine.ts'
import { createMineruSkillProvider } from './skill.ts'
import { optionsSchema } from './records.ts'
import { MineruError } from './errors.ts'
import { z } from 'zod'
import { configSchema } from './records.ts'

export type * from '../shared/types.ts'
export const name = 'zerowall-mineru'
export const inject = ['settings', 'tools', 'sessions', 'attachments', 'credentials', 'skills']
export interface Config extends MineruConfig {}
export const Config = ConfigSchema.volatile()
const SETTINGS_NS = 'zerowall-mineru' as SettingsNamespace
const TOKEN_KEY = 'zerowall.environment.mineru_api_token'
const TOOL_NAMES = ['mineru_activate', 'mineru_parse', 'mineru_batch_parse', 'mineru_task'] as const
const optionParameters = {
  language: { type: 'string' as const }, modelVersion: { type: 'string' as const, enum: ['pipeline', 'vlm', 'MinerU-HTML'] },
  isOcr: { type: 'boolean' as const }, enableTable: { type: 'boolean' as const }, enableFormula: { type: 'boolean' as const },
  pageRanges: { type: 'string' as const, description: 'Precision ascending page selection, for example 2,4-6 or 2--2 for a local PDF.' },
  pageRange: { type: 'string' as const, description: 'Agent page selection, for example 1-10; maximum 20 pages.' },
  anchor: { type: 'boolean' as const, description: 'Write additional page-anchored document.md when structured content is available.' },
  extraFormats: { type: 'array' as const, items: { type: 'string' as const, enum: ['docx', 'html', 'latex'] } },
}
const output = {
  schema: { type: 'object' as const, additionalProperties: true as const },
  render: (_args: unknown, value: unknown) => [{ type: 'text' as const, text: JSON.stringify(value) }],
  presentationMeta: (_args: unknown, value: unknown) => z.json().parse(value),
}
declare module '@deepseek-ai/cordis' { interface Context { zerowallMineru: ZeroWallMineruService } }

/** Owns live settings and the lifetime of every extraction operation. */
export class ZeroWallMineruService extends TypertRemoteService {
  static inject = inject
  static Config = ConfigSchema
  private readonly secrets: SecretBrokerClient
  private readonly stopped = new AbortController()
  private readonly engine: MineruEngine
  private settings: MineruConfig
  private readonly runs = new Map<string, MineruParseResult>()

  constructor(private readonly hostCtx: Context, config: MineruConfig) {
    super(hostCtx, 'zerowallMineru')
    this.settings = validateConfig({ ...DEFAULTS, ...config })
    this.secrets = new SecretBrokerClient(hostCtx.credentials)
    this.engine = new MineruEngine(hostCtx, () => this.config(), async () => (await this.credential()).value, this.stopped.signal)
    hostCtx.effect(() => async () => { this.stopped.abort(); await this.engine.drain(); this.runs.clear() })
    hostCtx.on('settings/document-updated', ns => {
      if (ns !== SETTINGS_NS) return
      const document = hostCtx.settings.describe().find(row => row.ns === SETTINGS_NS)
      if (document) this.settings = configSchema.parse(document.value)
    })
    hostCtx.effect(() => hostCtx.skills.registerProvider(() => createMineruSkillProvider()))
    hostCtx.effect(() => hostCtx.tools.register(defineTool({
      name: 'mineru_activate', description: 'Discover MinerU document parsing tools and credential status. Both APIs process documents remotely.', parameters: {}, output,
      execute: async () => { const status = await this.getConfigStatus(); return { api: status.api, tokenConfigured: status.tokenConfigured, tokenSource: status.tokenSource, tools: TOOL_NAMES.slice(1) } },
    })))
    hostCtx.effect(() => hostCtx.tools.register(defineTool({
      name: 'mineru_parse', description: 'Parse an authorized session attachment, workspace document or HTTP(S) URL remotely into Markdown. Precision supports structured artifacts and automatic local PDF chunking; Agent supports up to 10 MB and 20 pages.',
      parameters: { source: { type: 'string', required: true }, mode: { type: 'string', enum: ['auto', 'precision', 'agent'] }, ...optionParameters }, output,
      execute: async (args, exec) => {
        const mode = args.mode
        if (mode !== undefined && !['auto', 'precision', 'agent'].includes(String(mode))) throw new MineruError('MINERU_MODE', 'MinerU 模式无效。')
        return this.parse({ sessionId: String(exec.agent?.session.id ?? ''), source: String(args.source), ...(mode ? { mode: mode as MineruMode } : {}), overrides: optionsSchema.parse(args), signal: exec.signal })
      },
    })))
    hostCtx.effect(() => hostCtx.tools.register(defineTool({
      name: 'mineru_batch_parse', description: 'Parse 1–1000 authorized sources using Precision API batches. Returns per-source failures and recovery identifiers. Long PDFs must use mineru_parse separately.',
      parameters: { sources: { type: 'array', required: true, items: { type: 'string' } }, ...optionParameters }, output,
      execute: async (args, exec) => {
        if (!Array.isArray(args.sources) || args.sources.some(source => typeof source !== 'string')) throw new MineruError('MINERU_BATCH_INPUT', 'sources 必须为文件来源字符串数组。')
        return this.engine.batch(String(exec.agent?.session.id ?? ''), args.sources, optionsSchema.parse(args), exec.signal)
      },
    })))
    hostCtx.effect(() => hostCtx.tools.register(defineTool({
      name: 'mineru_task', description: 'Resume the original upload or collect a submitted task. Supply taskId, or runId for a long PDF; wait=false only queries and never submits new chunks.',
      parameters: { taskId: { type: 'string' }, runId: { type: 'string' }, api: { type: 'string', enum: ['precision', 'agent'] }, wait: { type: 'boolean' } }, output,
      execute: async (args, exec) => this.task({ sessionId: String(exec.agent?.session.id ?? ''), ...(typeof args.taskId === 'string' ? { taskId: args.taskId } : {}), ...(typeof args.runId === 'string' ? { runId: args.runId } : {}), ...(args.api === 'precision' || args.api === 'agent' ? { api: args.api } : {}), wait: args.wait === true, signal: exec.signal }),
    })))
  }
  private config(): MineruConfig { return validateConfig({ ...DEFAULTS, ...this.settings }) }
  private async credential(): Promise<{ value?: string; source: MineruConfigStatus['tokenSource'] }> {
    const environment = this.hostCtx.get('zerowallEnvironment')
    if (environment) await environment.ready()
    const dedicated = (await this.secrets.get(TOKEN_KEY))?.trim()
    if (dedicated) return { value: dedicated, source: 'plugin-settings' }
    const ref = this.config().tokenCredential
    const value = environment ? (await environment.readVariable(ref))?.trim() : (await this.secrets.get('zerowall.environment.var.' + ref.toLowerCase()))?.trim()
    if (value) return { value, source: 'environment-settings' }
    // The environment service owns explicit deletions and must not be bypassed by launch fallbacks.
    if (environment) return { source: null }
    const hit = await this.hostCtx.credentials.resolve(credentialRef(ref))
    if (hit?.value.trim()) return { value: hit.value.trim(), source: hit.source === 'env' ? 'environment' : 'credentials' }
    const inherited = process.env[ref]?.trim()
    return inherited ? { value: inherited, source: 'environment' } : { source: null }
  }
  /** Return non-secret configuration and registration status. @returns Effective API and credential presence. */
  @Remote('getConfigStatus') async getConfigStatus(): Promise<MineruConfigStatus> {
    const cfg = this.config()
    const token = await this.credential()
    const registeredTools = TOOL_NAMES.filter(tool => this.hostCtx.tools.get(tool) !== undefined)
    return { ...cfg, api: cfg.mode === 'auto' ? token.value ? 'precision' : 'agent' : cfg.mode, tokenConfigured: Boolean(token.value), tokenSource: token.source,
      tokenManagementUrl: 'https://mineru.net/apiManage/token', available: registeredTools.length === TOOL_NAMES.length, registeredTools }
  }
  /** Persist live configuration. @param input - Changed settings, excluding secrets. @returns Updated status. */
  @Remote('updateConfig') async updateConfig(input: Partial<MineruConfig>): Promise<MineruConfigStatus> {
    const next = validateConfig({ ...this.config(), ...input })
    await this.hostCtx.settings.replace(SETTINGS_NS, next)
    this.settings = next
    return this.getConfigStatus()
  }
  /** Store a write-only plugin credential. @param value - Non-empty token. @returns Updated status without the token. */
  @Remote('setToken') async setToken(value: string): Promise<MineruConfigStatus> {
    if (!value.trim()) throw new MineruError('MINERU_TOKEN_EMPTY', 'MinerU Token 不能为空。')
    await this.secrets.set(TOKEN_KEY, value.trim())
    return this.getConfigStatus()
  }
  /** Remove the plugin credential; environment settings or launch values may become effective. @returns Updated status. */
  @Remote('clearToken') async clearToken(): Promise<MineruConfigStatus> { await this.secrets.delete(TOKEN_KEY); return this.getConfigStatus() }
  /** Check endpoint routing without submitting a document. @returns API and credential presence; no extraction is performed. */
  @Remote('testConnection') async testConnection(): Promise<MineruConnectionTestResult> {
    const status = await this.getConfigStatus()
    if (status.api === 'precision' && !status.tokenConfigured) throw new MineruError('MINERU_TOKEN_REQUIRED', 'Precision 需要配置 Token。')
    await this.probe(status.api)
    return { ok: true, api: status.api, tokenConfigured: status.tokenConfigured }
  }
  /** Check the authenticated route without allocating upload URLs. @returns Precision route availability. */
  @Remote('testToken') async testToken(): Promise<{ ok: true; api: 'precision' }> {
    if (!(await this.credential()).value) throw new MineruError('MINERU_TOKEN_REQUIRED', '尚未配置 MinerU Token。')
    await this.probe('precision'); return { ok: true, api: 'precision' }
  }
  /** Check the tokenless route without submitting a document. @returns Agent route availability. */
  @Remote('testAgent') async testAgent(): Promise<{ ok: true; api: 'agent' }> { await this.probe('agent'); return { ok: true, api: 'agent' } }
  private async probe(api: MineruApi): Promise<void> {
    const token = api === 'precision' ? (await this.credential()).value : undefined
    const endpoint = api === 'precision' ? '/api/v4/file-urls/batch' : '/api/v1/agent/parse/url'
    const response = await fetch(this.config().apiBaseUrl.replace(/\/+$/u, '') + endpoint, {
      method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
      body: JSON.stringify(api === 'precision' ? { files: [] } : {}), signal: AbortSignal.any([this.stopped.signal, AbortSignal.timeout(15000)]),
    })
    await response.body?.cancel()
    if (!response.ok && ![400, 422].includes(response.status)) throw new MineruError('MINERU_CONNECTION', 'MinerU 连接检测失败（HTTP ' + response.status + '）；检查网络、Token 或 API 地址。')
  }
  /** Parse one authorized source. @param input - Session, source and options. @returns Retained artifacts. */
  async parse(input: ParseInput): Promise<MineruParseResult> {
    const result = await this.engine.parse(input)
    this.runs.set(result.taskId ?? result.runId ?? result.runDir, result)
    return result
  }
  /** Resume an existing identity. @param input - Task or long-document identity. @returns Current task state. */
  task(input: TaskInput): Promise<MineruTaskResult> { return this.engine.task(input) }
  /** Read a result collected in this service lifetime. @param input - Task id. @returns Cached result, if collected. */
  getRun(input: { taskId: string }): MineruParseResult | undefined { return this.runs.get(input.taskId) }
  /** List results collected in this service lifetime. @returns In-memory results. */
  listRuns(): MineruParseResult[] { return [...this.runs.values()] }
}
/** Mount the service with resolved live defaults. @param ctx - Plugin context. @param config - Loader's volatile settings. */
export async function apply(ctx: Context, config: { get(): MineruConfig }): Promise<void> { await ctx.plugin(ZeroWallMineruService, config.get()).await() }
