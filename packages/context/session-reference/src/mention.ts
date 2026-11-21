/** Browser-safe canonical session URI and inline mention encoding. */
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionReferenceInput } from './types.ts'

/** URI scheme reserved for DeepSeek Harness session snapshots. */
export const SESSION_REFERENCE_SCHEME = 'dsh-session:'

/**
 * Encode an opaque Session identity without Node dependencies.
 * @param sessionId - opaque Session identity.
 * @returns lossless canonical URI.
 */
export function encodeSessionReferenceUri(sessionId: SessionId): string {
  const bytes = new TextEncoder().encode(JSON.stringify(sessionId))
  const binary = Array.from(bytes, byte => String.fromCharCode(byte)).join('')
  return `${SESSION_REFERENCE_SCHEME}${btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')}`
}

/**
 * Render a canonical Session mention with an escaped display title.
 * @param reference - source identity and optional title.
 * @returns escaped canonical inline mention.
 */
export function formatSessionReferenceMention(reference: SessionReferenceInput): string {
  const label = (reference.label ?? reference.sessionId).replace(/[\\\]]/gu, match => `\\${match}`)
  return `@[${label}](${encodeSessionReferenceUri(reference.sessionId)})`
}
