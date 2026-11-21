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
export function UpdatesSection({ t, useDesktopUpdate, openDesktopUpdate, checkAll,
  prepareAll, restartUpdates, renderSlot }: Props) {
  const view = useDesktopUpdate(value => value)
  const state = view.presentation
  const runtime = state?.hostRuntime
  const busy = view.opening || state !== undefined && ['checking', 'downloading', 'verifying', 'installing'].includes(state.phase)
  const ready = state?.phase === 'ready'
  const available = state?.phase === 'available'
  const failed = view.failed || state?.phase === 'error'
  const copy = state === undefined ? undefined : updateCopy(state, t)
  const summary = failed ? view.failed ? t('desktop.update.checkFailed') : copy?.detail : state === undefined ? t('updates.web')
    : state.configured === false ? t('updates.unconfigured') : ready ? t('updates.promptReady', { version: state.version ?? runtime?.candidateVersion ?? '' })
      : available ? t('updates.promptAvailable', { version: state.version ?? runtime?.candidateVersion ?? '' })
        : state.phase === 'idle' ? t(state.checkedAt ? 'updates.latest' : 'updates.unchecked') : copy?.detail
  return <div className={css.page}>
    <header className={css.heading}><div><h2>{t('updates.center')}</h2></div>
      <a href="https://zerowallscience.org/" target="_blank" rel="noreferrer">{t('updates.website')}</a></header>
    <section className={css.summary} aria-label={t('updates.official')}>
      <div><h3>{t('updates.official')}</h3>
        <p>{state?.installedVersion === undefined ? t('updates.versionUnknown') : t('general.currentVersion', { version: state.installedVersion })}</p>
        <p role={failed ? 'alert' : 'status'}>{summary}</p>
      </div>
      <div className={css.actions}>
        <Button variant="outline" disabled={busy || state?.configured === false} onClick={checkAll}>{t('updates.check')}</Button>
        {ready ? <Button variant="primary" disabled={busy} onClick={restartUpdates}>{t('updates.restart')}</Button>
          : available ? <Button variant="primary" disabled={busy} onClick={prepareAll}>{t('updates.updateAll')}</Button>
            : failed ? <Button variant="primary" disabled={busy} onClick={openDesktopUpdate}>{t('desktop.update.retry')}</Button> : null}
      </div>
      {state?.phase === 'downloading' || state?.phase === 'verifying' ? <progress max={100} value={state.percent ?? 100} aria-label={copy?.label} /> : null}
    </section>
    {state?.releaseNotes === undefined ? null : <details className={css.card}><summary>{t('updates.releaseNotes')}</summary><p className={css.notes}>{state.releaseNotes}</p></details>}
    <section className={css.card} aria-label={t('updates.plugins')}>
      <h3>{t('updates.plugins')}</h3>
      {renderSlot('settings.updates.plugins', {})}
    </section>
  </div>
}

/** Render the native runtime through the same plugin list as independently delivered packages. */
export function HostRuntimeUpdateRow({ t, useDesktopUpdate, openHostRuntimeUpdate }: PropsLocale<'settings'>
  & Pick<InjectFace<UpdatesInjected>, 'useDesktopUpdate' | 'openHostRuntimeUpdate'>) {
  const view = useDesktopUpdate(value => value)
  const runtime = view.presentation?.hostRuntime
  if (runtime === undefined) return null
  const busy = view.opening || ['checking', 'downloading', 'extracting', 'verifying'].includes(runtime.phase)
  const status = runtime.phase === 'checking' ? t('desktop.update.checking')
    : runtime.phase === 'downloading' ? t('updates.hostRuntime.progress', { percent: runtime.percent ?? 0,
      downloaded: ((runtime.downloadedBytes ?? 0) / 1048576).toFixed(1), total: ((runtime.totalBytes ?? 0) / 1048576).toFixed(1) })
      : runtime.phase === 'extracting' ? t('updates.hostRuntime.extracting')
        : runtime.phase === 'verifying' ? t('desktop.update.verifying')
          : runtime.phase === 'staged' ? t('updates.hostRuntime.staged')
            : runtime.phase === 'error' || view.failed ? t('updates.hostRuntime.failed') : undefined
  const action = runtime.phase === 'staged' ? 'updates.restart' : runtime.phase === 'available' || runtime.phase === 'error'
    ? 'updates.hostRuntime.stage' : 'updates.check'
  return <article className={css.runtime} aria-label={t('updates.hostRuntime.title')} aria-busy={busy}>
    <div className={css.runtimeInfo}><h4>{t('updates.hostRuntime.title')}</h4>
      <span>{runtime.activeVersion ?? '—'}{runtime.candidateVersion !== undefined && runtime.candidateVersion !== runtime.activeVersion ? ` → ${runtime.candidateVersion}` : ''}</span>
      {status === undefined ? null : <p role={runtime.phase === 'error' || view.failed ? 'alert' : 'status'}>{status}</p>}
      {runtime.phase === 'downloading' ? <progress max={100} value={runtime.percent ?? 0} aria-label={t('updates.hostRuntime.title')} /> : null}
    </div>
    <Button variant={runtime.phase === 'available' || runtime.phase === 'staged' ? 'primary' : 'outline'} size="sm" disabled={busy}
      onClick={() => { openHostRuntimeUpdate(runtime.phase === 'available' || runtime.phase === 'error') }}>{busy ? status : t(action)}</Button>
  </article>
}
