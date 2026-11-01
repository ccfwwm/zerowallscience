import { afterEach, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { createScope } from '@deepseek-ai/dsh-scope'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createToolLoaders } from '../src/host/tool-loaders.ts'
import { installOnDemandTools } from '../src/host/on-demand-tools.ts'

const contexts: Context[] = []
afterEach(async () => { for (const ctx of contexts.splice(0)) await ctx.fiber.dispose() })
function latch() { let resolve!: () => void; const promise = new Promise<void>(accept => { resolve = accept }); return { promise, resolve } }

it('discovers exact local names without loading and coalesces concurrent calls across one group', async () => {
  const registered = new Set<string>(), registry = createToolLoaders(name => registered.has(name)), gate = latch()
  const load = vi.fn(async () => { await gate.promise; registered.add('ppt_create'); registered.add('ppt_edit') })
  registry.register({ id: 'ppt', names: ['ppt_create', 'ppt_edit'], description: 'PPT presentation tools', load })
  expect(registry.catalog().map(item => item.name)).toEqual(['ppt_create', 'ppt_edit'])
  expect(load).not.toHaveBeenCalled()
  const first = registry.ensure('ppt_create'), second = registry.ensure('ppt_edit')
  await Promise.resolve(); expect(load).toHaveBeenCalledOnce()
  gate.resolve()
  expect(await Promise.all([first, second])).toEqual([true, true])
  expect(await registry.ensure('ppt_create')).toBe(true)
  expect(load).toHaveBeenCalledOnce()
  expect(registry.catalog()).toEqual([])
})

it('returns actionable load errors, clears failed promises and verifies the requested name after loading', async () => {
  const registered = new Set<string>(), registry = createToolLoaders(name => registered.has(name))
  const load = vi.fn().mockRejectedValueOnce(new Error('provider-start-failed')).mockImplementationOnce(() => registered.add('fixture'))
  registry.register({ id: 'local-fixture', names: ['fixture'], description: 'fixture', load })
  await expect(registry.ensure('fixture')).rejects.toThrow('TOOL_LOAD_FAILED: local-fixture (fixture): provider-start-failed')
  expect(await registry.ensure('fixture')).toBe(true)
  expect(load).toHaveBeenCalledTimes(2)
  registry.register({ id: 'incomplete', names: ['absent'], description: 'incomplete', load: () => {} })
  await expect(registry.ensure('absent')).rejects.toThrow('TOOL_LOAD_INCOMPLETE')
  expect(await registry.ensure('not_installed')).toBe(false)
})

it('cancellation does not abandon shared registration or cancel another caller', async () => {
  const registered = new Set<string>(), registry = createToolLoaders(name => registered.has(name)), gate = latch(), controller = new AbortController()
  registry.register({ id: 'shared', names: ['fixture'], description: 'fixture', load: async () => { await gate.promise; registered.add('fixture') } })
  const first = registry.ensure('fixture', controller.signal), second = registry.ensure('fixture')
  controller.abort(new Error('caller-cancelled'))
  await expect(first).rejects.toThrow('caller-cancelled')
  // A caller can leave immediately while the group's registration is pending.
  gate.resolve()
  expect(await second).toBe(true)
})

it('does not discover a disposed provider or let conflicting declarations replace it', async () => {
  const registry = createToolLoaders(() => false), load = vi.fn()
  const remove = registry.register({ id: 'owner', names: ['fixture'], description: 'fixture', load })
  expect(() => registry.register({ id: 'other', names: ['fixture'], description: '', load })).toThrow('TOOL_LOADER_CONFLICT')
  expect(() => registry.register({ id: 'wildcard', names: ['ppt_*'], description: '', load })).toThrow('TOOL_LOADER_CONFLICT')
  remove(); expect(registry.catalog()).toEqual([])
  expect(await registry.ensure('fixture')).toBe(false)
  expect(load).not.toHaveBeenCalled()
})

async function runtime() {
  const ctx = new Context(); contexts.push(ctx)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  installOnDemandTools(ctx)
  const access = ctx.get('zerowallToolAccess') as { registerLoader: ReturnType<typeof createToolLoaders>['register'] }
  const run = (name: string, args = {}, agent?: Agent, signal = new AbortController().signal) => ctx.tools.execute({ name, arguments: args, agent, callId: ToolCallId(crypto.randomUUID()), signal })
  const body = vi.fn(async () => 'complete')
  const load = vi.fn(() => { ctx.tools.register(defineTool({ name: 'lazy_fixture', description: 'Lazy fixture', parameters: {}, output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] }, execute: body })) })
  access.registerLoader({ id: 'fixture', names: ['lazy_fixture'], description: 'Lazy fixture', load })
  return { ctx, run, load, body }
}

