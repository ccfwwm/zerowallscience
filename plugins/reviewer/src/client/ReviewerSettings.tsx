import { useEffect, useState } from 'react'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './ReviewerSettings.module.css'

export interface ReviewerSettingsValue {
  autoReview: boolean
}

export interface ReviewerSettingsInjected {
  scope: SettingsScope<ReviewerSettingsValue>
}

export type ReviewerSettingsProps = PropsRuntime<'settings.general.item'> & PropsLocale<'zerowall'> & InjectFace<ReviewerSettingsInjected>

export function ReviewerSettings({ scope, t }: ReviewerSettingsProps) {
  const snapshot = scope.getSnapshot()
  const value = snapshot.value ?? { autoReview: true }
  const [busy, setBusy] = useState(false)
  useEffect(() => scope.subscribe(() => setBusy(false)), [scope])
  const update = async (field: string, next: unknown) => {
    setBusy(true)
    await scope.set(field, next)
  }
  return (
    <section className={css.card} aria-label={t('reviewer.settings')}>
      <label className={css.toggle}><input type="checkbox" checked={value.autoReview} disabled={!snapshot.writable || busy} onChange={event => void update('autoReview', event.target.checked)} /><span>{t('reviewer.automaticReview')}</span></label>
      {snapshot.status === 'unavailable' ? <p className={css.note}>{t('reviewer.settingsUnavailable')}</p> : null}
      {!snapshot.writable && snapshot.status !== 'unavailable' ? <p className={css.note}>{t('reviewer.settingsReadonly')}</p> : null}
    </section>
  )
}
