import { createHash } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { GenerateOptions, TokenUsage } from '@deepseek-ai/dsh-llm'

/** Hash the ordered model-facing value, never message IDs, credentials or timestamps. */
export function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value) ?? 'null').digest('hex')
}

export function cacheUsage(usage: TokenUsage) {
  const input = usage.inputTokens
  const read = usage.cacheReadTokens ?? 0
  const write = usage.cacheWriteTokens ?? 0
  const valid = [input, read, write].every(value => Number.isSafeInteger(value) && value >= 0)
  const prompt = input + read + write
  // Omitted counters are only known to be zero if the exact total reconciles.
  const complete = valid && Number.isSafeInteger(prompt) && (
    (usage.cacheReadTokens !== undefined && usage.cacheWriteTokens !== undefined)
    || usage.totalTokens === prompt + usage.outputTokens
  )
  return {
    input_tokens: input,
    uncached_input_tokens: input,
    cache_read_tokens: usage.cacheReadTokens ?? (complete ? 0 : null),
    cache_write_tokens: usage.cacheWriteTokens ?? (complete ? 0 : null),
    prompt_tokens: complete ? prompt : null,
    cache_hit_rate: complete && prompt > 0 ? read / prompt : null,
    usage_complete: complete,
  }
}

export function requestFingerprint(options: GenerateOptions, previousLength = 0) {
  const messages = options.messages
  const system = messages.filter(message => message.role === 'system').map(message => message.content)
  const skillCalls = new Set(messages.flatMap(message => message.content.flatMap(block =>
    block.type === 'tool-call' && block.name === 'skill' ? [block.id] : [])))
  const skillMessages = messages.filter(message => String(message.source.kind).startsWith('skill-')
    || (message.source.kind === 'plugin' && /(?:^|[-/])skills?(?:$|[-/])/u.test(message.source.plugin))
    || (message.source.kind === 'tool' && skillCalls.has(message.source.callId)))
  const runtime = messages.findLast(message => message.source.kind === 'plugin'
    && message.source.plugin === '@deepseek-ai/dsh-system-prompt' && message.role !== 'system')
  // A hash chain detects an edited/deleted prefix without keeping the transcript in memory.
  let chain = fingerprint([])
  let previousPrefixHash = previousLength === 0 ? chain : null
  for (const [index, message] of messages.entries()) {
    chain = fingerprint([chain, message.role, message.content])
    if (index + 1 === previousLength) previousPrefixHash = chain
  }
  return {
    tool_count: options.tools?.length ?? 0,
    tool_names: options.tools?.map(tool => tool.name) ?? [],
    tool_schema_hash: fingerprint(options.tools ?? []),
    system_prompt_hash: fingerprint([options.system ?? null, system]),
    skills_hash: fingerprint(skillMessages.map(message => message.content)),
    dynamic_prefix_hash: fingerprint(runtime?.content ?? []),
    route_hash: fingerprint([options.provider, options.model, options.reasoningEffort ?? null]),
    message_count: messages.length,
    history_hash: chain,
    previousPrefixHash,
  }
}

type Snapshot = ReturnType<typeof requestFingerprint>
const compared = ['tool_schema_hash', 'system_prompt_hash', 'skills_hash', 'dynamic_prefix_hash', 'route_hash'] as const

/** Bounded metadata only; auxiliary calls and parallel sessions never share a baseline. */
export class CacheDiagnostics {
  private readonly previous = new Map<string, Snapshot>()
  private sequence = 0

  begin(options: GenerateOptions) {
    const key = options.sessionId
    const previous = key === undefined ? undefined : this.previous.get(key)
    const current = requestFingerprint(options, previous?.message_count)
    const changed = previous === undefined ? [] : compared.filter(field => previous[field] !== current[field])
    const historyExtended = previous === undefined ? null
      : previous.history_hash === current.previousPrefixHash
    if (key !== undefined) {
      this.previous.delete(key)
      this.previous.set(key, current)
      while (this.previous.size > 128) this.previous.delete(this.previous.keys().next().value!)
    }
    const { previousPrefixHash: _prefix, ...fields } = current
    return {
      request_id: ++this.sequence,
      session_id: key ?? null,
      diagnostic_boundary: 'provider-neutral-pre-serialization',
      ...fields,
      changed_sections: changed,
      history_prefix_preserved: historyExtended,
      prefix_warning: changed.includes('tool_schema_hash')
        ? '工具列表变化，可能导致缓存前缀失效；服务端命中结果见 usage。' : null,
    }
  }
}

/** Observe the canonical request and terminal usage without changing dispatch or durable messages. */
export function installCacheDiagnostics(ctx: Context): void {
  const diagnostics = new CacheDiagnostics()
  ctx.on('llm/stream', async function* (options, next) {
    if (options.purpose !== undefined || options.sessionId === undefined) {
      yield* next()
      return
    }
    let record: ReturnType<CacheDiagnostics['begin']> | undefined
    const log = (value: unknown) => {
      try { ctx.logger.info(`[cache-diagnostics] ${JSON.stringify(value)}`) } catch { /* Observability cannot fail a request. */ }
    }
    try { record = diagnostics.begin(options); log(record) } catch { /* Non-JSON extension: skip diagnostic only. */ }
    let usage: TokenUsage | undefined
    try {
      for await (const chunk of next()) {
        if (chunk.type === 'usage') usage = chunk.usage
        yield chunk
      }
    } finally {
      if (record !== undefined) log({
        request_id: record.request_id, session_id: record.session_id,
        ...(usage === undefined ? { usage_complete: false } : cacheUsage(usage)),
      })
    }
  })
}
