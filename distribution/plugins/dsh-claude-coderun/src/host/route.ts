/** Host-only route resolution. No value returned here may be sent over Remote. */
import { HarnessError } from '@deepseek-ai/dsh-llm'

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

const routeErrors = {
  NO_SELECTION: '当前会话没有选择模型。',
  NO_ROUTE: '当前模型路由没有可读取的协议配置。',
  NO_MANAGED_ROUTE: '当前 AI 云模型路由不可用，请刷新模型列表后重试。',
  NO_ENDPOINT: '当前路由没有可用的 API endpoint。',
  INVALID_ENDPOINT: '当前路由的 API endpoint 不受支持。',
  MISSING_CREDENTIAL: '当前模型路由没有可用凭据，请在平台对话设置中配置。',
  UNSUPPORTED_EFFORT: '当前选择的推理强度不受此 Claude Code 版本支持，请在当前对话调整。',
  UNSUPPORTED_PROTOCOL: '请为 Claude Code 选择支持 Anthropic Messages 的手动模型路由，或选择 AI 云模型。',
} as const

/** Validation failures with fixed text safe for the conversation transcript. */
export class ClaudeRouteError extends HarnessError {
  constructor(readonly reason: keyof typeof routeErrors, options?: ErrorOptions) {
    super(routeErrors[reason], `CLAUDE_ROUTE_${reason}`, options)
  }
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
  if (!selected?.provider || !selected.model) throw new ClaudeRouteError('NO_SELECTION')
  return { provider: selected.provider, model: selected.model, ...(selected.reasoningEffort === undefined ? {} : { reasoningEffort: selected.reasoningEffort }) }
}

function endpoint(raw: unknown): URL {
  if (typeof raw !== 'string' || !raw.trim() || raw.includes('\0')) throw new ClaudeRouteError('NO_ENDPOINT')
  const url = URL.parse(raw)
  if (!url || !['https:', 'http:'].includes(url.protocol) || url.username || url.password || /[?#]/u.test(url.href)) {
    throw new ClaudeRouteError('INVALID_ENDPOINT')
  }
  return url
}

/**
 * Resolve the SDK's Messages endpoint using the selected route's credential.
 * AI Cloud profiles advertise the standard adapter's transport. The SDK sends
 * Messages to the same gateway with the selected group key and exact model ID.
 * @param selection - Current conversation or delegated model selection.
 * @param services - Host-only route metadata and credential readers.
 * @returns The SDK base URL and credential for this turn.
 */
export async function resolveClaudeRoute(selection: ClaudeSelection, services: ClaudeRouteServices): Promise<ClaudeRoute> {
  // The pinned CLI silently ignores unknown efforts. Reject them before any
  // credentials are resolved instead of changing the user's selected effort.
  if (selection.reasoningEffort !== undefined && !['low', 'medium', 'high', 'xhigh', 'max'].includes(selection.reasoningEffort)) {
    throw new ClaudeRouteError('UNSUPPORTED_EFFORT')
  }
  let baseUrl: string, apiKey: string | undefined
  if (selection.provider.startsWith('zerowall-ai-cloud-')) {
    const route = await services.managedRoute?.(selection.provider, selection.model)
    if (!route) throw new ClaudeRouteError('NO_MANAGED_ROUTE')
    const gateway = endpoint(route.baseUrl)
    // The SDK appends /v1/messages. AI Cloud's adapter may supply an OpenAI or Gemini version suffix.
    baseUrl = gateway.origin + gateway.pathname.replace(/\/+$/u, '').replace(/\/v1(?:beta)?$/u, '')
    apiKey = route.apiKey?.trim() ? route.apiKey : undefined
    if (!apiKey && services.managedCredential) {
      try {
        apiKey = await services.managedCredential(selection.provider, selection.model)
      } catch (cause) {
        throw new ClaudeRouteError('MISSING_CREDENTIAL', { cause })
      }
    }
  } else {
    const entry = services.directory().find(row => row.provider === selection.provider)
    if (!entry) throw new ClaudeRouteError('NO_ROUTE')
    let profile = services.settings().find(row => row.ns === entry.settingsNs)?.value
    for (const segment of entry.settingsPath) profile = typeof profile === 'object' && profile !== null ? Reflect.get(profile, segment) : undefined
    if (typeof profile !== 'object' || profile === null) throw new ClaudeRouteError('NO_ROUTE')
    if (Reflect.get(profile, 'api') !== 'anthropic-messages') throw new ClaudeRouteError('UNSUPPORTED_PROTOCOL')
    baseUrl = endpoint(Reflect.get(profile, 'baseURL') ?? entry.defaultBaseURL).href.replace(/\/+$/u, '')
    const ref: unknown = Reflect.get(profile, 'apiKeyEnv')
    if (typeof ref === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/u.test(ref)) apiKey = await services.credential(ref)
  }
  if (typeof apiKey !== 'string' || !apiKey.trim() || apiKey.includes('\0')) throw new ClaudeRouteError('MISSING_CREDENTIAL')
  return { ...selection, baseUrl, apiKey: apiKey.trim() }
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
