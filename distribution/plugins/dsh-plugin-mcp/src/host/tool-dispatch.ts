/** Execute a nested capability through the shared policy and settlement stages. */
import type { Context } from '@deepseek-ai/cordis'
import type { ToolExecutionInput, ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import { ToolExecutionPipeline } from '@deepseek-ai/dsh-tools/pipeline'

/**
 * Preserve parent correlation, admission, cancellation, and canonical output.
 * @param ctx - Context retaining the tool registry for this invocation.
 * @param input - Parsed invocation, including parent token and step tool set.
 * @returns Settled policy-checked result.
 */
export async function executeNestedTool(ctx: Context, input: ToolExecutionInput): Promise<ToolExecutionResult> {
  const pipeline = new ToolExecutionPipeline(ctx)
  const prepared = await pipeline.prepare(input)
  const dispatched = prepared.kind === 'dispatch' ? await pipeline.dispatch(prepared.exec) : prepared
  return pipeline.complete(prepared.exec, dispatched)
}
