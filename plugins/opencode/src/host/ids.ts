import { createHash, randomBytes } from 'node:crypto'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'

export interface RequestIds {
  session: string
  request: string
  project: string
}

function stableId(prefix: string, value: string): string {
  const digest = createHash('sha256').update(`${prefix}\0${value}`).digest('hex').slice(0, 24)
  return `${prefix}_${digest}`
}

function randomId(prefix: string, bytes: number): string {
  return `${prefix}_${randomBytes(bytes).toString('hex')}`
}

export function conversationSeed(messages: GenerateOptions['messages']): string {
  const first = messages.find(message => message.role === 'user')
  if (first === undefined) return ''
  const value = JSON.stringify(first.content ?? null)
  return value === 'null' ? '' : value
}

export function deriveRequestIds(messages: GenerateOptions['messages']): RequestIds {
  const seed = conversationSeed(messages) || randomId('fallback', 16)
  return {
    session: stableId('ses', seed),
    request: randomId('req', 16),
    project: stableId('prj', 'opencode2dsh:zerowall-science'),
  }
}

export function opencodeUserAgent(): string {
  return `opencode/1.18.21 (${process.platform} ${process.arch}; node${process.versions.node})`
}

export function disguiseHeaders(ids: RequestIds): Record<string, string> {
  return {
    'user-agent': opencodeUserAgent(),
    'x-opencode-client': 'cli',
    'x-opencode-session': ids.session,
    'x-session-affinity': ids.session,
    'X-Session-Id': ids.session,
    'x-opencode-request': ids.request,
    'x-opencode-project': ids.project,
  }
}
