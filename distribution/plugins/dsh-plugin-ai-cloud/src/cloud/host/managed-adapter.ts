import { LlmError, resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, LlmFailure, PreparedAdapterCall, StreamChunk } from '@deepseek-ai/dsh-llm'
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import type { PiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai'

const defaults = resolveRetryPolicy(undefined, 'ZeroWall AI Cloud retry policy')
export const managedRetryPolicy: NonNullable<PiAiProviderProfile['retryPolicy']> = {
  mode: 'normal',
  maxRetries: 5,
  retryableCodes: [...(defaults.mode === 'normal' ? defaults.retryableCodes : []), 'STREAM_CLOSED', 'PI_AI_ERROR'],
}

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
  try {
    for await (const chunk of source) {
      if (chunk.type === 'finish' && chunk.reason.kind === 'error') {
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
  override async prepareCall(provider: string, model: string, signal?: AbortSignal): Promise<PreparedAdapterCall> {
    const call = await super.prepareCall(provider, model, signal)
    return { ...call, stream: options => managedStream(call.stream(options)) }
  }

  override stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    return managedStream(super.stream(options))
  }
}
