import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { agentEvents } from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { ToolCallId, createToolResultMessage } from '@deepseek-ai/dsh-llm'
import { createScope } from '@deepseek-ai/dsh-scope'
import type { Scope } from '@deepseek-ai/dsh-scope'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import * as ProgressiveTools from '../src/index.js'
import type { Config as ProgressiveConfig } from '../src/index.js'

const signal = new AbortController().signal

function replayNestedSession(session: Session, legacy: boolean): Session {
  const events = session.snapshotEvents().map(event => legacy && event.type === 'tool/ptc-dispatch'
    ? { ...event, type: 'tool/code-dispatch', ignorable: true } as unknown as SessionEvent
    : event)
  return Session.create(session.id, events)
}
function tool(name: string) {
  return defineTool({
    name,
    description: `${name} fixture`,
    parameters: {},
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    execute: async () => `ran:${name}`,
  })
}

async function setup(
  session = Session.create(SessionId('progressive-agent')),
  overrides: ProgressiveConfig = {},
) {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt, {})
  await ctx.plugin(ToolRuntime)
  for (const name of ['browser_open', 'browser_click', 'db_query', 'skill', 'ask_user_question']) {
    ctx.tools.register(tool(name))
  }
  const plugin = ctx.plugin(ProgressiveTools, {
    groups: [
      { id: 'browser', include: ['browser_*'], description: 'Browser tools' },
      { id: 'database', include: ['db_*'], description: 'Database tools' },
    ],
    maxActiveGroups: 1,
    maxActiveToolTokens: 10_000,
    retentionTurns: 10,
    ...overrides,
  })
  await plugin

  const agent = {} as Agent
  let scope!: Scope
  await ctx.plugin(Object.assign((inner: Context) => {
    scope = createScope(inner, agent)
  }, { inject: ['tools', 'systemPrompt'] }))
  Object.assign(agent, {
    id: session.id,
    session,
    ctx: scope.ctx,
  })
  scope.ctx.tools.register(tool('report'))
  return { agent, ctx, plugin, scope }
}

async function preStep(ctx: Context, agent: Agent, turn: number, step: number): Promise<void> {
  await agentEvents(ctx, agent).waterfall(
    'agent/pre-step',
    { messages: [], turn, step, signal },
    async () => ({ kind: 'enter', messages: [] }),
  )
}

async function assemble(ctx: Context, agent: Agent) {
  return ctx.systemPrompt.assemble({ scope: agent, agent, signal })
}

async function execute(ctx: Context, agent: Agent, name: string, argumentsValue: unknown, callId: string) {
  return ctx.tools.execute({
    signal,
    callId: ToolCallId(callId),
    name,
    arguments: argumentsValue,
    agent,
  })
}

