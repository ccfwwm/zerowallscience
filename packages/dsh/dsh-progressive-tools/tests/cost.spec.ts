import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { ToolCallId, createToolResultMessage } from '@deepseek-ai/dsh-llm'
import { createScope } from '@deepseek-ai/dsh-scope'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import { attributeTarget, buildBaselineReport, costFromUsage } from '../src/baseline.js'
import { definitionFingerprint, definitionStillVisible, fullDefinitionId } from '../src/projection.js'
import { summarizeGroup } from '../src/evaluate.js'
import * as ProgressiveTools from '../src/index.js'
import type { Config as ProgressiveConfig } from '../src/index.js'

const signal = new AbortController().signal

function textTool(name: string, text = `ran:${name}`, description = `${name} fixture`) {
  return defineTool({
    name,
    description,
    parameters: {},
    output: {
      schema: { type: 'string' },
      render: () => [{ type: 'text', text }],
    },
    execute: async () => text,
  })
}

async function setup(overrides: ProgressiveConfig = {}, tools: ReturnType<typeof textTool>[] = []) {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt, {})
  await ctx.plugin(ToolRuntime)
  for (const tool of tools) ctx.tools.register(tool)
  for (const name of ['browser_open', 'browser_click', 'db_query']) {
    if (ctx.tools.get(name) === undefined) ctx.tools.register(textTool(name))
  }
  await ctx.plugin(ProgressiveTools, {
    groups: [
      { id: 'browser', include: ['browser_*'], description: 'Browser tools' },
      { id: 'database', include: ['db_*'], description: 'Database tools' },
    ],
    ...overrides,
  })
  const session = Session.create(SessionId(`cost-${Math.random().toString(16).slice(2)}`))
  const agent = {} as Agent
  await ctx.plugin(Object.assign((inner: Context) => {
    Object.assign(agent, { id: session.id, session, ctx: createScope(inner, agent).ctx })
  }, { inject: ['tools', 'systemPrompt'] }))
  return { ctx, agent }
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

