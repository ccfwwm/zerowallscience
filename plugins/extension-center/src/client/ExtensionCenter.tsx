import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Boxes, CheckCircle2, CircleHelp, Download, Pin, PinOff, Power, RefreshCw, Search, Trash2, Upload, Wrench } from 'lucide-react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { PythonLayer, PythonLayerCheck } from '@zerowallscience/plugin-base/client'
import { NS } from './locales.js'
import css from './ExtensionCenter.module.css'
import type { ResourceCheckItem, ResourceCheckResult } from '@zerowallscience/plugin-base/client'
import { boundedRequest } from './requests.js'
import { isVisibleResource } from '../../../base/src/shared/resource-visibility.js'

type Props = PropsRuntime<'settings.section'> & PropsLocale<typeof NS>
type Kind = 'plugin' | 'skill' | 'mcp' | 'python'
type ResourceKindOnly = Exclude<Kind, 'python'>
type Resource = ResourceCheckItem & { pythonLayer?: PythonLayer; capabilityId?: string; pythonInstalled?: boolean; pythonNeedsInstall?: boolean; packageCount?: number; installedPackageCount?: number; pendingPackageCount?: number; pythonAvailable?: boolean }
type CheckResult = ResourceCheckResult
type ResourceFilter = 'all' | 'updates' | 'installed' | 'disabled' | 'missing'
type Job = { taskId: string; kind: ResourceKindOnly; id?: string; action: string; status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'pending-restart'; phase?: string; progress?: number; retries?: number; canCancel?: boolean; cancelRequested?: boolean; currentResource?: string; completed?: number; total?: number; lastActivityAt?: string; logLines?: string[]; error?: string; createdAt?: string; updatedAt?: string; oldVersion?: string; newVersion?: string }
type PythonJob = { taskId: string; layer: PythonLayer; state: 'queued' | 'running' | 'succeeded' | 'partial' | 'failed' | 'interrupted' | 'cancelled'; progress?: number; currentPackage?: string; error?: string; message?: string }
type DesktopResources = NonNullable<NonNullable<Window['zerowallDesktop']>['resources']>
type DesktopPythonLayers = NonNullable<NonNullable<Window['zerowallDesktop']>['pythonLayers']>

const operationKey = 'zerowall.extension-center.operation'
function rememberOperation(): void {
  try { sessionStorage.setItem(operationKey, String(Date.now())) } catch { /* Storage may be unavailable. */ }
}
function recentlyUpdated(): boolean {
  try { const time = Number(sessionStorage.getItem(operationKey)); return time > 0 && Date.now() - time < 10 * 60_000 } catch { return false }
}
function isCoreResource(item: Resource, kind: Kind): boolean {
  // Required ZeroWall plugins cannot be disabled, but still update independently.
  return kind === 'plugin' && (item.source === 'runtime' || (item.id.startsWith('@deepseek-ai/dsh-') && item.managed === false))
}
function isInstalled(item: Resource): boolean {
  if (item.pythonLayer) return Boolean(item.pythonInstalled)
  return item.installState !== 'missing' && item.installState !== 'not-installed' && item.source !== 'catalog' && item.source !== 'removed' && Boolean(item.installedVersion || item.installState === 'installed' || ['profile', 'bundled', 'disabled', 'runtime'].includes(item.source ?? ''))
}
function canUpdate(item: Resource, kind: Kind): boolean {
  return Boolean(item.updateAvailable && !item.pinnedVersion && !item.updateBlocked && !isCoreResource(item, kind) && item.pythonAvailable !== false)
}
function matchesFilter(item: Resource, filter: ResourceFilter, kind: Kind): boolean {
  if (filter === 'updates') return Boolean(item.updateAvailable && !isCoreResource(item, kind))
  if (filter === 'installed') return isInstalled(item)
  if (filter === 'disabled') return item.enabled === false || item.source === 'disabled'
  if (filter === 'missing') return !isInstalled(item)
  return true
}

