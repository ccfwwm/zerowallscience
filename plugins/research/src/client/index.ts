export * from './view.js'
export * from './scientific-engine-center.js'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { FlaskConical } from 'lucide-react'
import { createElement } from 'react'
import { ScienceWorkbench } from './view.js'
import { ScientificEngineSettingsSection } from './scientific-engine-settings-section.js'
import { NS as BASE_NS } from '../../../base/src/client/locales.js'

export const inject = ['betterSidebar', 'slots', 'locale', 'remote', 'remote.zerowallResearch', 'conversation'] as const

export function apply(ctx: ClientContext): void {
  // Resolve once in the owning plugin fiber. The tab and settings callbacks
  // execute later, so reading `ctx.remote.zerowallResearch` there can trigger
  // Cordis's `without inject` guard during model synchronization.
  const researchRemote = ctx.get('remote.zerowallResearch')
  ctx.effect(() => ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'zerowall-science-engines', order: 28, locale: BASE_NS, label: () => ctx.locale.bind(BASE_NS)('research.engineSettings.nav'),
    inject: () => ({ remote: researchRemote }),
  }, ScientificEngineSettingsSection), 'zerowall: science engine settings'), 'zerowall: science engine settings injection')
  ctx.effect(() => ctx.betterSidebar.registerTab({
    id: 'zerowall:science-workbench',
    title: '科研工作台',
    description: '研究问题、数据契约、专业工具、证据与报告',
    icon: size => createElement(FlaskConical, { size }),
    single: true,
    order: 20,
    component: props => createElement(ScienceWorkbench, {
      ...props,
      remote: researchRemote,
      onSendMessage: (text: string) => ctx.conversation.send(text),
    }),
  }), 'zerowall: science workbench')
}
