/**
 * 文本与事件格式化纯函数：assistant 消息文本提取、微信分块、控制命令解析。
 *
 * @module dsh-weixin-clawbot/format
 */

import type { AssistantMessage } from '@deepseek-ai/dsh-llm'
import type { TurnEndReason } from '@deepseek-ai/dsh-session'

/** 从 assistant 消息中提取可见文本。 */
export function extractAssistantText(message: AssistantMessage): string {
  return message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
}

/** 按硬上限切分单个段落。 */
function hardSplit(paragraph: string, limit: number): string[] {
  const pieces: string[] = []
  let rest = paragraph
  while (rest.length > limit) {
    pieces.push(rest.slice(0, limit))
    rest = rest.slice(limit)
  }
  if (rest) pieces.push(rest)
  return pieces
}

/**
 * 按段落把长文本切成适合微信发送的块（不超过 limit，尽量在段落边界断开）。
 * @param text - 待发送文本。
 * @param limit - 单条上限（字符数）。
 */
export function chunkForWechat(text: string, limit: number): string[] {
  const trimmed = text.replace(/\r\n/g, '\n')
  if (trimmed.length <= limit) return [trimmed]

  const chunks: string[] = []
  let current = ''
  const flush = () => {
    if (current) {
      chunks.push(current)
      current = ''
    }
  }

  for (const paragraph of trimmed.split(/\n{2,}/)) {
    for (const piece of hardSplit(paragraph, limit)) {
      if (current && current.length + 2 + piece.length > limit) flush()
      current = current ? `${current}\n\n${piece}` : piece
    }
  }
  flush()
  return chunks
}

export type ControlCommand =
  | { kind: 'new' }
  | { kind: 'stop' }
  | { kind: 'status' }
  | { kind: 'help' }
  | { kind: 'ws'; arg?: string }

/** 解析微信控制命令；非命令返回 null。 */
export function parseControlCommand(text: string): ControlCommand | null {
  const trimmed = text.trim()
  if (!trimmed.startsWith('/')) return null
  const lower = trimmed.toLowerCase()
  if (/^\/new\b/.test(lower) || trimmed === '/新会话') return { kind: 'new' }
  if (/^\/stop\b/.test(lower) || trimmed === '/停止') return { kind: 'stop' }
  if (/^\/status\b/.test(lower) || trimmed === '/状态') return { kind: 'status' }
  if (/^\/help\b/.test(lower) || trimmed === '/帮助') return { kind: 'help' }
  const ws = /^\/(?:ws|工作区)\b\s*(.*)$/.exec(trimmed)
  if (ws) {
    const arg = (ws[1] ?? '').trim()
    return arg === '' ? { kind: 'ws' } : { kind: 'ws', arg }
  }
  return null
}

export const HELP_TEXT = [
  'DSH 微信助手',
  '',
  '/new    开始新会话（清空上下文）',
  '/stop   停止当前任务',
  '/status 查看状态',
  '/ws     查看/切换工作区（/ws 2 或 /ws 名称）',
  '/help   显示本帮助',
  '',
  '直接发消息即可与 DSH agent 对话；群里请 @我。',
].join('\n')

/** turn 结束原因 → 给用户的错误摘要。 */
export function turnEndSummary(reason: TurnEndReason): string | undefined {
  switch (reason.kind) {
    case 'error':
      return `⚠️ 出错了：${reason.error.message} (${reason.error.code})`
    case 'aborted':
      return reason.reason.kind === 'user' ? '⏹ 已停止。' : '⏹ 任务被中止。'
    case 'max-tokens':
      return '⚠️ 输出达到上限，会话已截断。'
    default:
      return undefined
  }
}

/** 入站媒体占位文本（模型可见）。 */
export function mediaPlaceholder(kind: 'image' | 'voice' | 'video' | 'file', path: string): string {
  const tag = {
    image: 'image',
    voice: 'audio',
    video: 'video',
    file: 'document',
  }[kind]
  return `<media:${tag} path="${path}">`
}
