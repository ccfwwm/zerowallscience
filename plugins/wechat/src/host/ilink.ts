/**
 * 微信官方 iLink 机器人通道（clawbot）。
 *
 * 对齐腾讯官方 OpenClaw 微信插件（@tencent-weixin/openclaw-weixin）的
 * 后端协议：扫码登录（含手机配对码校验）→ getupdates 长轮询收消息 →
 * sendmessage 发回复。凭据由注入的 credential adapter 持久化；普通 DSH
 * 环境在未提供 adapter 时才使用 $DSH_HOME 下的兼容文件。
 *
 * 协议要点（源码逆向整理）：
 * - 固定网关 https://ilinkai.weixin.qq.com；扫码确认后响应里的 baseurl
 *   是该账号的消息网关（IDC 就近）。
 * - 请求头：iLink-App-Id: bot、iLink-App-ClientVersion（0xMMmmpp）、
 *   AuthorizationType: ilink_bot_token、Authorization: Bearer <token>、
 *   X-WECHAT-UIN（随机 uint32 的 base64）。
 * - getupdates 携带上一轮返回的 get_updates_buf 游标；errcode -14 表示
 *   会话失效需重新登录。
 *
 * @module dsh-weixin-clawbot/ilink
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

/** iLink 固定登录网关。 */
export const ILINK_LOGIN_BASE_URL = 'https://ilinkai.weixin.qq.com'

/** 凭据结构。token 必须由 Host credential adapter 保管。 */
export type IlinkCredentials = {
  token: string
  /** 扫码确认返回的 ilink_bot_id（本机器人的身份）。 */
  botId: string
  /** 扫码人（bot 主人）的 ilink_user_id。 */
  userId: string
  /** 消息网关（baseurl）。 */
  baseUrl: string
}

/** 一轮登录轮询的结果。 */
export type IlinkLoginTick =
  | { kind: 'wait' }
  | { kind: 'scaned' }
  | { kind: 'expired' }
  | { kind: 'need-verifycode'; wrongCode?: boolean }
  | { kind: 'verify-code-blocked' }
  | { kind: 'binded' }
  | { kind: 'confirmed'; credentials: IlinkCredentials }

/** 入站消息（已归一化：群/私聊、文本、上下文 token）。 */
export type IlinkInboundMessage = {
  /** 私聊 = 对端用户 id；群聊 = 群内发送者 id。 */
  fromUserId: string
  /** 群聊时的群 id。 */
  groupId?: string
  /** 文本（含语音转文字）；纯媒体消息为空串。 */
  text: string
  /** 媒体摘要（如「[图片]」），拼在 text 后交给 agent。 */
  mediaNote?: string
  /** 回复时应携带的上下文 token。 */
  contextToken?: string
}

type FetchLike = typeof fetch

export type IlinkChannelOptions = {
  /** 凭据文件路径；默认 $DSH_HOME/dsh-weixin-clawbot-ilink.json。 */
  stateFile?: string
  credentialStore?: IlinkCredentialStore
  log?: (message: string) => void
  /** 自定义 fetch（测试注入）。 */
  fetchImpl?: FetchLike
  /** 自声明的 bot_agent（观测用，默认 DSH）。 */
  botAgent?: string
}

/** iLink 通道客户端：登录态机 + 消息长轮询 + 出站发送。 */
export class IlinkChannel {
  private readonly log: (message: string) => void
  private readonly fetchImpl: FetchLike
  private readonly stateFile: string
  private readonly credentialStore: IlinkCredentialStore | undefined

  /** 当前二维码（qrcode=轮询凭据，qrUrl=二维码内容 URL）。 */
  private qrCode: string | undefined
  private qrUrl: string | undefined
  /** 待提交的手机配对码；下次轮询携带。 */
  private pendingVerifyCode: string | undefined
  /** 上次轮询是否已处于 need-verifycode（用于区分「输错重输」）。 */
  private lastNeededVerifyCode = false
  /** getupdates 游标。 */
  private updatesBuf = ''
  private running = false
  private credentials: IlinkCredentials | undefined

