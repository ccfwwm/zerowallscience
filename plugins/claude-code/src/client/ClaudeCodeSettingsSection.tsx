import React from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ClaudeCodeSettingsApi, ClaudeCodeStatus } from '../shared/types.js'
import { CLAUDE_NS } from './locales.js'
import css from './ClaudeCodeSettingsSection.module.css'

export type ClaudeCodeSettingsSectionProps = PropsRuntime<'settings.section'> & PropsLocale<typeof CLAUDE_NS> & InjectFace<ClaudeCodeSettingsApi>

function statusLabel(status: ClaudeCodeStatus | undefined, t: ClaudeCodeSettingsSectionProps['t']): string {
  if (!status) return t('unavailable')
  if (!status.desktop) return t('desktopOnly')
  if (status.running) return t('running')
  return status.installed ? t('ready') : t('notInstalled')
}
export function ClaudeCodeSettingsSection(props: ClaudeCodeSettingsSectionProps) {
  const { t } = props
  const [status, setStatus] = React.useState<ClaudeCodeStatus>()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    let active = true
    void props.status().then(next => { if (active) setStatus(next) }).catch(() => { if (active) setError(t('unavailable')) })
    return () => { active = false }
  }, [t])

  const run = async (operation: () => Promise<ClaudeCodeStatus>, confirm = false) => {
    if (busy || status?.running) { setError(t(status?.running ? 'busy' : 'operationFailed')); return }
    if (confirm && !window.confirm(t('uninstallConfirm'))) return
    setBusy(true)
    setError('')
    try { setStatus(await operation()) } catch { setError(t('operationFailed')) } finally { setBusy(false) }
  }

  const installed = status?.installed === true
  return <section className={css.root}>
    <h2>{t('title')}</h2>
    <p className={css.intro}>{t('description')}</p>
    <article className={css.card}>
      <header className={css.cardHeader}>
        <div><h3>{t('status')}</h3><p>{statusLabel(status, t)}</p></div>
        <span className={`${css.status} ${installed ? css.statusReady : css.statusWarning}`} role="status">{statusLabel(status, t)}</span>
      </header>
      <div className={css.path}><span className={css.pathLabel}>{t('path')}</span><code>{status?.executablePath ?? t('pathUnavailable')}</code></div>
      <div className={css.actions}>
        <button className={installed ? '' : css.primary} type="button" disabled={busy || status === undefined || status.desktop === false || status.running} onClick={() => void run(() => props.install())}>{installed ? t('update') : t('install')}</button>
        {status?.rollbackAvailable && <button type="button" disabled={busy || status.running} onClick={() => void run(() => props.rollback())}>{t('rollback')}</button>}
        {installed && <button type="button" disabled={busy || status.running} onClick={() => void run(() => props.uninstall(), true)}>{t('uninstall')}</button>}
      </div>
      {error && <p className={css.error} role="alert">{error}</p>}
      <p className={css.note}>{t('note')}</p>
    </article>
  </section>
}