function pythonResource(layer: PythonLayer, status: PythonLayerCheck, capabilityId?: string, counts?: NonNullable<PythonLayerCheck['capabilityCounts']>[string]): Resource {
  const packageCount = counts?.packageCount ?? status.packageCount
  const installedPackageCount = counts?.installedPackageCount ?? status.installedPackageCount
  const pendingPackageCount = counts?.pendingPackageCount ?? status.pendingPackageCount
  const hasInstalledPackages = installedPackageCount > 0 || (counts?.changes ?? status.changes).some(change => Boolean(change.from))
  const pythonNeedsInstall = packageCount > 0 && (status.needsRuntime || !hasInstalledPackages)
  const id = capabilityId ? `capability:${capabilityId}` : layer
  return {
    id, actionId: id, capabilityId, pythonLayer: layer,
    name: capabilityId ? capabilityId : layer === 'core' ? 'Python Core' : 'Python Science',
    version: status.revision,
    installedVersion: `${installedPackageCount}/${packageCount} packages`,
    updateAvailable: pendingPackageCount > 0 && !pythonNeedsInstall,
    source: status.source === 'bundled' ? 'bundled' : 'profile', catalogSigned: true, signed: true, restartRequired: true,
    pythonInstalled: !pythonNeedsInstall && packageCount > 0,
    pythonNeedsInstall, packageCount, installedPackageCount, pendingPackageCount, pythonAvailable: status.available,
  }
}

