import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import LlmRuntime, { ToolCallId } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjections from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools from '@deepseek-ai/dsh-tools'
import { mountAgentLoopTestHarness } from '@deepseek-ai/dsh-agent-loop-testkit'
import { expect, it, vi } from 'vitest'
import { SecretBrokerClient } from '@zerowall/dsh-plugin-ai-cloud/secrets'
import { Mcp, Store } from './runtime.js'

it.runIf(process.env.ZEROWALL_LIVE_WORKFLOW_TESTS === '1' && Boolean(process.env.R_PLATFORM_MCP_AUTHORIZATION))(
  'submits, polls and reads logs through the real Host workflow after late R discovery', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zerowall-workflow-live-'))
    const ctx = new Context()
    vi.stubEnv('DSH_HOME', root)
    vi.stubEnv('ZEROWALL_RESEARCH_DB', join(root, 'research.sqlite'))
    vi.stubEnv('ZEROWALL_DISABLE_DEFAULT_MCP', '1')
    const broker = vi.spyOn(SecretBrokerClient.prototype, 'get').mockImplementation(async name =>
      name === 'zerowall.mcp.rdatalinux_authorization' ? process.env.R_PLATFORM_MCP_AUTHORIZATION : undefined)
    try {
      for (const plugin of [LlmRuntime, SessionStore, SessionProjections, SystemPrompt, Tools, AgentRegistry]) await ctx.plugin(plugin).await()
      const harness = await mountAgentLoopTestHarness(ctx)
      await ctx.plugin(Store).await()
      ctx.zerowallMcpConfigurationStore.createMcpServer({ name: 'R live check', serverName: 'zerowallrmcp',
        transport: 'streamable-http', enabled: true, url: 'https://rmcp.chengxunkeji.cn/r-platform/mcp',
        headerRefs: { Authorization: 'R_PLATFORM_MCP_AUTHORIZATION' }, failOnStartupError: true })
      await ctx.plugin(Mcp, { toolLoading: 'on-demand' }).await()
      const agent = await harness.create(SessionId('workflow-route-live'), { provider: 'fixture', model: 'fixture' }, { cwd: root })
      const signal = AbortSignal.timeout(100_000)
      const admitted = await ctx.tools.resolve({ agent, modelSelection: { provider: 'fixture', model: 'fixture' }, signal })
      expect(admitted.view(agent).has('mcp__zerowallrmcp__r_runtime')).toBe(false)
      const invoke = async (argumentsValue: object) => {
        const batch = await ctx.tools.execute({ agent, signal, toolSet: admitted,
          calls: [{ type: 'tool-call', id: ToolCallId(`live-${Date.now()}`), name: 'research_workflow', arguments: JSON.stringify(argumentsValue) }],
        })
        const result = batch.results[0]!.result
        expect(result.isError, JSON.stringify({ content: result.content, servers: (await ctx.zerowallMcp.list()).map(server => ({
          state: server.runtimeState, error: server.runtimeError, tools: server.tools,
        })) })).toBe(false)
        if (result.isError || result.value === null || typeof result.value !== 'object') throw new Error('Workflow returned no object.')
        return result.value as Record<string, unknown>
      }
      let run = await invoke({ action: 'run', workflow_id: 'r.compute', operation: 'r.submit.script',
        arguments: { code: 'cat("ZEROWALL_HOST_ROUTE_OK\\n")', confirm: true }, request_id: `route-${Date.now()}` })
      expect(run.error).toBeNull()
      await expect.poll(async () => {
        run = await invoke({ action: 'status', run_id: run.run_id })
        return run.status
      }, { timeout: 60_000, interval: 1000 }).toBe('succeeded')
      const log = await invoke({ action: 'query', workflow_id: 'r.compute', operation: 'r.get.job.log',
        arguments: { job_id: run.remote_id } })
      expect(JSON.stringify(log)).toContain('ZEROWALL_HOST_ROUTE_OK')
      expect((await ctx.systemPrompt.assemble({ scope: agent })).tools.some(tool => tool.name === 'mcp__zerowallrmcp__r_runtime')).toBe(false)
      admitted.dispose()
    } finally {
      await ctx.fiber.dispose()
      broker.mockRestore()
      vi.unstubAllEnvs()
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    }
  }, 120_000,
)