it('the real dispatch pipeline loads an absent tool before its first body and executes exactly once', async () => {
  const f = await runtime()
  expect(f.ctx.tools.get('lazy_fixture')).toBeUndefined()
  expect(await f.run('lazy_fixture')).toMatchObject({ isError: false, value: 'complete' })
  expect(f.load).toHaveBeenCalledOnce(); expect(f.body).toHaveBeenCalledOnce()
})

it('capability_search lists unloaded names and its explicit enable triggers registration', async () => {
  const f = await runtime(), found = await f.run('capability_search', { query: 'lazy fixture' })
  expect(found.isError).toBe(false)
  expect((found.value as any).matches).toContainEqual(expect.objectContaining({ name: 'lazy_fixture' }))
  expect(f.load).not.toHaveBeenCalled()
  expect((await f.run('capability_search', { enable: ['lazy_fixture'] })).isError).toBe(false)
  expect(f.load).toHaveBeenCalledOnce(); expect(f.body).not.toHaveBeenCalled()
})

it('a denied call never loads its provider or executes its body', async () => {
  const f = await runtime()
  f.ctx.on('tools/pre-execute', async () => ({ kind: 'deny', reason: 'fixture-permission-denied' }))
  expect(await f.run('lazy_fixture')).toMatchObject({ isError: true, error: { message: 'fixture-permission-denied' } })
  expect(f.load).not.toHaveBeenCalled(); expect(f.body).not.toHaveBeenCalled()
})

it('a monotonic guard prevents both lazy registration and the tool body', async () => {
  const f = await runtime()
  f.ctx.tools.guard(exec => exec.name === 'lazy_fixture' ? 'fixture-guard-denied' : undefined)
  expect(await f.run('lazy_fixture')).toMatchObject({ isError: true, error: { message: 'fixture-guard-denied' } })
  expect(f.load).not.toHaveBeenCalled(); expect(f.body).not.toHaveBeenCalled()
})

it('loads only after approval grants an ask and never loads when approval denies it', async () => {
  const f = await runtime(), agent = { id: 'approval-agent' } as Agent
  const request = vi.fn().mockResolvedValueOnce('rejected').mockResolvedValueOnce('allowed-once')
  f.ctx.provide('approval', { request } as never)
  f.ctx.on('tools/pre-execute', async () => ({ kind: 'ask', reason: 'fixture approval' }))
  expect((await f.run('lazy_fixture', {}, agent)).isError).toBe(true)
  expect(f.load).not.toHaveBeenCalled(); expect(f.body).not.toHaveBeenCalled()
  expect(await f.run('lazy_fixture', {}, agent)).toMatchObject({ isError: false, value: 'complete' })
  expect(request).toHaveBeenCalledTimes(2)
  expect(f.load).toHaveBeenCalledOnce(); expect(f.body).toHaveBeenCalledOnce()
})

async function scopedRuntime() {
  const f = await runtime()
  for (let index = 0; index < 105; index++) f.ctx.tools.register(defineTool({
    name: `padding_${index}`, description: 'padding', parameters: {},
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] }, execute: async () => 'padding',
  }))
  const agent = { id: 'scoped-agent' } as Agent
  let scoped!: ReturnType<typeof createScope>
  await f.ctx.plugin(Object.assign((inner: Context) => { scoped = createScope(inner, agent) }, { inject: ['tools', 'systemPrompt'] }))
  Object.assign(agent, { ctx: scoped.ctx })
  f.ctx.emit('agent/created', { agent } as never)
  return { ...f, agent, scoped }
}