describe('progressive tools plugin', () => {
  it('keeps registered filesystem tools on the first stable surface', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt, {})
    await ctx.plugin(ToolRuntime)
    for (const name of ['read', 'write', 'edit', 'glob', 'grep', 'browser_open', 'skill']) {
      ctx.tools.register(tool(name))
    }
    await ctx.plugin(ProgressiveTools)
    const { agent } = await (async () => {
      const session = Session.create(SessionId('fs-visible-agent'))
      const agent = {} as Agent
      await ctx.plugin(Object.assign((inner: Context) => {
        Object.assign(agent, { id: session.id, session, ctx: createScope(inner, agent).ctx })
      }, { inject: ['tools', 'systemPrompt'] }))
      return { agent }
    })()
    const first = await assemble(ctx, agent)
    expect(first.tools.map(schema => schema.name).sort()).toEqual([
      'edit',
      'glob',
      'grep',
      'read',
      'skill',
      'tool_dispatch',
      'tool_search',
      'write',
    ])
    expect(first.tools.map(schema => schema.name)).not.toContain('browser_open')
  })

  it('tells the model not to search merely to prove a named tool is missing', async () => {
    const { agent, ctx } = await setup()
    const assembled = await assemble(ctx, agent)
    const text = assembled.sections.find(section => section.name === 'progressive-tools:discovery')?.text ?? ''
    expect(text).toContain('refused without searching')
    expect(text).toContain('needed capability class')
    expect(text).not.toContain('Do not claim a capability is unavailable before searching')
    expect(assembled.tools.find(schema => schema.name === 'tool_search')?.description)
      .toContain('refuse invented or uncallable names')
  })

  it('returns no schemas when an exact-name search misses the catalog', async () => {
    const { agent, ctx } = await setup()
    await assemble(ctx, agent)

    const missed = await execute(ctx, agent, 'tool_search', {
      query: 'definitely_not_a_real_tool_xyz',
    }, 'missing-name')
    expect(missed.isError).toBe(false)
    expect(missed.isError ? [] : (missed.value as { matches: unknown[] }).matches).toEqual([])
  })

  it('uses a minimal byte-stable surface on the first assembly and dispatches discovered tools', async () => {
    const { agent, ctx } = await setup()
    const policyNames: string[] = []
    ctx.on('tools/pre-execute', async (execution, next) => {
      policyNames.push(execution.name)
      return next()
    })
    const first = await assemble(ctx, agent)

    expect(first.tools.map(schema => schema.name).sort()).toEqual([
      'ask_user_question',
      'report',
      'skill',
      'tool_dispatch',
      'tool_search',
    ])
    expect(ctx.tools.schemas(agent).map(schema => schema.name)).toContain('browser_open')
    expect((await execute(ctx, agent, 'browser_open', {}, 'hidden')).isError).toBe(true)

    const search = await execute(ctx, agent, 'tool_search', { query: 'browser navigation' }, 'search')
    expect(search.isError).toBe(false)
    expect(search.isError ? [] : (search.value as { matches: { name: string }[] }).matches.map(match => match.name))
      .toContain('browser_open')

    const second = await assemble(ctx, agent)
    expect(second.tools).toEqual(first.tools)
    expect(second.sections).toEqual(first.sections)

    policyNames.length = 0
    const dispatched = await execute(ctx, agent, 'tool_dispatch', {
      name: 'browser_open',
      arguments: {},
    }, 'dispatch')
    expect(dispatched.isError).toBe(false)
    expect(dispatched.content).toEqual([{ type: 'text', text: 'ran:browser_open' }])
    expect(policyNames).toEqual(['tool_dispatch', 'browser_open'])
  })

  it('lists the deferred family catalog through the status action', async () => {
    const { agent, ctx } = await setup()
    await assemble(ctx, agent)

    const status = await execute(ctx, agent, 'tool_search', { action: 'status' }, 'status')
    expect(status.isError).toBe(false)
    const value = status.isError
      ? undefined
      : status.value as { groups: { id: string; tools: string[] }[]; matches: unknown[] }
    expect(value?.matches).toEqual([])
    expect(value?.groups.map(group => group.id)).toEqual(['browser', 'database'])
    expect(value?.groups.find(group => group.id === 'browser')?.tools).toEqual([
      'browser_open',
      'browser_click',
    ])
  })

  it('discovers whole families from one search so siblings dispatch without re-searching', async () => {
    const { agent, ctx } = await setup(undefined, { maxResults: 1 })
    await assemble(ctx, agent)

    const search = await execute(ctx, agent, 'tool_search', { query: 'browser navigation' }, 'family-search')
    expect(search.isError).toBe(false)
    const value = search.isError
      ? undefined
      : search.value as {
          matches: { name: string }[]
          families: { id: string; tools: { name: string; contract: string }[] }[]
        }
    expect(value?.matches).toHaveLength(1)
    expect(value?.families).toHaveLength(1)
    expect(value?.families[0]?.tools.map(tool => tool.name).sort()).toEqual(['browser_click', 'browser_open'])
    const loaded = value?.families[0]?.tools.find(tool => tool.name === value.matches[0]?.name)
    expect(loaded?.contract).toBe('schema')
    const siblingContract = value?.families[0]?.tools.find(tool => tool.name !== value.matches[0]?.name)
    expect(siblingContract?.contract).toBe('name-only')

    const sibling = value?.matches[0]?.name === 'browser_open' ? 'browser_click' : 'browser_open'
    const dispatched = await execute(ctx, agent, 'tool_dispatch', { name: sibling, arguments: {} }, 'family-dispatch')
    expect(dispatched.isError).toBe(false)
  })

  it('keeps status browse-only by default and recovers through an exact-name search', async () => {
    expect(ProgressiveTools.resolveConfig({}).statusGrantsDiscovery).toBe(false)
    const { agent, ctx } = await setup()
    await assemble(ctx, agent)
    await execute(ctx, agent, 'tool_search', { action: 'status' }, 'status-browse')

    const denied = await execute(ctx, agent, 'tool_dispatch', { name: 'db_query', arguments: {} }, 'status-denied')
    expect(denied.isError).toBe(true)
    expect(denied.isError ? denied.error.message : '').toContain('has not been discovered')
    expect(denied.isError ? denied.error.message : '').toContain('exact name')

    const exact = await execute(ctx, agent, 'tool_search', { query: 'db_query' }, 'exact-recovery')
    expect(exact.isError).toBe(false)
    expect(exact.isError ? [] : (exact.value as { matches: { name: string }[] }).matches.map(match => match.name))
      .toContain('db_query')

    const dispatched = await execute(ctx, agent, 'tool_dispatch', { name: 'db_query', arguments: {} }, 'exact-dispatch')
    expect(dispatched.isError).toBe(false)
  })

  it('lets one status listing unlock dispatch when statusGrantsDiscovery is enabled', async () => {
    const { agent, ctx } = await setup(undefined, { statusGrantsDiscovery: true })
    await assemble(ctx, agent)

    const before = await execute(ctx, agent, 'tool_dispatch', { name: 'db_query', arguments: {} }, 'grant-before')
    expect(before.isError).toBe(true)

    await execute(ctx, agent, 'tool_search', { action: 'status' }, 'grant-status')
    const after = await execute(ctx, agent, 'tool_dispatch', { name: 'db_query', arguments: {} }, 'grant-after')
    expect(after.isError).toBe(false)

    const direct = await execute(ctx, agent, 'db_query', {}, 'grant-direct')
    expect(direct.isError).toBe(true)
  })

  it('renders per-call discovery increments and keeps the cumulative list out of the text', async () => {
    const { agent, ctx } = await setup()
    await assemble(ctx, agent)

    const first = await execute(ctx, agent, 'tool_search', { query: 'browser navigation' }, 'increment-1')
    expect(first.isError).toBe(false)
    const firstText = first.isError ? '{}' : (first.content[0] as { type: 'text'; text: string }).text
    const firstRendered = JSON.parse(firstText) as Record<string, unknown>
    expect(firstRendered.allDiscoveredTools).toBeUndefined()
    expect(firstRendered.resume).toBeUndefined()
    expect(firstRendered.estimatedSavedTokens).toBeUndefined()
    const firstValue = first.isError ? undefined : first.value as { allDiscoveredTools?: unknown; families: { tools: { name: string }[] }[] }
    expect(firstValue?.allDiscoveredTools).toBeUndefined()
    expect(firstValue?.families[0]?.tools.map(tool => tool.name).sort()).toEqual(['browser_click', 'browser_open'])
    const firstMeta = first.isError ? undefined : first.meta as { discoveredTools: string[]; omittedDefinitionTokens: number }
    expect([...(firstMeta?.discoveredTools ?? [])].sort()).toEqual(['browser_click', 'browser_open'])
    expect(firstMeta?.omittedDefinitionTokens).toBeGreaterThan(0)

    const second = await execute(ctx, agent, 'tool_search', { query: 'browser navigation' }, 'increment-2')
    expect(second.isError).toBe(false)
    const secondText = second.isError ? '{}' : (second.content[0] as { type: 'text'; text: string }).text
    const secondRendered = JSON.parse(secondText) as { allDiscoveredTools?: unknown }
    expect(secondRendered.allDiscoveredTools).toBeUndefined()
    const secondValue = second.isError ? undefined : second.value as { allDiscoveredTools?: unknown }
    expect(secondValue?.allDiscoveredTools).toBeUndefined()
  })

  it('restores cumulative discovery from a stable search result projection', async () => {
    const session = Session.create(SessionId('stable-restored-meta'))
    const callId = ToolCallId('stable-restore-search')
    session.append('turn/start', { turn: 1 })
    session.append('step/start', { turn: 1, step: 1 })
    session.append('tool/call', {
      turn: 1,
      step: 1,
      callId,
      name: 'tool_search',
      arguments: JSON.stringify({ query: 'browser' }),
    })
    session.append('tool/result', {
      turn: 1,
      step: 1,
      message: createToolResultMessage({
        callId,
        content: [{ type: 'text', text: '{}' }],
        isError: false,
      }),
      meta: {
        protocol: 'dsh-progressive-tools/v2',
        action: 'search',
        discoveredTools: ['browser_click', 'browser_open'],
      },
    }, { surfaceOp: 'append' })
    session.append('step/end', { turn: 1, step: 1 })
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })

    const { agent, ctx } = await setup(session)
    const dispatched = await execute(ctx, agent, 'tool_dispatch', {
      name: 'browser_click',
      arguments: {},
    }, 'stable-restore-dispatch')
    expect(dispatched.isError).toBe(false)
  })

  it('unions incremental discovery records across replayed events', async () => {
    const session = Session.create(SessionId('stable-restored-increments'))
    session.append('turn/start', { turn: 1 })
    session.append('step/start', { turn: 1, step: 1 })
    for (const [index, names] of [['browser_open'], ['db_query']].entries()) {
      const callId = ToolCallId(`increment-replay-${index}`)
      session.append('tool/call', {
        turn: 1,
        step: 1,
        callId,
        name: 'tool_search',
        arguments: JSON.stringify({ query: names[0] }),
      })
      session.append('tool/result', {
        turn: 1,
        step: 1,
        message: createToolResultMessage({
          callId,
          content: [{
            type: 'text',
            text: JSON.stringify({
              protocol: 'dsh-progressive-tools/v2',
              action: 'search',
              discoveredTools: names,
            }),
          }],
          isError: false,
        }),
      }, { surfaceOp: 'append' })
    }
    session.append('step/end', { turn: 1, step: 1 })
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })

    const { agent, ctx } = await setup(session)
    for (const name of ['browser_open', 'db_query']) {
      const dispatched = await execute(ctx, agent, 'tool_dispatch', {
        name,
        arguments: {},
      }, `increment-dispatch-${name}`)
      expect(dispatched.isError).toBe(false)
    }
  })

  it('restores the status listing grant from replayed events', async () => {
    const session = Session.create(SessionId('stable-restored-status'))
    const callId = ToolCallId('stable-restore-status')
    session.append('turn/start', { turn: 1 })
    session.append('step/start', { turn: 1, step: 1 })
    session.append('tool/call', {
      turn: 1,
      step: 1,
      callId,
      name: 'tool_search',
      arguments: JSON.stringify({ action: 'status' }),
    })
    session.append('tool/result', {
      turn: 1,
      step: 1,
      message: createToolResultMessage({
        callId,
        content: [{ type: 'text', text: '{}' }],
        isError: false,
      }),
      meta: {
        protocol: 'dsh-progressive-tools/v2',
        action: 'status',
        discoveredTools: [],
      },
    }, { surfaceOp: 'append' })
    session.append('step/end', { turn: 1, step: 1 })
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })

    const { agent, ctx } = await setup(session, { statusGrantsDiscovery: true })
    const dispatched = await execute(ctx, agent, 'tool_dispatch', {
      name: 'db_query',
      arguments: {},
    }, 'status-restore-dispatch')
    expect(dispatched.isError).toBe(false)
  })

  it.each([false, true])('restores discovery from a nested stable dispatch result (legacy: %s)', async (legacy) => {
    const session = Session.create(SessionId('stable-restored-nested'))
    session.append('turn/start', { turn: 1 })
    session.append('step/start', { turn: 1, step: 1 })
    session.append('tool/ptc-dispatch', {
      rootCallId: ToolCallId('stable-root'),
      parentCallId: ToolCallId('stable-parent'),
      subCallId: ToolCallId('stable-nested-search'),
      name: 'tool_search',
      arguments: { query: 'browser' },
      isError: false,
      content: [{
        type: 'text',
        text: JSON.stringify({
          protocol: 'dsh-progressive-tools/v2',
          action: 'search',
          discoveredTools: ['browser_click'],
        }),
      }],
    })
    session.append('step/end', { turn: 1, step: 1 })
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })

    const { agent, ctx } = await setup(replayNestedSession(session, legacy))
    const dispatched = await execute(ctx, agent, 'tool_dispatch', {
      name: 'browser_click',
      arguments: {},
    }, 'stable-nested-dispatch')
    expect(dispatched.isError).toBe(false)
  })

  it('clamps oversized max_results instead of rejecting the search', async () => {
    const { agent, ctx } = await setup()
    await assemble(ctx, agent)

    const search = await execute(ctx, agent, 'tool_search', { query: 'browser', max_results: 99 }, 'clamp')
    expect(search.isError).toBe(false)
    const matches = search.isError ? [] : (search.value as { matches: unknown[] }).matches
    expect(matches.length).toBeLessThanOrEqual(2)
    expect(matches.length).toBeGreaterThan(0)
  })

  it('denies direct deferred calls arriving before any assembly or session start', async () => {
    const { agent, ctx } = await setup()

    const result = await execute(ctx, agent, 'browser_open', {}, 'pre-assembly')
    expect(result.isError).toBe(true)
    expect(result.isError ? result.error.message : '').toContain('deferred')
  })

  it('delegates parallel scheduling of dispatched calls to the target tool', async () => {
    const { agent, ctx } = await setup()
    ctx.tools.register(defineTool({
      name: 'browser_parallel',
      description: 'browser_parallel fixture',
      parameters: {},
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      isConcurrencySafe: () => true,
      execute: async () => 'ran:browser_parallel',
    }))
    await assemble(ctx, agent)

    expect(ctx.tools.executionMode({
      signal,
      callId: ToolCallId('mode-parallel'),
      name: 'tool_dispatch',
      arguments: { name: 'browser_parallel', arguments: {} },
      agent,
    })).toEqual({ kind: 'parallel' })
    expect(ctx.tools.executionMode({
      signal,
      callId: ToolCallId('mode-exclusive'),
      name: 'tool_dispatch',
      arguments: { name: 'browser_open', arguments: {} },
      agent,
    })).toEqual({ kind: 'exclusive' })
  })

  it('removes its prompt projection and tools when the plugin unloads', async () => {
    const { agent, ctx, plugin } = await setup()
    expect((await assemble(ctx, agent)).tools.map(schema => schema.name)).not.toContain('db_query')

    await plugin.dispose()

    expect((await assemble(ctx, agent)).tools.map(schema => schema.name)).toContain('db_query')
    expect(ctx.tools.schemas(agent).map(schema => schema.name)).not.toContain('tool_search')
    expect(ctx.tools.schemas(agent).map(schema => schema.name)).not.toContain('tool_dispatch')
  })

  it('keeps dynamic mode compatible while fixing first-assembly and immediate activation timing', async () => {
    const { agent, ctx } = await setup(undefined, { mode: 'dynamic' })
    const first = await assemble(ctx, agent)
    expect(first.tools.map(schema => schema.name)).not.toContain('browser_open')

    await execute(ctx, agent, 'tool_search', { query: 'browser navigation' }, 'dynamic-search')
    const second = await assemble(ctx, agent)
    expect(second.tools.map(schema => schema.name)).toContain('browser_open')
  })

  it('restores active families from a durable top-level result projection', async () => {
    const session = Session.create(SessionId('restored-direct'))
    const callId = ToolCallId('restore-search')
    session.append('turn/start', { turn: 1 })
    session.append('step/start', { turn: 1, step: 1 })
    session.append('tool/call', {
      turn: 1,
      step: 1,
      callId,
      name: 'tool_search',
      arguments: JSON.stringify({ query: 'browser' }),
    })
    session.append('tool/result', {
      turn: 1,
      step: 1,
      message: createToolResultMessage({
        callId,
        content: [{ type: 'text', text: '{}' }],
        isError: false,
      }),
      meta: {
        protocol: 'dsh-progressive-tools/v1',
        state: {
          activeGroups: [{ id: 'browser', activatedAtTurn: 1, lastUsedTurn: 1 }],
        },
      },
    }, { surfaceOp: 'append' })
    session.append('step/end', { turn: 1, step: 1 })
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })

    const { agent, ctx } = await setup(session, { mode: 'dynamic' })
    await preStep(ctx, agent, 2, 1)

    expect(ctx.tools.schemas(agent).map(schema => schema.name)).toContain('browser_open')
  })

  it.each([false, true])('restores active families from a nested dispatch result (legacy: %s)', async (legacy) => {
    const session = Session.create(SessionId('restored-nested'))
    session.append('turn/start', { turn: 1 })
    session.append('step/start', { turn: 1, step: 1 })
    session.append('tool/ptc-dispatch', {
      rootCallId: ToolCallId('root'),
      parentCallId: ToolCallId('parent'),
      subCallId: ToolCallId('nested-search'),
      name: 'tool_search',
      arguments: { query: 'browser' },
      isError: false,
      content: [{
        type: 'text',
        text: JSON.stringify({
          protocol: 'dsh-progressive-tools/v1',
          state: {
            activeGroups: [{ id: 'browser', activatedAtTurn: 1, lastUsedTurn: 1 }],
          },
        }),
      }],
    })
    session.append('step/end', { turn: 1, step: 1 })
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })

    const { agent, ctx } = await setup(replayNestedSession(session, legacy), { mode: 'dynamic' })
    await preStep(ctx, agent, 2, 1)

    expect(ctx.tools.schemas(agent).map(schema => schema.name)).toContain('browser_click')
  })

  it('activates configured families after a successful skill call', async () => {
    const { agent, ctx } = await setup(undefined, {
      mode: 'dynamic',
      groups: [
        { id: 'browser', include: ['browser_*'] },
        { id: 'database', include: ['db_*'] },
      ],
      skillBindings: [{ skill: 'browser-operations', groups: ['browser'] }],
    })
    await preStep(ctx, agent, 1, 1)
    await execute(ctx, agent, 'skill', { name: 'browser-operations' }, 'skill')
    await preStep(ctx, agent, 1, 2)

    expect(ctx.tools.schemas(agent).map(schema => schema.name)).toContain('browser_open')
  })

  it('refreshes active families after dynamic tool registration', async () => {
    const { agent, ctx } = await setup(undefined, { mode: 'dynamic' })
    await preStep(ctx, agent, 1, 1)
    await execute(ctx, agent, 'tool_search', { query: 'browser' }, 'activate')
    await preStep(ctx, agent, 1, 2)
    ctx.tools.register(tool('browser_new'))
    await preStep(ctx, agent, 1, 3)

    expect(ctx.tools.schemas(agent).map(schema => schema.name)).toContain('browser_new')
  })

  it('contains invalid search calls and releases state on agent disposal', async () => {
    const { agent, ctx } = await setup(undefined, { mode: 'dynamic' })
    await preStep(ctx, agent, 1, 1)

    expect((await execute(ctx, agent, 'tool_search', {}, 'empty-query')).isError).toBe(true)
    const clamped = await execute(ctx, agent, 'tool_search', { query: 'browser', max_results: 99 }, 'clamped-limit')
    expect(clamped.isError).toBe(false)
    expect((await ctx.tools.execute({
      signal,
      callId: ToolCallId('unscoped'),
      name: 'tool_search',
      arguments: { action: 'status' },
    })).isError).toBe(true)

    agentEvents(ctx, agent).emit('agent/disposed', {})
    expect(ctx.tools.schemas(agent).map(schema => schema.name)).toContain('db_query')
  })

  it('fails configuration with duplicate families or invalid limits', () => {
    expect(() => ProgressiveTools.resolveConfig({
      groups: [
        { id: 'same', include: ['a'] },
        { id: 'same', include: ['b'] },
      ],
    })).toThrow(/duplicate group id/)
    expect(() => ProgressiveTools.resolveConfig({
      activationGroupLimit: 2,
      maxActiveGroups: 1,
    })).toThrow(/must not exceed/)
    expect(() => ProgressiveTools.resolveConfig({ toolName: ' ' })).toThrow(/must not be empty/)
    expect(() => ProgressiveTools.resolveConfig({ groups: [{ id: 'empty', include: [] }] })).toThrow(/include must not be empty/)
    expect(() => ProgressiveTools.resolveConfig({ maxResults: 0 })).toThrow(/safe integer/)
    expect(() => ProgressiveTools.resolveConfig({ mode: 'unsupported' as 'dynamic' })).toThrow(/mode must/)
    expect(() => ProgressiveTools.resolveConfig({ toolName: 'same', dispatchToolName: 'same' })).toThrow(/must differ/)
    expect(() => ProgressiveTools.resolveConfig({
      groups: [{ id: 'browser', include: ['browser_*'] }],
      skillBindings: [{ skill: 'x', groups: ['missing'] }],
    })).toThrow(/unknown group/)
  })
})
