import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from '@zerowallscience/plugin-base/client-helpers'
import type { McpEnvironmentStatus, McpPythonInfo, McpPythonPackage, PythonPackagePlan } from '../../../base/src/client/desktop-api.js'
import css from './PythonEnvironmentPanel.module.css'

const normalize = (name: string) => name.toLowerCase().replace(/[-_.]+/gu, '-')
export function PythonEnvironmentPanel({ t }: PropsLocale<typeof NS>) {
  const [info, setInfo] = useState<McpPythonInfo>()
  const [status, setStatus] = useState<McpEnvironmentStatus>()
  const [query, setQuery] = useState(''); const [filter, setFilter] = useState('all')
  const [spec, setSpec] = useState(''); const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [updates, setUpdates] = useState<Record<string, Partial<McpPythonPackage>>>({})
  const [plan, setPlan] = useState<PythonPackagePlan>(); const [detail, setDetail] = useState<McpPythonPackage>()
  const [scrollTop, setScrollTop] = useState(0); const [height, setHeight] = useState(400)
  const list = useRef<HTMLDivElement>(null); const request = useRef(0); const active = useRef<string>()
  const api = window.zerowallDesktop
  const refresh = useCallback(async () => {
    const id = ++request.current
    try {
      const next = await window.zerowallDesktop?.getMcpPythonInfo?.()
      if (id !== request.current || !next) return
      if (active.current && next.snapshotId && next.snapshotId !== active.current) return
      setInfo(next)
    } catch (error) { if (id === request.current) setFeedback(String(error)) }
  }, [])
  useEffect(() => {
    const receive = (next: McpEnvironmentStatus) => {
      setStatus(next)
      const snapshot = next.activeEnvironment?.snapshotId
      if (snapshot && snapshot !== active.current) {
        active.current = snapshot; setUpdates({}); setPlan(undefined); setDetail(undefined); void refresh()
      }
      if (next.packageInventory?.snapshotId === snapshot && next.packageInventory) { request.current++; setInfo(next.packageInventory) }
      if (next.updated) setFeedback(t('python.manager.activated'))
      if (next.lastUpdateError) setFeedback(next.lastUpdateError)
    }
    const unsubscribe = window.zerowallDesktop?.onMcpEnvironmentStatus?.(receive)
    void window.zerowallDesktop?.getMcpEnvironmentStatus?.().then(receive)
    void refresh()
    return () => { unsubscribe?.(); request.current++ }
  }, [refresh, t])
  useEffect(() => {
    if (!list.current) return
    const observer = new ResizeObserver(entries => setHeight(entries[0]?.contentRect.height ?? 400))
    observer.observe(list.current); return () => observer.disconnect()
  }, [])
  const perform = async (key: string, work: () => Promise<unknown>) => {
    setBusy(value => ({ ...value, [key]: true }))
    try { await work() } catch (error) { setFeedback(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(value => ({ ...value, [key]: false })) }
  }
  const check = (name?: string) => perform(name ?? 'check', async () => {
    const expected = active.current
    const next = await api?.checkMcpPythonPackageUpdates?.(name ? [name] : [])
    if (!next || expected !== active.current || (next.snapshotId && next.snapshotId !== active.current)) return
    setUpdates(value => ({ ...value, ...Object.fromEntries(next.packages.filter(pkg => !name || pkg.name === name).map(pkg => [normalize(pkg.name), { latestVersion: pkg.latestVersion, latestError: pkg.latestError, updateAvailable: pkg.updateAvailable }])) }))
  })
  const preview = (names: string[]) => perform(names[0] ?? 'preview', async () => {
    const next = await api?.previewMcpPythonPackages?.(names)
    if (next && (!active.current || next.snapshotId === active.current)) {
      setPlan(next)
      if (!next.error) setUpdates(value => ({ ...value, ...Object.fromEntries(next.changes.map(change => [normalize(change.name), { ...value[normalize(change.name)], compatibleVersion: change.to }])) }))
    }
  })
  const rows = useMemo(() => (info?.packages ?? []).map(pkg => ({ ...pkg, ...updates[normalize(pkg.name)] })).filter(pkg =>
    pkg.name.toLowerCase().includes(query.toLowerCase()) && (filter === 'all' || filter === pkg.source || filter === 'custom' && pkg.customized || filter === 'updates' && pkg.updateAvailable)), [info, updates, query, filter])
  const rowHeight = 88; const start = Math.max(0, Math.floor(scrollTop / rowHeight) - 4); const end = Math.min(rows.length, start + Math.ceil(height / rowHeight) + 8)
  useEffect(() => { const maximum = Math.max(0, rows.length * rowHeight - height); if (list.current && list.current.scrollTop > maximum) list.current.scrollTop = maximum }, [rows.length, height])
  const inventoryMatches = !active.current || info?.snapshotId === active.current
  const working = status && ['checking', 'downloading', 'verifying', 'installing'].includes(status.phase)
  return <section className={css.panel} aria-label={t('python.title')}>
    <header className={css.heading}><div><small>ZeroWall Science</small><h2>{t('python.title')}</h2></div><button onClick={() => void refresh()} aria-label={t('python.manager.refreshInventory')}>{t('python.manager.refresh')}</button></header>
    <div className={css.summary}>
      <div><span>{t('python.manager.status')}</span><strong>{info?.ready ? t('python.manager.ready') : t('python.manager.checking')}</strong></div>
      <div><span>Python</span><strong>{info?.version ?? '—'}</strong></div>
      <div><span>{t('python.manager.currentEnvironment')}</span><strong>{status?.activeEnvironment?.environmentVersion ?? info?.environmentVersion ?? '—'}{(status?.activeEnvironment?.localRevision ?? info?.localRevision) ? t('python.manager.localRevision', { revision: status?.activeEnvironment?.localRevision ?? info?.localRevision ?? 0 }) : ''}</strong></div>
      <div><span>{t('python.manager.effective')}</span><strong>{inventoryMatches ? info?.packageCount ?? '—' : t('python.manager.refreshing')}</strong></div>
    </div>
    <div className={css.update} role="status" aria-live="polite">
      <div><strong>{working ? (status.phase === 'downloading' ? t('python.manager.downloading') : status.phase === 'verifying' ? t('python.manager.verifying') : status.phase === 'installing' ? (status.updateJob?.totalFiles ? t('python.manager.extracting', { completed: status.updateJob.completedFiles ?? 0, total: status.updateJob.totalFiles }) : t('python.manager.preparing')) : t('python.manager.checking')) : status?.phase === 'paused' ? t('python.manager.paused') : t('python.manager.automatic')}</strong>
        <span>{status?.updateJob?.targetVersion ? t('python.manager.target', { version: status.updateJob.targetVersion }) : status?.onlineEnvironmentVersion ? t('python.manager.online', { version: status.onlineEnvironmentVersion }) : t('python.manager.pinnedTask')}</span></div>
      {working && <progress max={100} value={status.progress ?? 0} />}
      <div className={css.actions}>
        {working && status.updateJob?.canPause && <button onClick={() => void api?.pauseMcpEnvironment?.()}>{t('python.manager.pause')}</button>}
        {!working && <button onClick={() => void perform('update', async () => { await api?.updateMcpEnvironment?.() })}>{status?.phase === 'paused' ? t('python.manager.resume') : t('python.manager.update')}</button>}
        {status?.rollbackAvailable && !working && <button onClick={() => void perform('rollback', async () => { await api?.rollbackMcpEnvironment?.(); setFeedback(t('python.manager.rollbackQueued')) })}>{t('python.manager.rollback')}</button>}
        {!!status?.updateJob?.bytesPerSecond && <span>{(status.updateJob.bytesPerSecond / 1024 ** 2).toFixed(1)} MiB/s</span>}
        {!!status?.updateJob?.totalBytes && <span>{((status.updateJob.receivedBytes ?? 0) / 1024 ** 2).toFixed(1)} / {(status.updateJob.totalBytes / 1024 ** 2).toFixed(1)} MiB</span>}
      </div>
    </div>
    <div className={css.toolbar}>
      <input aria-label={t('python.manager.search')} placeholder={t('python.manager.searchHint')} value={query} onChange={e => setQuery(e.target.value)} />
      <select aria-label={t('python.manager.source')} value={filter} onChange={e => setFilter(e.target.value)}><option value="all">{t('python.manager.all')}</option><option value="core">{t('python.manager.core')}</option><option value="overlay">{t('python.manager.extension')}</option><option value="custom">{t('python.manager.custom')}</option><option value="updates">{t('python.manager.updates')}</option></select>
      <button disabled={busy.check} onClick={() => void check()}>{busy.check ? t('python.manager.checkingUpdates') : t('python.manager.checkUpdates')}</button>
    </div>
    <div className={css.count}>{inventoryMatches ? t('python.manager.counts', { core: info?.officialPackageCount ?? 0, extensions: info?.overlayPackageCount ?? 0, effective: info?.packageCount ?? 0, filtered: rows.length }) : t('python.manager.refreshingInventory')}</div>
    <div className={css.listHeader}><span>{t('python.manager.nameVersion')}</span><span>{t('python.manager.versionsActions')}</span></div>
    <div ref={list} className={css.list} role="list" aria-label={t('python.manager.list')} onScroll={e => setScrollTop(e.currentTarget.scrollTop)}>
      <div style={{ height: rows.length * rowHeight, position: 'relative' }}>
        {(inventoryMatches ? rows.slice(start, end) : []).map((pkg, index) => <div key={normalize(pkg.name)} className={css.row} role="listitem" style={{ position: 'absolute', top: (start + index) * rowHeight, height: rowHeight, insetInline: 0 }}>
          <div className={css.package}><strong title={pkg.name}>{pkg.name}</strong><span>{pkg.version} · {pkg.customized ? t('python.manager.custom') : pkg.source === 'overlay' ? t('python.manager.extension') : t('python.manager.official')}{pkg.shadowedVersion ? t('python.manager.shadowed') : ''}</span></div>
          <div className={css.rowActions}><span title={pkg.latestError}>{working && status.updateJob?.packageNames?.some(name => normalize(name) === normalize(pkg.name)) ? t('python.manager.upgrading') : busy[pkg.name] ? t('python.manager.processing') : pkg.latestError ? t('python.manager.checkFailed') : pkg.compatibleVersion ? t('python.manager.compatible', { version: pkg.compatibleVersion }) : pkg.latestVersion ? `PyPI ${pkg.latestVersion}` : t('python.manager.unchecked')}</span><div>
            <button disabled={busy[pkg.name]} onClick={() => void check(pkg.name)}>{t('python.manager.check')}</button>
            <button disabled={busy[pkg.name]} onClick={() => void preview([pkg.name])}>{t('python.manager.upgrade')}</button>
            <button onClick={() => setDetail(pkg)}>{t('python.manager.details')}</button>
          </div></div>
        </div>)}
      </div>
      {!rows.length && <p className={css.empty}>{t('python.manager.empty')}</p>}
    </div>
    <footer className={css.footer}>
      <div className={css.toolbar}><input aria-label={t('python.manager.add')} placeholder={t('python.manager.addHint')} value={spec} onChange={e => setSpec(e.target.value)} /><button disabled={!spec.trim() || busy[spec.trim()]} onClick={() => void preview([spec.trim()])}>{t('python.manager.plan')}</button></div>
      <details><summary>{t('python.manager.paths')}</summary><dl><dt>{t('python.manager.interpreter')}</dt><dd>{info?.executable}</dd><dt>{t('python.manager.corePath')}</dt><dd>{info?.sitePackages}</dd><dt>{t('python.manager.overlayPath')}</dt><dd>{info?.overlayPath}</dd><dt>{t('python.manager.scanned')}</dt><dd>{info?.scannedAt}</dd><dt>{t('python.manager.skills')}</dt><dd>{info?.skillAudit ? Object.entries(info.skillAudit.summary).map(([key, value]) => `${key}: ${value}`).join(" · ") : t('python.manager.noAudit')}</dd></dl></details>
      {feedback && <p role="status" className={css.feedback}>{feedback}</p>}
    </footer>
    {(plan || detail) && <div className={css.backdrop}><section className={css.dialog} role="dialog" aria-modal="true" aria-label={plan ? t('python.manager.preview') : t('python.manager.packageDetails')}>
      <h3>{plan ? t('python.manager.preview') : detail?.name}</h3>
      {plan ? <><p>{t('python.manager.previewHint')}</p>{plan.error ? <pre>{plan.error}</pre> : plan.changes.length ? <ul>{plan.changes.map(change => <li key={change.name}>{change.name}：{change.from ?? t('python.manager.notInstalled')} → {change.to}</li>)}</ul> : <p>{t('python.manager.noChanges')}</p>}<div className={css.actions}><button onClick={() => setPlan(undefined)}>{t('python.manager.close')}</button>{!plan.error && !!plan.changes.length && <button disabled={busy.apply} onClick={() => void perform('apply', async () => { await api?.applyMcpPythonPackagePlan?.(plan.planId); setPlan(undefined); setFeedback(t('python.manager.queued')) })}>{t('python.manager.apply')}</button>}</div></> : <><dl><dt>{t('python.manager.currentVersion')}</dt><dd>{detail?.version}</dd><dt>{t('python.manager.baseline')}</dt><dd>{detail?.requiredVersion ?? t('python.manager.userInstalled')}</dd><dt>{t('python.manager.shadowedVersion')}</dt><dd>{detail?.shadowedVersion ?? t('python.manager.none')}</dd><dt>{t('python.manager.location')}</dt><dd>{detail?.location}</dd><dt>{t('python.manager.validation')}</dt><dd>{detail?.verificationMessage ?? t('python.manager.officialBaseline')}</dd><dt>{t('python.manager.dependencies')}</dt><dd>{detail?.dependencies?.join("；") || t('python.manager.undeclared')}</dd></dl>{!!detail?.upgradeHistory?.length && <details><summary>{t('python.manager.history')}</summary><ul>{detail.upgradeHistory.map((entry, index) => <li key={index}>{entry.from ?? t('python.manager.notInstalled')} → {entry.to} · {entry.verifiedAt}</li>)}</ul></details>}{(detail?.previousVersion || detail?.customized && detail?.requiredVersion) && <button onClick={() => { const target = detail.previousVersion ?? detail.requiredVersion; setDetail(undefined); void preview([`${detail.name}==${target}`]) }}>{t('python.manager.restorePackage')}</button>}<button onClick={() => setDetail(undefined)}>{t('python.manager.close')}</button></>}
    </section></div>}
  </section>
}
