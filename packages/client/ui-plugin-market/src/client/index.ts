/**
 * Discover, browser half: the Plugins page tab that browses the plugin market indexes the user configures through the
 * `pluginMarket` Remote and installs an entry through the page's install dialog; entry pages show each version's
 * detail document.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: the ctx.remote Context merge, the forwarded events, and the `plugins.tab` slot declaration.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-plugin-manager/types'
import type {} from '@deepseek-ai/dsh-plugin-market/types'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import { DiscoverSection } from './DiscoverSection.tsx'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { createSkillCatalogController } from './skill-catalog-store.ts'
import { SkillCatalogTab, SkillCatalogUpdates, SkillCatalogFeedback, type SkillCatalogFace } from './SkillCatalog.tsx'
import { skillEn, skillZh } from './skill-locales.ts'
import { en, ja, es, fr, de, ru, pt, zh, type PluginMarketLocaleKey } from './locales.ts'
import { DiscoverController } from './market-store.ts'

export type { DiscoverFace, DiscoverState } from './market-store.ts'
export type { PluginMarketLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Discover tab copy. */
    'pluginMarket': PluginMarketLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'pluginMarket'

/** Services the section reads. */
export const inject = ['slots', 'locale', 'remote', 'remote.pluginMarket', 'remote.pluginRegistryProbe']

/**
 * Contribute Discover to the Plugins page and keep it current on Host changes.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt }), 'ui-plugin-market: dictionaries')
  const controller = new DiscoverController(ctx, () => document.baseURI)
  ctx.effect(() => () => { controller.dispose() }, 'ui-plugin-market: controller')
  ctx.effect(() => {
    const disposers = [
      ctx.remote.$on('plugin-market/changed', () => { controller.sourcesChanged() }),
      ctx.remote.$on('plugin-manager/changed', () => { controller.bundlesChanged() }),
      ctx.on('connection/reset', () => {
        controller.sourcesChanged()
        controller.detailsReset()
      }),
    ]
    return () => { for (const dispose of disposers) dispose() }
  }, 'ui-plugin-market: host invalidations')
  const face = controller.face(text => ctx.locale.resolveText(text))
  const t = ctx.locale.bind(NS)
  ctx.slots.inject('plugins.tab', () => ctx.slots.register({
    name: 'plugins.tab', id: 'discover', label: () => t('title'), locale: NS, inject: () => face,
  }, DiscoverSection))
  ctx.effect(() => ctx.locale.register('pluginMarket.skills', { en: skillEn, zh: skillZh }))
  const skills = createSkillCatalogController({
    read: async (refresh) => {
      const result = await ctx.remote.pluginMarket.readSkills(refresh)
      if (!result.ok) throw new Error(result.error.message)
      return result.value
    },
    install: async (id, version) => {
      const result = await ctx.remote.pluginMarket.installSkill(id, version)
      if (!result.ok) throw new Error(result.error.message)
      return result.value
    },
  })
  ctx.effect(() => skills.dispose)
  const skillFace = (): SkillCatalogFace => ({
    ...skills, hooks: { skills: skills.store }, resolveText: text => ctx.locale.resolveText({ ...text, en: text.en ?? '' }),
  })
  ctx.slots.inject('plugins.tab', () => ctx.slots.register({
    name: 'plugins.tab', id: 'skills', order: 20, label: () => ctx.locale.bind('pluginMarket.skills')('title'),
    locale: 'pluginMarket.skills', inject: skillFace,
  }, SkillCatalogTab))
  ctx.slots.inject('settings.updates.plugins', () => ctx.slots.register({
    name: 'settings.updates.plugins', id: 'market-skills', order: 20, locale: 'pluginMarket.skills', inject: skillFace,
  }, SkillCatalogUpdates))
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'market-skills-feedback', locale: 'pluginMarket.skills', inject: skillFace,
  }, SkillCatalogFeedback))
  ctx.inject(['updateCenter'], (scope) => {
    const status = createSnapshotStore({ available: 0, ready: false, busy: false, failed: false, checked: false })
    const publish = (): void => {
      const state = skills.store.getSnapshot()
      status.set({ available: state.catalog.entries.filter(row => row.status === 'update').length,
        ready: false, busy: state.busy, failed: state.catalog.error !== undefined, checked: state.checked })
    }
    scope.effect(() => skills.store.subscribe(publish))
    scope.effect(() => scope.updateCenter.register('skills', { status, check: () => skills.read(true), prepare: skills.update }))
    void skills.read(false)
  })

}
