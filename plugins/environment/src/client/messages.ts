import type { EnvironmentKey, EnvironmentTranslate } from './locales.js'

/** Store message identity so changing language also updates completed operations. */
export type LocalizedMessage = string | { key: EnvironmentKey; params?: Record<string, unknown> }

export function renderMessage(message: LocalizedMessage, t: EnvironmentTranslate): string {
  if (typeof message !== 'string' && message.key === 'clearedUsingSource') {
    return t(message.key, { source: t(message.params?.source as EnvironmentKey) })
  }
  return typeof message === 'string' ? message : t(message.key, message.params)
}

export class LocalizedError extends Error {
  constructor(readonly key: EnvironmentKey) { super(key) }
}

export function messageFromError(value: unknown): LocalizedMessage {
  if (value instanceof LocalizedError) return { key: value.key }
  return value instanceof Error ? value.message : String(value)
}
