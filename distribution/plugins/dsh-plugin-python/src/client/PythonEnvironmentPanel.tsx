/** Settings actions share the dependency owner used by tools and MCP. */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { McpEnvironmentStatus, McpPythonInfo, PythonEnvironmentResponse, ZeroWallDesktopApi } from './desktop-api.js'
import { NS } from './locales.js'
import { packageIndexes } from '../shared/package-indexes.js'
import css from './PythonEnvironmentPanel.module.css'

function matchesFuzzy(value: string, query: string): boolean {
  const candidate = value.normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/gu, '')
  const terms = query.trim().split(/\s+/u).map(term => term.normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/gu, '')).filter(Boolean)
  return terms.every(term => {
    let cursor = 0
    for (const character of term) {
      cursor = candidate.indexOf(character, cursor)
      if (cursor < 0) return false
      cursor++
    }
    return true
  })
}

/** Render preparation state, inventory and explicit dependency changes. */
export function PythonEnvironmentPanel({ t, api }: PropsLocale<typeof NS> & { api: Pick<ZeroWallDesktopApi, 'pythonEnvironment' | 'revealPath'> }) {
  const [status, setStatus] = useState<McpEnvironmentStatus>()
  const [ocr, setOcr] = useState<PythonEnvironmentResponse['ocr']>()
  const [info, setInfo] = useState<McpPythonInfo>()
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [query, setQuery] = useState('')
  const [spec, setSpec] = useState('')
  const [matches, setMatches] = useState<{ name: string }[]>([])
  const [catalog, setCatalog] = useState<PythonEnvironmentResponse['packageCatalog']>()
  const [versionQuery, setVersionQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [searchError, setSearchError] = useState('')
  const searchEpoch = useRef(0)
  const [plan, setPlan] = useState<PythonEnvironmentResponse['plan']>()
  const [mirror, setMirror] = useState('')
  const alive = useRef(true)
  const epoch = useRef(0)
  const call = api.pythonEnvironment!
  const refresh = useCallback(async () => {
    const revision = ++epoch.current
    const response = await call({ action: 'status', requestId: crypto.randomUUID() })
    if (!alive.current || revision !== epoch.current) return
    setStatus(response.status)
    setOcr(response.ocr)
    setMirror(value => value || response.mirrorUrl || '')
    if (response.status?.phase === 'ready') {
      const result = await call({ action: 'list_packages', requestId: crypto.randomUUID() })
      if (alive.current && revision === epoch.current) setInfo(result.inventory)
    }
  }, [call])
  useEffect(() => {
    alive.current = true
    void refresh().catch(error => { if (alive.current) setFeedback(error instanceof Error ? error.message : String(error)) })
    return () => { alive.current = false; epoch.current++; searchEpoch.current++ }
  }, [refresh])
  useEffect(() => {
    if (!status || (['ready', 'failed'].includes(status.phase) && (!ocr || ['ready', 'failed'].includes(ocr.phase)))) return
    const timer = setTimeout(() => void refresh().catch(error => { if (alive.current) setFeedback(String(error)) }), 1500)
    return () => clearTimeout(timer)
  }, [status, ocr, refresh])
  const perform = async (operation: () => Promise<void>) => {
    setBusy(true); setFeedback('')
    try { await operation(); if (alive.current) await refresh() }
    catch (error) { if (alive.current) setFeedback(`${t('error')}: ${error instanceof Error ? error.message : String(error)}`) }
    finally { if (alive.current) setBusy(false) }
  }
  const request = async (action: 'install_runtime' | 'rollback' | 'diagnose') => {
    await call({ action, requestId: crypto.randomUUID(), confirm: true })
    if (alive.current && action === 'diagnose') setFeedback(t('healthy'))
  }
  const lookup = async (packageName?: string) => {
    const revision = ++searchEpoch.current
    setSearching(true); setSearchError(''); setPlan(undefined)
    try {
      const selected = packageName ?? /^([a-z0-9][a-z0-9._-]{0,99})==([^=\s]+)$/iu.exec(spec.trim())?.[1]
      const result = await call({ action: 'search_package', requestId: crypto.randomUUID(), ...(selected ? { packageName: selected } : { query: spec.trim() }) })
      if (!alive.current || revision !== searchEpoch.current) return
      setSearched(true)
      if (packageName) { setCatalog(result.packageCatalog); setMatches([]); setVersionQuery(''); setSpec(result.packageCatalog?.name ?? packageName) }
      else if (selected && result.packageCatalog) { setCatalog(result.packageCatalog); setMatches([]); setSpec(spec.trim()) }
      else { setMatches(result.packageMatches ?? []); setCatalog(undefined) }
    } catch (error) { if (alive.current && revision === searchEpoch.current) setSearchError(error instanceof Error ? error.message : String(error)) }
    finally { if (alive.current && revision === searchEpoch.current) setSearching(false) }
  }
  const installed = (info?.packages ?? []).filter(row => matchesFuzzy(row.name, query))
  const visibleVersions = catalog?.versions.filter(version => matchesFuzzy(version, versionQuery)) ?? []
  const changes = plan?.changes.filter(row => info?.packages.find(pkg => pkg.name.toLowerCase() === row.name.toLowerCase())?.version !== row.to.replace(/^.*==/u, '')) ?? []
  const phase = status?.phase
  const ocrError = ocr?.phase !== 'failed' ? undefined : ocr.code === 'OCR_DOWNLOAD_FAILED' ? t('ocrDownloadFailed') : ocr.code === 'OCR_MODEL_INTEGRITY' ? t('ocrIntegrityFailed') : ocr.code === 'OCR_CANCELLED' ? t('ocrCancelled') : t('ocrStorageFailed')
  return <section className={css.panel} aria-label={t('title')}>
    <header className={css.heading}><div><h2>{t('title')}</h2><p className={css.subtitle}>{t('description')}</p></div><button disabled={busy} onClick={() => void perform(refresh)}>{t('refresh')}</button></header>
    <p role="status">{busy ? t('busy') : phase === 'ready' ? t('ready') : phase === 'failed' ? t('failed') : phase === 'downloading' ? t('downloading') : phase === 'verifying' ? t('verifying') : phase === 'installing' ? t('busy') : t('idle')}</p>
    {status?.message && <p role="alert" className={css.warning}>{status.message}</p>}
    {feedback && <p role="status" className={css.feedback}>{feedback}</p>}
    {(phase === 'failed' || ocr?.phase === 'failed') && <button disabled={busy} onClick={() => void perform(() => request('install_runtime'))}>{t('retry')}</button>}
    {ocr && <section className={css.card}><h3>{t('ocr')}</h3><p role="status">{ocr.phase === 'ready' ? t('ready') : ocr.phase === 'failed' ? t('failed') : ocr.phase === 'downloading' ? t('downloading') : ocr.phase === 'verifying' ? t('verifying') : t('idle')}{ocr.totalBytes > 0 && ` · ${(ocr.receivedBytes / 1048576).toFixed(1)} / ${(ocr.totalBytes / 1048576).toFixed(1)} MiB`}</p>{ocrError && <p role="alert" className={css.warning}>{ocrError}</p>}<p>{t('ocrMirror')}</p></section>}
    <div className={css.summary}><div className={css.metric}><span>{t('managerVersion')}</span><strong>{info?.uvVersion ?? '—'}</strong></div><div className={css.metric}><span>{t('version')}</span><strong>{info?.version ?? '—'}</strong></div><div className={css.metric}><span>{t('packages')}</span><strong>{info?.packageCount ?? '—'}</strong></div></div>
    <section className={css.card}><h3>{t('executable')}</h3><p className={css.pathBox}>{info?.executable ?? '—'}</p><div className={css.actions}><button disabled={busy || !info?.runtimeRoot} onClick={() => void perform(async () => { await api.revealPath?.(info!.runtimeRoot!) })}>{t('folder')}</button><button disabled={busy || phase !== 'ready'} onClick={() => void perform(() => request('diagnose'))}>{t('diagnose')}</button><button disabled={busy || phase !== 'ready'} onClick={() => void perform(() => request('rollback'))}>{t('rollback')}</button></div></section>
    <section className={css.card}><h3>{t('packages')}</h3><input className={css.searchInput} aria-label={t('search')} placeholder={t('search')} value={query} onChange={event => setQuery(event.target.value)} /><div className={css.list}>{installed.length === 0 ? <p role="status">{t('noMatches')}</p> : installed.map(row => <div className={css.row} key={row.name}><strong>{row.name}</strong><span>{row.version}</span></div>)}</div></section>
    <section className={css.card}><h3>{t('custom')}</h3><p>{t('customNote')}</p>
      <div className={css.toolbar}><input aria-label={t('spec')} placeholder={t('searchPlaceholder')} value={spec} onChange={event => { ++searchEpoch.current; setSearching(false); setSearched(false); setSpec(event.target.value); setPlan(undefined); setCatalog(undefined); setMatches([]); setSearchError('') }} onKeyDown={event => { if (event.key === 'Enter' && spec.trim().length >= 2) { event.preventDefault(); void lookup() } }} />
        <button disabled={busy || searching || spec.trim().length < 2} onClick={() => void lookup()}>{searching ? t('searching') : t('searchCatalog')}</button>
        <button disabled={busy || searching || !spec.trim() || phase !== 'ready'} onClick={() => void perform(async () => { const result = await call({ action: 'preview_sync', packageSpec: spec, requestId: crypto.randomUUID() }); if (alive.current) setPlan(result.plan) })}>{t('preview')}</button>
      </div>
      {searchError && <p role="alert" className={css.warning}>{searchError}</p>}
      {matches.length > 0 && <div className={css.results} aria-label={t('searchResults')}>{matches.map(row => <button key={row.name} disabled={searching} onClick={() => void lookup(row.name)}>{row.name}</button>)}</div>}
      {searched && matches.length === 0 && !catalog && !searching && !searchError && <p role="status">{t('noMatches')}</p>}
      {catalog && <div className={css.catalog}><strong>{catalog.name}</strong><p>{catalog.summary}</p><div className={css.toolbar}>
        <input aria-label={t('filterVersions')} placeholder={t('filterVersions')} value={versionQuery} onChange={event => setVersionQuery(event.target.value)} />
        <select aria-label={t('chooseVersion')} value={spec.includes('==') ? spec.split('==')[1] : ''} onChange={event => { setSpec(catalog.name + '==' + event.target.value); setPlan(undefined) }}><option value="" disabled>{t('chooseVersion')}</option>{visibleVersions.map(version => <option value={version} key={version}>{version}</option>)}</select>
      </div><small>{t('versionSource')}</small></div>}
      {plan && <div className={css.plan}><h4>{t('plannedChanges', { count: changes.length })}</h4><div className={css.list}>{changes.map(row => <div className={css.row} key={row.name}><strong>{row.name}</strong><span>{row.to.replace(/^.*==/u, '')}</span></div>)}</div><button disabled={busy} onClick={() => void perform(async () => { await call({ action: 'apply_sync', planId: plan.planId, requestId: crypto.randomUUID(), confirm: true }); if (alive.current) setPlan(undefined) })}>{t('apply')}</button></div>}
    </section>
    <section className={css.card}><h3>{t('mirror')}</h3><label>{t('mirrorPreset')}<select aria-label={t('mirrorPreset')} value={packageIndexes.some(row => row.indexUrl === mirror) ? mirror : ''} onChange={event => { if (event.target.value) setMirror(event.target.value) }}><option value="">{t('customMirror')}</option>{packageIndexes.map(row => <option key={row.id} value={row.indexUrl}>{row.label}</option>)}</select></label><div className={css.toolbar}><input aria-label={t('mirror')} value={mirror} onChange={event => setMirror(event.target.value)} /><button disabled={busy || !mirror.trim()} onClick={() => void perform(async () => { await call({ action: 'configure', mirrorUrl: mirror, requestId: crypto.randomUUID(), confirm: true }); if (alive.current) setFeedback(t('saved')) })}>{t('save')}</button></div></section>
  </section>
}
