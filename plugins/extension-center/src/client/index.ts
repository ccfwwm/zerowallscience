import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { en, NS, zh } from './locales.js'
import { ExtensionCenter } from './ExtensionCenter.js'

type Props = PropsRuntime<'settings.section'> & PropsLocale<typeof NS>

export const inject = ['slots', 'locale']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'zerowall: extension center dictionaries')
  const t = ctx.locale.bind(NS)
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'zerowall-extension-center', order: 12,
    label: () => t('title'), locale: NS, inject: () => ({}),
  }, ExtensionCenter as (props: Props) => JSX.Element), 'zerowall: extension center')
}

export { NS, en, zh }
