/** Unified update settings; each updater retains ownership of its operations. */
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { DesktopUpdateSource } from './desktop-update-source.ts'
import { updateCopy } from './DesktopUpdateIndicator.tsx'
import css from './UpdatesSection.module.css'

/** Desktop carrier actions and framework-observed status. */
export interface UpdatesInjected {
  openDesktopUpdate: () => void
  openHostRuntimeUpdate: (stage: boolean) => void
  hooks: { desktopUpdate: DesktopUpdateSource['store'] }
}
type Props = PropsRuntime<'settings.section'> & PropsLocale<'settings'>
  & PropsRenderSlots<'settings.updates.plugins'> & InjectFace<UpdatesInjected>

/** @param props - Desktop state and plugin-owned update controls. @returns Update settings content. */
export function UpdatesSection({ t, useDesktopUpdate, openDesktopUpdate, openHostRuntimeUpdate, renderSlot }: Props) {
  const view = useDesktopUpdate(value => value)
  const state = view.presentation
  const busy = view.opening || (state !== undefined && ['checking', 'downloading', 'verifying', 'installing'].includes(state.phase))
  const copy = state === undefined ? undefined : updateCopy(state, t)
  const hostRuntime = state?.hostRuntime
  const hostBusy = hostRuntime !== undefined && ['checking', 'downloading'].includes(hostRuntime.phase)
  const hostAction = hostRuntime?.phase === 'staged' ? t('updates.hostRuntime.restart')
    : hostRuntime?.phase === 'available' ? t('updates.hostRuntime.stage') : t('updates.hostRuntime.check')
  return <div className={css.page}>
    <header><h2>{t('updates.nav')}</h2><p>{t('updates.description')}</p></header>
    <section className={css.card} aria-label={t('updates.desktop')}>
      <div className={css.heading}><h3>{t('updates.desktop')}</h3>
        <Button variant="outline" size="sm" disabled={busy || state?.configured === false || (state === undefined && !view.failed)} onClick={openDesktopUpdate}>
          {state?.phase === 'ready' ? t('desktop.update.ready') : view.failed || state?.phase === 'error' ? t('desktop.update.retry') : state?.phase === 'available' ? t('desktop.update.available') : t('updates.check')}
        </Button>
      </div>
      <p>{t('general.currentVersion', { version: process.env.DSH_CLIENT_VERSION ?? '' })}</p>
      {state?.version === undefined ? null : <p>{t('updates.target', { version: state.version })}</p>}
      {state?.releaseDate === undefined ? null : <time dateTime={state.releaseDate}>{state.releaseDate.slice(0, 10)}</time>}
      {state?.releaseNotes === undefined ? null : <p className={css.notes}>{state.releaseNotes}</p>}
      <p role={view.failed || state?.phase === 'error' ? 'alert' : 'status'}>{view.failed ? t('desktop.update.checkFailed') : state === undefined ? t('updates.web') : state.configured === false ? t('updates.unconfigured') : state.phase === 'idle' ? t(state.checkedAt ? 'updates.latest' : 'updates.unchecked') : copy?.detail}</p>
      {state?.phase === 'downloading' ? <progress max={100} value={state.percent ?? 0} aria-label={copy?.label} /> : null}
    </section>
    <section className={css.card} aria-label={t('updates.hostRuntime.title')}>
      <div className={css.heading}><h3>{t('updates.hostRuntime.title')}</h3>
        <Button variant="outline" size="sm" disabled={hostBusy || state === undefined}
          onClick={() => { openHostRuntimeUpdate(hostRuntime?.phase === 'available') }}>{hostAction}</Button>
      </div>
      <p>{hostRuntime?.activeVersion === undefined ? t('updates.hostRuntime.bundled') : t('updates.hostRuntime.active', { version: hostRuntime.activeVersion })}</p>
      {hostRuntime?.candidateVersion === undefined ? null : <p>{t('updates.hostRuntime.target', { version: hostRuntime.candidateVersion })}</p>}
      <p role={hostRuntime?.phase === 'error' ? 'alert' : 'status'}>{hostRuntime?.phase === 'error' ? t('updates.hostRuntime.failed')
        : hostRuntime?.phase === 'staged' ? t('updates.hostRuntime.staged') : hostRuntime?.phase === 'available' ? t('updates.hostRuntime.available') : t('updates.hostRuntime.description')}</p>
    </section>
    <section className={css.card} aria-label={t('updates.plugins')}>
      <h3>{t('updates.plugins')}</h3>{renderSlot('settings.updates.plugins', {})}
    </section>
  </div>
}
