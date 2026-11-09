import { Context } from '@deepseek-ai/cordis'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import { afterEach } from 'vitest'
const contexts: Context[] = []
afterEach(async () => { await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose())) })
/** Persistence owner for project-tool registration fixtures. */
export async function projectionHost() {
 const ctx = new Context(); contexts.push(ctx)
 await ctx.plugin(SessionProjectionRegistry).await()
 return ctx.sessionProjections
}