export function ExtensionCenter({ t }: Props): JSX.Element {
  const [kind, setKind] = useState<Kind>('plugin')
  const [rows, setRows] = useState<CheckResult[]>([])
  const [pythonResources, setPythonResources] = useState<Resource[]>([])
  const [pythonCheckError, setPythonCheckError] = useState<string>()
  const [pythonJob, setPythonJob] = useState<PythonJob>()
  const [jobs, setJobs] = useState<Job[]>([])
  const [query, setQuery] = useState('')
  const [resourceFilter, setResourceFilter] = useState<ResourceFilter>('all')
  const [busy, setBusy] = useState(false)
  const [checking, setChecking] = useState(false)
  const [states, setStates] = useState<Partial<Record<Kind, 'loading' | 'ready' | 'unavailable' | 'error'>>>({})
  const [errors, setErrors] = useState<Partial<Record<Kind, string>>>({})
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const hadActiveJobs = useRef(false)
  const lifecycle = useRef(0)
  const sequences = useRef<Partial<Record<`${'local' | 'remote'}:${Kind}`, number>>>({})
  const remoteApplied = useRef<Partial<Record<Kind, number>>>({})
  const checkInFlight = useRef(false)
  const [message, setMessage] = useState<string>()
  const [operationFailed, setOperationFailed] = useState(false)
  const api = window.zerowallDesktop?.resources as DesktopResources | undefined
  const pythonApi = window.zerowallDesktop?.pythonLayers as DesktopPythonLayers | undefined

  const load = useCallback(async (remote: boolean) => {
    const generation = lifecycle.current
    const alive = () => lifecycle.current === generation
    await Promise.all((['plugin', 'skill', 'mcp', 'python'] as Kind[]).map(async item => {
      const sequenceKey = `${remote ? 'remote' : 'local'}:${item}` as const
      const request = (sequences.current[sequenceKey] ?? 0) + 1
      sequences.current[sequenceKey] = request
      const localRequestAtStart = sequences.current[`local:${item}`] ?? 0
      const remoteRequestAtStart = sequences.current[`remote:${item}`] ?? 0
      const current = () => alive()
        && sequences.current[sequenceKey] === request
        && (!remote || sequences.current[`local:${item}`] === localRequestAtStart)
        && (remote || (remoteApplied.current[item] ?? 0) <= remoteRequestAtStart)
      if (!remote) setStates(previous => ({ ...previous, [item]: 'loading' }))
      try {
        if (item === 'python') {
          if (!pythonApi) throw new Error('Desktop resource bridge unavailable')
          const layers = ['core', 'science', 'capability'] as PythonLayer[]
          const results = await Promise.allSettled(layers.map(layer => boundedRequest(remote ? pythonApi.check(layer) : pythonApi.listLocal(layer), remote ? 15_000 : 5_000)))
          if (!current()) return
          const successful: Resource[] = [], failed: string[] = []
          results.forEach((result, index) => {
            const layer = layers[index]!
            if (result.status === 'rejected') { failed.push(`${layer}: ${String(result.reason)}`); return }
            if (layer === 'capability') successful.push(...Object.entries(result.value.capabilityCounts ?? {}).map(([id, counts]) => pythonResource(layer, result.value, id, counts)))
            else successful.push(pythonResource(layer, result.value))
          })
          setPythonResources(previous => [...previous.filter(row => results[layers.indexOf(row.pythonLayer!)]?.status === 'rejected'), ...successful])
          setPythonCheckError(failed.length ? failed.join('\n') : undefined)
          if (failed.length === layers.length) throw new Error(failed.join('\n'))
          if (remote) remoteApplied.current[item] = request
        } else {
          if (!api) throw new Error('Desktop resource bridge unavailable')
          const result = await boundedRequest(remote ? api.check(item, false) : api.list(item), remote ? 15_000 : 5_000)
          if (!current()) return
          if (remote && result.catalogStatus === 'unavailable') throw new Error(result.error ?? 'Catalog unavailable')
          if (remote) remoteApplied.current[item] = request
          const visible = { ...result, resources: result.resources.filter(resource => isVisibleResource(item, resource.id)) }
          setRows(previous => [...previous.filter(row => row.kind !== item), visible])
          if (result.domainAvailable === false) { setStates(previous => ({ ...previous, [item]: 'unavailable' })); return }
        }
        if (current()) { setStates(previous => ({ ...previous, [item]: 'ready' })); setErrors(previous => ({ ...previous, [item]: undefined })) }
      } catch (error) {
        if (!current()) return
        const reason = error instanceof Error ? error.message : String(error)
        setErrors(previous => ({ ...previous, [item]: reason }))
        if (!remote) setStates(previous => ({ ...previous, [item]: 'error' }))
        if (item === 'python') setPythonCheckError(reason)
      }
    }))
  }, [api, pythonApi])
  const refresh = useCallback(() => load(false), [load])
  const checkUpdates = async () => {
    if (checkInFlight.current) return
    checkInFlight.current = true; setChecking(true)
    const generation = lifecycle.current
    try { await load(true) } finally { checkInFlight.current = false; if (generation === lifecycle.current) setChecking(false) }
  }

  const refreshJobs = useCallback(async () => {
    const generation = lifecycle.current
    if (api?.listJobs) {
      const result = await boundedRequest(api.listJobs(), 5000)
      if (generation === lifecycle.current) setJobs(result as Job[])
    }
  }, [api])

  useEffect(() => {
    lifecycle.current++
    void refresh()
    if (!recentlyUpdated()) void checkUpdates()
    void refreshJobs().catch(() => {})
    return () => { lifecycle.current++ }
  }, [refresh, refreshJobs])
  useEffect(() => {
    if (api?.onJob === undefined) return
    return api.onJob(job => { setJobs(current => [job as Job, ...current.filter(item => item.taskId !== job.taskId)]) })
  }, [api])
  const activeJobs = jobs.some(job => job.status === 'queued' || job.status === 'running')
  const operationBusy = busy || activeJobs
  useEffect(() => {
    if (!activeJobs) {
      if (hadActiveJobs.current && !busy) void refresh()
      hadActiveJobs.current = false
      return
    }
    hadActiveJobs.current = true
    const timer = setInterval(() => { void refreshJobs().catch(() => {}) }, 1000)
    return () => clearInterval(timer)
  }, [activeJobs, busy, refresh, refreshJobs])

  const current = rows.find(item => item.kind === kind)
  const filtered = useMemo(() => (kind === 'python' ? pythonResources : current?.resources ?? []).filter(item => matchesFilter(item, resourceFilter, kind) && `${item.id} ${item.name ?? ''}`.toLowerCase().includes(query.trim().toLowerCase())), [current, kind, pythonResources, query, resourceFilter])
  const updates = filtered.filter(item => canUpdate(item, kind))
  const allUpdates = [...rows.flatMap(row => row.resources.filter(item => canUpdate(item, row.kind)).map(item => ({ kind: row.kind, item }))), ...pythonResources.filter(item => canUpdate(item, 'python')).map(item => ({ kind: 'python' as const, item }))]
  const selectedUpdates = allUpdates.filter(update => selected.has(`${update.kind}:${update.item.id}`))
  const localFailed = states[kind] === 'error'
  const totalResources = rows.reduce((sum, row) => sum + row.resources.length, 0) + pythonResources.length
  const totalUpdates = allUpdates.length
  const checkFailed = Object.values(errors).some(Boolean) || Boolean(pythonCheckError) || rows.some(row => row.error || row.catalogStatus === 'unavailable' || row.domainAvailable === false)
  const loading = Object.values(states).some(state => state === 'loading')
  const checkedAt = rows.map(row => row.checkedAt).filter(Boolean).sort().at(-1)
  const resourceName = (item: Resource): string => {
    if (item.pythonLayer && !item.capabilityId) return t(item.pythonLayer === 'core' ? 'pythonCore' : 'pythonScience')
    const key = `name_${item.id.slice('@zerowallscience/plugin-'.length).replaceAll('-', '_')}`
    const name = item.id.startsWith('@zerowallscience/plugin-') ? t(key as 'name_base') : undefined
    return item.name ?? (name && name !== key ? name : item.id)
  }
  const jobAction = (job: Job): string => {
    if (job.action === 'update-batch') return t('batchPlugins')
    const labels = { update: 'update', install: 'install', import: 'import', rollback: 'rollback', enable: 'enable', disable: 'disable', remove: 'remove', repair: 'repair', pin: 'pin', unpin: 'unpin', restart: 'restartServer' } as const
    return job.action in labels ? t(labels[job.action as keyof typeof labels]) : job.action
  }
  const jobName = (job: Job): string => job.action === 'update-batch' ? jobAction(job) : `${jobAction(job)} · ${job.action === 'import' ? t(job.kind === 'plugin' ? 'plugins' : job.kind === 'skill' ? 'skills' : 'mcp') : job.id ? resourceName({ id: job.id } as Resource) : t(job.kind === 'plugin' ? 'plugins' : job.kind === 'skill' ? 'skills' : 'mcp')}`
  const jobTime = (job: Job): string | undefined => {
    const value = job.updatedAt ?? job.createdAt
    return value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : undefined
  }
  const rollbackConflict = (job: Job): boolean => job.action === 'rollback' && Boolean(job.error?.includes('PLUGIN_ROLLBACK_CONFLICT'))
  const resourceStatus = (item: Resource): string => {
    if (isCoreResource(item, kind)) return t('systemCore')
    if (item.source === 'removed') return t('source_removed')
    if (item.installState === 'missing' && item.source !== 'catalog') return t('missing')
    if (item.installState === 'missing' || item.source === 'catalog' || item.pythonNeedsInstall) return t('notInstalled')
    if (item.pythonLayer && !item.pythonInstalled) return t('notInstalled')
    if (item.enabled === false || item.source === 'disabled') return t('disabled')
    if (item.updateAvailable && !item.pinnedVersion && !item.updateBlocked) return t('available')
    return t('installed')
  }

  const waitForJob = async (taskId: string): Promise<Job | undefined> => {
    const generation = lifecycle.current
    let job = await boundedRequest(api!.getJob(taskId), 5000) as Job | undefined
    while (job && (job.status === 'queued' || job.status === 'running')) {
      setJobs(current => [job!, ...current.filter(item => item.taskId !== taskId)])
      await new Promise(resolve => setTimeout(resolve, 300))
      if (generation !== lifecycle.current) return
      job = await boundedRequest(api!.getJob(taskId), 5000) as Job | undefined
    }
    if (generation !== lifecycle.current) return
    if (job) setJobs(current => [job, ...current.filter(item => item.taskId !== taskId)])
    if (!job || job.status === 'failed') throw new Error(job?.error ?? t('failed'))
    if (job.status === 'cancelled') throw new Error(t('cancelled'))
    return job
  }

  const updatePythonLayer = async (item: Resource): Promise<void> => {
    const generation = lifecycle.current
    if (!pythonApi || !item.pythonLayer) throw new Error(t('noDesktop'))
    const started = await pythonApi.update(item.pythonLayer, item.capabilityId)
    if (!started.taskId) {
      if (started.upToDate) return
      throw new Error(t('failed'))
    }
    let task = started.task as PythonJob | undefined
    if (task) setPythonJob(task)
    while (task && (task.state === 'queued' || task.state === 'running')) {
      await new Promise(resolve => setTimeout(resolve, 500))
      if (generation !== lifecycle.current) return
      const latest = await boundedRequest(pythonApi.taskStatus(started.taskId), 5000)
      if (generation !== lifecycle.current) return
      task = latest.task as PythonJob | undefined
      if (task) setPythonJob(task)
    }
    if (task?.state === 'failed' || task?.state === 'cancelled' || task?.state === 'interrupted') throw new Error(task.error ?? task.message ?? t('failed'))
    if (!task) throw new Error(t('failed'))
  }

  const run = async (action: string, item?: Resource, source?: string) => {
    const generation = lifecycle.current
    const alive = () => generation === lifecycle.current
    if (kind === 'python') {
      if (!item || !['install', 'update'].includes(action)) return
      setBusy(true); setMessage(undefined); setOperationFailed(false)
      try { await updatePythonLayer(item); if (!alive()) return; setMessage(t('operationComplete')); await refresh() }
      catch (error) { if (!alive()) return; setOperationFailed(true); setMessage(error instanceof Error ? error.message : t('failed')) }
      finally { if (alive()) setBusy(false) }
      return
    }
    if (!api?.startJob) return
    setBusy(true); setMessage(undefined); setOperationFailed(false)
    try {
      const id = ['enable', 'disable', 'remove', 'restart'].includes(action) ? item?.actionId ?? item?.id : item?.id
      if (kind === 'plugin' && id && ['disable', 'remove'].includes(action) && api.dependents) {
        const dependents = await api.dependents(id)
        if (dependents.length && !window.confirm(`${t('dependentWarning')}\n${dependents.join('\n')}`)) return
        if (dependents.length) source = JSON.stringify({ dependents })
      }
      rememberOperation()
      const started = await api.startJob(kind, action, id ?? source, source)
      const result = await waitForJob(started.taskId)
      if (!alive()) return
      setSelected(new Set()); setMessage(t(result?.status === 'pending-restart' ? 'pendingRestartHint' : 'operationComplete')); await refresh(); await refreshJobs()
    } catch (error) { if (!alive()) return; setOperationFailed(true); setMessage(error instanceof Error ? error.message : t('failed')); await Promise.allSettled([refresh(), refreshJobs()]) }
    finally { if (alive()) setBusy(false) }
  }

  const resumeJob = async (job: Job) => {
    if (!api?.resumeJob || busy) return
    const generation = lifecycle.current
    setBusy(true); setMessage(undefined); setOperationFailed(false); rememberOperation()
    try {
      const started = await api.resumeJob(job.taskId)
      const result = await waitForJob(started.taskId)
      if (generation !== lifecycle.current) return
      setMessage(t(result?.status === 'pending-restart' ? 'pendingRestartHint' : 'operationComplete'))
      await refresh(); await refreshJobs()
    } catch (error) {
      if (generation !== lifecycle.current) return
      setOperationFailed(true); setMessage(String(error)); await refreshJobs()
    } finally { if (generation === lifecycle.current) setBusy(false) }
  }

  const updateAll = async (onlySelected = false) => {
    const generation = lifecycle.current
    const alive = () => generation === lifecycle.current
    if (!api?.startJob || allUpdates.length === 0) return
    setBusy(true); setMessage(undefined); setOperationFailed(false)
    try {
      const planned = onlySelected ? selectedUpdates : allUpdates
      const pluginIds = [...new Set(planned.filter(update => update.kind === 'plugin').map(update => update.item.id))]
      if (pluginIds.length && !api.updatePlugins) throw new Error(t('batchUnsupported'))
      rememberOperation()
      // The Extension Center itself can be in this batch. Finish hot-refresh
      // resources first so its single Host activation cannot interrupt them.
      const skillIds = planned.filter(update => update.kind === 'skill').map(update => update.item.id)
      if (skillIds.length && api.updateSkills) { const started = await api.updateSkills(skillIds); await waitForJob(started.taskId) }
      for (const update of planned.filter(update => update.kind !== 'plugin' && !(update.kind === 'skill' && api.updateSkills))) {
        if (!alive()) return
        if (update.kind === 'python') { await updatePythonLayer(update.item); continue }
        const started = await api.startJob(update.kind, 'update', update.item.id)
        await waitForJob(started.taskId)
      }
      if (!alive()) return
      let pendingRestart = false
      if (pluginIds.length) { const started = await api.updatePlugins!(pluginIds); pendingRestart = (await waitForJob(started.taskId))?.status === 'pending-restart' }
      if (!alive()) return
      setSelected(new Set()); setMessage(t(pendingRestart ? 'pendingRestartHint' : 'operationComplete')); await refresh(); await refreshJobs()
    } catch (error) { if (!alive()) return; setOperationFailed(true); setMessage(error instanceof Error ? error.message : t('failed')); await Promise.allSettled([refresh(), refreshJobs()]) }
    finally { if (alive()) setBusy(false) }
  }

  const importResource = async () => {
    const file = kind === 'skill' ? await window.zerowallDesktop?.chooseDirectory() : await window.zerowallDesktop?.chooseScienceFile?.(kind === 'mcp' ? ['json'] : ['tgz', 'tar.gz'])
    if (file) await run('import', undefined, file)
  }

  return <section className={css.root} aria-labelledby="zerowall-extension-center-title">
    <header className={css.header}>
      <div className={css.heading}><div className={css.eyebrow}><Boxes size={14} aria-hidden="true" /> ZeroWall Science</div><h2 id="zerowall-extension-center-title">{t('title')}</h2><p>{t('intro')}</p></div>
      <div className={css.headerActions}>
        {selectedUpdates.length > 0 && <button type="button" disabled={operationBusy || checking} onClick={() => void updateAll(true)}>{t('updateSelected')} ({selectedUpdates.length})</button>}
        {allUpdates.length > 0 && <button className={css.primary} type="button" disabled={operationBusy || checking} onClick={() => void updateAll()} title={t('batchHint')}>{t('updateAll')}</button>}
        <button type="button" disabled={operationBusy} onClick={() => void refresh()}><RefreshCw size={14} aria-hidden="true" />{t('localRefresh')}</button>
        <button type="button" disabled={operationBusy || checking} onClick={() => void checkUpdates()}><RefreshCw size={14} aria-hidden="true" />{checking ? t('checking') : t('refresh')}</button>
      </div>
    </header>
    <div className={css.summary} aria-label={t('summary')}>
      <div><strong>{totalResources}</strong><span>{t('resourceCount')}</span></div>
      <div data-alert={totalUpdates > 0}><strong>{totalUpdates}</strong><span>{t('available')}</span></div>
      <div><strong>{checkedAt ? new Date(checkedAt).toLocaleTimeString() : '—'}</strong><span>{t('lastChecked')}</span></div>
      <div className={css.summaryState}>{checking || loading ? <><RefreshCw size={14} className={css.spin} />{t('checking')}</> : checkFailed ? <><span className={css.dot} />{t('catalogError')}</> : totalUpdates > 0 ? <><span className={css.dot} />{t('available')}</> : checkedAt ? <><CheckCircle2 size={14} />{t('ready')}</> : <>{t('unchecked')}</>}</div>
    </div>
    <div className={css.toolbar}>
      <nav className={css.tabs} aria-label={t('title')}>
        {(['plugin', 'skill', 'mcp', 'python'] as Kind[]).map(item => { const count = (item === 'python' ? pythonResources : rows.find(row => row.kind === item)?.resources ?? []).filter(resource => canUpdate(resource, item)).length; return <button key={item} role="tab" aria-selected={kind === item} className={kind === item ? css.activeTab : css.tab} type="button" onClick={() => setKind(item)}>{t(item === 'plugin' ? 'plugins' : item === 'skill' ? 'skills' : item === 'mcp' ? 'mcp' : 'python')}{count > 0 && <b>{count}</b>}</button> })}
      </nav>
      <label className={css.searchWrap}><Search size={14} aria-hidden="true" /><input className={css.search} value={query} onChange={event => setQuery(event.target.value)} placeholder={t('search')} aria-label={t('search')} /></label>
      {kind !== 'python' && <button type="button" disabled={operationBusy} onClick={() => void importResource()}><Upload size={14} aria-hidden="true" />{t('import')}</button>}
    </div>
    <div className={css.filters} role="group" aria-label={t('filter')}>
      {(['all', 'updates', 'installed', 'disabled', 'missing'] as ResourceFilter[]).map(value => {
        const count = (kind === 'python' ? pythonResources : current?.resources ?? []).filter(item => matchesFilter(item, value, kind)).length
        return <button key={value} type="button" className={resourceFilter === value ? css.filterActive : css.filter} aria-label={t(`filter_${value}` as 'filter_all')} aria-pressed={resourceFilter === value} onClick={() => setResourceFilter(value)}>{t(`filter_${value}` as 'filter_all')}<b aria-hidden="true">{count}</b></button>
      })}
    </div>
    {kind === 'python' && <p className={css.hint}>{t('pythonHint')}</p>}
    {allUpdates.some(update => update.kind === 'plugin') && <p className={css.hint}>{t('batchHint')}</p>}
    {message && <p className={operationFailed ? css.warning : css.message} role={operationFailed ? 'alert' : 'status'}>{message}</p>}
    {current?.catalogStatus === 'unpublished' && <p className={css.message} role="status">{t('catalogUnpublished')}</p>}
    {current?.catalogStatus === 'local' && <p className={css.message} role="status">{t('unchecked')}</p>}
    {current?.catalogStatus === 'unavailable' && <p className={css.message} role="status">{t('catalogUnavailable')}</p>}
    {(errors[kind] || current?.error || (kind === 'python' && pythonCheckError)) && <details className={css.warning}><summary>{localFailed ? t('localError') : t('catalogError')}</summary><p>{errors[kind] ?? current?.error ?? pythonCheckError}</p></details>}
    <div className={css.meta}><span>{t('status')}: {states[kind] === 'loading' ? t('loadingLocal') : states[kind] === 'error' ? t('localError') : states[kind] === 'unavailable' ? t('unavailable') : t('localReady')} · {t('resourceCount')}: {states[kind] === 'ready' || filtered.length ? filtered.length : '—'}</span><span>{t('available')}: {updates.length}</span></div>
    <div className={css.list}>
      {filtered.map(item => {
        const core = isCoreResource(item, kind)
        const selectable = canUpdate(item, kind)
        return <article className={`${css.row} ${core ? css.coreRow : ''}`} key={`${item.id}@${item.version}`}>
          <div className={css.rowMain}>
            <span className={css.select}>{selectable && <label><input type="checkbox" disabled={operationBusy} aria-label={`${t('selectUpdate')} ${resourceName(item)}`} checked={selected.has(`${kind}:${item.id}`)} onChange={event => { const key = `${kind}:${item.id}`; setSelected(previous => { const next = new Set(previous); if (event.target.checked) next.add(key); else next.delete(key); return next }) }} /></label>}</span>
            <div className={css.identity}><strong title={item.id}>{resourceName(item)}</strong><small title={item.id}>{item.id}</small></div>
            <span className={css.version}>{item.pythonLayer ? item.version : item.updateAvailable && !core ? `${item.installedVersion ?? '—'} → ${item.version}` : item.version === '—' ? t('unversioned') : item.version === 'core' ? t('runtimeCore') : `v${item.installedVersion ?? item.version}`}</span>
            <span className={item.updateAvailable && !core ? css.badgeUpdate : css.badge}>{resourceStatus(item)}</span>
          </div>
          <div className={css.rowMeta}><span>{core ? t('coreDescription') : `${t(`source_${item.source ?? 'catalog'}` as 'source_catalog')} · ${item.catalogSigned ? t('signed') : item.source === 'bundled' ? t('bundledResource') : t('localResource')}`}</span>{item.pythonLayer && <span>{t('packages')}: {item.packageCount} · {t('installed')}: {item.installedPackageCount} · {t('pendingPackages')}: {item.pendingPackageCount}</span>}{(item.pinnedVersion || item.updateBlocked) && <span className={css.blocked}>{item.pinnedVersion ? `${t('pinned')} ${item.pinnedVersion}` : item.updateBlocked}</span>}{kind === 'plugin' && !core && ['error', 'unavailable'].includes(item.activationState ?? '') && <span title={t('activationHint')}>{item.activationState === 'error' ? t('activationError') : t('activationUnavailable')}</span>}{item.pythonAvailable === false && <span>{t('pythonUnavailable')}</span>}</div>
          {!core && <div className={css.actions}>
            {item.pythonNeedsInstall && <button type="button" disabled={operationBusy || item.pythonAvailable === false} onClick={() => void run('install', item)} title={t('install')}><Download size={14} aria-hidden="true" />{t('install')}</button>}
            {selectable && !item.pythonNeedsInstall && <button className={css.updateButton} type="button" disabled={operationBusy || checking} onClick={() => void run('update', item)} title={t('update')}><Download size={14} aria-hidden="true" />{t('update')}</button>}
            {kind === 'plugin' && item.managed !== false && isInstalled(item) && <button className={css.iconButton} type="button" disabled={operationBusy} onClick={() => void run(item.pinnedVersion ? 'unpin' : 'pin', item)} title={item.pinnedVersion ? t('unpin') : t('pin')} aria-label={item.pinnedVersion ? t('unpin') : t('pin')}>{item.pinnedVersion ? <PinOff size={14} aria-hidden="true" /> : <Pin size={14} aria-hidden="true" />}</button>}
            {!item.pythonLayer && item.managed !== false && isInstalled(item) && ['profile', 'bundled', 'disabled'].includes(item.source ?? '') && <button type="button" disabled={operationBusy} onClick={() => void run(item.enabled === false ? 'enable' : 'disable', item)} title={item.enabled === false ? t('enable') : t('disable')} aria-label={item.enabled === false ? t('enable') : t('disable')}><Power size={14} aria-hidden="true" />{item.enabled === false ? t('enable') : t('disable')}</button>}
            {!item.pythonLayer && item.managed !== false && item.source === 'profile' && <button className={css.iconButton} type="button" disabled={operationBusy} onClick={() => void run('remove', item)} title={t('remove')} aria-label={t('remove')}><Trash2 size={14} aria-hidden="true" /></button>}
            {kind === 'mcp' && item.enabled !== false && item.source === 'profile' && <button type="button" disabled={operationBusy} onClick={() => void run('restart', item)} title={t('restartServer')}><RefreshCw size={14} aria-hidden="true" />{t('restartServer')}</button>}
            {kind === 'plugin' && item.source === 'catalog' && <button type="button" disabled={operationBusy} onClick={() => void run('install', item)} title={t('install')}><Download size={14} aria-hidden="true" />{t('install')}</button>}
            {kind === 'plugin' && item.managed !== false && item.source !== 'runtime' && item.source !== 'catalog' && <button className={css.iconButton} type="button" disabled={operationBusy} onClick={() => void run('repair', item)} title={t('repair')} aria-label={t('repair')}><Wrench size={14} aria-hidden="true" /></button>}
          </div>}
          {core && <span className={css.coreMark} title={t('coreDescription')} aria-label={t('coreDescription')}><CircleHelp size={14} aria-hidden="true" /></span>}
        </article>
      })}
      {filtered.length === 0 && states[kind] === 'ready' && <p className={css.empty}>{query || resourceFilter !== 'all' ? t('noMatches') : t('empty')}</p>}
    </div>
    <section className={css.jobs} aria-label={t('tasks')}>
      <h3>{t('tasks')}</h3>
      {jobs.slice(0, 8).map(job => <div className={css.job} key={job.taskId}>
        <div className={css.jobInfo}><strong title={job.id}>{jobName(job)}</strong><div className={css.jobMeta}>{job.oldVersion && <span>{job.oldVersion}{job.newVersion ? ` → ${job.newVersion}` : ''}</span>}{jobTime(job) && <time dateTime={job.updatedAt ?? job.createdAt}>{jobTime(job)}</time>}</div>
          {job.logLines?.length ? <details className={css.jobError}><summary>{t('taskLogs')}</summary><pre>{job.logLines.join('\n')}</pre></details> : null}
          {job.error && <details className={css.jobError}><summary>{rollbackConflict(job) ? t('rollbackConflict') : t('errorDetails')}</summary><p>{job.error}</p></details>}
        </div>
        <span>{job.status === 'failed' ? `${jobAction(job)} · ${t('job_failed')}` : t(`job_${job.status}` as 'job_running')}{['queued', 'running'].includes(job.status) ? ` · ${job.progress ?? 0}%` : ''}{job.phase && ['queued', 'running'].includes(job.status) && <small>{t(({ preparing: 'phase_preparing', downloading: 'phase_downloading', scanning: 'phase_scanning', extracting: 'phase_extracting', copying: 'phase_copying', installing: 'phase_installing', 'verifying-dependencies': 'phase_verifying', snapshot: 'phase_snapshot', applying: 'phase_applying', activating: 'phase_activating', 'health-check': 'phase_health', 'cancellation-requested': 'phase_cancelling' } as const)[job.phase as 'preparing'] ?? 'phase_preparing')}{job.currentResource ? ` · ${job.currentResource}` : ''}{job.total ? ` · ${job.completed ?? 0}/${job.total}` : job.phase === 'scanning' ? ` · ${t('scanCount', { count: job.completed ?? 0 })}` : ''}</small>}</span>
        {(job.status === 'failed' || job.status === 'cancelled') && job.phase !== 'resumed' && job.action !== 'resume-pending' && api?.retryJob && <button type="button" disabled={operationBusy || rollbackConflict(job)} title={rollbackConflict(job) ? t('rollbackConflict') : undefined} aria-label={`${t('retry')} · ${jobName(job)}`} onClick={() => { rememberOperation(); void api.retryJob(job.taskId).then(refreshJobs).catch(error => { setOperationFailed(true); setMessage(String(error)) }) }}>{t('retry')} {jobAction(job)}</button>}
        {job.status === 'pending-restart' && api?.resumeJob && <button type="button" disabled={operationBusy} onClick={() => void resumeJob(job)}>{t('restartAndContinue')}</button>}
        {(job.status === 'queued' || job.status === 'running' || job.status === 'pending-restart') && api?.cancelJob && <button type="button" disabled={job.canCancel === false || job.cancelRequested === true} onClick={() => void api.cancelJob(job.taskId).then(refreshJobs).catch(error => { setOperationFailed(true); setMessage(String(error)) })}>{t('cancel')}</button>}
      </div>)}
      {pythonJob && <div className={css.job} key={pythonJob.taskId}><span title={pythonJob.taskId}>{pythonJob.layer}{pythonJob.currentPackage ? ` · ${pythonJob.currentPackage}` : ''}{pythonJob.error && <small>{pythonJob.error}</small>}</span><span>{t(`pythonJob_${pythonJob.state}` as 'pythonJob_running')} · {pythonJob.progress ?? 0}%</span></div>}
      {jobs.length === 0 && !pythonJob && <p className={css.empty}>{t('noTasks')}</p>}
    </section>
  </section>
}
