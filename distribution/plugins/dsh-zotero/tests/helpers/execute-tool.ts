import type { Context } from '@deepseek-ai/cordis'
import type { ToolExecutionInput } from '@deepseek-ai/dsh-tools'
import { ToolExecutionPipeline } from '@deepseek-ai/dsh-tools/pipeline'
/** Exercise the official policy stages for one registry-owned tool. */
export async function executeTool(ctx: Context, input: ToolExecutionInput) {
  const pipeline = new ToolExecutionPipeline(ctx)
  const prepared = await pipeline.prepare(input)
  const outcome = prepared.kind === 'dispatch' ? await pipeline.dispatch(prepared.exec) : prepared
  return pipeline.complete(prepared.exec, outcome)
}
