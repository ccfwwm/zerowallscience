import * as NativeExecutor from '@deepseek-ai/dsh-tool-executor-native'
import { Context, Service } from '@deepseek-ai/cordis'
import { join } from 'node:path'
import { apply } from '../src/host/index.js'
import { McpConfigurationStoreService } from '../src/host/configuration-store.js'
import { ToolExecutionPipeline } from '@deepseek-ai/dsh-tools/pipeline'
import type { ToolExecutionInput } from '@deepseek-ai/dsh-tools'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'

/** Mount the projection registry required by the test system-prompt service. */
export async function mountSystemPrompt(ctx: Context): Promise<void> {
  await ctx.plugin(SessionProjectionRegistry).await()
  await ctx.plugin(SystemPrompt).await()
}

class MemoryCredentials extends Service {
  constructor(ctx: Context) { super(ctx, 'credentials') }
  store() { return { get: async () => undefined, set: async () => {}, delete: async () => {} } }
}
export const Store = { apply(ctx: Context) { ctx.provide('zerowallMcpConfigurationStore', new McpConfigurationStoreService(ctx, process.env.ZEROWALL_RESEARCH_DB ?? join(process.env.DSH_HOME!, 'research.sqlite'))) } }
export const Mcp = { async apply(ctx: Context, config: { toolLoading?: 'all' | 'on-demand' } = { toolLoading: 'all' }) { await ctx.plugin(NativeExecutor).await(); if (!ctx.get('credentials')) await ctx.plugin(MemoryCredentials).await(); await apply(ctx, config) } }
export async function executeTool(ctx: Context, input: ToolExecutionInput) {
 const pipeline = new ToolExecutionPipeline(ctx), prepared = await pipeline.prepare(input)
 return pipeline.complete(prepared.exec, prepared.kind === 'dispatch' ? await pipeline.dispatch(prepared.exec) : prepared)
}
