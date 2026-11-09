import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import remote from '../../lib/typert.remote-client.js'
import * as account from '../account/client/index.js'

export const inject = ['remote']

/** Mount this plugin's generated namespaces before its account UI. */
export async function apply(ctx: Context): Promise<void> {
  const unmount = await ctx.remote.$mount(remote)
  ctx.effect(() => unmount)
  ctx.plugin(account)
}
