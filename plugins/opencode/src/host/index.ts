import type { Context } from '@deepseek-ai/cordis'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { ModelCatalog } from './catalog.ts'
import { OpenCode2DshAdapter, PROVIDER_ID } from './zen-adapter.ts'

export const name = 'opencode2dsh'
export const inject = ['llm', 'attachments']

export function apply(ctx: Context): void {
  const dataRoot = join(homedir(), '.opencode2dsh')
  const catalog = new ModelCatalog({
    cachePath: join(dataRoot, 'models-dev-cache.json'),
    statusPath: join(dataRoot, 'adapter-status.json'),
    logger: ctx.logger,
    onRefresh: () => ctx.emit('llm/adapters-updated'),
  })
  ctx.llm.registerAdapter([PROVIDER_ID], new OpenCode2DshAdapter(catalog, ctx.attachments))
  void catalog.start()
  ctx.effect(() => () => catalog.stop())
}

export { ModelCatalog, PROVIDER_ID, OpenCode2DshAdapter }
export * from './catalog.ts'
export * from './ids.ts'

export default { name, inject, apply }
