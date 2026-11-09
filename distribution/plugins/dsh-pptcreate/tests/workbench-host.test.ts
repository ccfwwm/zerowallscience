import { projectionHost } from './support/host.js'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apply } from '../src/index.js'
import type { ToolDef } from '../src/tools/shared.js'
// The plain JS module is the same store imported by the packaged host bridge.
import * as store from '../plugin/host/store.mjs'

const fixture = vi.hoisted(() => ({ missingSkill: false }))
vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, readFile: (...args: Parameters<typeof actual.readFile>) => {
    if (fixture.missingSkill && String(args[0]).endsWith(`${path.sep}ppt-maker${path.sep}SKILL.md`)) {
      return Promise.reject(new Error('Bundled skill missing'))
    }
    return actual.readFile(...args)
  } }
})

let cwd: string
let previousHome: string | undefined
beforeEach(async () => {
  cwd = await mkdtemp(path.join(tmpdir(), 'ppt-workbench-host-'))
  previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = path.join(cwd, '.dsh-test')
  store.__clearAllSessionsForTest()
})
afterEach(async () => {
  fixture.missingSkill = false
  store.__clearAllSessionsForTest()
  if (previousHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previousHome
  await rm(cwd, { recursive: true, force: true })
})

describe('host apply automatic workbench wiring', () => {
  it('exposes the workbench route before readiness and unregisters it once', async () => {
    const disposers: Array<() => void> = []
    const unregister = vi.fn()
    const register = vi.fn(() => unregister)
    try {
      await apply({
        sessionProjections: await projectionHost(),
        tools: { register: () => () => {} },
        sessions: { get: () => ({ header: { cwd } }) },
        skills: { registerProvider: () => () => {} },
        webServer: { register },
        on: () => () => {},
        effect(fn) { const off = fn(); if (off) disposers.push(off) },
      } as never)
      expect(register).toHaveBeenCalledExactlyOnceWith({
        kind: 'prefix', path: '/ppt-maker/api', handler: expect.any(Function),
      })
    } finally {
      for (const off of disposers.reverse()) off()
    }
    expect(unregister).toHaveBeenCalledOnce()
  })

  it('fails loading when workbench registration fails', async () => {
    const disposers: Array<() => void> = []
    try {
      await expect(apply({
        sessionProjections: await projectionHost(),
        tools: { register: () => () => {} },
        sessions: { get: () => ({ header: { cwd } }) },
        skills: { registerProvider: () => () => {} },
        webServer: { register: () => { throw new Error('Route registration rejected') } },
        on: () => () => {},
        effect(fn) { const off = fn(); if (off) disposers.push(off) },
      } as never)).rejects.toThrow('Route registration rejected')
    } finally {
      for (const off of disposers.reverse()) off()
    }
  })

  it('reports missing bundled instructions before registering the plugin', async () => {
    fixture.missingSkill = true
    const registerProvider = vi.fn()
    const registerRoute = vi.fn()
    await expect(apply({ skills: { registerProvider }, webServer: { register: registerRoute } } as never))
      .rejects.toThrow('PPT workbench resources could not be loaded')
    expect(registerProvider).not.toHaveBeenCalled()
    expect(registerRoute).not.toHaveBeenCalled()
  })

  it('create opens the document without a separate ppt_open and subsequent edits do not reopen it', async () => {
    const defs = new Map<string, ToolDef>()
    const events = new Map<string, (...args: never[]) => void>()
    const disposers: Array<() => void> = []
    await apply({
      sessionProjections: await projectionHost(),
      tools: { register(def) { defs.set(def.name, def); return () => defs.delete(def.name) } },
      sessions: { get: () => ({ header: { cwd } }) },
      skills: { registerProvider: () => () => {} },
      webServer: { register: () => () => {} },
      on(event, handler) { events.set(event, handler); return () => events.delete(event) },
      effect(fn) { const off = fn(); if (off) disposers.push(off) },
    } as never)
    events.get('tools/result')?.({ name: 'skill', arguments: { name: 'ppt-maker' } } as never, { isError: false } as never)
    const exec = { agent: { session: { id: 'automatic-main' } } }
    try {
      expect(await defs.get('ppt_create')!.execute({ dir: 'deck', title: '自动打开测试' }, exec)).toMatchObject({ ok: true })
      const key = store.activeKey('automatic-main')
      expect(key).toBeTruthy()
      expect(store.listSessionProjects('automatic-main')).toEqual([{ key, dir: 'deck' }])
      expect(store.pendingOpenRequests('automatic-main')).toEqual([{ key, at: expect.any(Number) }])
      store.consumeOpenRequest('automatic-main', key)
      expect(await defs.get('ppt_edit')!.execute({ dir: 'deck', ops: [{ op: 'add_page', content: { elements: [] } }] }, exec)).toMatchObject({ ok: true })
      expect(store.pendingOpenRequests('automatic-main')).toEqual([])
      expect(await defs.get('ppt_open')!.execute({ dir: 'deck' }, exec)).toMatchObject({ ok: true, requested: true })
      expect(store.pendingOpenRequests('automatic-main')).toHaveLength(1)
    } finally {
      for (const off of disposers.reverse()) off()
    }
  })
})