  constructor(opts: IlinkChannelOptions = {}) {
    this.log = opts.log ?? (() => {})
    this.fetchImpl = opts.fetchImpl ?? fetch
    const home = process.env.DSH_HOME
      ?? (process.env.HOME ? `${process.env.HOME}/.dsh` : '/tmp/.dsh')
    this.stateFile = opts.stateFile ?? path.join(home, 'dsh-weixin-clawbot-ilink.json')
    this.credentialStore = opts.credentialStore
    // 旧包名（dsh-wechat）的凭据迁移：新文件不存在而旧文件存在则沿用
    const legacyFile = this.stateFile.replace('dsh-weixin-clawbot-ilink.json', 'dsh-wechat-ilink.json')
    if (this.stateFile !== legacyFile && !fs.existsSync(this.stateFile) && fs.existsSync(legacyFile)) {
      this.stateFile = legacyFile
      this.log('[wechat] 沿用旧包名的 iLink 凭据文件')
    }
    if (this.credentialStore === undefined) this.credentials = loadIlinkCredentials(this.stateFile, this.log)
  }

  async initialize(): Promise<void> {
    if (this.credentialStore !== undefined) this.credentials = await this.credentialStore.load()
  }

  /** 已保存的凭据（自动登录）。 */
  savedCredentials(): IlinkCredentials | undefined {
    return this.credentials
  }

  /** 发起新的扫码登录（丢弃旧二维码）。 */
  async startLogin(): Promise<string> {
    const body = await this.postJson(
      ILINK_LOGIN_BASE_URL,
      'ilink/bot/get_bot_qrcode?bot_type=3',
      { local_token_list: this.credentials ? [this.credentials.token] : [] },
      { token: false },
    )
    const parsed = body as { qrcode?: string; qrcode_img_content?: string }
    if (typeof parsed.qrcode !== 'string' || typeof parsed.qrcode_img_content !== 'string') {
      throw new Error(`iLink get_bot_qrcode 响应异常: ${JSON.stringify(body).slice(0, 200)}`)
    }
    this.qrCode = parsed.qrcode
    this.qrUrl = parsed.qrcode_img_content
    this.pendingVerifyCode = undefined
    this.lastNeededVerifyCode = false
    this.log('[wechat] iLink 登录二维码已生成，请在 Web 弹窗扫码')
    return this.qrUrl
  }

  /** 当前二维码内容 URL（供渲染 PNG）；未发起登录时为 undefined。 */
  currentQrUrl(): string | undefined {
    return this.qrUrl
  }

  /** 用户在弹窗里输入手机配对码。 */
  submitVerifyCode(code: string): void {
    this.pendingVerifyCode = code.trim()
  }

