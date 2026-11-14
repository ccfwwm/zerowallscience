/** Unified update settings; each updater retains ownership of its operations. */
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

/** @param props - Desktop state and plugin-owned update controls. @returns Update settings content. */
export function UpdatesSection({ t, useDesktopUpdate, useUpdateCenter, openDesktopUpdate, openHostRuntimeUpdate,
  checkAll, prepareAll, restartUpdates, renderSlot }: Props) {
  const view = useDesktopUpdate(value => value)
  const updates = useUpdateCenter(value => value)
  const count = updates.sources.reduce((total, source) => total + (source.ready ? 0 : source.available), 0)
  const ready = updates.sources.some(source => source.ready)
  const failed = updates.failure !== undefined || updates.sources.some(source => source.failed)
  const working = updates.operation !== 'idle' || updates.sources.some(source => source.busy)
  const checked = updates.sources.length > 0 && updates.sources.every(source => source.checked)
  const summary = working ? t(updates.operation === 'preparing' ? 'updates.preparing' : 'updates.busy')
    : failed ? t('updates.partialFailure') : count ? t('updates.availableCount', { count })
      : ready ? t('updates.ready') : checked ? t('updates.latest') : t('updates.unchecked')
  const state = view.presentation
  const busy = view.opening || (state !== undefined && ['checking', 'downloading', 'verifying', 'installing'].includes(state.phase))
  const copy = state === undefined ? undefined : updateCopy(state, t)
  const hostRuntime = state?.hostRuntime
  const hostBusy = hostRuntime !== undefined && ['checking', 'downloading'].includes(hostRuntime.phase)
  const hostAction = hostRuntime?.phase === 'staged' ? t('updates.hostRuntime.restart')
    : hostRuntime?.phase === 'available' ? t('updates.hostRuntime.stage') : t('updates.hostRuntime.check')
  return <div className={css.page}>
    <header><h2>{t('updates.center')}</h2><p>{t('updates.description')}</p></header>
    <section className={css.summary} aria-label={t('updates.overview')}>
      <div><h3 role={failed ? 'alert' : 'status'}>{summary}</h3><p>{t(ready ? 'updates.restartHint' : 'updates.checkHint')}</p></div>
      <div className={css.actions}>
        <Button variant="outline" disabled={working} onClick={checkAll}>{t('updates.check')}</Button>
        {count > 0 ? <Button variant="primary" disabled={working || failed} onClick={prepareAll}>{t('updates.updateAll')}</Button>
          : ready ? <Button variant="primary" disabled={working || failed || view.presentation === undefined} onClick={restartUpdates}>{t('updates.restart')}</Button> : null}
      </div>
    </section>
    <div className={css.components}>
      <section className={css.card} aria-label={t('updates.desktop')}>
        <div className={css.heading}><h3>{t('updates.desktop')}</h3>
          <Button variant="outline" size="sm" disabled={working || busy || (state?.phase === 'ready' && failed) || state?.configured === false || (state === undefined && !view.failed)} onClick={openDesktopUpdate}>
            {state?.phase === 'ready' ? t('desktop.update.ready') : view.failed || state?.phase === 'error' ? t('desktop.update.retry') : state?.phase === 'available' ? t('desktop.update.available') : t('updates.check')}
          </Button>
        </div>
        <p>{t('general.currentVersion', { version: process.env.DSH_CLIENT_VERSION ?? '' })}</p>
        {state?.version === undefined ? null : <p>{t('updates.target', { version: state.version })}</p>}
        {state?.releaseNotes === undefined ? null : <details><summary>{t('updates.releaseNotes')}</summary><p className={css.notes}>{state.releaseNotes}</p></details>}
        <p role={view.failed || state?.phase === 'error' ? 'alert' : 'status'}>{view.failed ? t('desktop.update.checkFailed') : state === undefined ? t('updates.web') : state.configured === false ? t('updates.unconfigured') : state.phase === 'idle' ? t(state.checkedAt ? 'updates.latest' : 'updates.unchecked') : copy?.detail}</p>
        {state?.phase === 'downloading' ? <progress max={100} value={state.percent ?? 0} aria-label={copy?.label} /> : null}
      </section>
      <section className={css.card} aria-label={t('updates.hostRuntime.title')}>
        <div className={css.heading}><h3>{t('updates.hostRuntime.title')}</h3>
          <Button variant="outline" size="sm" disabled={working || hostBusy || (hostRuntime?.phase === 'staged' && failed) || state === undefined}
            onClick={() => { openHostRuntimeUpdate(hostRuntime?.phase === 'available') }}>{hostAction}</Button>
        </div>
        <p>{hostRuntime?.activeVersion === undefined ? t('updates.hostRuntime.bundled') : t('updates.hostRuntime.active', { version: hostRuntime.activeVersion })}</p>
        {hostRuntime?.candidateVersion === undefined ? null : <p>{t('updates.hostRuntime.target', { version: hostRuntime.candidateVersion })}</p>}
        <p role={hostRuntime?.phase === 'error' ? 'alert' : 'status'}>{hostRuntime?.phase === 'error' ? t('updates.hostRuntime.failed')
          : hostRuntime?.phase === 'staged' ? t('updates.hostRuntime.staged') : hostRuntime?.phase === 'available' ? t('updates.hostRuntime.available') : t('updates.hostRuntime.description')}</p>
      </section>
    </div>
    <section className={css.card} aria-label={t('updates.plugins')}>
      <h3>{t('updates.plugins')}</h3>{renderSlot('settings.updates.plugins', {})}
    </section>
  </div>
}
