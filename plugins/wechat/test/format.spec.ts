import { describe, expect, it } from 'vitest'

import type { AssistantMessage } from '@deepseek-ai/dsh-llm'

import {
  HELP_TEXT,
  chunkForWechat,
  extractAssistantText,
  mediaPlaceholder,
  parseControlCommand,
  turnEndSummary,
} from '../src/host/format.js'
import {
  isWechatSession,
  sendTargetFromSessionId,
  sessionIdFor,
  subjectFromSessionId,
} from '../src/host/sessions.js'

function assistantMessage(texts: string[]): AssistantMessage {
  return {
    role: 'assistant',
    content: texts.map((text) => ({ type: 'text', text })),
  } as unknown as AssistantMessage
}

describe('extractAssistantText', () => {
  it('拼接全部文本块', () => {
    expect(extractAssistantText(assistantMessage(['你好', '世界']))).toBe('你好世界')
  })

  it('跳过非文本块', () => {
    const message = {
      role: 'assistant',
      content: [
        { type: 'tool-call', id: '1', name: 'bash', arguments: '{}' },
        { type: 'text', text: 'done' },
      ],
    } as unknown as AssistantMessage
    expect(extractAssistantText(message)).toBe('done')
  })
})

describe('chunkForWechat', () => {
  it('短文本不切分', () => {
    expect(chunkForWechat('hello', 100)).toEqual(['hello'])
  })

  it('按段落切分', () => {
    const text = ['a'.repeat(60), 'b'.repeat(60)].join('\n\n')
    const chunks = chunkForWechat(text, 100)
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toBe('a'.repeat(60))
    expect(chunks[1]).toBe('b'.repeat(60))
  })

  it('超长段落按硬上限切分', () => {
    const chunks = chunkForWechat('x'.repeat(250), 100)
    expect(chunks).toEqual(['x'.repeat(100), 'x'.repeat(100), 'x'.repeat(50)])
  })

  it('每块不超过上限', () => {
    const text = `${'a'.repeat(500)}\n\n${'b'.repeat(500)}\n\n${'c'.repeat(500)}`
    for (const chunk of chunkForWechat(text, 300)) {
      expect(chunk.length).toBeLessThanOrEqual(300)
    }
  })
})

describe('parseControlCommand', () => {
  it('识别 /new /stop /status /help', () => {
    expect(parseControlCommand('/new')).toEqual({ kind: 'new' })
    expect(parseControlCommand('/stop')).toEqual({ kind: 'stop' })
    expect(parseControlCommand('/status')).toEqual({ kind: 'status' })
    expect(parseControlCommand('/help')).toEqual({ kind: 'help' })
  })

  it('中文命令别名', () => {
    expect(parseControlCommand('/新会话')).toEqual({ kind: 'new' })
    expect(parseControlCommand('/停止')).toEqual({ kind: 'stop' })
  })

  it('普通消息不是命令', () => {
    expect(parseControlCommand('帮我看看代码')).toBeNull()
    expect(parseControlCommand('')).toBeNull()
  })

  it('帮助文本非空', () => {
    expect(HELP_TEXT.length).toBeGreaterThan(0)
  })
})

describe('turnEndSummary', () => {
  it('错误给出摘要', () => {
    const summary = turnEndSummary({
      kind: 'error',
      error: { message: 'boom', code: 'UNKNOWN' },
    })
    expect(summary).toContain('boom')
  })

  it('正常完成无摘要', () => {
    expect(turnEndSummary({ kind: 'completed' })).toBeUndefined()
  })
})

describe('mediaPlaceholder', () => {
  it('生成媒体占位文本', () => {
    expect(mediaPlaceholder('image', '/tmp/a.png')).toBe('<media:image path="/tmp/a.png">')
    expect(mediaPlaceholder('voice', '/tmp/a.silk')).toBe('<media:audio path="/tmp/a.silk">')
  })
})

describe('会话路由', () => {
  it('同一微信用户映射到稳定会话 id', () => {
    const a = sessionIdFor({ kind: 'direct', id: 'wxid_abc' })
    const b = sessionIdFor({ kind: 'direct', id: 'wxid_abc' })
    expect(String(a)).toBe(String(b))
    expect(String(a)).toBe('wechat:direct:wxid_abc')
  })

  it('群与用户会话分离', () => {
    const user = sessionIdFor({ kind: 'direct', id: 'abc' })
    const group = sessionIdFor({ kind: 'group', id: 'abc' })
    expect(String(user)).not.toBe(String(group))
  })

  it('isWechatSession 只认本插件前缀', () => {
    expect(isWechatSession('wechat:direct:x')).toBe(true)
    expect(isWechatSession('session-123')).toBe(false)
  })

  it('subjectFromSessionId 与 sendTargetFromSessionId 往返', () => {
    const id = sessionIdFor({ kind: 'group', id: 'room@chatroom' })
    expect(subjectFromSessionId(id)).toEqual({ kind: 'group', id: 'room@chatroom' })
    expect(sendTargetFromSessionId(id)).toBe('room@chatroom')
  })
})