describe('search and dispatch cost', () => {
  it('returns only the exact tool for an exact name', async () => {
    const { ctx, agent } = await setup({ maxResults: 5 })
    await assemble(ctx, agent)
    const result = await execute(ctx, agent, 'tool_search', { query: 'db_query' }, 'exact-only')
    expect(result.isError).toBe(false)
    if (result.isError) return
    const matches = (result.value as { matches: { name: string; parameters?: unknown }[] }).matches
    expect(matches.map(match => match.name)).toEqual(['db_query'])
    expect(matches[0]?.parameters).toBeDefined()
  })

  it('keeps one family member table and omits cumulative discovery from the value', async () => {
    const { ctx, agent } = await setup()
    await assemble(ctx, agent)
    const result = await execute(ctx, agent, 'tool_search', { query: 'browser' }, 'family-once')
    expect(result.isError).toBe(false)
    if (result.isError) return
    const value = result.value as {
      families: { tools: { name: string }[] }[]
      matches: { groupTools?: unknown }[]
      allDiscoveredTools?: unknown
    }
    expect(value.families).toHaveLength(1)
    expect(value.matches.every(match => match.groupTools === undefined)).toBe(true)
    expect(value.allDiscoveredTools).toBeUndefined()
    const rendered = JSON.parse((result.content[0] as { text: string }).text) as { allDiscoveredTools?: unknown }
    expect(rendered.allDiscoveredTools).toBeUndefined()
  })

  it('returns an oversized definition with an explicit budget marker', async () => {
    const huge = 'x'.repeat(400)
    const { ctx, agent } = await setup({ maxResultCharacters: 80 }, [
      textTool('browser_open', 'ran:browser_open', huge),
    ])
    await assemble(ctx, agent)
    const result = await execute(ctx, agent, 'tool_search', { query: 'browser_open' }, 'oversize')
    expect(result.isError).toBe(false)
    if (result.isError) return
    const value = result.value as {
      matches: { name: string; description?: string }[]
      budget?: { singleDefinitionExceedsBudget: boolean }
    }
    expect(value.matches.map(match => match.name)).toEqual(['browser_open'])
    expect(value.matches[0]?.description).toBe(huge)
    expect(value.budget?.singleDefinitionExceedsBudget).toBe(true)
  })

  it('compacts a repeated definition and reloads it when asked', async () => {
    const { ctx, agent } = await setup()
    await assemble(ctx, agent)
    const first = await execute(ctx, agent, 'tool_search', { query: 'db_query' }, 'repeat-1')
    expect(first.isError).toBe(false)
    if (first.isError) return
    agent.session.append('turn/start', { turn: 1 })
    agent.session.append('step/start', { turn: 1, step: 1 })
    agent.session.append('tool/call', {
      turn: 1,
      step: 1,
      callId: ToolCallId('repeat-1'),
      name: 'tool_search',
      arguments: JSON.stringify({ query: 'db_query' }),
    })
    agent.session.append('tool/result', {
      turn: 1,
      step: 1,
      message: createToolResultMessage({
        callId: ToolCallId('repeat-1'),
        content: first.content,
        isError: false,
      }),
    }, { surfaceOp: 'append' })
    agent.session.append('step/end', { turn: 1, step: 1 })
    agent.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    const repeated = await execute(ctx, agent, 'tool_search', { query: 'db_query' }, 'repeat-2')
    expect(repeated.isError).toBe(false)
    if (repeated.isError) return
    expect((repeated.value as { matches: { loaded: string; parameters?: unknown }[] }).matches[0]?.loaded).toBe('repeat')
    expect((repeated.value as { matches: { parameters?: unknown }[] }).matches[0]?.parameters).toBeUndefined()
    const reloaded = await execute(ctx, agent, 'tool_search', { query: 'db_query', reload: true }, 'repeat-3')
    expect(reloaded.isError).toBe(false)
    if (reloaded.isError) return
    expect((reloaded.value as { matches: { loaded: string; parameters?: unknown }[] }).matches[0]?.loaded).toBe('full')
    expect((reloaded.value as { matches: { parameters?: unknown }[] }).matches[0]?.parameters).toBeDefined()
  })

  it('returns a full definition again when the prior schema is not in derived history', async () => {
    const { ctx, agent } = await setup({ repeatDefinitions: 'compact' })
    await assemble(ctx, agent)
    const first = await execute(ctx, agent, 'tool_search', { query: 'db_query' }, 'fresh-history')
    expect(first.isError).toBe(false)
    if (first.isError) return
    expect((first.value as { matches: { loaded: string }[] }).matches[0]?.loaded).toBe('full')
  })

  it('removes deferred guidance from the prompt and attaches it to the discovered tool', async () => {
    const { ctx, agent } = await setup()
    ctx.systemPrompt.section({
      name: 'tool:browser_open',
      order: 200,
      text: 'Open pages with an absolute URL.',
    })
    ctx.systemPrompt.section({
      name: 'safety:always',
      order: 10,
      text: 'Always keep approval boundaries.',
    })
    const assembled = await assemble(ctx, agent)
    expect(assembled.sections.some(section => section.name === 'tool:browser_open')).toBe(false)
    expect(assembled.sections.some(section => section.name === 'safety:always')).toBe(true)
    const result = await execute(ctx, agent, 'tool_search', { query: 'browser_open' }, 'guidance')
    expect(result.isError).toBe(false)
    if (result.isError) return
    const match = (result.value as { matches: { guidance?: string }[] }).matches[0]
    expect(match?.guidance).toContain('absolute URL')
  })

  it('shows target content once for a direct dispatch and omits it from the program value', async () => {
    const { ctx, agent } = await setup()
    await assemble(ctx, agent)
    await execute(ctx, agent, 'tool_search', { query: 'browser_open' }, 'dispatch-search')
    const dispatched = await execute(ctx, agent, 'tool_dispatch', {
      name: 'browser_open',
      arguments: {},
    }, 'dispatch-once')
    expect(dispatched.isError).toBe(false)
    if (dispatched.isError) return
    expect(dispatched.value).toEqual({
      protocol: 'dsh-progressive-tools/dispatch-v2',
      tool: 'browser_open',
      value: 'ran:browser_open',
    })
    expect(JSON.stringify(dispatched.value)).not.toContain('ran:browser_openran')
    expect((dispatched.content[0] as { text: string }).text).toBe('ran:browser_open')
  })

  it('preserves non-text blocks and target errors', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt, {})
    await ctx.plugin(ToolRuntime)
    ctx.tools.register(defineTool({
      name: 'browser_open',
      description: 'Open',
      parameters: {},
      output: {
        schema: { type: 'string' },
        render: () => [
          { type: 'text', text: 'opened' },
          { type: 'reasoning', text: 'kept' },
        ],
      },
      execute: async () => 'opened',
    }))
    ctx.tools.register(textTool('browser_fail'))
    await ctx.plugin(ProgressiveTools, {
      groups: [{ id: 'browser', include: ['browser_*'], description: 'Browser tools' }],
    })
    const session = Session.create(SessionId('cost-blocks'))
    const agent = {} as Agent
    await ctx.plugin(Object.assign((inner: Context) => {
      Object.assign(agent, { id: session.id, session, ctx: createScope(inner, agent).ctx })
    }, { inject: ['tools', 'systemPrompt'] }))
    await assemble(ctx, agent)
    await execute(ctx, agent, 'tool_search', { query: 'browser' }, 'blocks-search')
    const opened = await execute(ctx, agent, 'tool_dispatch', { name: 'browser_open', arguments: {} }, 'blocks-open')
    expect(opened.isError).toBe(false)
    if (!opened.isError) {
      expect(opened.content.map(block => block.type)).toEqual(['text', 'reasoning'])
    }
    ctx.on('tools/pre-execute', async (execution, next) => {
      if (execution.name === 'browser_fail') return { kind: 'deny', reason: 'not approved' }
      return next()
    })
    await execute(ctx, agent, 'tool_search', { query: 'browser_fail' }, 'blocks-fail-search')
    const denied = await execute(ctx, agent, 'tool_dispatch', { name: 'browser_fail', arguments: {} }, 'blocks-deny')
    expect(denied.isError).toBe(true)
    if (denied.isError) expect(denied.error.message).toContain('not approved')
  })

  it('budgets direct dispatch text and reads the original by ref', async () => {
    const body = `${'line\n'.repeat(400)}FAIL assertion`
    const { ctx, agent } = await setup({ resultBudget: true, resultBudgetCharacters: 500 }, [
      textTool('browser_open', body, 'browser_open fixture'),
    ])
    const first = await assemble(ctx, agent)
    expect(first.tools.map(tool => tool.name)).toContain('tool_result_read')
    const second = await assemble(ctx, agent)
    expect(JSON.stringify(second.tools)).toBe(JSON.stringify(first.tools))
    await execute(ctx, agent, 'tool_search', { query: 'browser_open' }, 'budget-search')
    const dispatched = await execute(ctx, agent, 'tool_dispatch', {
      name: 'browser_open',
      arguments: {},
    }, 'budget-dispatch')
    expect(dispatched.isError).toBe(false)
    if (dispatched.isError) return
    const rendered = (dispatched.content[0] as { text: string }).text
    expect(rendered.length).toBeLessThan(body.length)
    expect(rendered).toContain('tool_result_read')
    const ref = rendered.match(/cost-[^:\s]+:browser_open:\d+:\d+/)?.[0]
    expect(ref).toBeDefined()
    const read = await execute(ctx, agent, 'tool_result_read', {
      ref,
      mode: 'search',
      keyword: 'FAIL',
    }, 'budget-read')
    expect(read.isError).toBe(false)
    if (!read.isError) expect(JSON.stringify(read.value)).toContain('FAIL')
    const other = Session.create(SessionId('cost-other-agent'))
    const outsider = {} as Agent
    await ctx.plugin(Object.assign((inner: Context) => {
      Object.assign(outsider, { id: other.id, session: other, ctx: createScope(inner, outsider).ctx })
    }, { inject: ['tools', 'systemPrompt'] }))
    const blocked = await execute(ctx, outsider, 'tool_result_read', { ref, mode: 'full' }, 'budget-other')
    expect(blocked.isError).toBe(true)
  })

  it('returns the original text when the result cannot be stored', async () => {
    const body = 'y'.repeat(1_000_001)
    const { ctx, agent } = await setup({ resultBudget: true, resultBudgetCharacters: 100 }, [
      textTool('browser_open', body),
    ])
    await assemble(ctx, agent)
    await execute(ctx, agent, 'tool_search', { query: 'browser_open' }, 'fallback-search')
    const dispatched = await execute(ctx, agent, 'tool_dispatch', {
      name: 'browser_open',
      arguments: {},
    }, 'fallback-dispatch')
    expect(dispatched.isError).toBe(false)
    if (dispatched.isError) return
    expect((dispatched.content[0] as { text: string }).text).toBe(body)
  })

  it('restores the previous dispatch envelope when legacy results are enabled', async () => {
    const { ctx, agent } = await setup({ legacyResults: true })
    await assemble(ctx, agent)
    const search = await execute(ctx, agent, 'tool_search', { query: 'browser_open' }, 'legacy-search')
    expect(search.isError).toBe(false)
    if (search.isError) return
    expect((search.value as { allDiscoveredTools?: string[] }).allDiscoveredTools).toBeDefined()
    expect((search.content[0] as { text: string }).text).not.toContain('allDiscoveredTools')
    const dispatched = await execute(ctx, agent, 'tool_dispatch', {
      name: 'browser_open',
      arguments: {},
    }, 'legacy-dispatch')
    expect(dispatched.isError).toBe(false)
    if (dispatched.isError) return
    expect(dispatched.value).toMatchObject({ protocol: 'dsh-progressive-tools/dispatch-v1', content: [{ type: 'text', text: 'ran:browser_open' }] })
  })

  it('adds a registered terminal tool for the coding profile without inventing names', async () => {
    const { ctx, agent } = await setup({ profile: 'coding' }, [textTool('bash', 'ok', 'Run a command')])
    const assembled = await assemble(ctx, agent)
    expect(assembled.tools.map(tool => tool.name)).toContain('bash')
    expect(assembled.tools.map(tool => tool.name)).not.toContain('await_shell')
    const explicit = await setup({
      profile: 'coding',
      alwaysVisible: ['skill'],
    }, [textTool('bash', 'ok', 'Run a command')])
    const pinned = await assemble(explicit.ctx, explicit.agent)
    expect(pinned.tools.map(tool => tool.name)).not.toContain('bash')
  })

  it('keeps the capability summary byte-stable and free of member lists', async () => {
    const { ctx, agent } = await setup()
    const first = await assemble(ctx, agent)
    const summary = first.sections.find(section => section.name === 'progressive-tools:capabilities')?.text ?? ''
    expect(summary).toContain('browser:')
    expect(summary).not.toContain('browser_open')
    await execute(ctx, agent, 'tool_search', { query: 'browser' }, 'summary-search')
    const second = await assemble(ctx, agent)
    expect(second.sections.find(section => section.name === 'progressive-tools:capabilities')?.text).toBe(summary)
    expect(JSON.stringify(second.tools)).toBe(JSON.stringify(first.tools))
  })
})

