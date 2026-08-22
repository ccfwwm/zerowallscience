import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'

export const NS = 'zerowall'

export function unwrapRemoteResult<T>(operation: string, result: RemoteResult<T>): T {
  if (!result.ok) throw new Error(`${operation} failed: ${result.error.code}: ${result.error.message}`)
  return result.value
}
