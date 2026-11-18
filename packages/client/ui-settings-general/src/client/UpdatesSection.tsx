/** Official software updates remain usable while independent extension checks run. */
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { DesktopUpdateSource } from './desktop-update-source.ts'
import type { UpdateCenter } from '@deepseek-ai/dsh-client-ui-settings/client'
import { updateCopy } from './DesktopUpdateIndicator.tsx'
import css from './UpdatesSection.module.css'

/** Desktop carrier actions and framework-observed status. */
export interface UpdatesInjected {
  openDesktopUpdate: () => void
  openHostRuntimeUpdate: (stage: boolean) => void
  checkAll: () => void
  prepareAll: () => void
  restartUpdates: () => void
  hooks: { desktopUpdate: DesktopUpdateSource['store']; updateCenter: UpdateCenter['store'] }
}
type Props = PropsRuntime<'settings.section'> & PropsLocale<'settings'>
  & PropsRenderSlots<'settings.updates.plugins'> & InjectFace<UpdatesInjected>

/** @param props - Main-owned software state and extension-owned controls. @returns Update settings. */
export function UpdatesSection({ t, useDesktopUpdate, openDesktopUpdate, openHostRuntimeUpdate, checkAll,
  prepareAll, restartUpdates, renderSlot }: Props) {
  const view = useDesktopUpdate(value => value)
  const state = view.presentation
  const runtime = state?.hostRuntime
  const busy = view.opening || state !== undefined && ['checking', 'downloading', 'verifying', 'installing'].includes(state.phase)
  const ready = state?.phase === 'ready' || state?.phase === 'idle' && runtime?.phase === 'staged'
  const available = state?.phase === 'available' || state?.phase === 'idle' && runtime?.phase === 'available'
  const failed = view.failed || state?.phase === 'error'
  const copy = state === undefined ? undefined : updateCopy(state, t)
  const summary = failed ? view.failed ? t('desktop.update.checkFailed') : copy?.detail : state === undefined ? t('updates.web')
    : state.configured === false ? t('updates.unconfigured') : ready ? t('updates.promptReady', { version: state.version ?? runtime?.candidateVersion ?? '' })
      : available ? t('updates.promptAvailable', { version: state.version ?? runtime?.candidateVersion ?? '' })
        : state.phase === 'idle' ? t(state.checkedAt ? 'updates.latest' : 'updates.unchecked') : copy?.detail
  return <div className={css.page}>
    <header className={css.heading}><div><h2>{t('updates.center')}</h2><p>{t('updates.description')}</p></div>
      <a href="https://zerowallscience.org/" target="_blank" rel="noreferrer">{t('updates.website')}</a></header>
    <section className={css.summary} aria-label={t('updates.official')}>
      <div><h3>{t('updates.official')}</h3>
        <p>{state?.installedVersion === undefined ? t('updates.versionUnknown') : t('general.currentVersion', { version: state.installedVersion })}</p>
        <p role={failed ? 'alert' : 'status'}>{summary}</p>
        <p>{t(ready ? 'updates.deferHint' : state?.phase === 'downloading' || state?.phase === 'verifying'
          ? 'updates.preparing' : 'updates.background')}</p></div>
      <div className={css.actions}>
        <Button variant="outline" disabled={busy || state?.configured === false} onClick={checkAll}>{t('updates.check')}</Button>
        {ready ? <Button variant="primary" disabled={busy} onClick={restartUpdates}>{t('updates.restart')}</Button>
          : available ? <Button variant="primary" disabled={busy} onClick={prepareAll}>{t('updates.updateAll')}</Button>
            : failed ? <Button variant="primary" disabled={busy} onClick={openDesktopUpdate}>{t('desktop.update.retry')}</Button> : null}
      </div>
      {state?.phase === 'downloading' || state?.phase === 'verifying' ? <progress max={100} value={state.percent ?? 100} aria-label={copy?.label} /> : null}
    </section>
    {state?.releaseNotes === undefined ? null : <section className={css.card}><h3>{t('updates.releaseNotes')}</h3><p className={css.notes}>{state.releaseNotes}</p></section>}
    <details className={css.card}><summary>{t('updates.components')}</summary>
      <section className={css.heading} aria-label={t('updates.hostRuntime.title')}><div><h3>{t('updates.hostRuntime.title')}</h3>
        <p>{runtime?.activeVersion === undefined ? t('updates.hostRuntime.bundled') : t('updates.hostRuntime.active', { version: runtime.activeVersion })}</p>
        <p role={runtime?.phase === 'error' ? 'alert' : 'status'}>{t(runtime?.phase === 'error' ? 'updates.hostRuntime.failed'
          : runtime?.phase === 'staged' ? 'updates.hostRuntime.staged' : runtime?.phase === 'available' ? 'updates.hostRuntime.available' : 'updates.hostRuntime.description')}</p></div>
      <Button variant="outline" size="sm" disabled={runtime?.phase === 'checking' || runtime?.phase === 'downloading' || state === undefined || busy}
        onClick={() => { openHostRuntimeUpdate(runtime?.phase === 'available') }}>{t(runtime?.phase === 'staged' ? 'updates.restart' : runtime?.phase === 'available' ? 'updates.hostRuntime.stage' : 'updates.check')}</Button>
      </section>
    </details>
    <section className={css.card} aria-label={t('updates.plugins')}>
      <h3>{t('updates.plugins')}</h3><p>{t('updates.independent')}</p>{renderSlot('settings.updates.plugins', {})}
    </section>
  </div>
}
