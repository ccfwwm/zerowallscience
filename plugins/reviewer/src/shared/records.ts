import { z } from 'zod'

const evidence = z.enum(['verified', 'auto-repaired', 'unverified', 'legacy'])
export const reviewerModeSchema = z.object({ mode: z.enum(['inherit', 'on', 'off']) })
export const reviewerReportSchema = z.object({
  id: z.string(), turn: z.number().int().nonnegative(), summary: z.string(),
  findings: z.array(z.object({
    messageIndex: z.number().int().nonnegative(), claim: z.string(), evidence: z.string(),
    reportedEvidence: z.string().optional(), evidenceStatus: evidence.optional(), fix: z.string(),
    verdict: z.enum(['warn', 'fail', 'inconclusive']), severity: z.enum(['low', 'medium', 'high']),
    status: z.enum(['open', 'resolved', 'unaddressed']),
  })),
  reviewerModel: z.string(), reviewerEffort: z.string().optional(), reviewerBackend: z.string(),
  reviewStatus: z.enum(['passed', 'failed', 'unreviewable', 'error']), evidenceCoverage: z.number(),
  citationCoverage: z.number().optional(), hasUnverifiedEvidence: z.boolean().optional(),
  summaryEvidenceStatus: z.enum(['verified', 'unverified', 'legacy']).optional(),
  coverageGaps: z.array(z.string()),
  coverageGapDetails: z.array(z.object({
    code: z.enum(['tool-empty', 'tool-truncated', 'transcript-truncated', 'finding-citation-unverified', 'summary-citation-unverified']),
    messageIndex: z.number().optional(), seq: z.number().optional(), detail: z.string().optional(),
  })).optional(),
  correction: z.enum(['none', 'requested', 'completed']).optional(), reReviewed: z.boolean().optional(),
})

export type ReviewerStoredReport = z.infer<typeof reviewerReportSchema>
export type ReviewerStoredMode = z.infer<typeof reviewerModeSchema>

declare module '@deepseek-ai/dsh-session/types' {
  interface PluginRecordMap {
    'plugin:zerowall/reviewer/mode': ReviewerStoredMode
    'plugin:zerowall/reviewer/report': ReviewerStoredReport
  }
}

interface StoredEvent { type: string; seq: number; data: unknown; ignorable?: boolean }
function owns(event: StoredEvent, kind: 'mode' | 'report'): boolean {
  return event.type === `zerowall/reviewer/${kind}`
    || event.ignorable === true && event.type === `plugin:zerowall/reviewer/${kind}`
}

/** Validate restored PluginRecords and pre-8.4 Reviewer metadata without rewriting history. */
export function reviewerReportOf(event: StoredEvent): { seq: number; data: ReviewerStoredReport } | undefined {
  if (!owns(event, 'report')) return
  const result = reviewerReportSchema.safeParse(event.data)
  if (result.success) return { seq: event.seq, data: result.data }
}

export function reviewerModeOf(event: StoredEvent): { seq: number; data: ReviewerStoredMode } | undefined {
  if (!owns(event, 'mode')) return
  const result = reviewerModeSchema.safeParse(event.data)
  if (result.success) return { seq: event.seq, data: result.data }
}
