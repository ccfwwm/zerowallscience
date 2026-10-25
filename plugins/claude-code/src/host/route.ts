/** Host-only route resolution. No value returned here may be sent over Remote. */
export interface ClaudeSelection { provider: string; model: string; reasoningEffort?: string }
export interface ClaudeRequestHeader { config: ClaudeSelection; adapterDefaults?: { reasoningEffort?: boolean } }
export interface ClaudeRoute extends ClaudeSelection { baseUrl: string; apiKey: string }
export interface ClaudeRouteServices {
  directory(): readonly { provider: string; settingsNs: string; settingsPath: readonly string[]; defaultBaseURL?: string }[]
  settings(): readonly { ns: string; value: unknown }[]
  credential(ref: string): Promise<string | undefined>
  managedRoute?(provider: string, model: string): Promise<{ api?: string; baseUrl?: string; apiKey?: string } | undefined>
  managedCredential?(provider: string, model: string): Promise<string | undefined>
}

export function selectedClaudeModel(
  projection: { pending?: ClaudeSelection | null; lastUsed?: ClaudeSelection | null } | undefined,
  fallback: () => ClaudeSelection,
  loggedHeader?: ClaudeRequestHeader,
): ClaudeSelection {
  // Match DSH ApiSessionAgentController.selectionFor: pending is user intent;
  // otherwise restore the logged route, omitting adapter-owned defaults. The
  // projection's lastUsed includes resolved effort but loses its ownership
  // marker, so using it would turn an adapter default into a user choice.
  const selected = projection?.pending ?? (loggedHeader === undefined ? fallback() : {
    provider: loggedHeader.config.provider,
    model: loggedHeader.config.model,
    ...(loggedHeader.config.reasoningEffort === undefined || loggedHeader.adapterDefaults?.reasoningEffort === true
      ? {} : { reasoningEffort: loggedHeader.config.reasoningEffort }),
  })
  if (!selected?.provider || !selected.model) throw new Error('当前会话没有选择模型。')
  return { provider: selected.provider, model: selected.model, ...(selected.reasoningEffort === undefined ? {} : { reasoningEffort: selected.reasoningEffort }) }
}

function endpoint(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim() || raw.includes('\0')) throw new Error('当前路由没有可用的 API endpoint。')
  try {
    const url = new URL(raw)
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error()
    return raw.replace(/\/+$/u, '')
  } catch { throw new Error('当前路由的 API endpoint 不受支持。') }
}

export async function resolveClaudeRoute(selection: ClaudeSelection, services: ClaudeRouteServices): Promise<ClaudeRoute> {
  // The pinned CLI silently ignores unknown efforts. Reject them before any
  // credentials are resolved instead of changing the user's selected effort.
  if (selection.reasoningEffort !== undefined && !['low', 'medium', 'high', 'xhigh', 'max'].includes(selection.reasoningEffort)) {
    throw new Error('当前选择的推理强度不受此 Claude Code 版本支持，请在当前对话调整。')
  }
  let api: unknown, baseUrl: unknown, apiKey: string | undefined
  if (selection.provider.startsWith('zerowall-ai-cloud-')) {
    // AI Cloud already owns this Host-only resolver. Its profile declaration is
    // authoritative; model names are never used here to infer a wire protocol.
    const route = await services.managedRoute?.(selection.provider, selection.model)
    api = route?.api
    baseUrl = route?.baseUrl
    apiKey = await services.managedCredential?.(selection.provider, selection.model) ?? route?.apiKey
  } else {
    const entry = services.directory().find(row => row.provider === selection.provider)
    if (!entry) throw new Error('当前模型路由没有可读取的协议配置。')
    let profile = services.settings().find(row => row.ns === entry.settingsNs)?.value
    for (const segment of entry.settingsPath) profile = typeof profile === 'object' && profile !== null ? Reflect.get(profile, segment) : undefined
    if (typeof profile !== 'object' || profile === null) throw new Error('当前模型路由没有可读取的协议配置。')
    api = Reflect.get(profile, 'api')
    baseUrl = Reflect.get(profile, 'baseURL') ?? entry.defaultBaseURL
    const ref: unknown = Reflect.get(profile, 'apiKeyEnv')
    if (typeof ref === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/u.test(ref)) apiKey = await services.credential(ref)
  }
  if (api !== 'anthropic-messages') throw new Error('Claude Code 仅支持明确声明为 Anthropic Messages 的模型路由，请在当前对话切换模型。')
  const base = endpoint(baseUrl)
  if (typeof apiKey !== 'string' || !apiKey.trim() || apiKey.includes('\0')) throw new Error('当前模型路由没有可用凭据，请在平台对话设置中配置。')
  return { ...selection, baseUrl: base, apiKey: apiKey.trim() }
}

/** Hold a suffix until enough bytes arrive to redact secrets spanning chunks. */
export class ClaudeSafeOutput {
  private raw = ''
  private finished = false
  constructor(private readonly secrets: readonly string[]) {}
  append(text: string): void {
    this.raw += text
    if (this.raw.length > 4 * 1024 * 1024) throw new Error('Claude Code 输出超过单轮限制。')
  }
  finish(): void { this.finished = true }
  /** Create an independent buffer with the same redaction set for one stream block. */
  fork(): ClaudeSafeOutput { return new ClaudeSafeOutput(this.secrets) }
  snapshot(): string {
    const secrets = this.secrets.filter(Boolean)
    // Delay only a suffix that could actually be the start of a secret.
    // Holding max(secret.length) characters on every update hid short Claude
    // deltas until whole paragraphs arrived, even when no secret was present.
    let end = this.raw.length
    if (!this.finished) for (const secret of secrets) {
      for (let length = Math.min(this.raw.length, secret.length - 1); length > this.raw.length - end; length -= 1) {
        if (this.raw.endsWith(secret.slice(0, length))) { end = this.raw.length - length; break }
      }
    }
    for (const secret of secrets) {
      const start = this.raw.lastIndexOf(secret, end)
      if (start >= 0 && start < end && start + secret.length > end) end = start
    }
    let text = this.raw.slice(0, end)
    for (const secret of secrets) text = text.split(secret).join('[REDACTED]')
    return text
  }
}
