import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { apply } from '../src/index.js'
import type { ToolDef } from '../src/tools/shared.js'
// The plain JS module is the same store imported by the packaged host bridge.
import * as store from '../plugin/host/store.mjs'

let cwd: string
let previousHome: string | undefined
beforeEach(async () => {
  cwd = await mkdtemp(path.join(tmpdir(), 'ppt-workbench-host-'))
  previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = path.join(cwd, '.dsh-test')
  store.__clearAllSessionsForTest()
})
afterEach(async () => {
  store.__clearAllSessionsForTest()
  if (previousHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previousHome
  await rm(cwd, { recursive: true, force: true })
})

describe('host apply automatic workbench wiring', () => {
  it('create opens the document without a separate ppt_open and subsequent edits do not reopen it', async () => {
    const defs = new Map<string, ToolDef>()
    const events = new Map<string, (...args: never[]) => void>()
    const disposers: Array<() => void> = []
    apply({
      tools: { register(def) { defs.set(def.name, def); return () => defs.delete(def.name) } },
      sessions: { get: () => ({ header: { cwd } }) },
      skills: { register: () => () => {} },
      webServer: { register: () => () => {} },
      on(event, handler) { events.set(event, handler); return () => events.delete(event) },
      effect(fn) { const off = fn(); if (off) disposers.push(off) },
    })
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
