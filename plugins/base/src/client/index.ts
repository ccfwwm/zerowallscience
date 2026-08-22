import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { UpdateButton } from './UpdateButton.tsx'
import type {} from './desktop-api.js'
import { en, NS, zh, type ZeroWallKey } from './locales.js'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { zerowallRemoteContributions } from './remote-contributions.generated.ts'
import { registerZeroWallBrand } from './Brand.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { zerowall: ZeroWallKey }
}

export { en, NS, zh, type ZeroWallKey } from './locales.js'
export { unwrapRemoteResult } from './remote-result.js'

export const inject = ['slots', 'locale', 'remote']

export async function apply(ctx: ClientContext): Promise<void> {
  // Register the shell-level brand before any remote contract is mounted.
  // Remote contribution arrival is allowed to be slower (or unavailable in
  // an offline first launch) and must not leave the entire UI on DSH's
  // fallback branding while it is pending.
  registerZeroWallBrand(ctx)
  for (const contribution of zerowallRemoteContributions) await ctx.remote.$mount(contribution)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'zerowall: dictionaries')
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action', id: 'zerowall-update', order: -30, locale: NS,
    inject: () => ({}),
  }, UpdateButton))
}
