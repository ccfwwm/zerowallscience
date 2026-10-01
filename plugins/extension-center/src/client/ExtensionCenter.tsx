import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@zerowallscience/plugin-base/client'
import { NS, type ExtensionTranslate } from './locales.js'
import css from './ExtensionCenter.module.css'

type Props = PropsRuntime<'settings.section'> & PropsLocale<typeof NS>
type Kind = 'plugin' | 'skill' | 'mcp'
type Resource = { id: string; version: string; installedVersion?: string; updateAvailable?: boolean; source?: string; signed?: boolean; restartRequired?: boolean; rollbackSupported?: boolean }
type CheckResult = { kind: Kind; checkedAt: string; resources: Resource[]; error?: string }
type Job = { taskId: string; status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'; phase?: string; progress?: number; error?: string }
type DesktopResources = NonNullable<NonNullable<Window['zerowallDesktop']>['resources']>

export function ExtensionCenter({ t }: Props): JSX.Element {
  const [kind, setKind] = useState<Kind>('plugin')
  const [rows, setRows] = useState<CheckResult[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string>()
  const [activeJob, setActiveJob] = useState<Job>()
  const api = window.zerowallDesktop?.resources as DesktopResources | undefined

  const check = useCallback(async () => {
    if (api?.check === undefined) { setMessage(t('noDesktop')); return }
    setBusy(true); setMessage(undefined)
    try {
      const next = await Promise.all((['plugin', 'skill', 'mcp'] as Kind[]).map(item => api.check(item)))
      setRows(next)
      setMessage(t('ready'))
    } catch (error) { setMessage(error instanceof Error ? error.message : t('failed')) }
    finally { setBusy(false) }
  }, [api, t])

  useEffect(() => { void check() }, [check])

  useEffect(() => {
    if (api?.onJob === undefined) return
    return api.onJob(job => {
      if (job.status === 'queued' || job.status === 'running') setActiveJob(job)
      else setActiveJob(current => current?.taskId === job.taskId ? job : current)
    })
  }, [api])

  const current = rows.find(item => item.kind === kind)
  const updates = useMemo(() => current?.resources.filter(item => item.updateAvailable) ?? [], [current])
  const invoke = async (action: 'update' | 'rollback', id: string) => {
    if (api === undefined) return
    setBusy(true); setMessage(undefined)
    try {
      const started = await api.startJob(kind, action, id)
      let job = await api.getJob(started.taskId) as Job | undefined
      setActiveJob(job)
      while (job !== undefined && (job.status === 'queued' || job.status === 'running')) {
        await new Promise(resolve => setTimeout(resolve, 250))
        job = await api.getJob(started.taskId) as Job | undefined
        setActiveJob(job)
      }
      if (job?.status === 'failed') throw new Error(job.error ?? t('failed'))
      if (job?.status === 'cancelled') throw new Error(t('cancelled'))
      setMessage(t('ready')); await check()
    }
    catch (error) { setMessage(error instanceof Error ? error.message : t('failed')) }
    finally { setBusy(false) }
  }

  return <section className={css.root} aria-labelledby="zerowall-extension-center-title">
    <header className={css.header}>
      <div><h2 id="zerowall-extension-center-title">{t('title')}</h2><p>{t('intro')}</p></div>
      <button className={css.primary} type="button" disabled={busy} onClick={() => void check()}>{busy ? t('checking') : t('refresh')}</button>
    </header>
    <nav className={css.tabs} aria-label={t('title')}>
      {(['plugin', 'skill', 'mcp'] as Kind[]).map(item => <button key={item} className={kind === item ? css.activeTab : css.tab} type="button" onClick={() => setKind(item)}>{t(item === 'plugin' ? 'plugins' : item === 'skill' ? 'skills' : 'mcp')}</button>)}
    </nav>
    {message && <p className={css.message} role="status">{message}</p>}
    {activeJob && (activeJob.status === 'queued' || activeJob.status === 'running') && <p className={css.message} role="status">{t('task')}: {activeJob.phase ?? activeJob.status} · {activeJob.progress ?? 0}%</p>}
    <div className={css.meta}><span>{t('status')}: {current?.error ?? (current ? t('ready') : t('unavailable'))}</span><span>{t('available')}: {updates.length}</span></div>
    <div className={css.list}>
      {(current?.resources ?? []).map(item => <article className={css.row} key={`${item.id}@${item.version}`}>
        <div className={css.identity}><strong>{item.id}</strong><small>{item.source ?? 'catalog'} · {item.signed ? t('signed') : t('unsigned')}</small></div>
        <span className={css.version}>{item.installedVersion ?? '—'} → {item.version}</span>
        <span className={item.updateAvailable ? css.badgeUpdate : css.badge}>{item.updateAvailable ? t('available') : t('installed')}</span>
        {item.updateAvailable && <button type="button" disabled={busy} onClick={() => void invoke('update', item.id)}>{t('update')}</button>}
        {item.rollbackSupported && item.installedVersion && <button type="button" disabled={busy} onClick={() => void invoke('rollback', item.id)}>{t('rollback')}</button>}
      </article>)}
      {current?.resources.length === 0 && <p className={css.empty}>{t('empty')}</p>}
    </div>
  </section>
}
