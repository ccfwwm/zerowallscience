import { Context } from '@deepseek-ai/cordis'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { mountSystemPrompt } from './runtime.js'
import Tools, { defineTool } from '@deepseek-ai/dsh-tools'
import * as NativeExecutor from '@deepseek-ai/dsh-tool-executor-native'
import { createScope } from '@deepseek-ai/dsh-scope'
import { afterEach, expect, it } from 'vitest'
import { executeNestedTool } from '../src/host/tool-dispatch.js'

const contexts: Context[] = []
afterEach(async () => { for (const ctx of contexts.splice(0)) await ctx.fiber.dispose() })

it('routes a Host workflow to R tools discovered after admission, retaining guards and restrictions', async () => {
  const ctx = new Context()
  contexts.push(ctx)
  await mountSystemPrompt(ctx)
  await ctx.plugin(Tools)
  await ctx.plugin(NativeExecutor)
  const target = 'mcp__zerowallrmcp__r_runtime'
  const forwarded: string[] = []
  let late = false
  let guardCalls = 0
  ctx.tools.guard(exec => { if (exec.name === target) guardCalls += 1 })
  ctx.tools.register(defineTool({
    name: 'research_workflow', description: 'Host workflow.', parameters: { operation: { type: 'string', required: true } },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    execute: async (args, exec) => {
      if (!late) {
        late = true
        ctx.tools.register(defineTool({
          name: target, description: 'Live R runtime.', parameters: { action: { type: 'string', required: true } },
          output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
          execute: async args => { forwarded.push(args.action); return `${args.action}:OK` },
        }))
      }
      const result = await executeNestedTool(ctx, { name: target, arguments: { action: args.operation },
        callId: ToolCallId(`${exec.callId}:runtime`), parent: exec.token, toolSet: exec.toolSet,
        agent: exec.agent, signal: exec.signal, rootCallId: exec.callId,
      })
      if (result.isError) throw new Error(result.content.map(block => block.type === 'text' ? block.text : '').join(''))
      return String(result.value)
    },
  }))
  const initial = new Map(ctx.tools.definitions().map(tool => [tool.name, tool]))
  const admission = { dispose() {}, view: () => initial }
  for (const operation of ['r.submit.script', 'r.get.job', 'r.get.job.log']) {
    const result = await ctx.tools.execute({ signal: new AbortController().signal, toolSet: admission,
      calls: [{ type: 'tool-call', id: ToolCallId(operation), name: 'research_workflow', arguments: JSON.stringify({ operation }) }],
    })
    expect(result.results[0]?.result).toMatchObject({ isError: false, value: `${operation}:OK` })
  }
  expect(forwarded).toEqual(['r.submit.script', 'r.get.job', 'r.get.job.log'])
  expect(guardCalls).toBe(3)
  const key = {}
  const scope = createScope(ctx, key)
  await scope.ctx.inject(['tools'], inner => { inner.tools.restrict({ deny: [target] }) }).await()
  const denied = await executeNestedTool(ctx, { name: target, arguments: { action: 'r.submit.script' },
    agent: key as never, parent: {} as never, toolSet: admission, callId: ToolCallId('denied'), signal: new AbortController().signal,
  })
  expect(denied.isError).toBe(true)
  expect(forwarded).toHaveLength(3)
  await scope.dispose()
  const conditional = 'mcp__zerowallrmcp__conditional'
  let conditionalCalls = 0
  ctx.tools.register(defineTool({
    name: conditional, description: 'Conditional R capability.', parameters: {},
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    execute: async () => { conditionalCalls += 1; return 'unexpected' },
  }), { when: () => true })
  const notAdmitted = await executeNestedTool(ctx, { name: conditional, arguments: {},
    parent: {} as never, toolSet: admission, callId: ToolCallId('conditional'), signal: new AbortController().signal,
  })
  expect(notAdmitted.isError).toBe(true)
  expect(conditionalCalls).toBe(0)
})
