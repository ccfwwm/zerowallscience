import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@zerowallscience/plugin-base/client'
import { NS } from './locales.js'
import css from './ExtensionCenter.module.css'

type Props = PropsRuntime<'settings.section'> & PropsLocale<typeof NS>
type Kind = 'plugin' | 'skill' | 'mcp'
type Resource = { id: string; version: string; installedVersion?: string; updateAvailable?: boolean; source?: 'profile' | 'bundled' | 'runtime' | 'catalog' | 'removed' | 'disabled'; signed?: boolean; catalogSigned?: boolean; restartRequired?: boolean; rollbackSupported?: boolean; enabled?: boolean }
type CheckResult = { kind: Kind; checkedAt: string; resources: Resource[]; catalogStatus?: 'checked' | 'unavailable' | 'local'; error?: string }
type Job = { taskId: string; kind: Kind; id?: string; action: string; status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'; phase?: string; progress?: number; retries?: number; error?: string }
type DesktopResources = NonNullable<NonNullable<Window['zerowallDesktop']>['resources']>

export function ExtensionCenter({ t }: Props): JSX.Element {
  const [kind, setKind] = useState<Kind>('plugin')
  const [rows, setRows] = useState<CheckResult[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string>()
  const api = window.zerowallDesktop?.resources as DesktopResources | undefined

  const refresh = useCallback(async () => {
    if (api?.check === undefined) { setMessage(t('noDesktop')); return }
    setBusy(true); setMessage(undefined)
    try {
      const next = await Promise.all((['plugin', 'skill', 'mcp'] as Kind[]).map(item => api.check(item).catch(error => ({ kind: item, checkedAt: new Date().toISOString(), resources: [], error: error instanceof Error ? error.message : t('failed') }))))
      setRows(next)
      setMessage(next.some(item => item.catalogStatus === 'unavailable') ? t('catalogUnavailable') : t('ready'))
    } finally { setBusy(false) }
  }, [api, t])

  const refreshJobs = useCallback(async () => {
    if (api?.listJobs) setJobs(await api.listJobs() as Job[])
  }, [api])

  useEffect(() => { void refresh(); void refreshJobs() }, [refresh, refreshJobs])
  useEffect(() => {
    if (api?.onJob === undefined) return
    return api.onJob(job => { setJobs(current => [job as Job, ...current.filter(item => item.taskId !== job.taskId)]) })
  }, [api])

  const current = rows.find(item => item.kind === kind)
  const filtered = useMemo(() => current?.resources.filter(item => item.id.toLowerCase().includes(query.trim().toLowerCase())) ?? [], [current, query])
  const updates = filtered.filter(item => item.updateAvailable)

  const run = async (action: string, item?: Resource, source?: string) => {
    if (!api?.startJob) return
    setBusy(true); setMessage(undefined)
    try {
      const started = await api.startJob(kind, action, item?.id ?? source, source)
      let job = await api.getJob(started.taskId) as Job | undefined
      while (job && (job.status === 'queued' || job.status === 'running')) {
        await new Promise(resolve => setTimeout(resolve, 300))
        job = await api.getJob(started.taskId) as Job | undefined
      }
      if (job?.status === 'failed') throw new Error(job.error ?? t('failed'))
      if (job?.status === 'cancelled') throw new Error(t('cancelled'))
      setMessage(t('ready')); await refresh(); await refreshJobs()
    } catch (error) { setMessage(error instanceof Error ? error.message : t('failed')) }
    finally { setBusy(false) }
  }

  const importResource = async () => {
    const file = await window.zerowallDesktop?.chooseScienceFile?.(kind === 'mcp' ? ['json'] : ['tgz', 'zip', 'tar.gz'])
    if (file) await run('import', undefined, file)
  }

  return <section className={css.root} aria-labelledby="zerowall-extension-center-title">
    <header className={css.header}>
      <div><h2 id="zerowall-extension-center-title">{t('title')}</h2><p>{t('intro')}</p></div>
      <button className={css.primary} type="button" disabled={busy} onClick={() => void refresh()}>{busy ? t('checking') : t('refresh')}</button>
    </header>
    <div className={css.toolbar}>
      <nav className={css.tabs} aria-label={t('title')}>
        {(['plugin', 'skill', 'mcp'] as Kind[]).map(item => <button key={item} className={kind === item ? css.activeTab : css.tab} type="button" onClick={() => setKind(item)}>{t(item === 'plugin' ? 'plugins' : item === 'skill' ? 'skills' : 'mcp')}</button>)}
      </nav>
      <input className={css.search} value={query} onChange={event => setQuery(event.target.value)} placeholder={t('search')} aria-label={t('search')} />
      <button type="button" disabled={busy} onClick={() => void importResource()}>{t('import')}</button>
    </div>
    {message && <p className={css.message} role="status">{message}</p>}
    <div className={css.meta}><span>{t('status')}: {current ? t('ready') : t('unavailable')}</span><span>{t('available')}: {updates.length}</span></div>
    <div className={css.list}>
      {filtered.map(item => <article className={css.row} key={`${item.id}@${item.version}`}>
        <div className={css.identity}><strong>{item.id}</strong><small>{t(`source_${item.source ?? 'catalog'}` as 'source_catalog')} · {item.source === 'runtime' ? t('runtimeCore') : item.source === 'bundled' ? t('bundledResource') : item.catalogSigned ? t('signed') : item.source === 'catalog' ? t('unsigned') : t('localResource')} {item.enabled === false ? `· ${t('disabled')}` : ''}</small></div>
        <span className={css.version}>{item.source === 'runtime' ? t('runtimeCore') : item.updateAvailable ? `${item.installedVersion ?? '—'} → ${item.version}` : item.version}</span>
        <span className={item.updateAvailable ? css.badgeUpdate : css.badge}>{item.updateAvailable ? t('available') : item.source === 'catalog' ? t('notInstalled') : t('installed')}</span>
        <div className={css.actions}>
          {item.updateAvailable && item.source !== 'runtime' && <button type="button" disabled={busy} onClick={() => void run('update', item)}>{t('update')}</button>}
          {item.rollbackSupported && item.installedVersion && item.source !== 'runtime' && <button type="button" disabled={busy} onClick={() => void run('rollback', item)}>{t('rollback')}</button>}
          {kind === 'plugin' && ['profile', 'bundled', 'disabled', 'removed'].includes(item.source ?? '') && <button type="button" disabled={busy} onClick={() => void run(item.enabled === false ? 'enable' : 'disable', item)}>{item.enabled === false ? t('enable') : t('disable')}</button>}
          {kind === 'plugin' && item.source === 'profile' && <button type="button" disabled={busy} onClick={() => void run('remove', item)}>{t('remove')}</button>}
          {kind === 'plugin' && item.source === 'catalog' && <button type="button" disabled={busy} onClick={() => void run('install', item)}>{t('install')}</button>}
          {kind === 'plugin' && item.source !== 'runtime' && item.source !== 'catalog' && <button type="button" disabled={busy} onClick={() => void run('repair', item)}>{t('repair')}</button>}
        </div>
      </article>)}
      {filtered.length === 0 && <p className={css.empty}>{t('empty')}</p>}
    </div>
    <section className={css.jobs} aria-label={t('tasks')}>
      <h3>{t('tasks')}</h3>
      {jobs.slice(0, 8).map(job => <div className={css.job} key={job.taskId}><span>{job.kind}/{job.id ?? job.action}</span><span>{job.status} · {job.phase ?? ''} · {job.progress ?? 0}%</span>{(job.status === 'failed' || job.status === 'cancelled') && api?.retryJob && <button type="button" onClick={() => void api.retryJob(job.taskId).then(refreshJobs)}>{t('retry')}</button>}{(job.status === 'queued' || job.status === 'running') && api?.cancelJob && <button type="button" onClick={() => void api.cancelJob(job.taskId).then(refreshJobs)}>{t('cancel')}</button>}</div>)}
      {jobs.length === 0 && <p className={css.empty}>{t('noTasks')}</p>}
    </section>
  </section>
}
