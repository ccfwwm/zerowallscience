import type { ChatConversationViewNode } from '@deepseek-ai/dsh-client-ui-chat/client'
import type {
  ConversationNodeContext,
  ConversationNodeDefinition,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'

export type ReviewerMode = 'inherit' | 'on' | 'off'
export type ReviewerStatus = 'passed' | 'failed' | 'unreviewable' | 'error'
export type ReviewerEvidenceStatus = 'verified' | 'auto-repaired' | 'unverified' | 'legacy'
export type ReviewerFindingStatus = 'open' | 'resolved' | 'unaddressed'

export interface ReviewerFinding {
  messageIndex: number
  claim: string
  evidence: string
  reportedEvidence?: string
  evidenceStatus?: ReviewerEvidenceStatus
  fix: string
  verdict: 'warn' | 'fail' | 'inconclusive'
  severity: 'low' | 'medium' | 'high'
  status: ReviewerFindingStatus
}

export interface ReviewerReportData {
  id: string
  turn: number
  summary: string
  findings: readonly ReviewerFinding[]
  reviewerModel: string
  reviewerEffort?: string
  reviewerBackend: string
  reviewStatus: ReviewerStatus
  evidenceCoverage: number
  citationCoverage?: number
  hasUnverifiedEvidence?: boolean
  summaryEvidenceStatus?: ReviewerEvidenceStatus
  coverageGaps: readonly string[]
  coverageGapDetails?: readonly { code: string; messageIndex?: number; seq?: number; detail?: string }[]
  correction?: 'none' | 'requested' | 'completed'
  reReviewed?: boolean
}

export interface ReviewerModeData {
  mode: ReviewerMode
  seq: number
}

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ChatNodeDataMap {
    'zerowall-reviewer-report': ReviewerReportData
    'zerowall-reviewer-mode': ReviewerModeData
  }
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    'zerowall/reviewer/mode': { mode: ReviewerMode }
    'zerowall/reviewer/report': ReviewerReportData
  }
}

function reportEvent(event: SessionEvent): event is SessionEvent<'zerowall/reviewer/report'> {
  return event.type === 'zerowall/reviewer/report'
}

function modeEvent(event: SessionEvent): event is SessionEvent<'zerowall/reviewer/mode'> {
  return event.type === 'zerowall/reviewer/mode'
}

function reportNode(context: ConversationNodeContext<ReviewerReportData>): ChatConversationViewNode | null {
  const match = context.start
  if (match === undefined || !reportEvent(match.event)) return null
  return {
    key: context.key,
    id: context.id,
    kind: 'zerowall-reviewer-report',
    target: 'chat',
    anchorSeq: match.event.seq,
    location: match.location,
    visibility: 'visible',
    data: context.state as ReviewerReportData,
  }
}

function modeNode(context: ConversationNodeContext<ReviewerModeData>): ChatConversationViewNode | null {
  const match = context.start
  if (match === undefined || !modeEvent(match.event)) return null
  return {
    key: context.key,
    id: context.id,
    kind: 'zerowall-reviewer-mode',
    target: 'chat',
    anchorSeq: match.event.seq,
    location: match.location,
    visibility: 'hidden',
    data: context.state as ReviewerModeData,
  }
}

export const reviewerReportDefinition: ConversationNodeDefinition<ReviewerReportData> = {
  kind: 'zerowall-reviewer-report',
  target: 'chat',
  match: event => reportEvent(event) ? { id: event.data.id, role: event.data.reReviewed === true ? 'update' : 'start' } : null,
  start: (_context, match) => {
    if (!reportEvent(match.event)) throw new Error('reviewer report start requires a reviewer report event')
    return match.event.data
  },
  update: (context, match) => {
    if (!reportEvent(match.event)) return context.state
    return match.event.data
  },
  buildViewNode: reportNode,
}

export const reviewerModeDefinition: ConversationNodeDefinition<ReviewerModeData> = {
  kind: 'zerowall-reviewer-mode',
  target: 'chat',
  match: event => modeEvent(event) ? { id: String(event.seq), role: 'start' } : null,
  start: (_context, match) => {
    if (!modeEvent(match.event)) throw new Error('reviewer mode start requires a reviewer mode event')
    return { mode: match.event.data.mode, seq: match.event.seq }
  },
  update: context => context.state,
  buildViewNode: modeNode,
}
