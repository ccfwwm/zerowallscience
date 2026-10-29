export * from './view.js'
export * from './scientific-engine-center.js'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { FlaskConical } from 'lucide-react'
import { createElement } from 'react'
import type { BetterSidebarService } from 'dsh-better-sidebar/client/service'
import { ScienceViewer } from './view.js'
import { openScienceViewer, scienceViewerRouteDefinition, ScienceViewerTurnRoute } from './viewer-routing.js'
import { ScientificEngineSettingsSection } from './scientific-engine-settings-section.js'
import { NS as BASE_NS } from '../../../base/src/client/locales.js'

export const inject = ['betterSidebar', 'slots', 'locale', 'remote', 'remote.zerowallResearch', 'conversation', 'uiConversation'] as const

export function apply(ctx: ClientContext): void {
  // Resolve once in the owning plugin fiber. The tab and settings callbacks
  // execute later, so reading `ctx.remote.zerowallResearch` there can trigger
  // Cordis's `without inject` guard during model synchronization.
  const researchRemote = ctx.get('remote.zerowallResearch')
  const sidebar = ctx.get('betterSidebar') as BetterSidebarService
  const uiConversation = ctx.get('uiConversation') as { events: { register: (definition: typeof scienceViewerRouteDefinition) => () => void } } | undefined
  if (uiConversation) ctx.effect(() => uiConversation.events.register(scienceViewerRouteDefinition), 'zerowall: science viewer conversation route')
  ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
    name: 'conversation.chat.turnTail',
    id: 'zerowall-science-viewer-route',
    order: -10,
    inject: () => ({ openViewer: (sessionId: string, route: Parameters<typeof openScienceViewer>[2]) => openScienceViewer(sidebar, sessionId, route) }),
  }, ScienceViewerTurnRoute))
  ctx.effect(() => ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'zerowall-science-engines', order: 28, locale: BASE_NS, label: () => ctx.locale.bind(BASE_NS)('research.engineSettings.nav'),
    inject: () => ({ remote: researchRemote }),
  }, ScientificEngineSettingsSection), 'zerowall: science engine settings'), 'zerowall: science engine settings injection')
  ctx.effect(() => ctx.betterSidebar.registerTab({
    id: 'zerowall:science-viewers',
    title: '科学查看器',
    description: '由对话打开图像、序列、分子结构及其他科研可视化结果',
    icon: size => createElement(FlaskConical, { size }),
    single: true,
    order: 20,
    component: props => createElement(ScienceViewer, {
      ...props,
      remote: researchRemote,
    }),
  }), 'zerowall: science viewers')
}
