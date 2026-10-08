import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { PythonLayer, PythonLayerCheck, ResourceKind } from '@zerowallscience/plugin-base/client'
import { NS } from './locales.js'
import css from './ExtensionCenter.module.css'

type Props = PropsRuntime<'settings.section'> & PropsLocale<typeof NS>
type Kind = 'plugin' | 'skill' | 'mcp' | 'python'
type ResourceKindOnly = Exclude<Kind, 'python'>
type Resource = { id: string; actionId?: string; name?: string; version: string; installedVersion?: string; updateAvailable?: boolean; source?: 'profile' | 'bundled' | 'runtime' | 'catalog' | 'removed' | 'disabled'; signed?: boolean; catalogSigned?: boolean; restartRequired?: boolean; rollbackSupported?: boolean; enabled?: boolean; managed?: boolean; runtimeState?: string; pythonLayer?: PythonLayer; capabilityId?: string }
type CheckResult = { kind: ResourceKindOnly; checkedAt: string; resources: Resource[]; catalogStatus?: 'checked' | 'unavailable' | 'local' | 'unpublished'; error?: string }
type Job = { taskId: string; kind: ResourceKindOnly; id?: string; action: string; status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'; phase?: string; progress?: number; retries?: number; error?: string }
type PythonJob = { taskId: string; layer: PythonLayer; state: 'queued' | 'running' | 'succeeded' | 'partial' | 'failed' | 'interrupted' | 'cancelled'; progress?: number; currentPackage?: string; error?: string; message?: string }
type DesktopResources = NonNullable<NonNullable<Window['zerowallDesktop']>['resources']>
type DesktopPythonLayers = NonNullable<NonNullable<Window['zerowallDesktop']>['pythonLayers']>

function pythonResource(layer: PythonLayer, status: PythonLayerCheck, capabilityId?: string, counts?: NonNullable<PythonLayerCheck['capabilityCounts']>[string]): Resource {
  const packageCount = counts?.packageCount ?? status.packageCount
  const installedPackageCount = counts?.installedPackageCount ?? status.installedPackageCount
  const pendingPackageCount = counts?.pendingPackageCount ?? status.pendingPackageCount
  const id = capabilityId ? `capability:${capabilityId}` : layer
  return {
    id, actionId: id, capabilityId, pythonLayer: layer,
    name: capabilityId ? capabilityId : layer === 'core' ? 'Python Core' : 'Python Science',
    version: status.revision,
    installedVersion: `${installedPackageCount}/${packageCount} packages`,
    updateAvailable: pendingPackageCount > 0,
    source: 'catalog', catalogSigned: true, signed: true, restartRequired: true,
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
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string>()
  const [operationFailed, setOperationFailed] = useState(false)
  const api = window.zerowallDesktop?.resources as DesktopResources | undefined
  const pythonApi = window.zerowallDesktop?.pythonLayers as DesktopPythonLayers | undefined

  const refresh = useCallback(async () => {
    if (api?.check === undefined) { setMessage(t('noDesktop')); return }
    setBusy(true); setMessage(undefined)
    try {
      const check = async (item: ResourceKindOnly, localOnly: boolean): Promise<CheckResult> => {
        try { return await api.check(item, localOnly) }
        catch (error) { return { kind: item, checkedAt: new Date().toISOString(), resources: [], error: error instanceof Error ? error.message : t('failed') } }
      }
      setRows(await Promise.all((['plugin', 'skill', 'mcp'] as ResourceKindOnly[]).map(item => check(item, true))))
      await Promise.all((['plugin', 'skill', 'mcp'] as ResourceKindOnly[]).map(async item => {
        const result = await check(item, false)
        setRows(previous => previous.map(row => row.kind === item ? result : row))
      }))
      if (pythonApi) {
        try {
          const [core, science, capability] = await Promise.all((['core', 'science', 'capability'] as PythonLayer[]).map(layer => pythonApi.check(layer)))
          const capabilities = Object.entries(capability.capabilityCounts ?? {}).map(([id, counts]) => pythonResource('capability', capability, id, counts))
          setPythonResources([pythonResource('core', core), pythonResource('science', science), ...capabilities])
          setPythonCheckError(undefined)
        } catch (error) {
          setPythonResources([])
          setPythonCheckError(error instanceof Error ? error.message : t('failed'))
        }
      } else {
        setPythonResources([])
        setPythonCheckError(t('noDesktop'))
      }
    } finally { setBusy(false) }
  }, [api, pythonApi, t])

  const refreshJobs = useCallback(async () => {
    if (api?.listJobs) setJobs(await api.listJobs() as Job[])
  }, [api])

  useEffect(() => { void refresh(); void refreshJobs().catch(() => {}) }, [refresh, refreshJobs])
  useEffect(() => {
    if (api?.onJob === undefined) return
    return api.onJob(job => { setJobs(current => [job as Job, ...current.filter(item => item.taskId !== job.taskId)]) })
  }, [api])

  const current = rows.find(item => item.kind === kind)
  const filtered = useMemo(() => (kind === 'python' ? pythonResources : current?.resources ?? []).filter(item => `${item.id} ${item.name ?? ''}`.toLowerCase().includes(query.trim().toLowerCase())), [current, kind, pythonResources, query])
  const updates = filtered.filter(item => item.updateAvailable)
  const allUpdates = [...rows.flatMap(row => row.resources.filter(item => item.updateAvailable).map(item => ({ kind: row.kind, item }))), ...pythonResources.filter(item => item.updateAvailable).map(item => ({ kind: 'python' as const, item }))]
  const localFailed = kind === 'python' ? Boolean(pythonCheckError) : Boolean(current?.error && current.catalogStatus === undefined)
  const resourceName = (item: Resource): string => item.name ?? (item.id.startsWith('@zerowallscience/plugin-') ? t(`name_${item.id.slice('@zerowallscience/plugin-'.length).replaceAll('-', '_')}` as 'name_base') : item.id)

  const updatePythonLayer = async (item: Resource): Promise<void> => {
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
      const latest = await pythonApi.taskStatus(started.taskId)
      task = latest.task as PythonJob | undefined
      if (task) setPythonJob(task)
    }
    if (task?.state === 'failed' || task?.state === 'cancelled' || task?.state === 'interrupted') throw new Error(task.error ?? task.message ?? t('failed'))
    if (!task) throw new Error(t('failed'))
  }

  const run = async (action: string, item?: Resource, source?: string) => {
    if (kind === 'python') {
      if (!item || action !== 'update') return
      setBusy(true); setMessage(undefined); setOperationFailed(false)
      try { await updatePythonLayer(item); setMessage(t('ready')); await refresh() }
      catch (error) { setOperationFailed(true); setMessage(error instanceof Error ? error.message : t('failed')) }
      finally { setBusy(false) }
      return
    }
    if (!api?.startJob) return
    setBusy(true); setMessage(undefined); setOperationFailed(false)
    try {
      const id = ['enable', 'disable', 'remove', 'restart'].includes(action) ? item?.actionId ?? item?.id : item?.id
      const started = await api.startJob(kind, action, id ?? source, source)
      let job = await api.getJob(started.taskId) as Job | undefined
      while (job && (job.status === 'queued' || job.status === 'running')) {
        await new Promise(resolve => setTimeout(resolve, 300))
        job = await api.getJob(started.taskId) as Job | undefined
      }
      if (job?.status === 'failed') throw new Error(job.error ?? t('failed'))
      if (job?.status === 'cancelled') throw new Error(t('cancelled'))
      setMessage(t('ready')); await refresh(); await refreshJobs()
    } catch (error) { setOperationFailed(true); setMessage(error instanceof Error ? error.message : t('failed')) }
    finally { setBusy(false) }
  }

  const updateAll = async () => {
    if (!api?.startJob || allUpdates.length === 0) return
    setBusy(true); setMessage(undefined); setOperationFailed(false)
    try {
      for (const update of allUpdates) {
        if (update.kind === 'python') { await updatePythonLayer(update.item); continue }
        const started = await api.startJob(update.kind, 'update', update.item.id)
        let job = await api.getJob(started.taskId) as Job | undefined
        while (job && (job.status === 'queued' || job.status === 'running')) {
          await new Promise(resolve => setTimeout(resolve, 300))
          job = await api.getJob(started.taskId) as Job | undefined
        }
        if (job?.status === 'failed') throw new Error(job.error ?? t('failed'))
        if (job?.status === 'cancelled') throw new Error(t('cancelled'))
      }
      setMessage(t('ready')); await refresh(); await refreshJobs()
    } catch (error) { setOperationFailed(true); setMessage(error instanceof Error ? error.message : t('failed')) }
    finally { setBusy(false) }
  }

  const importResource = async () => {
    const file = kind === 'skill' ? await window.zerowallDesktop?.chooseDirectory() : await window.zerowallDesktop?.chooseScienceFile?.(kind === 'mcp' ? ['json'] : ['tgz', 'tar.gz'])
    if (file) await run('import', undefined, file)
  }

  return <section className={css.root} aria-labelledby="zerowall-extension-center-title">
    <header className={css.header}>
      <div><h2 id="zerowall-extension-center-title">{t('title')}</h2><p>{t('intro')}</p></div>
      {allUpdates.length > 0 && <button type="button" disabled={busy} onClick={() => void updateAll()}>{t('updateAll')}</button>}
      <button className={css.primary} type="button" disabled={busy} onClick={() => void refresh()}>{busy ? t('checking') : t('refresh')}</button>
    </header>
    <div className={css.toolbar}>
      <nav className={css.tabs} aria-label={t('title')}>
        {(['plugin', 'skill', 'mcp', 'python'] as Kind[]).map(item => <button key={item} className={kind === item ? css.activeTab : css.tab} type="button" onClick={() => setKind(item)}>{t(item === 'plugin' ? 'plugins' : item === 'skill' ? 'skills' : item === 'mcp' ? 'mcp' : 'python')}</button>)}
      </nav>
      <input className={css.search} value={query} onChange={event => setQuery(event.target.value)} placeholder={t('search')} aria-label={t('search')} />
      {kind !== 'python' && <button type="button" disabled={busy} onClick={() => void importResource()}>{t('import')}</button>}
    </div>
    {message && <p className={operationFailed ? css.warning : css.message} role={operationFailed ? 'alert' : 'status'}>{message}</p>}
    {current?.catalogStatus === 'unpublished' && <p className={css.message} role="status">{t('catalogUnpublished')}</p>}
    {current?.catalogStatus === 'unavailable' && <p className={css.message} role="status">{t('catalogUnavailable')}</p>}
    {(current?.error || (kind === 'python' && pythonCheckError)) && <details className={css.warning}><summary>{localFailed ? t('localError') : t('catalogError')}</summary><p>{current?.error ?? pythonCheckError}</p></details>}
    <div className={css.meta}><span>{t('status')}: {localFailed ? t('failed') : busy ? t('checking') : current || kind === 'python' && !pythonCheckError ? t('ready') : t('unavailable')} · {t('resourceCount')}: {filtered.length}</span><span>{t('available')}: {updates.length}</span></div>
    <div className={css.list}>
      {filtered.map(item => <article className={css.row} key={`${item.id}@${item.version}`}>
        <div className={css.identity}><strong title={item.id}>{resourceName(item)}</strong><small title={item.id}>{item.id}</small><small>{t(`source_${item.source ?? 'catalog'}` as 'source_catalog')} · {item.catalogSigned ? t('signed') : item.source === 'runtime' ? t('runtimeCore') : item.source === 'bundled' ? t('bundledResource') : t('localResource')}</small></div>
        <span className={css.version}>{item.updateAvailable ? `${item.installedVersion ?? '—'} → ${item.version}` : item.version === '—' ? t('unversioned') : item.version === 'core' ? t('runtimeCore') : `v${item.version}`}</span>
        <span className={item.updateAvailable ? css.badgeUpdate : css.badge}>{item.updateAvailable ? t('available') : item.pythonLayer ? t('installed') : item.source === 'catalog' ? t('notInstalled') : item.enabled === false ? t('disabled') : t('installed')}</span>
        <div className={css.actions}>
          {item.updateAvailable && item.source !== 'runtime' && <button type="button" disabled={busy} onClick={() => void run('update', item)}>{t('update')}</button>}
          {item.rollbackSupported && item.installedVersion && item.source !== 'runtime' && <button type="button" disabled={busy} onClick={() => void run('rollback', item)}>{t('rollback')}</button>}
          {item.managed !== false && ['profile', 'bundled', 'disabled', 'removed'].includes(item.source ?? '') && <button type="button" disabled={busy} onClick={() => void run(item.enabled === false ? 'enable' : 'disable', item)}>{item.enabled === false ? t('enable') : t('disable')}</button>}
          {item.managed !== false && item.source === 'profile' && <button type="button" disabled={busy} onClick={() => void run('remove', item)}>{t('remove')}</button>}
          {kind === 'mcp' && item.enabled !== false && item.source === 'profile' && <button type="button" disabled={busy} onClick={() => void run('restart', item)}>{t('restartServer')}</button>}
          {kind === 'plugin' && item.source === 'catalog' && <button type="button" disabled={busy} onClick={() => void run('install', item)}>{t('install')}</button>}
          {kind === 'plugin' && item.managed !== false && item.source !== 'runtime' && item.source !== 'catalog' && <button type="button" disabled={busy} onClick={() => void run('repair', item)}>{t('repair')}</button>}
        </div>
      </article>)}
      {filtered.length === 0 && <p className={css.empty}>{query ? t('noMatches') : t('empty')}</p>}
    </div>
    <section className={css.jobs} aria-label={t('tasks')}>
      <h3>{t('tasks')}</h3>
      {jobs.slice(0, 8).map(job => <div className={css.job} key={job.taskId}><span title={job.id}>{job.id ?? job.action}{job.error && <small>{job.error}</small>}</span><span>{t(`job_${job.status}` as 'job_running')} · {job.progress ?? 0}%</span>{(job.status === 'failed' || job.status === 'cancelled') && api?.retryJob && <button type="button" onClick={() => void api.retryJob(job.taskId).then(refreshJobs).catch(error => { setOperationFailed(true); setMessage(String(error)) })}>{t('retry')}</button>}{(job.status === 'queued' || job.status === 'running') && api?.cancelJob && <button type="button" onClick={() => void api.cancelJob(job.taskId).then(refreshJobs).catch(error => { setOperationFailed(true); setMessage(String(error)) })}>{t('cancel')}</button>}</div>)}
      {pythonJob && <div className={css.job} key={pythonJob.taskId}><span title={pythonJob.taskId}>{pythonJob.layer}{pythonJob.currentPackage ? ` · ${pythonJob.currentPackage}` : ''}{pythonJob.error && <small>{pythonJob.error}</small>}</span><span>{t(`pythonJob_${pythonJob.state}` as 'pythonJob_running')} · {pythonJob.progress ?? 0}%</span></div>}
      {jobs.length === 0 && !pythonJob && <p className={css.empty}>{t('noTasks')}</p>}
    </section>
  </section>
}
