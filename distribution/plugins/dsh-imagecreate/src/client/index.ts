import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { registerImageToolViews } from './ImageToolView.tsx'
import type {} from '@zerowall/dsh-imagecreate/remote'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { ImageSettingsFeedback, ImageSettingsPanel, type ImageSettingsFace } from './settings.js'
import { NS, en, zh } from './settings-locales.js'

export const inject = ['uiConversation', 'slots', 'locale', 'remote.zerowallImageSettings']
export function apply(ctx: ClientContext): void {
  registerImageToolViews(ctx)
  ctx.effect(() => ctx.locale.register(NS, { en, zh }))
  const remote = ctx.get('remote.zerowallImageSettings')
  let toast: boolean | undefined
  const listeners = new Set<() => void>()
  const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
  const snapshot = () => toast
  const clear = () => { toast = undefined; for (const listener of listeners) listener() }
  const notify = (success: boolean) => { toast = success; for (const listener of listeners) listener() }
  const face: ImageSettingsFace = {
    load: async () => {
      const [settings, models] = await Promise.all([remote.get(), remote.catalog()])
      if (!settings.ok) throw new Error(settings.error.message)
      if (!models.ok) throw new Error(models.error.message)
      return { settings: settings.value, models: models.value }
    },
    refresh: async () => { const result = await remote.refresh(); if (!result.ok) throw new Error(result.error.message) },
    save: async input => { const result = await remote.save(input); if (!result.ok) throw new Error(result.error.message); return result.value },
    notify,
  }
  ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({ name: 'plugins.bundle.config', key: '@zerowall/dsh-imagecreate', locale: NS, inject: () => face }, ImageSettingsPanel))
  ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'zerowall-image-settings', label: () => ctx.locale.bind(NS)('title'), locale: NS, order: 26, inject: () => face }, ImageSettingsPanel))
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'zerowall-image-feedback', locale: NS, inject: () => ({ subscribe, snapshot, clear }) }, ImageSettingsFeedback))
  ctx.effect(() => () => { listeners.clear() })
}
