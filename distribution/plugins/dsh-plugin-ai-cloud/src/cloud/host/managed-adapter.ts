import { LlmError, resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, LlmFailure, LlmResolvedModelInfo, PreparedAdapterCall, StreamChunk } from '@deepseek-ai/dsh-llm'
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import type { PiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai'

const defaults = resolveRetryPolicy(undefined, 'ZeroWall AI Cloud retry policy')
export const managedRetryPolicy = {
  mode: 'normal',
  maxRetries: 5,
  retryableCodes: [...(defaults.mode === 'normal' ? defaults.retryableCodes : []), 'STREAM_CLOSED', 'PI_AI_ERROR'],
} satisfies NonNullable<PiAiProviderProfile['retryPolicy']>

function normalizeFailure(failure: LlmFailure): LlmFailure {
  // The gateway sometimes wraps a transient upstream failure in HTTP 400.
  // pi-ai can flatten an SSE error to `upstream_error: ...` without HTTP
  // status or JSON. Match the gateway error type, not arbitrary prose about
  // unavailability, and keep actual authentication/validation errors intact.
  if (!['INVALID_REQUEST', 'PI_AI_ERROR'].includes(failure.code)) return failure
  if (failure.code === 'PI_AI_ERROR' && /^(?:Unsupported (?:parameter|model|protocol)|Invalid (?:parameter|argument|request)|pi-ai deferred response for model ".*" is not supported)/iu.test(failure.message)) return { ...failure, code: 'INVALID_REQUEST' }
  // A malformed/truncated provider response can fail before its first text
  // chunk. These are adapter failures; tool/file JSON errors never enter here.
  if (failure.code === 'PI_AI_ERROR' && /^(?:Unexpected end of JSON input|(?:Unexpected non-whitespace character after JSON|Unterminated string in JSON) at position \d+(?: \(line \d+ column \d+\))?)$/u.test(failure.message)) return { ...failure, code: 'TRANSPORT' }
  if (/^\s*upstream_error\s*:/u.test(failure.message)) return { ...failure, code: 'SERVER' }
  const start = failure.message.indexOf('{')
  if (start < 0) return failure
  try {
    const body = JSON.parse(failure.message.slice(start))
    const error = body?.error ?? body
    if (error?.type === 'upstream_error') return { ...failure, code: 'SERVER' }
    if (failure.code === 'PI_AI_ERROR') {
      if (['authentication_error', 'invalid_api_key', 'permission_error'].includes(error?.type ?? error?.code)) return { ...failure, code: 'AUTH' }
      if (['invalid_request_error', 'model_not_found', 'unsupported_parameter', 'content_policy_violation'].includes(error?.type ?? error?.code)) return { ...failure, code: 'INVALID_REQUEST' }
    }
  } catch { /* Unrecognized responses retain their original classification. */ }
  return failure
}

/** Keep retry execution in DSH's durable agent loop, with its attempt cleanup,
 * cancellable backoff and UI retry events. Never replay a whole conversation. */
export async function* managedStream(source: AsyncIterable<StreamChunk>): AsyncIterable<StreamChunk> {
  let generated = false
  try {
    for await (const chunk of source) {
      if ((chunk.type === 'text-delta' || chunk.type === 'reasoning-delta') && chunk.text.length > 0
        || chunk.type === 'tool-call-delta'
        || chunk.type === 'block-end' && chunk.block.type !== 'text' && chunk.block.type !== 'reasoning'
        || chunk.type === 'block-end' && (chunk.block.type === 'text' || chunk.block.type === 'reasoning') && chunk.block.text.length > 0
        || chunk.type === 'usage' && (chunk.usage.outputTokens > 0 || (chunk.usage.reasoningTokens ?? 0) > 0)) generated = true
      if (chunk.type === 'finish' && chunk.reason.kind === 'max-tokens' && !generated) {
        yield { type: 'finish', reason: { kind: 'error', failure: {
          code: 'EMPTY_RESPONSE',
          message: 'The upstream reported an output limit without generating content or output tokens. Retry the request or select another route.',
        } } }
      } else if (chunk.type === 'finish' && chunk.reason.kind === 'error') {
        yield { ...chunk, reason: { ...chunk.reason, failure: normalizeFailure(chunk.reason.failure) } }
      } else yield chunk
    }
  } catch (error) {
    if (!(error instanceof LlmError)) throw error
    const failure = normalizeFailure(error.failure)
    if (failure.code === error.code) throw error
    throw new LlmError(error.message, failure.code, { ...failure, cause: error })
  }
}

export class ManagedPiAiAdapter extends PiAiAdapter {
  override async resolveModel(provider: string, model: string, signal?: AbortSignal): Promise<LlmResolvedModelInfo> {
    return defaultReasoning(await super.resolveModel(provider, model, signal))
  }

  override async prepareCall(provider: string, model: string, signal?: AbortSignal): Promise<PreparedAdapterCall> {
    const call = await super.prepareCall(provider, model, signal)
    const info = defaultReasoning(call.model)
    return { ...call, model: info, stream: options => managedStream(call.stream({ ...options,
      ...options.reasoningEffort !== undefined || info.reasoning?.defaultEffort === undefined ? {} : { reasoningEffort: info.reasoning.defaultEffort } })) }
  }

  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const call = await this.prepareCall(options.provider, options.model, options.signal)
    yield* call.stream(options)
  }
}

/** Managed models expose a concrete supported default, preferring Xhigh, then High. */
function defaultReasoning(info: LlmResolvedModelInfo): LlmResolvedModelInfo {
  if (!info.reasoning) return info
  const effort = info.reasoning.efforts.find(level => level.id === 'xhigh')?.id
    ?? info.reasoning.efforts.find(level => level.id === 'high')?.id
    ?? info.reasoning.defaultEffort ?? info.reasoning.efforts[0]?.id
  return effort === undefined ? info : { ...info, reasoning: { ...info.reasoning, defaultEffort: effort } }
}
