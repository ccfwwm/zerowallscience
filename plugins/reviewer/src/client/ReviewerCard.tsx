import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { AlertTriangle, CheckCircle2, CircleX, HelpCircle } from 'lucide-react'
import type { ReviewerReportData, ReviewerStatus } from './definition.js'
import css from './ReviewerCard.module.css'

type ReviewerCardProps = PropsRuntime<'conversation.chat.node', 'zerowall-reviewer-report'> & PropsLocale<'zerowall'>

const STATUS_LABEL: Record<ReviewerStatus, string> = {
  passed: 'Passed', failed: 'Needs correction', unreviewable: 'Evidence incomplete', error: 'Reviewer error',
}

function Icon({ status }: { status: ReviewerStatus }) {
  if (status === 'passed') return <CheckCircle2 size={15} aria-hidden="true" />
  if (status === 'failed') return <CircleX size={15} aria-hidden="true" />
  if (status === 'unreviewable') return <AlertTriangle size={15} aria-hidden="true" />
  return <HelpCircle size={15} aria-hidden="true" />
}

export function ReviewerCard({ node }: ReviewerCardProps) {
  const report = node.data as ReviewerReportData
  return (
    <section className={css.card} data-status={report.reviewStatus} data-reviewer-report={report.id}>
      <header className={css.header}>
        <Icon status={report.reviewStatus} />
        <span className={css.title}>Reviewer</span>
        <span className={css.status}>{STATUS_LABEL[report.reviewStatus]}</span>
        <span className={css.model}>{report.reviewerModel}</span>
      </header>
      <p className={css.summary}>{report.summary}</p>
      <div className={css.meta}>
        <span>Evidence {report.evidenceCoverage}%</span>
        <span>{report.findings.length} finding(s)</span>
        {report.correction === 'completed' ? <span>Correction reviewed</span> : null}
      </div>
      {report.findings.length > 0 ? (
        <ol className={css.findings}>
          {report.findings.map((finding, index) => (
            <li className={css.finding} key={`${finding.messageIndex}-${index}`}>
              <strong>[msg:{finding.messageIndex}] {finding.claim}</strong>
              <div className={css.evidence}>{finding.evidence}</div>
              <div className={css.fix}>{finding.status}: {finding.fix}</div>
            </li>
          ))}
        </ol>
      ) : null}
      {report.coverageGaps.length > 0 ? <p className={css.gaps}>Coverage gaps: {report.coverageGaps.join('; ')}</p> : null}
    </section>
  )
}
