/** Execute a nested capability through the shared policy and settlement stages. */
import type { Context } from '@deepseek-ai/cordis'
import type { ToolExecutionInput, ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import { ToolExecutionPipeline } from '@deepseek-ai/dsh-tools/pipeline'

/**
 * Preserve parent correlation, cancellation, guards, and canonical output.
 * Host-owned nested R calls can use unconditional registrations discovered after
 * step admission. Current scope restrictions still apply; conditional tools must
 * remain in the original admitted set.
 * @param ctx - Context retaining the tool registry for this invocation.
 * @param input - Parsed invocation, including parent token and step tool set.
 * @returns Settled policy-checked result.
 */
export async function executeNestedTool(ctx: Context, input: ToolExecutionInput): Promise<ToolExecutionResult> {
  const pipeline = new ToolExecutionPipeline(ctx, {
    get: (name, scope, toolSet) => ctx.tools.executable(name, scope, toolSet)
      ?? (input.parent !== undefined && name.startsWith('mcp__zerowallrmcp__')
        ? ctx.tools.executable(name, scope) : undefined),
  })
  const prepared = await pipeline.prepare(input)
  const dispatched = prepared.kind === 'dispatch' ? await pipeline.dispatch(prepared.exec) : prepared
  return pipeline.complete(prepared.exec, dispatched)
}
