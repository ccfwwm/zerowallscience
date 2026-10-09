import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import PtcRuntime from '@deepseek-ai/dsh-ptc-runtime'
import type { PtcRunRequest, PtcRunResult, PtcRunSpec } from '@deepseek-ai/dsh-ptc-runtime'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { createScope } from '@deepseek-ai/dsh-scope'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import { HOST_DEFERRED_FIELD, probeDeferredProtocol } from '../src/deferred-protocol.js'
import { compareOfflineArms, redactedFixtureCost } from '../src/offline-eval.js'
import * as ProgressiveTools from '../src/index.js'

const signal = new AbortController().signal

function textTool(name: string, text = `ran:${name}`) {
  return defineTool({
    name,
    description: `${name} fixture`,
    parameters: {},
    output: {
      schema: { type: 'string' },
      render: () => [{ type: 'text', text }],
    },
    execute: async () => text,
  })
}

class BindingRuntime extends PtcRuntime {
  readonly isolation = 'fixture'
  readonly language: string
  behavior: (request: PtcRunRequest) => Promise<PtcRunResult> = async () => ({ logs: [] })

  constructor(ctx: Context, config: { language?: string }) {
    super(ctx)
    this.language = config.language ?? 'typescript'
  }

  resolve(request: PtcRunRequest): PtcRunSpec {
    return { ...request, cwd: request.cwd ?? process.cwd(), timeoutMs: request.timeoutMs ?? null }
  }

  run(spec: PtcRunSpec): Promise<PtcRunResult> {
    return this.behavior(spec)
  }
}

async function surface(options: {
  tools: ReturnType<typeof textTool>[]
  config: ProgressiveTools.Config
  mode?: 'native' | 'both'
}) {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt, {})
  await ctx.plugin(ToolRuntime, { mode: options.mode ?? 'native' })
  if (options.mode === 'both') await ctx.plugin(BindingRuntime, { language: 'typescript' })
  for (const tool of options.tools) ctx.tools.register(tool)
  await ctx.plugin(ProgressiveTools, {
    groups: [
      { id: 'browser', include: ['browser_*'], description: 'Browser tools' },
      { id: 'database', include: ['db_*'], description: 'Database tools' },
    ],
    ...options.config,
  })
  const session = Session.create(SessionId(`remaining-${Math.random().toString(16).slice(2)}`))
  const agent = {} as Agent
  await ctx.plugin(Object.assign((inner: Context) => {
    Object.assign(agent, { id: session.id, session, ctx: createScope(inner, agent).ctx })
  }, { inject: ['tools', 'systemPrompt'] }))
  const assembled = await ctx.systemPrompt.assemble({ scope: agent, agent, signal })
  return { ctx, agent, assembled }
}

