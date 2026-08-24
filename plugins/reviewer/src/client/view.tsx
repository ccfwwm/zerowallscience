import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { reviewerModeDefinition, reviewerReportDefinition } from './definition.js'
import { ReviewerCard } from './ReviewerCard.tsx'
import { ReviewerModeAction } from './ReviewerModeAction.tsx'
import { ReviewerSettings, type ReviewerSettingsValue } from './ReviewerSettings.tsx'
import { NS } from '@zerowallscience/plugin-base/client-helpers'

export const inject = ['slots', 'conversationEvents', 'settingsScope']

export function apply(ctx: ClientContext): void {
  ctx.conversationEvents.register(reviewerReportDefinition)
  ctx.conversationEvents.register(reviewerModeDefinition)
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node', key: 'zerowall-reviewer-report', locale: NS,
  }, ReviewerCard))
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node', key: 'zerowall-reviewer-mode', locale: NS,
  }, () => null))
  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions', id: 'zerowall-reviewer-mode', order: 30, locale: NS,
  }, ReviewerModeAction))
  const scope = ctx.settingsScope.bind<ReviewerSettingsValue>({ namespace: 'zerowall-reviewer' })
  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item', id: 'zerowall-reviewer', order: 30, locale: NS,
    inject: () => ({ scope }),
  }, ReviewerSettings))
}
