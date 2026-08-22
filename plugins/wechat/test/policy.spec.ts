import { describe, expect, it } from 'vitest'

import { Config, resolveMediaDir, type WechatConfig } from '../src/host/config.js'
import {
  decideDm,
  decideGroup,
  normalizeWechatId,
  resolveGroupMatch,
  resolveSenderMatch,
} from '../src/host/policy.js'

describe('Config', () => {
  it('空配置使用默认值', () => {
    const config = Config({} as unknown as WechatConfig)
    expect(config.enabled).toBe(true)
    expect(config.puppet).toBe('ilink')
    expect(config.dmPolicy).toBe('pairing')
    expect(config.groupPolicy).toBe('allowlist')
    expect(config.groupRequireMention).toBe(true)
    expect(config.textChunkLimit).toBe(3800)
  })

  it('接受完整配置', () => {
    const config = Config({
      puppet: 'ilink',
      puppetOptions: { token: 'puppet_xxx' },
      workspace: '/tmp/ws',
      model: 'deepseek-v4-flash',
      dmPolicy: 'allowlist',
      allowFrom: ['wxid_abc', 123],
      groupPolicy: 'open',
      groups: ['xxx@chatroom'],
      replyOn: 'turn',
      textChunkLimit: 1000,
    } as unknown as WechatConfig)
    expect(config.puppet).toBe('ilink')
    expect(config.puppetOptions.token).toBe('puppet_xxx')
    expect(config.allowFrom).toEqual(['wxid_abc', 123])
    expect(config.replyOn).toBe('turn')
  })

  it('拒绝非法策略值', () => {
    expect(() => Config({ dmPolicy: 'everyone' } as unknown as WechatConfig)).toThrow()
    expect(() => Config({ groupPolicy: 'everyone' } as unknown as WechatConfig)).toThrow()
    expect(() => Config({ replyOn: 'chunk' } as unknown as WechatConfig)).toThrow()
  })

  it('resolveMediaDir 优先配置，其次 DSH_HOME', () => {
    expect(resolveMediaDir({ mediaDir: '/tmp/media' })).toBe('/tmp/media')
    const home = process.env.HOME ?? '/tmp'
    expect(resolveMediaDir({ mediaDir: '' })).toBe(`${home}/.dsh/wechat-media`)
  })
})

describe('resolveSenderMatch', () => {
  it('支持 id 匹配', () => {
    expect(
      resolveSenderMatch({ allowFrom: ['wxid_abc'], userId: 'wxid_abc' }),
    ).toEqual({ allowed: true, matchKey: 'wxid_abc', matchSource: 'id' })
  })

  it('支持备注名匹配（忽略大小写）', () => {
    expect(
      resolveSenderMatch({ allowFrom: ['Boss'], userName: 'boss' }),
    ).toEqual({ allowed: true, matchKey: 'boss', matchSource: 'name' })
  })

  it('支持 * 通配', () => {
    expect(resolveSenderMatch({ allowFrom: ['*'], userId: 'x' }).matchSource).toBe('wildcard')
  })

  it('空列表拒绝', () => {
    expect(resolveSenderMatch({ allowFrom: [], userId: 'x' }).allowed).toBe(false)
  })
})

describe('resolveGroupMatch', () => {
  it('按群 id 匹配', () => {
    expect(resolveGroupMatch({ groups: ['X@CHATROOM'], roomId: 'x@chatroom' }).allowed).toBe(true)
  })

  it('按群名匹配', () => {
    expect(
      resolveGroupMatch({ groups: ['家庭群'], roomTopic: '家庭群' }),
    ).toEqual({ allowed: true, matchKey: '家庭群', matchSource: 'name' })
  })
})

describe('decideDm', () => {
  const sender = { id: 'wxid_abc', name: '张三' }

  it('open 策略放行', () => {
    expect(decideDm({ dmPolicy: 'open', allowFrom: [] }, sender).allowed).toBe(true)
  })

  it('disabled 策略拦截', () => {
    expect(decideDm({ dmPolicy: 'disabled', allowFrom: [] }, sender)).toEqual({
      allowed: false,
      reason: 'disabled',
    })
  })

  it('allowlist 命中放行', () => {
    expect(
      decideDm({ dmPolicy: 'allowlist', allowFrom: ['wxid_abc'] }, sender).allowed,
    ).toBe(true)
  })

  it('allowlist 未命中拦截', () => {
    expect(
      decideDm({ dmPolicy: 'allowlist', allowFrom: ['other'] }, sender),
    ).toEqual({ allowed: false, reason: 'blocked' })
  })

  it('pairing 未命中要求配对', () => {
    expect(decideDm({ dmPolicy: 'pairing', allowFrom: [] }, sender)).toEqual({
      allowed: false,
      reason: 'pairing',
    })
  })
})

describe('decideGroup', () => {
  const base = { roomId: 'r@chatroom', roomTopic: '家庭群', mentionSelf: true }

  it('allowlist 命中且已 @ 放行', () => {
    expect(
      decideGroup(
        { groupPolicy: 'allowlist', groups: ['家庭群'], groupRequireMention: true },
        base,
      ).allowed,
    ).toBe(true)
  })

  it('未 @ 拦截', () => {
    expect(
      decideGroup(
        { groupPolicy: 'allowlist', groups: ['家庭群'], groupRequireMention: true },
        { ...base, mentionSelf: false },
      ),
    ).toEqual({ allowed: false, reason: 'no-mention' })
  })

  it('群不在白名单拦截', () => {
    expect(
      decideGroup(
        { groupPolicy: 'allowlist', groups: ['工作群'], groupRequireMention: false },
        base,
      ),
    ).toEqual({ allowed: false, reason: 'not-listed' })
  })

  it('disabled 拦截', () => {
    expect(
      decideGroup(
        { groupPolicy: 'disabled', groups: [], groupRequireMention: false },
        base,
      ),
    ).toEqual({ allowed: false, reason: 'disabled' })
  })
})

describe('normalizeWechatId', () => {
  it('去掉 wechat: 前缀并小写', () => {
    expect(normalizeWechatId('wechat:WXID_ABC')).toBe('wxid_abc')
  })
})
