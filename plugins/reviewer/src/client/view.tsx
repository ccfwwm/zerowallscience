import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { reviewerModeDefinition, reviewerReportDefinition } from './definition.js'
import { ReviewerCard } from './ReviewerCard.tsx'
import { NS } from '@zerowallscience/plugin-base/client-helpers'

export const inject = ['slots', 'uiConversation']

export function apply(ctx: ClientContext): void {
  ctx.uiConversation.events.register(reviewerReportDefinition)
  ctx.uiConversation.events.register(reviewerModeDefinition)
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node', key: 'zerowall-reviewer-report', locale: NS,
  }, ReviewerCard))
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node', key: 'zerowall-reviewer-mode', locale: NS,
  }, () => null))
}
