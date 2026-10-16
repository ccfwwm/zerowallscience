import { LlmError, resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, LlmFailure, PreparedAdapterCall, StreamChunk } from '@deepseek-ai/dsh-llm'
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import type { PiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai'

const defaults = resolveRetryPolicy(undefined, 'ZeroWall AI Cloud retry policy')
export const managedRetryPolicy: NonNullable<PiAiProviderProfile['retryPolicy']> = {
  mode: 'normal',
  maxRetries: 5,
  retryableCodes: [...(defaults.mode === 'normal' ? defaults.retryableCodes : []), 'STREAM_CLOSED'],
}

function normalizeFailure(failure: LlmFailure): LlmFailure {
  // The gateway sometimes wraps a transient upstream failure in HTTP 400.
  // pi-ai has flattened the response into its message by this point. Read the
  // structured body instead of treating every invalid request as retryable.
  if (!['INVALID_REQUEST', 'PI_AI_ERROR'].includes(failure.code)) return failure
  const start = failure.message.indexOf('{')
  if (start < 0) return failure
  try {
    const body = JSON.parse(failure.message.slice(start))
    const error = body?.error ?? body
    if (error?.type === 'upstream_error') return { ...failure, code: 'SERVER' }
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
