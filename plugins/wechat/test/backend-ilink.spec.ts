import { describe, expect, it, vi, beforeEach } from 'vitest'

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'

import { WechatBackend } from '../src/host/backend.js'
import { Config } from '../src/host/config.js'
import type { IlinkInboundMessage } from '../src/host/ilink.js'

// ── mock IlinkChannel ─────────────────────────────────────────

const { mockChannel } = vi.hoisted(() => {
  const mockChannel = {
    initialize: vi.fn(async () => {}),
    savedCredentials: vi.fn<() => unknown>(() => undefined),
    startLogin: vi.fn(async () => 'https://qr.example/ilink'),
    currentQrUrl: vi.fn(() => undefined as string | undefined),
    pollLoginOnce: vi.fn(async () => ({ kind: 'wait' }) as unknown),
    submitVerifyCode: vi.fn(),
    sendText: vi.fn(async () => {}),
    runMessageLoop: vi.fn(async () => {}),
    logout: vi.fn(async () => {}),
    stop: vi.fn(),
    setBotAgent: vi.fn(),
  }
  return { mockChannel }
})

vi.mock('../src/host/ilink.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/host/ilink.js')>()
  return { ...actual, IlinkChannel: vi.fn(function () { return mockChannel }) }
})

// ── 夹具 ──────────────────────────────────────────────────────

function makeAgent(): { agent: Agent; followup: ReturnType<typeof vi.fn> } {
  const followup = vi.fn()
  const agent = {
    id: SessionId('wechat:direct:u1'),
    options: {},
    session: {},
    inbox: {},
    status: 'idle',
    ctx: {},
    followup,
    steer: followup,
    inject: followup,
    cancel: vi.fn(),
    whenIdle: async () => {},
    runMaintenance: async <T>(job: (signal: AbortSignal) => Promise<T>): Promise<T> =>
      job(new AbortController().signal),
  } as unknown as Agent
  return { agent, followup }
}

function makeContext() {
  const { agent, followup } = makeAgent()
  const dispose = vi.fn(async () => {})
  const listeners = new Map<string, (session: Session, event: SessionEvent) => void>()
  const ctx = {
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
    on: (name: string, handler: never) => {
      listeners.set(name, handler)
      return () => listeners.delete(name)
    },
    effect: () => () => {},
    agents: { create: vi.fn(async () => ({ agent, dispose })) },
    agentDefaultModel: {
      currentSelection: () => ({ provider: 'deepseek-official', model: 'deepseek-v4-flash' }),
    },
  } as unknown as Context
  return { ctx, followup, listeners, agent }
}

function ilinkConfig(workspace = '/default') {
  return Config({
    puppet: 'ilink',
    dmPolicy: 'open',
    workspace,
  } as never) as ReturnType<typeof Config>
}

function tempFile(): string {
  return `/tmp/dsh-weixin-clawbot-ilink-backend-${Math.random().toString(36).slice(2)}.json`
}

beforeEach(() => {
  vi.clearAllMocks()
  mockChannel.savedCredentials.mockReturnValue(undefined)
  mockChannel.currentQrUrl.mockReturnValue(undefined)
  mockChannel.pollLoginOnce.mockResolvedValue({ kind: 'wait' })
})

