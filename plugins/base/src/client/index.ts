import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { UpdateButton } from './UpdateButton.tsx'
import type {} from './desktop-api.js'
import { en, NS, zh, type ZeroWallKey } from './locales.js'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { zerowallRemoteContributions } from './remote-contributions.generated.ts'
import { registerZeroWallBrand } from './Brand.tsx'
import { GithubButton } from './GithubButton.tsx'
import { WechatStatusButton } from './WechatStatusButton.tsx'
import { AboutSection } from './AboutSection.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { zerowall: ZeroWallKey }
}

export { en, NS, zh, type ZeroWallKey } from './locales.js'
export { unwrapRemoteResult } from './remote-result.js'

export const inject = ['slots', 'locale', 'remote', 'theme']

function applyDefaultLightTheme(ctx: ClientContext): void {
  const theme = (ctx as any).theme as { getTheme?: () => { preference?: string; themes?: Array<{ id: string }> }; setTheme?: (id: string) => void } | undefined
  if (theme?.getTheme === undefined || theme.setTheme === undefined || typeof window === 'undefined') return
  // Dream Skin persists the user's choice. Only seed light when there is no
  // local preference at all; a later manual choice is never overwritten.
  const hasUserPreference = ['dsh-dream-skin:skin', 'dsh-theme-preference', 'dsh-ui-theme:preference']
    .some(key => window.localStorage.getItem(key) !== null)
  if (hasUserPreference) return
  const snapshot = theme.getTheme()
  if (snapshot.preference !== 'system' && snapshot.preference !== undefined) return
  if (snapshot.themes?.some(item => item.id === 'light')) theme.setTheme('light')
}

export async function apply(ctx: ClientContext): Promise<void> {
  // Register the shell-level brand before any remote contract is mounted.
  // Remote contribution arrival is allowed to be slower (or unavailable in
  // an offline first launch) and must not leave the entire UI on DSH's
  // fallback branding while it is pending.
  registerZeroWallBrand(ctx)
  applyDefaultLightTheme(ctx)
  // Remote contributions can also be discovered through an installed feature
  // package. Deduplicate descriptor IDs at the single assembly point so a
  // second copy cannot abort client startup with "direct method already
  // mounted".
  const mounted = new Set<string>()
  for (const contribution of zerowallRemoteContributions) {
    const descriptors = contribution.descriptors.filter((descriptor) => {
      if (mounted.has(descriptor.id)) return false
      mounted.add(descriptor.id)
      return true
    })
    if (descriptors.length === 0) continue
    await ctx.remote.$mount({ ...contribution, descriptors })
  }
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'zerowall: dictionaries')
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action', id: 'zerowall-update', order: -10, locale: NS,
    inject: () => ({}),
  }, UpdateButton))
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action', id: 'zerowall-github', order: -100, locale: NS,
    inject: () => ({}),
  }, GithubButton))
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action', id: 'zerowall-wechat-status', order: -40, locale: NS,
    inject: () => ({}),
  }, WechatStatusButton))
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'zerowall-about', order: Number.MAX_SAFE_INTEGER, locale: NS, label: () => ctx.locale.bind(NS)('about.nav'),
  }, AboutSection))
}
