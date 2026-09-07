import { afterEach, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import * as registry from '../src/registry.ts'
import * as policy from '../src/policy.ts'
import * as invoke from '../src/invoke.ts'
import * as search from '../src/search.ts'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import { createUserMessage } from '@deepseek-ai/dsh-llm'

const roots: Context[] = []
afterEach(async () => { for (const root of roots.splice(0)) await root.fiber.dispose() })

function agent(ctx: Context, events: any[] = []): Agent {
  return { ctx, id: 'fixture', session: {
    header: { cwd: process.cwd() },
    snapshotEvents: () => events,
    append: (type: string, data: unknown) => events.push({ type, data }),
  } } as unknown as Agent
}

it('keeps the first request small and executes an exact capability without legacy enable tools', async () => {
  const ctx = new Context()
  roots.push(ctx)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(SkillRegistry)
  await ctx.plugin(registry, { catalogFile: '' })
  await ctx.plugin(policy, { tools: { 'on-demand': ['*'] }, skills: { 'on-demand': ['*'] } })
  await ctx.plugin(invoke)
  await ctx.plugin(search)
  let executed = 0
  for (let i = 0; i < 172; i++) ctx.tools.register(defineTool({
    name: `mcp__rmcp__rplatform__tool_${i}`,
    description: 'Scientific operation. '.repeat(120),
    parameters: { path: { type: 'string' } },
    output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    execute: async () => { executed++; return { ok: true } },
  }))
  const first = agent(ctx)
  const second = agent(ctx)
  const target = 'mcp__rmcp__rplatform__tool_0'
  const execute = (owner: Agent, name: string, args: unknown = {}) => ctx.tools.execute({
    agent: owner, name, arguments: args, callId: ToolCallId('test'), signal: new AbortController().signal,
  })
  const before = await ctx.systemPrompt.assemble({ scope: first })
  expect(before.tools.some(tool => tool.name.startsWith('mcp__'))).toBe(false)
  expect(ctx.tools.schemas(first).some(tool => tool.name.startsWith('mcp__'))).toBe(false)
  expect(Buffer.byteLength(JSON.stringify(before.tools))).toBeLessThan(6000)
  expect((await execute(first, target)).isError).toBe(true)
  expect(executed).toBe(0)
  const detail = await execute(first, 'capability_search', { id: target, kind: 'tool' })
  expect(detail.isError, JSON.stringify(detail)).toBe(false)
  const invoked = await execute(first, 'capability_execute', { id: target, kind: 'tool', args: {} })
  expect(invoked.isError, JSON.stringify(invoked)).toBe(false)
  const enabled = await ctx.systemPrompt.assemble({ scope: first })
  expect(enabled.tools.filter(tool => tool.name.startsWith('mcp__')).map(tool => tool.name)).toEqual([target])
  expect(ctx.tools.schemas(first).filter(tool => tool.name.startsWith('mcp__')).map(tool => tool.name)).toEqual([target])
  const result = await execute(first, target)
  expect(result.isError, JSON.stringify(result)).toBe(false)
  expect((await execute(second, target)).isError).toBe(true)
  const restored = agent(ctx, [...first.session.snapshotEvents()])
  await ctx.systemPrompt.assemble({ scope: restored })
  expect((await execute(restored, target)).isError).toBe(false)
  expect((await execute(first, 'meta_enable', { tools: [target] })).isError).toBe(true)
  expect((await execute(first, 'mcp_enable_tools', { tools: [target] })).isError).toBe(true)
  expect(executed).toBe(3)
  console.log(JSON.stringify({ catalogTools: 172, catalogSchemaBytes: Buffer.byteLength(JSON.stringify(ctx.tools.schemas())), initialSchemaBytes: Buffer.byteLength(JSON.stringify(before.tools)), enabledSchemaBytes: Buffer.byteLength(JSON.stringify(enabled.tools)) }))
})

it('hides a historical skill catalog from the request while retaining its log', async () => {
  const ctx = new Context()
  roots.push(ctx)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(SkillRegistry)
  await ctx.plugin(SessionStore)
  await ctx.plugin(registry, { catalogFile: '' })
  await ctx.plugin(policy, { tools: { 'on-demand': ['*'] }, skills: { 'on-demand': ['*'] } })
  const session = ctx.sessions.create(SessionId('catalog-replay'))
  const original = session.append('user/message', createUserMessage({
    content: [{ type: 'text', text: 'Old catalog '.repeat(10_000) }],
    source: { kind: 'skill-catalog', form: 'catalog', entries: [{ name: 'large-skill', description: 'Long description' }] },
  }), { surfaceOp: 'append' })
  const owner = { ctx, id: session.id, session } as Agent
  const decision = await ctx.waterfall('agent/pre-step', { agent: owner, signal: new AbortController().signal, turn: 1, step: 1 } as never,
    () => Promise.resolve({ kind: 'enter' as const, messages: [] }))
  expect(session.snapshotEvents().some(event => event.seq === original.seq)).toBe(true)
  expect(session.surface.nodes).toContain(original.seq)
  expect(decision.kind).toBe('enter')
  if (decision.kind !== 'enter') return
  expect(decision.messages).toHaveLength(0)
})
