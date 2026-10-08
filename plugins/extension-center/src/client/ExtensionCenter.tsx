import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { PythonLayer, PythonLayerCheck, ResourceKind } from '@zerowallscience/plugin-base/client'
import { NS } from './locales.js'
import css from './ExtensionCenter.module.css'
import type { ResourceCheckItem, ResourceCheckResult } from '@zerowallscience/plugin-base/client'
import { boundedRequest } from './requests.js'

type Props = PropsRuntime<'settings.section'> & PropsLocale<typeof NS>
type Kind = 'plugin' | 'skill' | 'mcp' | 'python'
type ResourceKindOnly = Exclude<Kind, 'python'>
type Resource = ResourceCheckItem & { pythonLayer?: PythonLayer; capabilityId?: string; pythonInstalled?: boolean }
type CheckResult = ResourceCheckResult
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
    source: status.source === 'bundled' ? 'bundled' : 'profile', catalogSigned: true, signed: true, restartRequired: true,
    pythonInstalled: !status.needsRuntime && pendingPackageCount === 0 && packageCount > 0,
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
  const [checking, setChecking] = useState(false)
  const [states, setStates] = useState<Partial<Record<Kind, 'loading' | 'ready' | 'unavailable' | 'error'>>>({})
  const [errors, setErrors] = useState<Partial<Record<Kind, string>>>({})
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const lifecycle = useRef(0)
  const sequences = useRef<Partial<Record<Kind, number>>>({})
  const checkInFlight = useRef(false)
  const [message, setMessage] = useState<string>()
  const [operationFailed, setOperationFailed] = useState(false)
  const api = window.zerowallDesktop?.resources as DesktopResources | undefined
  const pythonApi = window.zerowallDesktop?.pythonLayers as DesktopPythonLayers | undefined

  const load = useCallback(async (remote: boolean) => {
    const generation = lifecycle.current
    const alive = () => lifecycle.current === generation
    await Promise.all((['plugin', 'skill', 'mcp', 'python'] as Kind[]).map(async item => {
      const request = (sequences.current[item] ?? 0) + 1
      sequences.current[item] = request
      const current = () => alive() && sequences.current[item] === request
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
        } else {
          if (!api) throw new Error('Desktop resource bridge unavailable')
          const result = await boundedRequest(remote ? api.check(item, false) : api.list(item), remote ? 15_000 : 5_000)
          if (!current()) return
          if (remote && result.catalogStatus === 'unavailable') throw new Error(result.error ?? 'Catalog unavailable')
          setRows(previous => [...previous.filter(row => row.kind !== item), result])
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
    void refresh(); void refreshJobs().catch(() => {})
    return () => { lifecycle.current++ }
  }, [refresh, refreshJobs])
  useEffect(() => {
    if (api?.onJob === undefined) return
    return api.onJob(job => { setJobs(current => [job as Job, ...current.filter(item => item.taskId !== job.taskId)]) })
  }, [api])

  const current = rows.find(item => item.kind === kind)
  const filtered = useMemo(() => (kind === 'python' ? pythonResources : current?.resources ?? []).filter(item => `${item.id} ${item.name ?? ''}`.toLowerCase().includes(query.trim().toLowerCase())), [current, kind, pythonResources, query])
  const updates = filtered.filter(item => item.updateAvailable)
  const allUpdates = [...rows.flatMap(row => row.resources.filter(item => item.updateAvailable && !item.pinnedVersion && !item.updateBlocked).map(item => ({ kind: row.kind, item }))), ...pythonResources.filter(item => item.updateAvailable).map(item => ({ kind: 'python' as const, item }))]
  const localFailed = states[kind] === 'error'
  const resourceName = (item: Resource): string => item.name ?? (item.id.startsWith('@zerowallscience/plugin-') ? t(`name_${item.id.slice('@zerowallscience/plugin-'.length).replaceAll('-', '_')}` as 'name_base') : item.id)

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
      if (!item || action !== 'update') return
      setBusy(true); setMessage(undefined); setOperationFailed(false)
      try { await updatePythonLayer(item); if (!alive()) return; setMessage(t('ready')); await refresh() }
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
      const started = await api.startJob(kind, action, id ?? source, source)
      let job = await boundedRequest(api.getJob(started.taskId), 5000) as Job | undefined
      while (job && (job.status === 'queued' || job.status === 'running')) {
        await new Promise(resolve => setTimeout(resolve, 300))
        if (!alive()) return
        job = await boundedRequest(api.getJob(started.taskId), 5000) as Job | undefined
      }
      if (!alive()) return
      if (!job) throw new Error(t('failed'))
      if (job?.status === 'failed') throw new Error(job.error ?? t('failed'))
      if (job?.status === 'cancelled') throw new Error(t('cancelled'))
      setSelected(new Set()); setMessage(t('ready')); await refresh(); await refreshJobs()
    } catch (error) { if (!alive()) return; setOperationFailed(true); setMessage(error instanceof Error ? error.message : t('failed')) }
    finally { if (alive()) setBusy(false) }
  }

  const updateAll = async (onlySelected = false) => {
    const generation = lifecycle.current
    const alive = () => generation === lifecycle.current
    if (!api?.startJob || allUpdates.length === 0) return
    setBusy(true); setMessage(undefined); setOperationFailed(false)
    try {
      for (const update of allUpdates) {
        if (!alive()) return
        if (onlySelected && !selected.has(`${update.kind}:${update.item.id}`)) continue
        if (update.kind === 'python') { await updatePythonLayer(update.item); continue }
        const started = await api.startJob(update.kind, 'update', update.item.id)
        let job = await boundedRequest(api.getJob(started.taskId), 5000) as Job | undefined
        while (job && (job.status === 'queued' || job.status === 'running')) {
          await new Promise(resolve => setTimeout(resolve, 300))
          if (!alive()) return
          job = await boundedRequest(api.getJob(started.taskId), 5000) as Job | undefined
        }
        if (!alive()) return
        if (!job) throw new Error(t('failed'))
        if (job?.status === 'failed') throw new Error(job.error ?? t('failed'))
        if (job?.status === 'cancelled') throw new Error(t('cancelled'))
      }
      if (!alive()) return
      setSelected(new Set()); setMessage(t('ready')); await refresh(); await refreshJobs()
    } catch (error) { if (!alive()) return; setOperationFailed(true); setMessage(error instanceof Error ? error.message : t('failed')) }
    finally { if (alive()) setBusy(false) }
  }

  const importResource = async () => {
    const file = kind === 'skill' ? await window.zerowallDesktop?.chooseDirectory() : await window.zerowallDesktop?.chooseScienceFile?.(kind === 'mcp' ? ['json'] : ['tgz', 'tar.gz'])
    if (file) await run('import', undefined, file)
  }

  return <section className={css.root} aria-labelledby="zerowall-extension-center-title">
    <header className={css.header}>
      <div><h2 id="zerowall-extension-center-title">{t('title')}</h2><p>{t('intro')}</p></div>
      {selected.size > 0 && <button type="button" disabled={busy} onClick={() => void updateAll(true)}>{t('updateSelected')}</button>}
      {allUpdates.length > 0 && <button type="button" disabled={busy} onClick={() => void updateAll()}>{t('updateAll')}</button>}
      <button type="button" disabled={busy} onClick={() => void refresh()}>{t('localRefresh')}</button>
      <button className={css.primary} type="button" disabled={busy || checking} onClick={() => void checkUpdates()}>{checking ? t('checking') : t('refresh')}</button>
    </header>
    <div className={css.toolbar}>
      <nav className={css.tabs} aria-label={t('title')}>
        {(['plugin', 'skill', 'mcp', 'python'] as Kind[]).map(item => <button key={item} role="tab" aria-selected={kind === item} className={kind === item ? css.activeTab : css.tab} type="button" onClick={() => setKind(item)}>{t(item === 'plugin' ? 'plugins' : item === 'skill' ? 'skills' : item === 'mcp' ? 'mcp' : 'python')}</button>)}
      </nav>
      <input className={css.search} value={query} onChange={event => setQuery(event.target.value)} placeholder={t('search')} aria-label={t('search')} />
      {kind !== 'python' && <button type="button" disabled={busy} onClick={() => void importResource()}>{t('import')}</button>}
    </div>
    {message && <p className={operationFailed ? css.warning : css.message} role={operationFailed ? 'alert' : 'status'}>{message}</p>}
    {current?.catalogStatus === 'unpublished' && <p className={css.message} role="status">{t('catalogUnpublished')}</p>}
    {current?.catalogStatus === 'local' && <p className={css.message} role="status">{t('unchecked')}</p>}
    {current?.catalogStatus === 'unavailable' && <p className={css.message} role="status">{t('catalogUnavailable')}</p>}
    {(errors[kind] || current?.error || (kind === 'python' && pythonCheckError)) && <details className={css.warning}><summary>{localFailed ? t('localError') : t('catalogError')}</summary><p>{errors[kind] ?? current?.error ?? pythonCheckError}</p></details>}
    <div className={css.meta}><span>{t('status')}: {states[kind] === 'loading' ? t('loadingLocal') : states[kind] === 'error' ? t('localError') : states[kind] === 'unavailable' ? t('unavailable') : t('localReady')} · {t('resourceCount')}: {states[kind] === 'ready' || filtered.length ? filtered.length : '—'}</span><span>{t('available')}: {updates.length}</span></div>
    <div className={css.list}>
      {filtered.map(item => <article className={css.row} key={`${item.id}@${item.version}`}>
        <span>{item.updateAvailable && !item.pinnedVersion && !item.updateBlocked && <label><input type="checkbox" aria-label={`${t('selectUpdate')} ${resourceName(item)}`} checked={selected.has(`${kind}:${item.id}`)} onChange={event => { const key = `${kind}:${item.id}`; setSelected(previous => { const next = new Set(previous); if (event.target.checked) next.add(key); else next.delete(key); return next }) }} /></label>}</span>
        <div className={css.identity}><strong title={item.id}>{resourceName(item)}</strong><small title={item.id}>{item.id}</small><small>{t(`source_${item.source ?? 'catalog'}` as 'source_catalog')} · {item.catalogSigned ? t('signed') : item.source === 'runtime' ? t('runtimeCore') : item.source === 'bundled' ? t('bundledResource') : t('localResource')}</small></div>
        <span className={css.version}>{item.updateAvailable ? `${item.installedVersion ?? '—'} → ${item.version}` : item.version === '—' ? t('unversioned') : item.version === 'core' ? t('runtimeCore') : `v${item.version}`}</span>
        <span className={item.updateAvailable ? css.badgeUpdate : css.badge}>{item.installState === 'missing' ? t('missing') : item.pythonLayer ? item.pythonInstalled ? t('installed') : t('notInstalled') : item.enabled === false ? t('disabled') : item.updateAvailable ? t('available') : item.source === 'catalog' ? t('notInstalled') : t('installed')}</span>
        {(item.pinnedVersion || item.updateBlocked) && <small>{item.pinnedVersion ? `${t('pinned')} ${item.pinnedVersion}` : item.updateBlocked}</small>}
        {kind === 'plugin' && ['error', 'unavailable'].includes(item.activationState ?? '') && <small>{item.activationState === 'error' ? t('activationError') : t('activationUnavailable')}</small>}
        <div className={css.actions}>
          {item.updateAvailable && !item.pinnedVersion && !item.updateBlocked && item.source !== 'runtime' && <button type="button" disabled={busy} onClick={() => void run('update', item)}>{t('update')}</button>}
          {kind === 'plugin' && item.managed !== false && item.installedVersion && item.source !== 'runtime' && <button type="button" disabled={busy} onClick={() => void run(item.pinnedVersion ? 'unpin' : 'pin', item)}>{item.pinnedVersion ? t('unpin') : t('pin')}</button>}
          {item.rollbackSupported && item.installedVersion && item.source !== 'runtime' && <button type="button" disabled={busy} onClick={() => void run('rollback', item)}>{t('rollback')}</button>}
          {item.managed !== false && ['profile', 'bundled', 'disabled', 'removed'].includes(item.source ?? '') && <button type="button" disabled={busy} onClick={() => void run(item.enabled === false ? 'enable' : 'disable', item)}>{item.enabled === false ? t('enable') : t('disable')}</button>}
          {item.managed !== false && item.source === 'profile' && <button type="button" disabled={busy} onClick={() => void run('remove', item)}>{t('remove')}</button>}
          {kind === 'mcp' && item.enabled !== false && item.source === 'profile' && <button type="button" disabled={busy} onClick={() => void run('restart', item)}>{t('restartServer')}</button>}
          {kind === 'plugin' && item.source === 'catalog' && <button type="button" disabled={busy} onClick={() => void run('install', item)}>{t('install')}</button>}
          {kind === 'plugin' && item.managed !== false && item.source !== 'runtime' && item.source !== 'catalog' && <button type="button" disabled={busy} onClick={() => void run('repair', item)}>{t('repair')}</button>}
        </div>
      </article>)}
      {filtered.length === 0 && states[kind] === 'ready' && <p className={css.empty}>{query ? t('noMatches') : t('empty')}</p>}
    </div>
    <section className={css.jobs} aria-label={t('tasks')}>
      <h3>{t('tasks')}</h3>
      {jobs.slice(0, 8).map(job => <div className={css.job} key={job.taskId}><span title={job.id}>{job.id ?? job.action}{job.error && <small>{job.error}</small>}</span><span>{t(`job_${job.status}` as 'job_running')} · {job.progress ?? 0}%</span>{(job.status === 'failed' || job.status === 'cancelled') && api?.retryJob && <button type="button" onClick={() => void api.retryJob(job.taskId).then(refreshJobs).catch(error => { setOperationFailed(true); setMessage(String(error)) })}>{t('retry')}</button>}{(job.status === 'queued' || job.status === 'running') && api?.cancelJob && <button type="button" onClick={() => void api.cancelJob(job.taskId).then(refreshJobs).catch(error => { setOperationFailed(true); setMessage(String(error)) })}>{t('cancel')}</button>}</div>)}
      {pythonJob && <div className={css.job} key={pythonJob.taskId}><span title={pythonJob.taskId}>{pythonJob.layer}{pythonJob.currentPackage ? ` · ${pythonJob.currentPackage}` : ''}{pythonJob.error && <small>{pythonJob.error}</small>}</span><span>{t(`pythonJob_${pythonJob.state}` as 'pythonJob_running')} · {pythonJob.progress ?? 0}%</span></div>}
      {jobs.length === 0 && !pythonJob && <p className={css.empty}>{t('noTasks')}</p>}
    </section>
  </section>
}