  /** 登录轮询推进一拍（长轮询 ~35s）；无进行中的二维码时返回 wait。 */
  async pollLoginOnce(): Promise<IlinkLoginTick> {
    if (this.qrCode === undefined) return { kind: 'wait' }
    const params = new URLSearchParams({ qrcode: this.qrCode })
    if (this.pendingVerifyCode !== undefined && this.pendingVerifyCode !== '') {
      params.set('verify_code', this.pendingVerifyCode)
    }
    let parsed: {
      status?: string
      bot_token?: string
      ilink_bot_id?: string
      ilink_user_id?: string
      baseurl?: string
    }
    try {
      parsed = await this.getJson(
        ILINK_LOGIN_BASE_URL,
        `ilink/bot/get_qrcode_status?${params.toString()}`,
        { timeoutMs: 35_000, token: false },
      ) as typeof parsed
    } catch (error) {
      // 网关超时/网络抖动视为继续等待
      this.log(`[wechat] iLink 登录轮询失败（重试）: ${String(error)}`)
      return { kind: 'wait' }
    }

    switch (parsed.status) {
      case 'wait':
        return { kind: 'wait' }
      case 'scaned':
        if (this.pendingVerifyCode !== undefined) {
          // 配对码被接受，清掉暂存
          this.pendingVerifyCode = undefined
        }
        this.lastNeededVerifyCode = false
        return { kind: 'scaned' }
      case 'need_verifycode': {
        const wrong = this.lastNeededVerifyCode
        this.lastNeededVerifyCode = true
        return { kind: 'need-verifycode', wrongCode: wrong }
      }
      case 'verify_code_blocked':
        this.pendingVerifyCode = undefined
        this.lastNeededVerifyCode = false
        return { kind: 'verify-code-blocked' }
      case 'expired':
        return { kind: 'expired' }
      case 'binded_redirect':
        return { kind: 'binded' }
      case 'scaned_but_redirect':
        // IDC 重定向只影响轮询 host；固定网关继续轮询也能拿到结果
        return { kind: 'scaned' }
      case 'confirmed': {
        if (typeof parsed.ilink_bot_id !== 'string' || !parsed.ilink_bot_id) {
          return { kind: 'expired' }
        }
        const credentials: IlinkCredentials = {
          token: parsed.bot_token ?? '',
          botId: parsed.ilink_bot_id,
          userId: parsed.ilink_user_id ?? '',
          baseUrl: normalizeBaseUrl(parsed.baseurl) ?? ILINK_LOGIN_BASE_URL,
        }
        this.credentials = credentials
        if (this.credentialStore !== undefined) await this.credentialStore.save(credentials)
        else saveIlinkCredentials(this.stateFile, credentials, this.log)
        this.qrCode = undefined
        this.qrUrl = undefined
        this.log(`[wechat] iLink 登录成功（bot: ${credentials.botId}）`)
        return { kind: 'confirmed', credentials }
      }
      default:
        return { kind: 'wait' }
    }
  }

  /** 解绑：清凭据并停止消息循环。 */
  async logout(): Promise<void> {
    this.running = false
    this.credentials = undefined
    this.updatesBuf = ''
    if (this.credentialStore !== undefined) await this.credentialStore.clear()
    else {
      try { fs.rmSync(this.stateFile, { force: true }) } catch { /* best effort */ }
    }
    this.log('[wechat] iLink 已解绑（凭据已清除）')
  }

  /** 消息循环：getupdates 长轮询直到 stop() 或解绑。 */
  async runMessageLoop(
    onMessage: (message: IlinkInboundMessage) => void,
    onError?: (error: unknown) => void,
  ): Promise<void> {
    const credentials = this.credentials
    if (!credentials) throw new Error('iLink 未登录，无法启动消息循环')
    this.running = true
    this.log(`[wechat] iLink 消息循环启动（网关: ${credentials.baseUrl}）`)

    // 官方协议要求客户端启动时通知服务端，消息路由才会建立（失败不阻断）
    try {
      const start = await this.postJson(
        credentials.baseUrl,
        'ilink/bot/msg/notifystart',
        { base_info: { bot_agent: this.botAgentHeaderValue() } },
        { token: true, timeoutMs: 15_000 },
      ) as { ret?: number; errmsg?: string }
      if (start.ret !== 0 && start.ret !== undefined) {
        this.log(`[wechat] iLink notifyStart: ret=${start.ret} ${start.errmsg ?? ''}`)
      }
    } catch (error) {
      this.log(`[wechat] iLink notifyStart 失败（忽略）: ${String(error)}`)
    }

    while (this.running && this.credentials !== undefined) {
      try {
        const response = await this.postJson(
          credentials.baseUrl,
          'ilink/bot/getupdates',
          { get_updates_buf: this.updatesBuf, base_info: { bot_agent: this.botAgentHeaderValue() } },
          { token: true, timeoutMs: 70_000 },
        ) as {
          ret?: number
          errcode?: number
          errmsg?: string
          msgs?: Array<Record<string, unknown>>
          get_updates_buf?: string
          longpolling_timeout_ms?: number
        }

        if (response.errcode === -14) {
          this.log('[wechat] iLink 会话失效（errcode -14），请重新扫码登录')
          this.running = false
          this.credentials = undefined
          break
        }
        if (response.ret !== 0 && response.ret !== undefined) {
          this.log(`[wechat] iLink getupdates 异常: ret=${response.ret} ${response.errmsg ?? ''}`)
        }
        if (typeof response.get_updates_buf === 'string' && response.get_updates_buf !== '') {
          this.updatesBuf = response.get_updates_buf
        }

        const msgs = response.msgs ?? []
        if (msgs.length > 0) {
          this.log(`[wechat] iLink 收到 ${msgs.length} 条消息（cursor ${this.updatesBuf.length}B）`)
        }
        for (const msg of msgs) {
          const inbound = normalizeInbound(msg)
          if (inbound) {
            try {
              onMessage(inbound)
            } catch (error) {
              this.log(`[wechat] 处理 iLink 消息失败: ${String(error)}`)
            }
          }
        }
      } catch (error) {
        if (!this.running) break
        onError?.(error)
        this.log(`[wechat] iLink getupdates 失败（重试）: ${String(error)}`)
        await new Promise((resolve) => setTimeout(resolve, 3000))
      }
    }
    this.log('[wechat] iLink 消息循环已停止')
  }

