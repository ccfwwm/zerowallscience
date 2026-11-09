/** Plugin updates contributed to the settings-owned update page. */
import { useEffect, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { PluginManagerFace } from './manager-store.ts'
import { updateCandidate } from './manager-store.ts'
import { UpdateDialog } from './versions.tsx'
import { packageText } from './presentation.ts'
import css from './PluginUpdates.module.css'

/** Activation state read independently of the visible page. */
export interface BusinessStatus { phase: string; pending: boolean; failed?: boolean }
/** Framework-injected business journal and safe Desktop restart action. */
export interface BusinessUpdatesFace { hooks: { businessStatus: SnapshotStore<BusinessStatus> }
  restartFeatures?: () => Promise<void>
  repairFeatures: () => Promise<void> }
type Props = PropsRuntime<'settings.updates.plugins'> & PropsLocale<'pluginManager'> & InjectFace<PluginManagerFace & BusinessUpdatesFace>

/** @param props - Shared plugin manager and activation journal. @returns Plugin update list. */
export function PluginUpdates(props: Props) {
  const { t } = props
  const state = props.usePluginManager(value => value)
  const status = props.useBusinessStatus(value => value)
  const [restarting, setRestarting] = useState(false)
  const [restartFailed, setRestartFailed] = useState(false)
  useEffect(() => { props.refresh() }, [props.refresh])
  const [expanded, setExpanded] = useState<string>()
  const eligible = state.packages.filter(pkg => pkg.updatable)
  const candidates = eligible.filter((pkg) => { const check = state.versions[pkg.name]
    return pkg.profileOverrideAllowed === true && check?.phase === 'done' && updateCandidate(check.list) !== undefined })
  const pending = status.pending || state.update?.result?.result.application === 'restart-required'
  return <div className={css.root}>
    <div className={css.toolbar}><Button variant="outline" size="sm" disabled={state.refreshStatus === 'refreshing'} onClick={props.refresh}>{t('featuresRefreshAll')}</Button>
      <Button variant="primary" size="sm" disabled={pending || state.refreshStatus === 'refreshing' || state.update?.phase === 'running' || !candidates.length} onClick={props.openBulkUpdate}>{t('featuresUpdateAll',
        { count: candidates.length })}</Button>
      {pending && props.restartFeatures !== undefined ? <Button variant="primary" size="sm" disabled={restarting} onClick={() => {
        setRestartFailed(false); setRestarting(true)
        void props.restartFeatures?.().catch(() =>{  setRestartFailed(true) }).finally(() =>{  setRestarting(false) })
      }}>{t('featuresRestart')}</Button> : null}
      {['restored', 'restore-failed'].includes(status.phase) ? <Button variant="outline" size="sm" disabled={restarting} onClick={() => {
        setRestartFailed(false); setRestarting(true)
        void props.repairFeatures().catch(() =>{  setRestartFailed(true) }).finally(() =>{  setRestarting(false) })
      }}>{t('featuresRepair')}</Button> : null}
    </div>
    {restartFailed || status.failed ? <p role="alert">{t('featuresUnavailable')}</p> : null}
    {status.phase === 'restored' ? <p role="status">{t('featuresRestored')}</p> : null}
    {status.phase === 'restore-failed' ? <p role="alert">{t('featuresBroken')}</p> : null}
    {state.status === 'error' ? <p role="alert">{t('refreshError')}</p> : null}
    <div className={css.list}>{eligible.map((pkg) => {
      const check = state.versions[pkg.name]
      const candidate = check?.phase === 'done' ? updateCandidate(check.list) : undefined
      const checking = check?.phase === 'checking'
      const failed = check?.phase === 'done' && check.list.status === 'refused'
      return <article className={css.package} key={pkg.name}>
        <div className={css.packageInfo}><h4>{packageText(pkg,
          props.resolveText).title}</h4><span>{pkg.version ?? '—'}{candidate && <> → {candidate.version}</>}</span>
        <small role={failed ? 'alert' : undefined}>{checking ? t('versionsChecking') : failed ? t('refreshError') : candidate ? t('versionsAvailable',
          { version: candidate.version }) : check === undefined ? t('featuresUnchecked') : t('versionsLatest')}</small>
        </div>
        <div className={css.actions}><Button variant="outline" size="sm" disabled={checking || pending || state.update?.phase === 'running'} onClick={() =>{  props.checkVersions(pkg.name) }}>{t('featuresCheck')}</Button>
          {candidate && <Button variant="primary" size="sm" disabled={pending || state.update?.phase === 'running'} onClick={() =>{  props.openUpdate(pkg.name,
            candidate.version) }}>{t('featuresUpdate')}</Button>}
          <Button variant="ghost" size="sm" onClick={() =>{  setExpanded(expanded === pkg.name ? undefined : pkg.name) }}>{t('featuresDetails')}</Button>
        </div>
        {expanded === pkg.name && <div className={css.details}><code>{pkg.name}</code>{pkg.bundledVersion && <p>{t('featuresBundled',
          { version: pkg.bundledVersion })}</p>}
        {check?.phase === 'done' && check.list.status === 'listed' && check.list.versions.map(version => <div key={version.version}><span>{version.version}</span><small>{version.incompatible ? t('versionsBlocked') : version.deprecated ?? version.publishedAt?.slice(0,
          10)}</small></div>)}
        </div>}
      </article>
    })}</div>
    {state.update === null ? null : <UpdateDialog update={state.update} title={state.update.targets === undefined ? state.update.packageName : t('featuresBatchTitle',
      { count: state.update.targets.length })} t={t}
    onRun={props.runUpdate} onCancel={props.cancelUpdate} onClose={props.closeUpdate} onToggleOutput={props.toggleUpdateOutput} />}
  </div>
}
