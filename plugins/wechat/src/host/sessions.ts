/**
 * 会话路由：微信主体（私聊用户 / 群）到 DSH 会话 id 的稳定映射。
 *
 * @module dsh-weixin-clawbot/sessions
 */

import { SessionId } from '@deepseek-ai/dsh-session'

export type WechatSubject =
  | { kind: 'direct'; id: string }
  | { kind: 'group'; id: string }

/** 会话 id 前缀，用于在事件流中过滤本插件拥有的会话。 */
export const WECHAT_SESSION_PREFIX = 'wechat:'

/**
 * 由微信主体推导稳定会话 id：同一个微信用户（或群）在重启后仍映射到
 * 同一会话，配合持久化即可恢复历史。带工作区后缀 `#<workspaceId>` 的
 * 变体用于 /ws 切换——每个工作区一段独立会话历史。
 */
export function sessionIdFor(subject: WechatSubject, workspaceId?: string): SessionId {
  const safeId = subject.id.replace(/[/\\]/g, '_')
  const suffix = workspaceId !== undefined && workspaceId !== '' ? `#${workspaceId}` : ''
  return SessionId(`${WECHAT_SESSION_PREFIX}${subject.kind}:${safeId}${suffix}`)
}

/** 判断一个会话 id 是否由本插件创建。 */
export function isWechatSession(id: SessionId | string): boolean {
  return String(id).startsWith(WECHAT_SESSION_PREFIX)
}

/** 从会话 id 反推微信主体（用于外发时定位收件人）；工作区后缀被剥离。 */
export function subjectFromSessionId(id: SessionId | string): WechatSubject | undefined {
  const raw = String(id)
  if (!raw.startsWith(WECHAT_SESSION_PREFIX)) return undefined
  const rest = raw.slice(WECHAT_SESSION_PREFIX.length)
  const sep = rest.indexOf(':')
  if (sep <= 0) return undefined
  const kind = rest.slice(0, sep)
  const subjectId = rest.slice(sep + 1).split('#', 1)[0]
  if (!subjectId) return undefined
  if (kind === 'direct' || kind === 'group') return { kind, id: subjectId }
  return undefined
}

/** 会话 id → 微信发送目标（direct 发用户，group 发群）。 */
export function sendTargetFromSessionId(id: SessionId | string): string | undefined {
  const subject = subjectFromSessionId(id)
  return subject?.id
}
