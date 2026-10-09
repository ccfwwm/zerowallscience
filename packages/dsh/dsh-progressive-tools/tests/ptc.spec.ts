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
import * as ProgressiveTools from '../src/index.js'

// Exercise the real PTC bridge and log pipeline without a language interpreter.
class BindingRuntime extends PtcRuntime {
  readonly isolation = 'fixture'
  readonly language: string
  behavior: (request: PtcRunRequest) => Promise<PtcRunResult> = async () => ({ logs: [] })

  constructor(ctx: Context, config: { language: string }) {
    super(ctx)
    this.language = config.language
  }

  resolve(request: PtcRunRequest): PtcRunSpec {
    return { ...request, cwd: request.cwd ?? process.cwd(), timeoutMs: request.timeoutMs ?? null }
  }

  run(spec: PtcRunSpec): Promise<PtcRunResult> {
    return this.behavior(spec)
  }
}

describe.each(['ptc', 'both'] as const)('stable projection in %s mode', (mode) => {
  it.each(['typescript', 'python'])('preserves the %s SDK, routes calls, and restores after reload', async (language) => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt, {})
    await ctx.plugin(ToolRuntime, { mode })
    await ctx.plugin(BindingRuntime, { language })
    ctx.tools.register(defineTool({
      name: 'browser_open',
      description: 'Open a browser page',
      parameters: { url: { type: 'string', required: true } },
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
      execute: async args => `opened:${args.url}`,
    }))
    const config = { groups: [{ id: 'browser', include: ['browser_*'] }] }
    const plugin = await ctx.plugin(ProgressiveTools, config)
    const session = Session.create(SessionId(`ptc-${mode}-${language}`))
    session.append('turn/start', { turn: 1 })
    session.append('step/start', { turn: 1, step: 1 })
    const agent = { id: session.id, session } as Agent
    await ctx.plugin(Object.assign((inner: Context) => {
      Object.assign(agent, { ctx: createScope(inner, agent).ctx })
    }, { inject: ['tools', 'systemPrompt'] }))

    const assemble = () => ctx.systemPrompt.assemble({ agent, scope: agent })
    const first = await assemble()
    expect(first.tools.map(tool => tool.name).sort()).toEqual(mode === 'ptc'
      ? ['run_code']
      : ['run_code', 'tool_dispatch', 'tool_search'])
    const sdk = first.sections.find(section => section.name === 'tools:sdk')?.text
    expect(sdk).toContain('tool_search')
    expect(sdk).toContain('tool_dispatch')
    expect(sdk).not.toContain('browser_open')
    expect(sdk).toContain(language === 'python' ? 'async def' : 'declare const tools')

    const signal = new AbortController().signal
    const run = (id: string) => ctx.tools.execute({
      callId: ToolCallId(id), name: 'run_code',
      arguments: { code: 'fixture bindings', description: 'Exercise discovery and dispatch' },
      agent, signal,
    })
    const runtime = ctx.ptcRuntime as BindingRuntime
    runtime.behavior = async (request) => {
      const bindings = request.bindings[0]!.functions
      await expect(bindings.browser_open!({ url: 'example' })).rejects.toThrow('deferred')
      await bindings.tool_search!({ query: 'browser_open' })
      const value = await bindings.tool_dispatch!({ name: 'browser_open', arguments: { url: 'example' } })
      expect(value).toMatchObject({ tool: 'browser_open', value: 'opened:example' })
      expect(value).not.toHaveProperty('content')
      await expect(bindings.tool_dispatch!({ name: 'browser_open', arguments: {} })).rejects.toThrow()
      return { logs: [], value }
    }
    expect((await run('discover')).isError).toBe(false)
    const second = await assemble()
    expect(JSON.stringify(second.tools)).toBe(JSON.stringify(first.tools))
    expect(second.sections).toEqual(first.sections)
    expect(session.snapshotEvents().some(event => event.type === 'tool/ptc-dispatch'
      && event.data.name === 'tool_search' && !event.data.isError)).toBe(true)

    await plugin.dispose()
    const unloaded = await assemble()
    expect(unloaded.sections.find(section => section.name === 'tools:sdk')?.text).toContain('browser_open')
    await ctx.plugin(ProgressiveTools, config)
    runtime.behavior = async (request) => {
      const value = await request.bindings[0]!.functions.tool_dispatch!({
        name: 'browser_open', arguments: { url: 'restored' },
      })
      expect(value).toMatchObject({ value: 'opened:restored' })
      return { logs: [], value }
    }
    expect((await run('restored')).isError).toBe(false)
    expect((await assemble()).sections).toEqual(first.sections)
    session.append('step/end', { turn: 1, step: 1 })
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  })
})