it('restores only its own visibility restriction for internal dispatch and preserves independent deny rules', async () => {
  const f = await scopedRuntime()
  expect(f.ctx.tools.schemas(f.agent).map(tool => tool.name)).not.toContain('padding_2')
  expect(await f.run('padding_2', {}, f.agent)).toMatchObject({ isError: false, value: 'padding' })
  expect(f.ctx.tools.schemas(f.agent).map(tool => tool.name)).toContain('padding_2')
  expect(f.ctx.tools.schemas(f.agent).map(tool => tool.name)).not.toContain('padding_3')
  expect(await f.run('lazy_fixture', {}, f.agent)).toMatchObject({ isError: false, value: 'complete' })
  expect(f.load).toHaveBeenCalledOnce(); expect(f.body).toHaveBeenCalledOnce()
  const deny = f.scoped.ctx.tools.restrict({ deny: ['lazy_fixture'] })
  expect((await f.run('lazy_fixture', {}, f.agent)).isError).toBe(true)
  expect(f.body).toHaveBeenCalledOnce()
  expect(f.ctx.tools.get('lazy_fixture', f.agent)).toBeUndefined()
  deny()
  expect(await f.run('lazy_fixture', {}, f.agent)).toMatchObject({ isError: false, value: 'complete' })
  expect(f.body).toHaveBeenCalledTimes(2)
})

it('reports actual scoped schemas and never advertises an independently restricted tool as enabled', async () => {
  const f = await scopedRuntime()
  const first = await f.run('capability_search', { enable: ['lazy_fixture'] }, f.agent)
  expect(first.value).toMatchObject({ enabled: ['lazy_fixture'], schemas: [{ name: 'lazy_fixture', parameters: { type: 'object' } }] })
  const deny = f.scoped.ctx.tools.restrict({ deny: ['lazy_fixture'] })
  const second = await f.run('capability_search', { enable: ['lazy_fixture'] }, f.agent)
  expect(second.value).toMatchObject({ enabled: [], schemas: [], unavailable: ['lazy_fixture'] })
  expect(f.body).not.toHaveBeenCalled()
  expect((await f.run('lazy_fixture', {}, f.agent)).isError).toBe(true)
  deny()
  expect((await f.run('capability_search', { enable: ['lazy_fixture'] }, f.agent)).value).toMatchObject({ enabled: ['lazy_fixture'] })
})

it('discovers and activates the optional PPT service without invoking the skill first', async () => {
  const f = await runtime()
  const provider = Object.assign((inner: Context) => {
    inner.provide('dshPptMakerTools', { ensureRegistered: () => {
      inner.effect(() => inner.tools.register(defineTool({ name: 'ppt_create', description: 'Create a PPT', parameters: {},
        output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] }, execute: f.body })))
    } } as never)
  }, { inject: ['tools'] })
  const fiber = await f.ctx.plugin(provider)
  const found = await f.run('capability_search', { query: 'ppt_create' })
  expect((found.value as any).matches).toContainEqual(expect.objectContaining({ name: 'ppt_create' }))
  expect(f.ctx.tools.get('ppt_create')).toBeUndefined()
  expect(await f.run('ppt_create')).toMatchObject({ isError: false, value: 'complete' })
  expect(f.body).toHaveBeenCalledOnce()
  await fiber.dispose()
  expect(f.ctx.tools.get('ppt_create')).toBeUndefined()
  const after = await f.run('capability_search', { query: 'ppt_create' })
  expect((after.value as any).matches).not.toContainEqual(expect.objectContaining({ name: 'ppt_create' }))
})

it('keeps unknown names unknown without loading other installed groups', async () => {
  const f = await runtime()
  expect((await f.run('not_an_installed_tool')).isError).toBe(true)
  expect(f.load).not.toHaveBeenCalled(); expect(f.body).not.toHaveBeenCalled()
})

it('never executes a cancelled call while another call waits for the shared loader', async () => {
  const f = await runtime(), gate = latch(), controller = new AbortController()
  const access = f.ctx.get('zerowallToolAccess') as { registerLoader: ReturnType<typeof createToolLoaders>['register'] }
  const load = vi.fn(async () => { await gate.promise; f.ctx.tools.register(defineTool({ name: 'slow_fixture', description: 'slow fixture', parameters: {},
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] }, execute: f.body })) })
  access.registerLoader({ id: 'slow', names: ['slow_fixture'], description: 'slow fixture', load })
  const first = f.run('slow_fixture', {}, undefined, controller.signal), second = f.run('slow_fixture')
  await vi.waitFor(() => expect(load).toHaveBeenCalledOnce())
  controller.abort(new Error('caller-cancelled'))
  expect((await first).isError).toBe(true); expect(f.body).not.toHaveBeenCalled()
  gate.resolve()
  expect(await second).toMatchObject({ isError: false, value: 'complete' })
  expect(load).toHaveBeenCalledOnce(); expect(f.body).toHaveBeenCalledOnce()
})
