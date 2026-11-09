/** Register Skills management on existing settings and plugin configuration surfaces. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@zerowall/dsh-plugin-skills/remote'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { PluginInstructionsPanel, SkillsFeedback, SkillsPanel, type SkillsFace } from './panel.js'
import { en, NS, zh } from './locales.js'
import { createSkillsViewStore } from './view-store.js'
import { createInstructionPages } from './instruction-pages.js'

export const inject = ['slots', 'locale', 'uiWorkspace', 'remote.zerowallSkills']
/** Mount management and a navigation-independent feedback overlay. @param ctx - injected browser context. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { en, zh }))
  const remote = ctx.get('remote.zerowallSkills')
  const store = createSkillsViewStore()
  const request: SkillsFace['request'] = async input => {
    const result = await remote.request(input)
    if (!result.ok) throw new Error(result.error.message)
    return result.value
  }
  const configuration = (): SkillsFace => ({ request, pickDirectory: () => ctx.uiWorkspace.pickDirectory() })
  ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'zerowall-skills', order: 35, label: () => ctx.locale.bind(NS)('title'), locale: NS, store, inject: configuration }, SkillsPanel))
  ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({ name: 'plugins.bundle.config', key: '@zerowall/dsh-plugin-skills', locale: NS, store, inject: configuration }, SkillsPanel))
  ctx.slots.inject('plugins.detail.section', () => ctx.slots.register({ name: 'plugins.detail.section', id: 'zerowall-plugin-instructions', locale: NS, store, inject: configuration }, PluginInstructionsPanel))
  ctx.inject(['remote', 'remote.pluginManager'], scope => {
    scope.slots.inject('plugins.item', () => {
      const pages = createInstructionPages({
        load: async () => {
          const [skills, bundles] = await Promise.all([request({ action: 'list' }), scope.remote.pluginManager.listBundles()])
          if (!bundles.ok) throw new Error(bundles.error.message)
          return { entries: skills.entries ?? [], packages: bundles.value.map(bundle => bundle.name) }
        },
        register: ownerPackage => scope.effect(() => scope.slots.register({ name: 'plugins.item', id: ownerPackage, order: 70, label: () => ownerPackage }, ({ view }) => view === 'summary' ? scope.locale.bind(NS)('pluginDescription') : null)),
        failed: error => scope.logger.warn(`Plugin instruction pages could not refresh: ${String(error)}`),
      })
      const refresh = () => { void pages.refresh() }
      refresh()
      const unsubscribe = scope.remote.$on('plugin-manager/changed', refresh)
      return async () => { unsubscribe(); await pages.dispose() }
    })
  })
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'zerowall-skills-feedback', locale: NS, store }, SkillsFeedback))
}
