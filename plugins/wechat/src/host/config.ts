/**
 * 微信远程控制插件的配置模式。
 *
 * 挂载示例（cordis.yml）：
 *
 * ```yaml
 * - id: wechat
 *   name: dsh-weixin-clawbot
 *   config:
 *     puppet: ilink
 *     dmPolicy: pairing
 *     groupPolicy: allowlist
 *     groups: ["xxx@chatroom"]
 * ```
 *
 * @module dsh-weixin-clawbot/config
 */

import z from '@deepseek-ai/schemastery'

export type DmPolicy = 'open' | 'pairing' | 'allowlist' | 'disabled'

export type GroupPolicy = 'open' | 'allowlist' | 'disabled'

export interface WechatConfig {
  /** 是否启用本插件。 */
  enabled: boolean
  /** 未配对时禁止后台发起登录请求；扫码页打开后才连接。 */
  autoConnect: boolean
  /** 通道实例名，日志与诊断标识。 */
  name: string
  /** 微信接入后端。ZeroWall 安装包只允许官方 iLink。 */
  puppet: 'ilink'
  /** 后端参数（token、appId、host 等）。 */
  puppetOptions: Record<string, unknown>
  /** agent 的工作目录（会话 meta.cwd）。 */
  workspace: string
  /** 模型 id；留空则使用 DSH 默认模型选择。 */
  model: string
  /** 私聊访问策略。 */
  dmPolicy: DmPolicy
  /** 私聊白名单：微信号 / 备注名 / `*`。 */
  allowFrom: Array<string | number>
  /** 群策略。 */
  groupPolicy: GroupPolicy
  /** 群白名单：群 id / 群名 / `*`。 */
  groups: string[]
  /** 群内是否需要 @机器人。 */
  groupRequireMention: boolean
  /** 自动通过好友请求（仅支持该事件的后端）。 */
  autoAcceptFriend: boolean
  /** 入站媒体大小上限（MB）。 */
  mediaMaxMb: number
  /** 入站媒体保存目录；留空使用 $DSH_HOME/wechat-media。 */
  mediaDir: string
  /** agent 调用工具时是否向微信发送提示。 */
  noticeTools: boolean
  /** 回复时机：step（每步完成即发，默认）或 turn（整个回合结束发最终文本）。 */
  replyOn: 'step' | 'turn'
  /** 未授权私聊的配对提示文案。 */
  pairingNotice: string
  /** 每条微信消息的文本上限（超出按段拆分发送）。 */
  textChunkLimit: number
}

export const Config: z<WechatConfig> = z.object({
  enabled: z.boolean().default(true),
  autoConnect: z.boolean().default(false),
  name: z.string().default('dsh-weixin-clawbot'),
  puppet: z.const('ilink').default('ilink'),
  puppetOptions: z.dict(z.any()).default({}),
  workspace: z.string().default(process.cwd()),
  model: z.string().default(''),
  dmPolicy: z.union(['open', 'pairing', 'allowlist', 'disabled']).default('pairing'),
  allowFrom: z.array(z.union([z.string(), z.number()])).default([]),
  groupPolicy: z.union(['open', 'allowlist', 'disabled']).default('allowlist'),
  groups: z.array(z.string()).default([]),
  groupRequireMention: z.boolean().default(true),
  autoAcceptFriend: z.boolean().default(false),
  mediaMaxMb: z.natural().default(30),
  mediaDir: z.string().default(''),
  noticeTools: z.boolean().default(true),
  replyOn: z.union(['step', 'turn']).default('step'),
  pairingNotice: z.string().default(
    'OpenClaw: 你还没有访问权限。请让机器人主人把你的微信号加入 channels.wechat.dm.allowFrom（或改用 open 策略）。',
  ),
  textChunkLimit: z.natural().default(3800),
})

/** 返回媒体保存目录：配置优先，其次 $DSH_HOME/wechat-media，最后 ~/.dsh/wechat-media。 */
export function resolveMediaDir(config: Pick<WechatConfig, 'mediaDir'>): string {
  if (config.mediaDir) return config.mediaDir
  const home = process.env.DSH_HOME ?? (process.env.HOME ? `${process.env.HOME}/.dsh` : '/tmp/.dsh')
  return `${home}/wechat-media`
}
