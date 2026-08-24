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

function severityKey(severity: ReviewerReportData['findings'][number]['severity']): 'reviewer.severity.low' | 'reviewer.severity.medium' | 'reviewer.severity.high' {
  return `reviewer.severity.${severity}` as 'reviewer.severity.low' | 'reviewer.severity.medium' | 'reviewer.severity.high'
}

function verdictKey(verdict: ReviewerReportData['findings'][number]['verdict']): 'reviewer.verdict.warn' | 'reviewer.verdict.fail' | 'reviewer.verdict.inconclusive' {
  return `reviewer.verdict.${verdict}` as 'reviewer.verdict.warn' | 'reviewer.verdict.fail' | 'reviewer.verdict.inconclusive'
}

export function ReviewerCard({ node, t }: ReviewerCardProps) {
  const report = node.data as ReviewerReportData
  const statusLabel = t(statusKey(report.reviewStatus))
  const citationCoverage = report.citationCoverage ?? (report.findings.length === 0 ? 100 : '—')
  return (
    <section className={css.card} data-status={report.reviewStatus} data-reviewer-report={report.id}>
      <header className={css.header}>
        <Icon status={report.reviewStatus} />
        <div className={css.heading}>
          <span className={css.title}>{t('reviewer.title')}</span>
          <span className={css.status}>{statusLabel}</span>
        </div>
        <span className={css.model} title={report.reviewerModel}>{report.reviewerModel}</span>
      </header>
      <section className={css.conclusion}>
        <div className={css.sectionLabel}>{t('reviewer.conclusion')}</div>
        <p className={css.summary}>{report.summary}</p>
      </section>
      <section className={css.metrics} aria-label={t('reviewer.metrics')}>
        <div><span>{t('reviewer.toolEvidence')}</span><strong>{report.evidenceCoverage}%</strong></div>
        <div><span>{t('reviewer.citation')}</span><strong>{citationCoverage}%</strong></div>
        <div><span>{t('reviewer.findingsMetric')}</span><strong>{report.findings.length}</strong></div>
        {report.correction === 'completed' ? <div className={css.success}><span>{t('reviewer.correctionCompleted')}</span></div> : null}
        {report.hasUnverifiedEvidence === true ? <div className={css.warning}><span>{t('reviewer.autoCorrectionSkipped')}</span></div> : null}
      </section>
      {report.findings.length > 0 ? (
        <section className={css.findingsSection}>
          <h3 className={css.sectionLabel}>{t('reviewer.findingsTitle')}</h3>
          <ol className={css.findings}>
            {report.findings.map((finding, index) => (
              <li className={css.finding} data-evidence-status={finding.evidenceStatus ?? 'legacy'} key={`${finding.messageIndex}-${index}`}>
                <div className={css.findingHeader}>
                  <strong>{t('reviewer.findingNumber', { number: index + 1 })}</strong>
                  <span className={css.badge}>{t(severityKey(finding.severity))} · {t(verdictKey(finding.verdict))}</span>
                </div>
                <div className={css.reference}>{t('reviewer.messageReference', { number: finding.messageIndex + 1 })}</div>
                <div className={css.field}><strong>{t('reviewer.claim')}</strong><p>{finding.claim}</p></div>
                <div className={css.field}><strong>{t('reviewer.evidenceSection')}</strong><div className={css.evidenceStatus}>{t(evidenceKey(finding.evidenceStatus ?? 'legacy'))}</div>{finding.evidenceStatus === 'unverified' && finding.reportedEvidence !== undefined ? <div className={css.originalEvidence}><strong>{t('reviewer.originalEvidence')}</strong><span>{finding.reportedEvidence}</span></div> : null}<div className={css.transcriptEvidence}><strong>{t('reviewer.transcriptEvidence')}</strong><span>{finding.evidence}</span></div></div>
                <div className={`${css.field} ${css.fix}`}><strong>{t('reviewer.recommendedFix')}</strong><p>{finding.fix}</p></div>
              </li>
            ))}
          </ol>
        </section>
      ) : <p className={css.empty}>{t('reviewer.noFindings')}</p>}
      {report.coverageGaps.length > 0 ? <div className={css.gaps}><strong>{t('reviewer.coverageGaps')}</strong><ul>{report.coverageGaps.map((gap, index) => <li key={`${gap}-${index}`}>{gap}</li>)}</ul></div> : null}
    </section>
  )
}