  /** 停止消息循环（不断开凭据）；best-effort 通知服务端。 */
  stop(): void {
    if (this.running) {
      const credentials = this.credentials
      if (credentials) {
        void this.postJson(
          credentials.baseUrl,
          'ilink/bot/msg/notifystop',
          { base_info: { bot_agent: this.botAgentHeaderValue() } },
          { token: true, timeoutMs: 5000 },
        ).catch(() => {})
      }
    }
    this.running = false
  }

  /** 发送文本消息（chunk 由调用方负责）。 */
  async sendText(toUserId: string, text: string, contextToken?: string): Promise<void> {
    const credentials = this.credentials
    if (!credentials) throw new Error('iLink 未登录，无法发送消息')
    const response = await this.postJson(
      credentials.baseUrl,
      'ilink/bot/sendmessage',
      {
        msg: {
          from_user_id: '',
          to_user_id: toUserId,
          client_id: `dsh-weixin-clawbot-${crypto.randomUUID()}`,
          message_type: 2, // BOT
          message_state: 2, // FINISH
          item_list: text ? [{ type: 1, text_item: { text } }] : undefined,
          context_token: contextToken ?? undefined,
        },
      },
      { token: true, timeoutMs: 30_000 },
    ) as { ret?: number; errmsg?: string }
    if (response.ret !== 0 && response.ret !== undefined) {
      throw new Error(`iLink sendmessage 失败: ret=${response.ret} ${response.errmsg ?? ''}`)
    }
    this.log(`[wechat] iLink 已回复 ${toUserId}（${text.length} 字）`)
  }

  private botAgentHeaderValue(): string {
    return this.agentName ?? 'DSH-Wechat'
  }

  private agentName: string | undefined

  /** 设置 bot_agent 自声明（UA 风格 Name/Version）。 */
  setBotAgent(name: string | undefined): void {
    this.agentName = name
  }

  // ── HTTP 基础设施 ────────────────────────────────────────────

