import * as NativeExecutor from '@deepseek-ai/dsh-tool-executor-native'
import { Context, Service } from '@deepseek-ai/cordis'
import { join } from 'node:path'
import { apply } from '../src/host/index.js'
import { McpConfigurationStoreService } from '../src/host/configuration-store.js'
import { ToolExecutionPipeline } from '@deepseek-ai/dsh-tools/pipeline'
import type { ToolExecutionInput } from '@deepseek-ai/dsh-tools'
class MemoryCredentials extends Service {
  constructor(ctx: Context) { super(ctx, 'credentials') }
  store() { return { get: async () => undefined, set: async () => {}, delete: async () => {} } }
}
export const Store = { apply(ctx: Context) { ctx.provide('zerowallMcpConfigurationStore', new McpConfigurationStoreService(ctx, process.env.ZEROWALL_RESEARCH_DB ?? join(process.env.DSH_HOME!, 'research.sqlite'))) } }
export const Mcp = { async apply(ctx: Context) { await ctx.plugin(NativeExecutor).await(); if (!ctx.get('credentials')) await ctx.plugin(MemoryCredentials).await(); await apply(ctx) } }
export async function executeTool(ctx: Context, input: ToolExecutionInput) {
 const pipeline = new ToolExecutionPipeline(ctx), prepared = await pipeline.prepare(input)
 return pipeline.complete(prepared.exec, prepared.kind === 'dispatch' ? await pipeline.dispatch(prepared.exec) : prepared)
}