describe('remaining cost work', () => {
  it('loads a small deferred catalog only when asked, and freezes that choice', async () => {
    const loaded = await surface({
      tools: [textTool('browser_open'), textTool('db_query')],
      config: { autoloadMaxTools: 5 },
    })
    const names = loaded.assembled.tools.map(tool => tool.name)
    expect(names).toContain('browser_open')
    expect(names).toContain('db_query')
    loaded.ctx.tools.register(textTool('browser_click'))
    const again = await loaded.ctx.systemPrompt.assemble({ scope: loaded.agent, agent: loaded.agent, signal })
    expect(again.tools.map(tool => tool.name)).not.toContain('browser_click')

    const hidden = await surface({
      tools: [textTool('browser_open'), textTool('db_query')],
      config: { autoloadMaxTools: 1 },
    })
    expect(hidden.assembled.tools.map(tool => tool.name)).not.toContain('browser_open')
    expect(ProgressiveTools.resolveConfig({}).autoloadMaxTools).toBe(0)
  })

  it('selects the coding surface at session start only for profile auto', async () => {
    const selected = await surface({
      tools: [textTool('bash'), textTool('browser_open')],
      config: { profile: 'auto' },
    })
    expect(selected.assembled.tools.map(tool => tool.name)).toContain('bash')
    expect(selected.assembled.tools.map(tool => tool.name)).not.toContain('await_shell')
    const plain = await surface({
      tools: [textTool('bash'), textTool('browser_open')],
      config: {},
    })
    expect(plain.assembled.tools.map(tool => tool.name)).not.toContain('bash')
  })

  it('budgets run_code model text and leaves the program value intact', async () => {
    const body = 'payload '.repeat(2_000)
    const hosted = await surface({
      tools: [textTool('browser_open', body)],
      config: { resultBudget: true, resultBudgetCharacters: 400 },
      mode: 'both',
    })
    const runtime = hosted.ctx.ptcRuntime as BindingRuntime
    runtime.behavior = async (request) => {
      const value = await request.bindings[0]!.functions.tool_dispatch!({
        name: 'browser_open',
        arguments: {},
      })
      expect(JSON.stringify(value).length).toBeGreaterThan(body.length)
      return { logs: [], value }
    }
    await hosted.ctx.tools.execute({
      signal,
      callId: ToolCallId('discover-code'),
      name: 'tool_search',
      arguments: { query: 'browser_open' },
      agent: hosted.agent,
    })
    const run = await hosted.ctx.tools.execute({
      signal,
      callId: ToolCallId('run-budget'),
      name: 'run_code',
      arguments: { code: 'return tools.tool_dispatch(...)', description: 'Dispatch a large result' },
      agent: hosted.agent,
    })
    expect(run.isError).toBe(false)
    if (run.isError) return
    const program = JSON.stringify(run.value)
    const model = run.content.map(block => block.type === 'text' ? block.text : '').join('')
    expect(program).toContain(body)
    expect(model.length).toBeLessThan(body.length)
    expect(model).toContain('tool_result_read')
  })

  it('reports an aborted dispatch without running the target body', async () => {
    let ran = false
    const ctx = new Context()
    await ctx.plugin(SystemPrompt, {})
    await ctx.plugin(ToolRuntime)
    ctx.tools.register(defineTool({
      name: 'browser_open',
      description: 'Open',
      parameters: {},
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
      execute: async () => {
        ran = true
        return 'ran'
      },
    }))
    await ctx.plugin(ProgressiveTools, {
      groups: [{ id: 'browser', include: ['browser_*'], description: 'Browser tools' }],
    })
    const session = Session.create(SessionId('remaining-abort'))
    const agent = {} as Agent
    await ctx.plugin(Object.assign((inner: Context) => {
      Object.assign(agent, { id: session.id, session, ctx: createScope(inner, agent).ctx })
    }, { inject: ['tools', 'systemPrompt'] }))
    await ctx.systemPrompt.assemble({ scope: agent, agent, signal })
    await ctx.tools.execute({
      signal,
      callId: ToolCallId('abort-search'),
      name: 'tool_search',
      arguments: { query: 'browser_open' },
      agent,
    })
    const aborted = new AbortController()
    aborted.abort()
    const result = await ctx.tools.execute({
      signal: aborted.signal,
      callId: ToolCallId('abort-dispatch'),
      name: 'tool_dispatch',
      arguments: { name: 'browser_open', arguments: {} },
      agent,
    })
    expect(result.isError).toBe(true)
    expect(ran).toBe(false)
  })

  it('forwards cancellation into a running deferred tool', async () => {
    let sawAbort = false
    let markReady: () => void = () => {}
    const ready = new Promise<void>(resolve => {
      markReady = resolve
    })
    const ctx = new Context()
    await ctx.plugin(SystemPrompt, {})
    await ctx.plugin(ToolRuntime)
    ctx.tools.register(defineTool({
      name: 'browser_open',
      description: 'Open',
      parameters: {},
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
      execute: async (_args, exec) => {
        markReady()
        await new Promise<void>(resolve => {
          if (exec.signal.aborted) {
            sawAbort = true
            resolve()
            return
          }
          exec.signal.addEventListener('abort', () => {
            sawAbort = true
            resolve()
          })
        })
        throw new Error('stopped')
      },
    }))
    await ctx.plugin(ProgressiveTools, {
      groups: [{ id: 'browser', include: ['browser_*'], description: 'Browser tools' }],
    })
    const session = Session.create(SessionId('remaining-cancel'))
    const agent = {} as Agent
    await ctx.plugin(Object.assign((inner: Context) => {
      Object.assign(agent, { id: session.id, session, ctx: createScope(inner, agent).ctx })
    }, { inject: ['tools', 'systemPrompt'] }))
    await ctx.systemPrompt.assemble({ scope: agent, agent, signal })
    await ctx.tools.execute({
      signal,
      callId: ToolCallId('cancel-search'),
      name: 'tool_search',
      arguments: { query: 'browser_open' },
      agent,
    })
    const controller = new AbortController()
    const pending = ctx.tools.execute({
      signal: controller.signal,
      callId: ToolCallId('cancel-dispatch'),
      name: 'tool_dispatch',
      arguments: { name: 'browser_open', arguments: {} },
      agent,
    })
    await ready
    controller.abort()
    const result = await pending
    expect(sawAbort).toBe(true)
    expect(result.isError).toBe(true)
  })

  it('keeps host deferLoading on the stable surface and off the deferred catalog', async () => {
    const hosted = await surface({
      tools: [
        defineTool({
          name: 'read',
          description: 'Read a file',
          deferLoading: true,
          parameters: {},
          output: {
            schema: { type: 'string' },
            render: () => [{ type: 'text', text: 'ok' }],
          },
          execute: async () => 'ok',
        }),
        defineTool({
          name: 'browser_open',
          description: 'Open a page',
          deferLoading: true,
          parameters: {},
          output: {
            schema: { type: 'string' },
            render: () => [{ type: 'text', text: 'ok' }],
          },
          execute: async () => 'ok',
        }),
      ],
      config: {},
    })
    const projected = hosted.ctx.tools.schemas(hosted.agent).find(tool => tool.name === 'browser_open')
    expect(projected?.deferLoading).toBe(true)
    const probe = probeDeferredProtocol(Object.keys(projected ?? {}))
    expect(probe).toMatchObject({ supported: true, field: HOST_DEFERRED_FIELD })
    expect(hosted.assembled.tools.map(tool => tool.name)).not.toContain('browser_open')
    expect(hosted.assembled.tools.find(tool => tool.name === 'read')).toMatchObject({ deferLoading: true })
    expect(probeDeferredProtocol(['name', 'description', 'parameters']).supported).toBe(false)
    expect(probeDeferredProtocol(['name', 'description', 'parameters', 'custom']).supported).toBe(false)
  })

  it('compares offline arms and keeps a redacted fixture cost unknown', () => {
    const comparison = compareOfflineArms([
      { group: 'A', label: 'plugin off', modelVisibleCharacters: 100, programValueCharacters: 100 },
      { group: 'B', label: 'legacy envelope', modelVisibleCharacters: 220, programValueCharacters: 220 },
      { group: 'C', label: 'deduped', modelVisibleCharacters: 110, programValueCharacters: 100 },
      { group: 'D', label: 'coding surface', modelVisibleCharacters: 80, programValueCharacters: 100 },
      { group: 'E', label: 'result budget', modelVisibleCharacters: 40, programValueCharacters: 100 },
    ])
    expect(comparison.paidRun).toBe('not-executed')
    expect(comparison.summaries.map(summary => summary.cost.reason)).toEqual([
      'unknown', 'unknown', 'unknown', 'unknown', 'unknown',
    ])
    expect(redactedFixtureCost('tests/fixtures/redacted-usage.json').reason).toBe('unknown')
  })
})