  private buildHeaders(withToken: boolean): Record<string, string> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'iLink-App-Id': 'bot',
      // 0.1.0 → 0x00010000 = 65536
      'iLink-App-ClientVersion': '65536',
      AuthorizationType: 'ilink_bot_token',
      'X-WECHAT-UIN': crypto.randomBytes(4).toString('base64'),
    }
    if (withToken && this.credentials?.token) {
      headers.Authorization = `Bearer ${this.credentials.token}`
    }
    return headers
  }

  private async request(
    baseUrl: string,
    endpoint: string,
    init: { method: 'GET' | 'POST'; body?: unknown; timeoutMs?: number; token: boolean },
  ): Promise<unknown> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 30_000)
    try {
      const body = init.body === undefined ? undefined : JSON.stringify(init.body)
      const response = await this.fetchImpl(new URL(endpoint, `${baseUrl}/`).toString(), {
        method: init.method,
        headers: this.buildHeaders(init.token),
        ...(body === undefined ? {} : { body }),
        signal: controller.signal,
      })
      const text = await response.text()
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`)
      return text ? JSON.parse(text) : {}
    } finally {
      clearTimeout(timer)
    }
  }

  private async postJson(
    baseUrl: string,
    endpoint: string,
    body: unknown,
    opts: { token: boolean; timeoutMs?: number },
  ): Promise<unknown> {
    return this.request(baseUrl, endpoint, { method: 'POST', body, ...opts })
  }

  private async getJson(
    baseUrl: string,
    endpoint: string,
    opts: { token: boolean; timeoutMs?: number },
  ): Promise<unknown> {
    return this.request(baseUrl, endpoint, { method: 'GET', ...opts })
  }
}

/** baseurl 规范化：无协议时补 https，去尾部斜杠。 */
function normalizeBaseUrl(raw: string | undefined): string | undefined {
  if (typeof raw !== 'string' || raw === '') return undefined
  const withScheme = raw.startsWith('http') ? raw : `https://${raw}`
  return withScheme.replace(/\/+$/, '')
}

/** iLink 消息归一化：群/私聊、文本、语音转文字、媒体摘要。 */
function normalizeInbound(msg: Record<string, unknown>): IlinkInboundMessage | undefined {
  // message_type 1 = USER（只处理用户消息）
  if (msg.message_type !== 1) return undefined
  const fromUserId = typeof msg.from_user_id === 'string' ? msg.from_user_id : ''
  if (!fromUserId) return undefined
  const groupId = typeof msg.group_id === 'string' && msg.group_id !== '' ? msg.group_id : undefined

  const parts: string[] = []
  let mediaNote: string | undefined
  const items = Array.isArray(msg.item_list) ? (msg.item_list as Array<Record<string, unknown>>) : []
  for (const item of items) {
    const text = (item.text_item as { text?: string } | undefined)?.text
    if (typeof text === 'string' && text !== '') parts.push(text)
    const voiceText = (item.voice_item as { text?: string } | undefined)?.text
    if (typeof voiceText === 'string' && voiceText !== '') parts.push(voiceText)
    if (item.image_item) mediaNote = '[图片]'
    else if (item.video_item) mediaNote = '[视频]'
    else if (item.file_item) {
      const name = (item.file_item as { file_name?: string }).file_name
      mediaNote = `[文件${typeof name === 'string' && name ? `: ${name}` : ''}]`
    }
  }
  const text = parts.join('\n')
  if (text === '' && mediaNote === undefined) return undefined

  return {
    fromUserId,
    text,
    ...(groupId === undefined ? {} : { groupId }),
    ...(mediaNote === undefined ? {} : { mediaNote }),
    ...(typeof msg.context_token === 'string' ? { contextToken: msg.context_token } : {}),
  }
}

// ── 凭据持久化 ─────────────────────────────────────────────────

export interface IlinkCredentialStore {
  load(): Promise<IlinkCredentials | undefined>
  save(credentials: IlinkCredentials): Promise<void>
  clear(): Promise<void>
}

/** 读取凭据；缺失/损坏返回 undefined。 */
export function loadIlinkCredentials(
  file: string,
  log: (message: string) => void,
): IlinkCredentials | undefined {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<IlinkCredentials>
    if (
      typeof raw.token === 'string' && raw.token !== ''
      && typeof raw.botId === 'string' && raw.botId !== ''
      && typeof raw.baseUrl === 'string' && raw.baseUrl !== ''
    ) {
      return { token: raw.token, botId: raw.botId, userId: raw.userId ?? '', baseUrl: raw.baseUrl }
    }
    return undefined
  } catch {
    return undefined
  }
}

/** 原子写入凭据。 */
export function saveIlinkCredentials(
  file: string,
  credentials: IlinkCredentials,
  log: (message: string) => void,
): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(credentials, null, 2)}\n`)
  fs.renameSync(tmp, file)
  log('[wechat] iLink 凭据已保存')
}