describe('offline cost accounting', () => {
  it('marks missing server usage as unknown and prices explicit usage', () => {
    expect(costFromUsage(undefined, undefined).reason).toBe('unknown')
    const priced = costFromUsage({
      source: 'server',
      inputTokens: 1_000_000,
      cachedInputTokens: 250_000,
      outputTokens: 1_000_000,
    }, {
      currency: 'USD',
      inputPerMillion: 2,
      cachedInputPerMillion: 0.5,
      outputPerMillion: 8,
    })
    expect(priced).toEqual({ currency: 'USD', amount: 9.625, reason: 'computed' })
    expect(attributeTarget(['run_code', 'tool_dispatch', 'bash'])).toBe('bash')
    const report = buildBaselineReport({
      pluginVersion: '0.7.0',
      hostVersion: '0.2.0-rc.1',
      config: { mode: 'stable-proxy' },
      catalogToolCount: 2,
      omittedDefinitionTokens: 10,
      requestText: 'hello',
      charactersPerToken: 4,
      traces: [{ kind: 'discovery', characters: 3 }, { kind: 'execution', targetTool: 'bash' }],
    })
    expect(report.requests[0]?.cost.reason).toBe('unknown')
    expect(report.omittedDefinitionNote).toContain('Not a net task saving')
    const summary = summarizeGroup('C', [{
      group: 'C',
      task: 'fixture',
      success: true,
      requests: 2,
      usage: { source: 'unknown' },
      searches: 1,
      repeatedDiscoveries: 0,
      parameterErrors: 0,
      compressionCharactersSaved: 10,
      rereadCharacters: 4,
    }], undefined)
    const previous = definitionFingerprint('db_query', 'old', {}, '')
    const next = definitionFingerprint('db_query', 'new', {}, '')
    expect(definitionStillVisible(`prefix ${fullDefinitionId('db_query', previous)}`, 'db_query', previous)).toBe(true)
    expect(definitionStillVisible(`prefix ${fullDefinitionId('db_query', previous)}`, 'db_query', next)).toBe(false)
    expect(summary.paidRun).toBe('not-executed')
    expect(summary.cost.reason).toBe('unknown')
  })
})
