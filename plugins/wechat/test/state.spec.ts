import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  granularityFromConfig,
  loadState,
  noticeToolsOf,
  replyOnOf,
  resolveStatePath,
  saveState,
  validateSettingsInput,
} from '../src/host/state.js'

const dir = path.join(tmpdir(), `dsh-weixin-clawbot-state-test-${process.pid}`)
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('granularity 映射', () => {
  it('从静态配置推导', () => {
    expect(granularityFromConfig({ replyOn: 'step', noticeTools: true })).toBe('detailed')
    expect(granularityFromConfig({ replyOn: 'step', noticeTools: false })).toBe('standard')
    expect(granularityFromConfig({ replyOn: 'turn', noticeTools: false })).toBe('summary')
    expect(granularityFromConfig({ replyOn: 'turn', noticeTools: true })).toBe('summary')
  })
  it('granularity → replyOn/noticeTools', () => {
    expect(replyOnOf('detailed')).toBe('step')
    expect(replyOnOf('standard')).toBe('step')
    expect(replyOnOf('summary')).toBe('turn')
    expect(noticeToolsOf('detailed')).toBe(true)
    expect(noticeToolsOf('standard')).toBe(false)
    expect(noticeToolsOf('summary')).toBe(false)
  })
})

describe('state 文件读写', () => {
  it('saveState 原子写入并可读回', () => {
    const file = path.join(dir, 'dsh-weixin-clawbot.state.json')
    saveState(file, { granularity: 'summary', workspaceScope: { workspaceIds: ['w1', 'w2'] } })
    expect(loadState(file)).toEqual({ granularity: 'summary', workspaceScope: { workspaceIds: ['w1', 'w2'] } })
  })
  it('saveState 自动创建父目录', () => {
    const file = path.join(dir, 'nested/deep/state.json')
    saveState(file, {})
    expect(loadState(file)).toEqual({})
  })
  it('损坏/缺失文件回退空对象', () => {
    expect(loadState(path.join(dir, 'missing.json'))).toEqual({})
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, 'bad.json'), '{oops')
    expect(loadState(path.join(dir, 'bad.json'))).toEqual({})
  })
  it('单选旧格式 { workspaceId } 迁移为多选数组', () => {
    const file = path.join(dir, 'legacy.json')
    mkdirSync(dir, { recursive: true })
    writeFileSync(file, JSON.stringify({ workspaceScope: { workspaceId: 'w9' } }))
    expect(loadState(file)).toEqual({ workspaceScope: { workspaceIds: ['w9'] } })
  })
  it('空数组 / 非字符串数组的 scope 被丢弃', () => {
    const file = path.join(dir, 'badscope.json')
    mkdirSync(dir, { recursive: true })
    writeFileSync(file, JSON.stringify({ workspaceScope: { workspaceIds: [] } }))
    expect(loadState(file)).toEqual({})
  })
  it('文件里多余字段被丢弃', () => {
    const file = path.join(dir, 'extra.json')
    mkdirSync(dir, { recursive: true })
    writeFileSync(file, JSON.stringify({ granularity: 'summary', evil: true }))
    expect(loadState(file)).toEqual({ granularity: 'summary' })
  })
  it('resolveStatePath 优先 $DSH_HOME', () => {
    const prev = process.env.DSH_HOME
    process.env.DSH_HOME = '/tmp/dsh-home-x'
    try {
      expect(resolveStatePath()).toBe(path.join('/tmp/dsh-home-x', 'dsh-weixin-clawbot.state.json'))
    } finally {
      if (prev === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = prev
    }
  })
})

describe('validateSettingsInput', () => {
  const workspaces = [
    { id: 'w1', title: 'dsh', path: '/Users/x/git/dsh' },
    { id: 'w2', title: 'sleuth', path: '/Users/x/git/sleuth' },
  ]

  it('接受合法 granularity', () => {
    expect(validateSettingsInput({ granularity: 'summary' }, workspaces)).toEqual({
      ok: true,
      patch: { granularity: 'summary' },
    })
  })
  it('接受 all / 多选 workspaceIds', () => {
    expect(validateSettingsInput({ workspaceScope: 'all' }, workspaces)).toEqual({
      ok: true,
      patch: { workspaceScope: 'all' },
    })
    expect(validateSettingsInput({ workspaceScope: { workspaceIds: ['w2', 'w1'] } }, workspaces)).toEqual({
      ok: true,
      patch: { workspaceScope: { workspaceIds: ['w2', 'w1'] } },
    })
  })
  it('拒绝非法枚举/结构/未知工作区/空数组/空 body', () => {
    expect(validateSettingsInput({ granularity: 'loud' }, workspaces).ok).toBe(false)
    expect(validateSettingsInput({ workspaceScope: 'some' }, workspaces).ok).toBe(false)
    expect(validateSettingsInput({ workspaceScope: { workspaceIds: ['w1', 'nope'] } }, workspaces).ok).toBe(false)
    expect(validateSettingsInput({ workspaceScope: { workspaceIds: [] } }, workspaces).ok).toBe(false)
    expect(validateSettingsInput({ workspaceScope: { workspaceIds: 'w1' } }, workspaces).ok).toBe(false)
    expect(validateSettingsInput({ workspaceScope: { workspaceIds: ['w1'] } }, []).ok).toBe(false)
    expect(validateSettingsInput({}, workspaces).ok).toBe(false)
    expect(validateSettingsInput('nonsense', workspaces).ok).toBe(false)
  })
})