describe('WechatBackend × iLink', () => {
  it('无凭据启动：出二维码 → confirmed → 进入消息循环并置 logged-in', async () => {
    const { ctx } = makeContext()
    const backend = new WechatBackend(ctx, ilinkConfig(), tempFile())

    const credentials = { token: 't', botId: 'bot-77', userId: 'owner', baseUrl: 'https://gw' }
    let polls = 0
    mockChannel.pollLoginOnce.mockImplementation(async () => {
      polls += 1
      if (polls >= 2) {
        mockChannel.savedCredentials.mockReturnValue(credentials)
        return { kind: 'confirmed', credentials }
      }
      return { kind: 'wait' }
    })

    await backend.start()
    expect(mockChannel.startLogin).not.toHaveBeenCalled()
    backend.ensureLoginStarted()
    await vi.waitFor(() => expect(backend.qrPayload().state.kind).toBe('logged-in'))
    expect(backend.qrPayload().user?.name).toContain('bot-77')
    expect(mockChannel.startLogin).toHaveBeenCalled()
    expect(mockChannel.runMessageLoop).toHaveBeenCalled()

    await backend.dispose()
  })

  it('已存凭据启动：直接进入消息循环（不再出二维码）', async () => {
    const { ctx } = makeContext()
    const backend = new WechatBackend(ctx, ilinkConfig(), tempFile())
    mockChannel.savedCredentials.mockReturnValue({ token: 't', botId: 'b', userId: 'u', baseUrl: 'https://gw' })

    await backend.start()
    expect(mockChannel.startLogin).not.toHaveBeenCalled()
    expect(mockChannel.runMessageLoop).toHaveBeenCalled()
    expect(backend.qrPayload().state.kind).toBe('logged-in')

    await backend.dispose()
  })

  it('入站 iLink 消息 → agent followup；回复经 sendText 携带 context_token', async () => {
    const { ctx, followup, listeners } = makeContext()
    const backend = new WechatBackend(ctx, ilinkConfig('/ws-default'), tempFile())
    mockChannel.savedCredentials.mockReturnValue({ token: 't', botId: 'b', userId: 'u', baseUrl: 'https://gw' })

    let onMessage: ((message: IlinkInboundMessage) => void) | undefined
    const captureLoop = async (...args: unknown[]) => {
      onMessage = args[0] as (m: IlinkInboundMessage) => void
    }
    mockChannel.runMessageLoop.mockImplementation(captureLoop as never)
    await backend.start()
    expect(onMessage).toBeDefined()

    await onMessage!({
      fromUserId: 'user-1',
      text: '你好',
      contextToken: 'CTX-42',
    })
    await vi.waitFor(() => expect(followup).toHaveBeenCalledTimes(1))
    const created = (ctx.agents.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as { sessionId: SessionId } | undefined
    expect(String(created?.sessionId)).toMatch(
      /^wechat:direct:user-1~p[0-9a-z]+$/,
    )

    // assistant 回复 → ilink sendText（带 context token）
    const session = { id: SessionId('wechat:direct:user-1'), events: [] } as unknown as Session
    listeners.get('session/event')!(session, {
      seq: 1,
      type: 'assistant/message',
      data: { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: '收到' }] } },
    } as unknown as SessionEvent)
    await vi.waitFor(() => expect(mockChannel.sendText).toHaveBeenCalledWith('user-1', '收到', 'CTX-42'))

    await backend.dispose()
  })

  it('解绑：清除 iLink 凭据并回到待扫码', async () => {
    const { ctx } = makeContext()
    const backend = new WechatBackend(ctx, ilinkConfig(), tempFile())
    mockChannel.savedCredentials.mockReturnValue({ token: 't', botId: 'b', userId: 'u', baseUrl: 'https://gw' })
    mockChannel.runMessageLoop.mockImplementation(async () => {})
    await backend.start()

    mockChannel.savedCredentials.mockReturnValue(undefined)
    await backend.logout()
    expect(mockChannel.logout).toHaveBeenCalled()
    expect(mockChannel.startLogin).not.toHaveBeenCalled()
    backend.ensureLoginStarted()
    await vi.waitFor(() => expect(mockChannel.startLogin).toHaveBeenCalled())

    await backend.dispose()
  })

  it('submitVerifyCode 透传给通道', async () => {
    const { ctx } = makeContext()
    const backend = new WechatBackend(ctx, ilinkConfig(), tempFile())
    mockChannel.savedCredentials.mockReturnValue({ token: 't', botId: 'b', userId: 'u', baseUrl: 'https://gw' })
    await backend.start()
    backend.submitVerifyCode('654321')
    expect(mockChannel.submitVerifyCode).toHaveBeenCalledWith('654321')
    await backend.dispose()
  })
})
