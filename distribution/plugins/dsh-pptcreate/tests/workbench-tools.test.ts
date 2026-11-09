import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { workbenchTools } from '../src/tools/workbench.js'
import type { ToolDef } from '../src/tools/shared.js'

let cwd: string
let registered: ToolDef
const exec = { agent: { session: { id: 'main' } } }
beforeEach(async () => { cwd = await mkdtemp(path.join(tmpdir(), 'ppt-workbench-')) })
afterEach(async () => { await rm(cwd, { recursive: true, force: true }) })

async function project(dir = 'deck') {
  await mkdir(path.join(cwd, dir), { recursive: true })
  await writeFile(path.join(cwd, dir, 'manifest.json'), JSON.stringify({ revision: 0 }))
}

function harness(headers: Record<string, { cwd: string; parentSession?: string; origin?: string }> = { main: { cwd } }) {
  const bridge = {
    registerProject: vi.fn((_id: string, _cwd: string, dir: string) => ({ key: `key:${dir}`, dir })),
    requestOpen: vi.fn()
  }
  const warn = vi.fn()
  const tools = workbenchTools({
    tools: { register: (def) => { registered = def } },
    sessions: { get: (id) => headers[id] ? { header: headers[id] } : undefined }
  }, async () => bridge, warn)
  const register = (name: string, execute: ToolDef['execute'] = async () => ({ ok: true })) => tools.register({
    name, execute, description: '', parameters: {}, output: { schema: {}, render: () => [] }
  })
  return { bridge, warn, register }
}

describe('automatic workbench project binding', () => {
  it('opens an existing project before an expensive render starts, once per active project', async () => {
    await project()
    const { bridge, register } = harness()
    register('ppt_render', async () => {
      expect(bridge.requestOpen).toHaveBeenCalledWith('main', 'key:deck')
      return { ok: true }
    })
    await registered.execute({ dir: 'deck' }, exec)
    await registered.execute({ dir: 'deck' }, exec)
    expect(bridge.requestOpen).toHaveBeenCalledTimes(1)
  })

  it('waits for a successful create, so a missing project cannot become active', async () => {
    const { bridge, register } = harness()
    register('ppt_create', async () => {
      expect(bridge.requestOpen).not.toHaveBeenCalled()
      await project()
      return { ok: true }
    })
    await registered.execute({ dir: 'deck' }, exec)
    expect(bridge.requestOpen).toHaveBeenCalledWith('main', 'key:deck')
  })

  it('does not register a failed create or opt-out import', async () => {
    await project()
    const { bridge, register } = harness()
    register('ppt_create', async () => ({ ok: false }))
    await registered.execute({ dir: 'deck' }, exec)
    register('ppt_import', async () => ({ ok: true, projectDir: 'deck' }))
    await registered.execute({ open: false }, exec)
    expect(bridge.registerProject).not.toHaveBeenCalled()
  })

  it('mirrors nested subagent work to the visible parent without guessing a session', async () => {
    await project('子目录/deck')
    const { bridge, register } = harness({
      main: { cwd }, child: { cwd: path.join(cwd, '子目录'), origin: 'subagent', parentSession: 'main' }
    })
    register('ppt_edit')
    await registered.execute({ dir: 'deck' }, { agent: { session: { id: 'child' } } })
    expect(bridge.registerProject).toHaveBeenCalledWith('child', path.join(cwd, '子目录'), 'deck')
    expect(bridge.registerProject).toHaveBeenCalledWith('main', cwd, '子目录/deck')
    expect(bridge.requestOpen).toHaveBeenCalledWith('main', 'key:子目录/deck')
  })

  it('keeps user forks separate', async () => {
    await project()
    const { bridge, register } = harness({
      main: { cwd: path.join(cwd, 'other') }, child: { cwd, parentSession: 'main' }
    })
    register('ppt_edit')
    const childExec = { agent: { session: { id: 'child' } } }
    await registered.execute({ dir: 'deck' }, childExec)
    expect(bridge.registerProject.mock.calls.map((call) => call[0])).toEqual(['child'])
  })

  it('does not expose a subagent project outside the parent cwd', async () => {
    await project()
    const { bridge, register } = harness({
      main: { cwd: path.join(cwd, 'other') }, child: { cwd, origin: 'subagent', parentSession: 'main' }
    })
    register('ppt_edit')
    await registered.execute({ dir: 'deck' }, { agent: { session: { id: 'child' } } })
    expect(bridge.registerProject.mock.calls.map((call) => call[0])).toEqual(['child'])
  })

  it('keeps project execution successful when the optional workbench bridge fails', async () => {
    await project()
    const defs: ToolDef[] = []
    const warn = vi.fn()
    const tools = workbenchTools({ tools: { register: (def) => defs.push(def) }, sessions: { get: () => ({ header: { cwd } }) } },
      async () => { throw new Error('route not ready') }, warn)
    tools.register({ name: 'ppt_edit', description: '', parameters: {}, output: { schema: {}, render: () => [] }, execute: async () => ({ ok: true }) })
    expect(await defs[0].execute({ dir: 'deck' }, exec)).toEqual({ ok: true })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('route not ready'))
  })
})
