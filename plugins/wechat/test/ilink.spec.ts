import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  IlinkChannel,
  loadIlinkCredentials,
  saveIlinkCredentials,
  type IlinkCredentials,
} from '../src/host/ilink.js'

const dir = path.join(os.tmpdir(), `dsh-weixin-clawbot-ilink-test-${process.pid}`)
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

function stateFile(): string {
  return path.join(dir, `ilink-${Math.random().toString(36).slice(2)}.json`)
}

type Call = { url: string; method: string; body?: unknown; headers?: Record<string, string> }

/** 可变路由表：respond 返回 body；测试中途改 status 即可驱动状态机。 */
function makeFetch(responder: (url: string, method: string) => unknown, calls: Call[] = []) {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    const body = init?.body !== undefined ? JSON.parse(String(init.body)) : undefined
    calls.push({ url, method, body, headers: init?.headers as Record<string, string> })
    const responseBody = responder(url, method)
    return new Response(JSON.stringify(responseBody ?? {}), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
}

describe('IlinkChannel 登录', () => {
  it('二维码 → wait → scaned → confirmed：凭据落盘并停止二维码', async () => {
    const file = stateFile()
    const calls: Call[] = []
    let qrStatus: Record<string, unknown> = { status: 'wait' }
    const channel = new IlinkChannel({
      stateFile: file,
      fetchImpl: makeFetch((url, method) => {
        if (url.includes('get_bot_qrcode') && method === 'POST') {
          return { qrcode: 'QR1', qrcode_img_content: 'https://qr.example/x' }
        }
        if (url.includes('get_qrcode_status')) return qrStatus
        return {}
      }, calls),
    })

    await expect(channel.startLogin()).resolves.toBe('https://qr.example/x')
    expect(calls.at(-1)?.body).toEqual({ local_token_list: [] })
    expect(channel.currentQrUrl()).toBe('https://qr.example/x')

    await expect(channel.pollLoginOnce()).resolves.toEqual({ kind: 'wait' })

    qrStatus = { status: 'scaned' }
    await expect(channel.pollLoginOnce()).resolves.toEqual({ kind: 'scaned' })

    qrStatus = {
      status: 'confirmed',
      bot_token: 'tok-1',
      ilink_bot_id: 'bot-1',
      ilink_user_id: 'user-1',
      baseurl: 'https://gw.example.com/',
    }
    await expect(channel.pollLoginOnce()).resolves.toEqual({
      kind: 'confirmed',
      credentials: {
        token: 'tok-1',
        botId: 'bot-1',
        userId: 'user-1',
        baseUrl: 'https://gw.example.com',
      },
    })
    // 凭据落盘 + 二维码清空
    expect(loadIlinkCredentials(file, () => {})).toEqual({
      token: 'tok-1',
      botId: 'bot-1',
      userId: 'user-1',
      baseUrl: 'https://gw.example.com',
    })
    expect(channel.currentQrUrl()).toBeUndefined()
    expect(channel.savedCredentials()?.token).toBe('tok-1')
  })

  it('need-verifycode：wrongCode 区分首输/重输；提交后随轮询携带', async () => {
    const file = stateFile()
    const calls: Call[] = []
    let qrStatus: Record<string, unknown> = { status: 'need_verifycode' }
    const channel = new IlinkChannel({
      stateFile: file,
      fetchImpl: makeFetch((url, method) => {
        if (url.includes('get_bot_qrcode') && method === 'POST') {
          return { qrcode: 'QR2', qrcode_img_content: 'https://qr.example/y' }
        }
        if (url.includes('get_qrcode_status')) return qrStatus
        return {}
      }, calls),
    })
    await channel.startLogin()

    await expect(channel.pollLoginOnce()).resolves.toEqual({ kind: 'need-verifycode', wrongCode: false })
    await expect(channel.pollLoginOnce()).resolves.toEqual({ kind: 'need-verifycode', wrongCode: true })

    channel.submitVerifyCode('1234')
    await channel.pollLoginOnce()
    expect(calls.some((call) => call.url.includes('verify_code=1234'))).toBe(true)

    // 配对码被接受后暂存清除
    qrStatus = { status: 'scaned' }
    await channel.pollLoginOnce()
    qrStatus = { status: 'need_verifycode' }
    await expect(channel.pollLoginOnce()).resolves.toEqual({ kind: 'need-verifycode', wrongCode: false })
  })

  it('scaned_but_redirect 视为 scaned；expired/blocked 正确透出', async () => {
    const file = stateFile()
    let qrStatus: Record<string, unknown> = { status: 'scaned_but_redirect' }
    const channel = new IlinkChannel({
      stateFile: file,
      fetchImpl: makeFetch((url, method) => {
        if (url.includes('get_bot_qrcode') && method === 'POST') {
          return { qrcode: 'QR3', qrcode_img_content: 'https://qr.example/z' }
        }
        if (url.includes('get_qrcode_status')) return qrStatus
        return {}
      }),
    })
    await channel.startLogin()
    await expect(channel.pollLoginOnce()).resolves.toEqual({ kind: 'scaned' })
    qrStatus = { status: 'expired' }
    await expect(channel.pollLoginOnce()).resolves.toEqual({ kind: 'expired' })
    qrStatus = { status: 'verify_code_blocked' }
    await expect(channel.pollLoginOnce()).resolves.toEqual({ kind: 'verify-code-blocked' })
  })
})

describe('IlinkChannel 消息循环与发送', () => {
  function loggedInChannel(
    file: string,
    responder: (url: string, method: string) => unknown,
    calls: Call[],
  ): IlinkChannel {
    saveIlinkCredentials(
      file,
      { token: 'tok-9', botId: 'bot-9', userId: 'user-9', baseUrl: 'https://gw.example.com' },
      () => {},
    )
    return new IlinkChannel({ stateFile: file, fetchImpl: makeFetch(responder, calls) })
  }

  it('getupdates 端点带 ilink/bot 前缀，循环启动前先 notifyStart', async () => {
    const file = stateFile()
    const calls: Call[] = []
    let round = 0
    const channel = loggedInChannel(file, (url, method) => {
      if (url.includes('notifystart') && method === 'POST') return { ret: 0 }
      if (url.includes('getupdates') && method === 'POST') {
        round += 1
        if (round === 2) channel.stop()
        return { ret: 0, msgs: [] }
      }
      return {}
    }, calls)

    await channel.runMessageLoop(() => {})

    const order = calls.map((call) => call.url.includes('notifystart') ? 'start' : 'updates')
    expect(order[0]).toBe('start')
    expect(calls.find((call) => call.url.includes('getupdates'))?.url).toContain('ilink/bot/getupdates')
  })

  it('getupdates 游标推进 + 消息归一化（群/私聊/语音/媒体/忽略 BOT 消息）', async () => {
    const file = stateFile()
    const calls: Call[] = []
    const received: unknown[] = []
    let round = 0
    const channel = loggedInChannel(file, (url, method) => {
      if (url.includes('getupdates') && method === 'POST') {
        round += 1
        if (round === 1) {
          return {
            ret: 0,
            get_updates_buf: 'BUF-1',
            msgs: [
              {
                message_type: 1,
                from_user_id: 'u1',
                context_token: 'CTX-1',
                item_list: [{ type: 1, text_item: { text: '你好' } }],
              },
              {
                message_type: 1,
                from_user_id: 'u2',
                group_id: 'g1',
                item_list: [{ type: 3, voice_item: { text: '语音转写' } }],
              },
              { message_type: 1, from_user_id: 'u3', item_list: [{ type: 2, image_item: {} }] },
              { message_type: 2, from_user_id: 'bot-9', item_list: [{ type: 1, text_item: { text: '自己的回复' } }] },
            ],
          }
        }
        // 第二轮：同步停循环（mock 立即返回，不能靠定时器）
        channel.stop()
        return { ret: 0, get_updates_buf: 'BUF-2', msgs: [] }
      }
      return {}
    }, calls)

    await channel.runMessageLoop((message) => received.push(message))

    expect(received).toEqual([
      { fromUserId: 'u1', groupId: undefined, text: '你好', mediaNote: undefined, contextToken: 'CTX-1' },
      { fromUserId: 'u2', groupId: 'g1', text: '语音转写', mediaNote: undefined, contextToken: undefined },
      { fromUserId: 'u3', groupId: undefined, text: '', mediaNote: '[图片]', contextToken: undefined },
    ])
    // 游标携带（calls[0] = notifyStart，其后是 getupdates）
    expect(calls[1]?.body).toMatchObject({ get_updates_buf: '' })
    expect(calls[2]?.body).toMatchObject({ get_updates_buf: 'BUF-1' })
  })

  it('sendText 携带鉴权头与 context_token；ret 非 0 抛错', async () => {
    const file = stateFile()
    const calls: Call[] = []
    let ret = 0
    const channel = loggedInChannel(file, (url) => {
      if (url.includes('sendmessage')) return { ret, errmsg: ret === 0 ? '' : 'fail' }
      return {}
    }, calls)

    await channel.sendText('u1', '回复', 'CTX-9')
    expect(calls[0]?.headers?.Authorization).toBe('Bearer tok-9')
    expect(calls[0]?.headers?.AuthorizationType).toBe('ilink_bot_token')
    expect(calls[0]?.headers?.['iLink-App-Id']).toBe('bot')
    expect(calls[0]?.url).toContain('ilink/bot/sendmessage')
    expect((calls[0]?.body as { msg: Record<string, unknown> }).msg).toMatchObject({
      to_user_id: 'u1',
      message_type: 2,
      message_state: 2,
      context_token: 'CTX-9',
    })

    ret = -1
    await expect(channel.sendText('u1', 'x')).rejects.toThrow('sendmessage 失败')
  })

  it('errcode -14 停止循环并清除凭据', async () => {
    const file = stateFile()
    const channel = loggedInChannel(file, (url) => {
      if (url.includes('getupdates')) return { ret: -1, errcode: -14 }
      return {}
    }, [])
    await channel.runMessageLoop(() => {})
    expect(channel.savedCredentials()).toBeUndefined()
  })

  it('logout 清除凭据文件；重启后自动载入已存凭据', async () => {
    const file = stateFile()
    saveIlinkCredentials(
      file,
      { token: 't', botId: 'b', userId: 'u', baseUrl: 'https://x.example' },
      () => {},
    )
    const channel = new IlinkChannel({ stateFile: file, fetchImpl: makeFetch(() => ({})) })
    expect(channel.savedCredentials()?.token).toBe('t')
    await channel.logout()
    expect(channel.savedCredentials()).toBeUndefined()
    expect(fs.existsSync(file)).toBe(false)
  })
})
