import type { ClaudeCommandDescriptor } from '../shared/types.js'

export const FALLBACK_COMMANDS: readonly ClaudeCommandDescriptor[] = [
  { name: '/compact', description: '压缩当前 Claude 会话上下文' },
  { name: '/压缩', description: '压缩当前 Claude 会话上下文' },
  { name: '/context', description: '显示当前上下文使用量' },
  { name: '/上下文', description: '显示当前上下文使用量' },
  { name: '/autocompact', description: '显示自动压缩状态' },
  { name: '/usage', description: '显示会话用量' },
  { name: '/config', argumentHint: '<key> <value>', description: '查看或修改 ZeroWall Claude 设置' },
  { name: '/clear', description: '清理当前会话' },
  { name: '/help', description: '显示可用命令' },
]

export type ClaudeParsedCommand = { kind: 'slash'; name: string; args: string[] } | { kind: 'prompt'; text: string }

export interface ClaudeCompactBoundary {
  trigger: 'manual' | 'auto'
  preTokens: number
  postTokens?: number
  durationMs?: number
}

export function compactBoundaryOf(message: unknown): ClaudeCompactBoundary | undefined {
  if (typeof message !== 'object' || message === null) return undefined
  const value = message as Record<string, unknown>
  if (value.type !== 'system' || value.subtype !== 'compact_boundary' || typeof value.compact_metadata !== 'object' || value.compact_metadata === null) return undefined
  const metadata = value.compact_metadata as Record<string, unknown>
  if ((metadata.trigger !== 'manual' && metadata.trigger !== 'auto') || typeof metadata.pre_tokens !== 'number') return undefined
  return {
    trigger: metadata.trigger,
    preTokens: metadata.pre_tokens,
    ...(typeof metadata.post_tokens === 'number' ? { postTokens: metadata.post_tokens } : {}),
    ...(typeof metadata.duration_ms === 'number' ? { durationMs: metadata.duration_ms } : {}),
  }
}

export function parseClaudeCommand(input: string): ClaudeParsedCommand {
  const text = input.trim()
  if (!text.startsWith('/')) return { kind: 'prompt', text }
  const [name = '', ...args] = text.split(/\s+/u)
  return { kind: 'slash', name: name.toLowerCase(), args }
}

export function commandSupported(commands: readonly ClaudeCommandDescriptor[], name: string): boolean {
  const normalized = name.toLowerCase()
  return commands.some(command => command.name.toLowerCase() === normalized)
}
