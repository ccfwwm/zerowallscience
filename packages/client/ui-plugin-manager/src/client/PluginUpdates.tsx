/** Plugin updates contributed to the settings-owned update page. */
import { useEffect, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { UpdateCenterSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { PluginManagerFace } from './manager-store.ts'
import { updateCandidate } from './manager-store.ts'
import { UpdateDialog } from './versions.tsx'
import { packageText } from './presentation.ts'
import css from './PluginUpdates.module.css'

/** Activation state read independently of the visible page. */
export interface BusinessStatus { phase: string; pending: boolean; failed?: boolean }
/** Framework-injected business journal and safe Desktop restart action. */
export interface BusinessUpdatesFace {
  hooks: { businessStatus: SnapshotStore<BusinessStatus>; updateCenter: SnapshotStore<UpdateCenterSnapshot> }
  restartFeatures?: () => Promise<void>
  checkPluginUpdates: () => void
  repairFeatures: () => Promise<void> }
type Props = PropsRuntime<'settings.updates.plugins'> & PropsLocale<'pluginManager'> & PropsRenderSlots<'settings.updates.plugin-row'> & InjectFace<PluginManagerFace & BusinessUpdatesFace>

/** @param props - Shared plugin manager and activation journal. @returns Plugin update list. */
export function PluginUpdates(props: Props) {
  const { t } = props
  const restartFeatures = props.restartFeatures
  const state = props.usePluginManager(value => value)
  const status = props.useBusinessStatus(value => value)
  const center = props.useUpdateCenter(value => value)
  const runtime = center.sources.find(source => source.id === 'runtime')
  const [restarting, setRestarting] = useState(false)
  const [restartFailed, setRestartFailed] = useState(false)
  useEffect(() => { props.ensure() }, [props.ensure])
  const [expanded, setExpanded] = useState<string>()
  const eligible = state.packages.filter(pkg => pkg.update === 'registry')
  const pending = status.pending || state.restartRequired || runtime?.ready === true
  const busy = restarting || center.operation !== 'idle' || runtime?.busy === true || state.updatePreparing || state.update?.phase === 'running' || state.refreshStatus === 'refreshing'
  const available = eligible.filter((pkg) => {
    const check = state.versions[pkg.name]
    return check?.phase === 'done' && updateCandidate(check.list) !== undefined
  }).length + (runtime?.available ?? 0)
  return <div className={css.root}>
    <div className={css.toolbar}>
      <Button variant="outline" size="sm" disabled={busy} onClick={props.checkPluginUpdates}>{t('featuresRefreshAll')}</Button>
      {available > 0 && !pending ? <Button variant="primary" size="sm" disabled={busy} onClick={() => { void props.prepareUpdates() }}>
        {t('featuresUpdateAll', { count: available })}
      </Button> : null}
      {pending && restartFeatures !== undefined ? <Button variant="primary" size="sm" disabled={busy} onClick={() => {
        setRestartFailed(false); setRestarting(true)
        void restartFeatures().catch(() => { setRestartFailed(true) }).finally(() => { setRestarting(false) })
      }}>{t('featuresRestart')}</Button> : null}
    </div>
    {pending ? <p role="status">{t(restartFeatures === undefined ? 'featuresWebRestart' : 'featuresPending')}</p> : null}
    {['restored', 'restore-failed'].includes(status.phase) ? <div className={css.toolbar}>
      <Button variant="outline" size="sm" disabled={restarting} onClick={() => {
        setRestartFailed(false); setRestarting(true)
        void props.repairFeatures().catch(() => { setRestartFailed(true) }).finally(() => { setRestarting(false) })
      }}>{t('featuresRepair')}</Button>
    </div> : null}
    {restartFailed || status.failed ? <p role="alert">{t('featuresUnavailable')}</p> : null}
    {status.phase === 'restored' ? <p role="status">{t('featuresRestored')}</p> : null}
    {status.phase === 'restore-failed' ? <p role="alert">{t('featuresBroken')}</p> : null}
    {state.status === 'error' ? <p role="alert">{t('refreshError')}</p> : null}
    <div className={css.list}>{props.renderSlot('settings.updates.plugin-row', {})}{eligible.map((pkg) => {
      const check = state.versions[pkg.name]
      const candidate = check?.phase === 'done' ? updateCandidate(check.list) : undefined
      const checking = check?.phase === 'checking'
      const failed = check?.phase === 'done' && check.list.status === 'refused'
      return <article className={css.package} key={pkg.name}>
        <div className={css.packageInfo}><h4>{packageText(pkg,
          props.resolveText).title}</h4><span>{pkg.version ?? '—'}{candidate && <> → {candidate.version}</>}</span>
        {failed ? <small role="alert">{t('refreshError')}</small> : null}
        </div>
        <div className={css.actions}>{check === undefined || failed ? <Button variant="outline" size="sm" disabled={checking || pending || state.update?.phase === 'running'} onClick={() => { props.checkVersions(pkg.name) }}>{t('featuresCheck')}</Button> : null}
          {candidate && <Button variant="primary" size="sm" disabled={pending || busy} onClick={() => { void props.prepareUpdates(pkg.name) }}>{t('featuresUpdate')}</Button>}
          <Button variant="ghost" size="sm" aria-expanded={expanded === pkg.name} onClick={() =>{  setExpanded(expanded === pkg.name ? undefined : pkg.name) }}>{t('featuresDetails')}</Button>
        </div>
        {expanded === pkg.name && <div className={css.details}><code>{pkg.name}</code>
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
