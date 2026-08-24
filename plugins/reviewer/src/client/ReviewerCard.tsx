import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { AlertTriangle, CheckCircle2, CircleX, HelpCircle } from 'lucide-react'
import type { ReviewerReportData, ReviewerStatus } from './definition.js'
import css from './ReviewerCard.module.css'

type ReviewerCardProps = PropsRuntime<'conversation.chat.node', 'zerowall-reviewer-report'> & PropsLocale<'zerowall'>

function Icon({ status }: { status: ReviewerStatus }) {
  if (status === 'passed') return <CheckCircle2 size={15} aria-hidden="true" />
  if (status === 'failed') return <CircleX size={15} aria-hidden="true" />
  if (status === 'unreviewable') return <AlertTriangle size={15} aria-hidden="true" />
  return <HelpCircle size={15} aria-hidden="true" />
}

function statusKey(status: ReviewerStatus): 'reviewer.status.passed' | 'reviewer.status.failed' | 'reviewer.status.unreviewable' | 'reviewer.status.error' {
  return `reviewer.status.${status}` as 'reviewer.status.passed' | 'reviewer.status.failed' | 'reviewer.status.unreviewable' | 'reviewer.status.error'
}

function evidenceKey(status: NonNullable<ReviewerReportData['findings'][number]['evidenceStatus']>): 'reviewer.evidence.verified' | 'reviewer.evidence.auto-repaired' | 'reviewer.evidence.unverified' | 'reviewer.evidence.legacy' {
  return `reviewer.evidence.${status}` as 'reviewer.evidence.verified' | 'reviewer.evidence.auto-repaired' | 'reviewer.evidence.unverified' | 'reviewer.evidence.legacy'
}

export function ReviewerCard({ node, t }: ReviewerCardProps) {
  const report = node.data as ReviewerReportData
  const statusLabel = t(statusKey(report.reviewStatus))
  const citationCoverage = report.citationCoverage ?? (report.findings.length === 0 ? 100 : '—')
  return (
    <section className={css.card} data-status={report.reviewStatus} data-reviewer-report={report.id}>
      <header className={css.header}>
        <Icon status={report.reviewStatus} />
        <span className={css.title}>{t('reviewer.title')}</span>
        <span className={css.status}>{statusLabel}</span>
        <span className={css.model}>{report.reviewerModel}</span>
      </header>
      <p className={css.summary}>{report.summary}</p>
      <div className={css.meta}>
        <span>{t('reviewer.evidenceCoverage', { percent: report.evidenceCoverage })}</span>
        <span>{t('reviewer.citationCoverage', { percent: citationCoverage })}</span>
        <span>{t('reviewer.findingCount', { count: report.findings.length })}</span>
        {report.correction === 'completed' ? <span>{t('reviewer.correctionCompleted')}</span> : null}
        {report.hasUnverifiedEvidence === true ? <span className={css.warning}>{t('reviewer.autoCorrectionSkipped')}</span> : null}
      </div>
      {report.findings.length > 0 ? (
        <ol className={css.findings}>
          {report.findings.map((finding, index) => (
            <li className={css.finding} data-evidence-status={finding.evidenceStatus ?? 'legacy'} key={`${finding.messageIndex}-${index}`}>
              <strong>[msg:{finding.messageIndex}] {finding.claim}</strong>
              <div className={css.evidenceStatus}>{t(evidenceKey(finding.evidenceStatus ?? 'legacy'))}</div>
              {finding.evidenceStatus === 'unverified' && finding.reportedEvidence !== undefined ? <div className={css.originalEvidence}><strong>{t('reviewer.originalEvidence')}</strong>{finding.reportedEvidence}</div> : null}
              <div className={css.transcriptEvidence}><strong>{t('reviewer.transcriptEvidence')}</strong>{finding.evidence}</div>
              <div className={css.fix}><strong>{t('reviewer.fix')}</strong>{finding.fix}</div>
            </li>
          ))}
        </ol>
      ) : null}
      {report.coverageGaps.length > 0 ? <div className={css.gaps}><strong>{t('reviewer.coverageGaps')}</strong>{report.coverageGaps.join('; ')}</div> : null}
    </section>
  )
}
