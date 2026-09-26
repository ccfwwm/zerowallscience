import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from '@zerowallscience/plugin-base/client-helpers'
import type { McpEnvironmentStatus, McpPythonInfo, McpPythonPackage, PythonMirrorPresetInfo, PythonPackagePlan, PythonEnvironmentResponse } from '../../../base/src/client/desktop-api.js'
import css from './PythonEnvironmentPanel.module.css'

const normalize = (name: string) => name.toLowerCase().replace(/[-_.]+/gu, '-')
// Keep the first paint aligned with the Host's default before settings load.
const DEFAULT_MIRROR = 'https://mirrors.ustc.edu.cn/pypi/simple'
const BUILTIN_MIRRORS: PythonMirrorPresetInfo[] = [
  { id: 'aliyun', label: '阿里云', indexUrl: 'https://mirrors.aliyun.com/pypi/simple', custom: false },
  { id: 'tuna', label: '清华大学', indexUrl: 'https://pypi.tuna.tsinghua.edu.cn/simple', custom: false },
  { id: 'ustc', label: '中科大', indexUrl: DEFAULT_MIRROR, custom: false },
  { id: 'tencent', label: '腾讯云', indexUrl: 'https://mirrors.cloud.tencent.com/pypi/simple', custom: false },
  { id: 'huawei', label: '华为云', indexUrl: 'https://repo.huaweicloud.com/repository/pypi/simple', custom: false },
  { id: 'pypi', label: '官方 PyPI', indexUrl: 'https://pypi.org/simple', custom: false },
]
const sameIndex = (a: string, b: string) => a.replace(/\/+$/u, '').toLowerCase() === b.replace(/\/+$/u, '').toLowerCase()
function retainPackageMetadata(previous: McpPythonInfo | undefined, next: McpPythonInfo): McpPythonInfo {
  if (!next.snapshotId || previous?.snapshotId !== next.snapshotId) return next
  const metadata = new Map(previous.packages.map(pkg => [normalize(pkg.name), pkg]))
  return { ...next, packages: next.packages.map(pkg => {
    const current = metadata.get(normalize(pkg.name))
    return current?.version === pkg.version ? { ...pkg, capabilities: pkg.capabilities ?? current.capabilities, sha256: pkg.sha256 ?? current.sha256 } : pkg
  }) }
}
export function PythonEnvironmentPanel({ t }: PropsLocale<typeof NS>) {
  const [inventoryLoading, setInventoryLoading] = useState(true)
  const [info, setInfo] = useState<McpPythonInfo>()
  const [status, setStatus] = useState<McpEnvironmentStatus>()
  const [query, setQuery] = useState(''); const [filter, setFilter] = useState('all')
  const [capability, setCapability] = useState('all')
  // The official inventory is hundreds of rows and is no longer the editable surface users work
  // from, so the virtualized list stays unmounted until a search, a filter, or an explicit reveal.
  const [revealed, setRevealed] = useState(false)
  const [spec, setSpec] = useState(''); const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [updates, setUpdates] = useState<Record<string, Partial<McpPythonPackage>>>({})
  const [plan, setPlan] = useState<PythonPackagePlan & { manifestRevision?: string }>(); const [planStale, setPlanStale] = useState(false)
  const [mirrorUrl, setMirrorUrl] = useState(DEFAULT_MIRROR)
  const [mirrorPresets, setMirrorPresets] = useState<PythonMirrorPresetInfo[]>([])
  const [defaultMirrorUrl, setDefaultMirrorUrl] = useState(DEFAULT_MIRROR)
  const [configurationRevision, setConfigurationRevision] = useState<number>()
  const [dependencies, setDependencies] = useState<PythonEnvironmentResponse['dependencies']>()
  const [events, setEvents] = useState<NonNullable<PythonEnvironmentResponse['events']>>([])
  const [diagnostics, setDiagnostics] = useState<{ checkedAt: string; pip: { status: string; message?: string } }>()
  const [detail, setDetail] = useState<McpPythonPackage>()
  const [installRuntime, setInstallRuntime] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [customMirrorEditing, setCustomMirrorEditing] = useState(false)
  const [scrollTop, setScrollTop] = useState(0); const [height, setHeight] = useState(400)
  const searching = query.trim() !== '' || filter !== 'all' || capability !== 'all'; const showInventory = searching || revealed
  const list = useRef<HTMLDivElement>(null); const request = useRef(0); const active = useRef<string>()
  const api = window.zerowallDesktop
  const callEnvironment = api?.pythonEnvironment
  const loadStatus = useCallback(async () => {
    const next = await window.zerowallDesktop?.pythonEnvironment?.({ action: 'status', requestId: crypto.randomUUID() })
    if (!next) return
    if (next.status) setStatus(next.status)
    setDependencies(next.dependencies)
    setEvents((next.events ?? []).filter(event => !['status', 'list_packages'].includes(event.action)))
  }, [])
  const refresh = useCallback(async () => {
    const id = ++request.current
    setInventoryLoading(true)
    try {
      const desktop = window.zerowallDesktop
      const next = desktop?.pythonEnvironment ? (await desktop.pythonEnvironment({ action: 'list_packages', requestId: crypto.randomUUID() })).inventory ?? await desktop.getMcpPythonInfo?.() : await desktop?.getMcpPythonInfo?.()
      if (id !== request.current || !next) return
      if (active.current && next.snapshotId && next.snapshotId !== active.current) return
      setInfo(previous => retainPackageMetadata(previous, next))
    } catch (error) { if (id === request.current) setFeedback(String(error)) }
    finally { if (id === request.current) setInventoryLoading(false) }
  }, [])
  useEffect(() => {
    const receive = (next: McpEnvironmentStatus) => {
      setStatus(next)
      const snapshot = next.activeEnvironment?.snapshotId
      if (snapshot && snapshot !== active.current) {
        active.current = snapshot; setUpdates({}); setPlan(undefined); setPlanStale(false); setDetail(undefined); void refresh()
      }
      if (next.packageInventory?.snapshotId === snapshot && next.packageInventory) { const inventory = next.packageInventory; request.current++; setInfo(previous => retainPackageMetadata(previous, inventory)); setInventoryLoading(false) }
      if (next.updated) {
        const result = next.packageInventory?.verification
        const failed = result?.failedPackages ?? []
        if (result?.upToDate) setFeedback(t('python.shared.syncUpToDate'))
        else if (failed.length && (result.installed ?? 0) > 0) setFeedback(t('python.shared.installPartial', { installed: result.installed, failed: failed.join('、') }))
        else if (failed.length) setFeedback(t('python.shared.installFailed', { failed: failed.join('、') }))
        else if (result && (!result.imports || !result.pipCheck)) setFeedback(t('python.shared.installVerificationFailed'))
        else if (result) setFeedback(t('python.shared.installSucceeded', { count: result.installed ?? 0 }))
        else setFeedback(t('python.manager.activated'))
        void refresh()
        void loadStatus()
      }
      if (next.lastUpdateError) setFeedback(t('python.shared.installFailureSafety', { reason: next.lastUpdateError }))
    }
    const unsubscribe = window.zerowallDesktop?.onMcpEnvironmentStatus?.(receive)
    void window.zerowallDesktop?.getMcpEnvironmentStatus?.().then(receive)
    void refresh()
    return () => { unsubscribe?.(); request.current++ }
  }, [refresh, t])
  useEffect(() => { void loadStatus().catch(error => setFeedback(error instanceof Error ? error.message : String(error))) }, [loadStatus])
  useEffect(() => { void callEnvironment?.({ action: 'configure', requestId: crypto.randomUUID() }).then(value => { setMirrorUrl(value.mirrorUrl ?? DEFAULT_MIRROR); setConfigurationRevision(value.revision); setMirrorPresets(value.mirrorPresets ?? []); setDefaultMirrorUrl(value.defaultMirrorUrl ?? DEFAULT_MIRROR) }).catch(error => setFeedback(error instanceof Error ? error.message : String(error))) }, [callEnvironment])
  useEffect(() => {
    if (!list.current) return
    const observer = new ResizeObserver(entries => setHeight(entries[0]?.contentRect.height ?? 400))
    observer.observe(list.current); return () => observer.disconnect()
  }, [showInventory])
  const perform = async (key: string, work: () => Promise<unknown>) => {
    setBusy(value => ({ ...value, [key]: true }))
    try { await work() } catch (error) { setFeedback(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(value => ({ ...value, [key]: false })); void loadStatus().catch(() => undefined) }
  }
  // Only the newest check may write results, but a superseded run now says so out loud instead of
  // returning silently, which is what made the button look dead when nothing happened.
  const check = (name?: string) => perform(name ?? 'check', async () => {
    const expected = active.current
    const id = ++request.current
    if (!name && callEnvironment) {
      const value = await callEnvironment({ action: 'check_manifest', requestId: crypto.randomUUID() })
      if (value.status) setStatus(value.status)
      setFeedback(t('python.shared.manifestChecked'))
      return
    }
    const next = await api?.checkMcpPythonPackageUpdates?.(name ? [name] : [])
    // Both drops below used to `return` with no user-visible effect, which is the same
    // silent-failure shape that made 检查安装方案 look dead. Every exit states its outcome.
    if (!next) { setFeedback(t('python.unavailable')); return }
    if (expected !== active.current) { setFeedback(t('python.manager.refreshing')); return }
    if (id !== request.current) { setFeedback(t('python.manager.refreshing')); return }
    const packages = Array.isArray(next.packages) ? next.packages : []
    setUpdates(value => ({ ...value, ...Object.fromEntries(packages.filter((pkg: McpPythonPackage) => !name || pkg.name === name).map((pkg: McpPythonPackage) => [normalize(pkg.name), { latestVersion: pkg.latestVersion, latestError: pkg.latestError, updateAvailable: pkg.updateAvailable }])) }))
  })
  // The plan snapshot is the environment root the host resolved against, while the active snapshot
  // only becomes known once a status event lands. Showing the plan either way and flagging staleness
  // keeps a valid result from vanishing when the two have not converged yet.
  const preview = (key: string, names: string[]) => perform(key, async () => {
    const next = names.length ? await api?.previewMcpPythonPackages?.(names) : (await callEnvironment?.({ action: 'preview_sync', requestId: crypto.randomUUID() }))?.plan
    if (!next) { setFeedback(t('python.unavailable')); return }
    const resolved = next
    setPlanStale(!!active.current && !!resolved.snapshotId && resolved.snapshotId !== active.current)
    setPlan(resolved)
    if (!resolved.error) setUpdates(value => ({ ...value, ...Object.fromEntries((resolved.changes ?? []).map((change: { name: string; to: string }) => [normalize(change.name), { ...value[normalize(change.name)], compatibleVersion: change.to }])) }))
  })
  /**
   * One click: refresh the signed manifest, build and bind the plan, then apply
   * it. The host still writes a receipt for this requestId and still binds the
   * plan to the manifest revision, so a double click or a restart replays the
   * same task instead of installing twice — what the user no longer has to do is
   * approve the same change set twice. The change set stays visible in the
   * dependency list rather than in a modal that can be dismissed too early.
   */
  const syncNow = () => perform('sync', async () => {
    if (!callEnvironment) { setFeedback(t('python.unavailable')); return }
    let result: PythonEnvironmentResponse
    try { result = await callEnvironment({ action: 'sync', requestId: crypto.randomUUID(), confirm: true }) }
    catch (error) { setFeedback(t('python.shared.installFailureSafety', { reason: error instanceof Error ? error.message : String(error) })); return }
    if (!result) { setFeedback(t('python.unavailable')); return }
    if (result.upToDate) setFeedback(t('python.shared.syncUpToDate'))
    else if (result.taskId) setFeedback(t('python.manager.queued'))
    await loadStatus()
  })
  const rows = useMemo(() => (info?.packages ?? []).map(pkg => ({ ...pkg, ...updates[normalize(pkg.name)] })).filter(pkg =>
    pkg.name.toLowerCase().includes(query.toLowerCase()) && (capability === 'all' || pkg.capabilities?.includes(capability)) && (filter === 'all' || filter === pkg.source || filter === 'custom' && pkg.customized || filter === 'updates' && pkg.updateAvailable)), [info, updates, query, filter, capability])
  const capabilities = useMemo(() => [...new Set((info?.packages ?? []).flatMap(pkg => pkg.capabilities ?? []))].sort(), [info])
  const rowHeight = 88; const start = Math.max(0, Math.floor(scrollTop / rowHeight) - 4); const end = Math.min(rows.length, start + Math.ceil(height / rowHeight) + 8)
  useEffect(() => { const maximum = Math.max(0, rows.length * rowHeight - height); if (list.current && list.current.scrollTop > maximum) list.current.scrollTop = maximum }, [rows.length, height])
  const inventoryMatches = !active.current || info?.snapshotId === active.current
  const working = status && ['checking', 'downloading', 'verifying', 'installing'].includes(status.phase)
  useEffect(() => {
    if (!working) return
    const timer = window.setInterval(() => { void loadStatus().catch(() => undefined) }, 1500)
    return () => window.clearInterval(timer)
  }, [working, loadStatus])
  const liveLog = status?.updateJob?.logLines ?? events.filter(event => event.action === 'progress' && event.logLine).map(event => event.logLine!).reverse().slice(-80)
  const runtimeRoot = info?.runtimeRoot
  const stablePath = runtimeRoot
  const sharedSitePackages = runtimeRoot ? `${runtimeRoot.replace(/[\\/]+$/u, '')}\\Lib\\site-packages` : t('python.shared.pathPending')
  const copyPath = (value?: string) => value && void perform('copy-path', async () => { await api?.copyText?.(value); setFeedback(t('python.shared.copied')) })
  const openPath = (value?: string) => value && void perform('open-path', async () => { const ok = await api?.revealPath?.(value); if (!ok) setFeedback(t('python.shared.openFailed')) })
  /**
   * Kept as an internal refresh rather than a user action. The "test connection
   * and certificate" button and the mirror-probe row it fed are gone: the probe
   * reported a healthy mirror as 失败 often enough that the row was noise, and it
   * never gated an install. The CA row survives in the advanced footer, where a
   * genuinely broken bundle is still visible without a red light on every load.
   */
  const refreshDiagnostics = () => perform('diagnose', async () => { const result = await callEnvironment?.({ action: 'diagnose', requestId: crypto.randomUUID() }); if (result?.diagnostics) setDiagnostics(result.diagnostics) })
  const configure = (value = mirrorUrl) => perform('configure', async () => { const result = await callEnvironment?.({ action: 'configure', requestId: crypto.randomUUID(), mirrorUrl: value, expectedRevision: configurationRevision }); if (!result) { setFeedback(t('python.unavailable')); return }; setMirrorUrl(result.mirrorUrl ?? value); setConfigurationRevision(result.revision); setFeedback(t('python.shared.mirrorSaved')) })
  const language = t('python.shared.advanced') === 'Advanced settings' ? 'en' : 'zh'
  const mirrorNames: Record<string, string> = language === 'en'
    ? { aliyun: 'Aliyun', tuna: 'Tsinghua University', ustc: 'USTC', tencent: 'Tencent Cloud', huawei: 'Huawei Cloud', pypi: 'Official PyPI' }
    : { aliyun: '阿里云', tuna: '清华大学', ustc: '中科大', tencent: '腾讯云', huawei: '华为云', pypi: '官方 PyPI' }
  const mirrorOptions = (mirrorPresets.length ? mirrorPresets : BUILTIN_MIRRORS).filter(preset => !preset.custom).map(preset => ({ ...preset, label: mirrorNames[preset.id] ?? preset.label }))
  const selectedMirrorId = mirrorOptions.find(preset => sameIndex(preset.indexUrl, mirrorUrl))?.id ?? 'custom'
  const selectMirror = (id: string): void => {
    if (id === 'custom') { setCustomMirrorEditing(true); setAdvancedOpen(true); return }
    const preset = mirrorOptions.find(value => value.id === id)
    if (preset) { setCustomMirrorEditing(false); setMirrorUrl(preset.indexUrl); void configure(preset.indexUrl) }
  }
  const healthLabel = (value?: string) => value === 'passed' || value === 'available' || value === 'ready' || value === 'ok' ? t('python.shared.passed') : value === 'failed' || value === 'error' ? t('python.shared.failed') : t('python.shared.pending')
  /**
   * The stage line, derived from the phase rather than from `status.message`.
   * Backend messages are Chinese prose, and painting them into an English panel
   * is the leak this label exists to prevent; the raw message still reaches the
   * operations log, where it is data rather than UI copy.
   */
  const phaseLabel = (): string => {
    if (!working || !status) return t('python.manager.checking')
    if (status.phase === 'downloading') return t('python.manager.downloading')
    if (status.phase === 'verifying') return t('python.manager.verifying')
    if (status.phase === 'installing') return status.updateJob?.totalFiles ? t('python.manager.extracting', { completed: status.updateJob.completedFiles ?? 0, total: status.updateJob.totalFiles }) : t('python.manager.preparing')
    return t('python.manager.checking')
  }
  return <section className={css.panel} aria-label={t('python.title')}>
    <header className={css.heading}>
      <div><span className={css.eyebrow}>ZeroWall Science</span><h2>{t('python.title')}</h2><p className={css.subtitle}>{t('python.shared.subtitle')}</p></div>
      <div className={css.headingActions}><span className={`${css.statusPill} ${info?.ready ? css.success : css.muted}`}>{info?.ready ? t('python.ready') : inventoryLoading || working ? t('python.checking') : t('python.unavailable')}</span><button onClick={() => { void refresh(); void loadStatus() }} aria-label={t('python.shared.refreshStatus')}>{t('python.manager.refresh')}</button></div>
    </header>
    <div className={css.summary}>
      <div className={css.metric}><span>{t('python.version')}</span><strong>{info?.version ?? '—'}</strong><small>{t('python.environment')}</small></div>
      <div className={css.metric}><span>{t('python.manifestPackages')}</span><strong>{dependencies?.packageCount ?? '—'}</strong><small>{dependencies?.changes.length ? `${t('python.shared.pendingMetric')}：${dependencies.changes.length}` : t('python.ready')}</small></div>
      <div className={css.metric}><span>{t('python.installedPackages')}</span><strong>{inventoryMatches ? info?.packageCount ?? '—' : '…'}</strong><small>{t('python.manager.effective')}</small></div>
      <div className={css.metric}><span>{t('python.status')}</span><strong>{info?.ready ? t('python.ready') : inventoryLoading || working ? t('python.checking') : t('python.shared.pending')}</strong><small>{t('python.shared.health')}: {healthLabel(info?.ready ? 'ok' : undefined)}</small></div>
    </div>
    <div className={css.update} role="status" aria-live="polite">
      <div><strong>{working ? phaseLabel() : status?.phase === 'paused' ? t('python.manager.paused') : t('python.shared.updatePolicy')}</strong>
        <span>{dependencies?.packageCount ? `${dependencies.packageCount} · Python ${dependencies.pythonVersion}` : t('python.manager.pinnedTask')}</span></div>
      {working && <>
        <progress max={100} value={status.progress ?? 0} />
        {/* A bare progress bar says "something is happening"; the stage and the
            package count are what make a long install safe to leave running. */}
        <div className={css.progressLine} role="status">
          <span>{phaseLabel()}</span>
          {!!status.updateJob?.packageNames?.length && <span>{t('python.manager.progressPackages', { completed: status.updateJob.completedFiles ?? 0, total: status.updateJob.packageNames.length })}</span>}
          <span>{status.progress ?? 0}%</span>
        </div>
      </>}
      {dependencies && <div className={css.manifestMeta}>
        <strong>{t('python.shared.pendingCount', { count: dependencies.changes.length })}</strong>
        {dependencies.packageCount > 0 && <span>{dependencies.packageCount} {t('python.shared.dependencies')}</span>}
        {dependencies.source && <span>{t(`python.shared.source.${dependencies.source}` as 'python.shared.source.remote')}</span>}
        {dependencies.checkedAt && <time dateTime={dependencies.checkedAt}>{t('python.shared.lastChecked')}: {new Date(dependencies.checkedAt).toLocaleString()}</time>}
      </div>}
      <div className={css.actions}>
        {working && status.updateJob?.canPause && <button onClick={() => void api?.pauseMcpEnvironment?.()}>{t('python.manager.pause')}</button>}
        {/* One primary action checks, plans and installs the signed dependency set. */}
        {!working && <button className={css.primary} disabled={busy.sync || !callEnvironment} onClick={() => void syncNow()}>{busy.sync ? t('python.shared.syncing') : t('python.shared.syncNow')}</button>}
        {status?.phase === 'paused' && <button disabled={busy.resume || !api?.updateMcpEnvironment} onClick={() => void perform('resume', async () => { await api?.updateMcpEnvironment?.() })}>{t('python.manager.resume')}</button>}
        {!working && status?.phase !== 'paused' && !inventoryLoading && !info?.ready && <button disabled={busy.bootstrap || !api?.updateMcpEnvironment} onClick={() => setInstallRuntime(true)}>{t('python.shared.installRuntime')}</button>}
        {status?.rollbackAvailable && !working && <button onClick={() => void perform('rollback', async () => { await api?.rollbackMcpEnvironment?.(); setFeedback(t('python.manager.rollbackQueued')) })}>{t('python.manager.rollback')}</button>}
        {!!status?.updateJob?.bytesPerSecond && <span>{(status.updateJob.bytesPerSecond / 1024 ** 2).toFixed(1)} MiB/s</span>}
        {!!status?.updateJob?.totalBytes && <span>{((status.updateJob.receivedBytes ?? 0) / 1024 ** 2).toFixed(1)} / {(status.updateJob.totalBytes / 1024 ** 2).toFixed(1)} MiB</span>}
      </div>
    </div>
    {(working || liveLog.length > 0) && <details className={css.liveLog} open={working}>
      <summary>{t('python.shared.log')} · {liveLog.length}</summary>
      <pre role="log" aria-live="polite">{liveLog.length ? liveLog.join('\n') : t('python.shared.logEmpty')}</pre>
    </details>}
    <div className={css.environmentGrid}>
      <section className={css.card} aria-labelledby="python-path-title"><div className={css.cardTitle}><div><span className={css.sectionKicker}>{t('python.environment')}</span><h3 id="python-path-title">{t('python.shared.path')}</h3></div><span className={css.checkMark}>{stablePath ? '✓' : '—'}</span></div><div className={css.pathBox} title={stablePath ?? ''}>{stablePath ?? t('python.shared.pathPending')}</div><div className={css.cardActions}><button disabled={!stablePath} onClick={() => copyPath(stablePath)}>{t('python.shared.copy')}</button><button disabled={!stablePath} onClick={() => openPath(stablePath)}>{t('python.shared.open')}</button><button disabled={!stablePath || !api?.openPythonTerminal} onClick={() => void perform('terminal', async () => { if (!await api?.openPythonTerminal?.()) setFeedback(t('python.shared.terminalFailed')) })}>{t('python.shared.terminal')}</button></div><p className={css.hint}>{t('python.shared.subtitle')}</p></section>
      <section className={css.card} aria-labelledby="python-health-title"><div className={css.cardTitle}><div><span className={css.sectionKicker}>{t('python.status')}</span><h3 id="python-health-title">{t('python.shared.mirror')}</h3></div></div>
        <label className={css.mirrorSelectLabel}>{t('python.shared.mirror')}<select aria-label={t('python.shared.mirror')} value={selectedMirrorId} disabled={busy.configure || !callEnvironment} onChange={event => selectMirror(event.target.value)}>
          {mirrorOptions.map(preset => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
          <option value="custom">{t('python.shared.customMirrorChoice')}</option>
        </select></label>
        <p className={css.hint} title={mirrorUrl}>{mirrorOptions.find(preset => sameIndex(preset.indexUrl, mirrorUrl))?.label ?? mirrorUrl}</p>
      </section>
    </div>
    <p role="status" className={css.feedback}>{feedback}</p>
    {!inventoryLoading && !info?.ready && <p className={css.empty} role="status">{t('python.notReady')}</p>}
    <details className={css.advanced} open={advancedOpen} onToggle={event => { setAdvancedOpen(event.currentTarget.open); if (event.currentTarget.open && !diagnostics) refreshDiagnostics() }}>
      <summary>{t('python.shared.advanced')}</summary>
      <div className={css.advancedBody}>
        <div className={css.actions}>
          <button disabled={busy.check} onClick={() => void check()}>{t('python.shared.manifestCheck')}</button>
          <button disabled={busy.sync || !callEnvironment} onClick={() => void preview('sync', [])}>{t('python.shared.manifestPreview')}</button>
          {status?.rollbackAvailable && !working && <button onClick={() => void perform('rollback', async () => { await api?.rollbackMcpEnvironment?.(); setFeedback(t('python.manager.rollbackQueued')) })}>{t('python.manager.rollback')}</button>}
        </div>
        {(customMirrorEditing || selectedMirrorId === 'custom') && <section className={css.advancedSection}>
          <h3>{t('python.shared.customMirror')}</h3>
          <input className={css.mirrorInput} aria-label={t('python.shared.customMirror')} placeholder={t('python.shared.customMirrorHint')} value={mirrorUrl} onChange={event => setMirrorUrl(event.target.value)} />
          <div className={css.mirrorActions}><button disabled={busy.configure || !callEnvironment || !mirrorUrl.trim()} onClick={() => void configure()}>{t('python.shared.saveMirror')}</button><button disabled={busy.configure || !callEnvironment} onClick={() => { setCustomMirrorEditing(false); setMirrorUrl(defaultMirrorUrl); void configure(defaultMirrorUrl) }}>{t('python.shared.resetMirror')}</button></div>
        </section>}
        <div className={css.sectionHeading}><div><h3>{t('python.shared.dependencies')}</h3></div><span className={css.sectionMeta}>{dependencies?.packageCount ? `${dependencies.packageCount} · ${t('python.shared.updatePolicy')}` : t('python.shared.updatePolicy')}</span></div>
        {!!dependencies?.changes.length && <details className={css.changeList}><summary>{t('python.shared.pendingChanges', { count: dependencies.changes.length })}</summary><ol>{dependencies.changes.map(change => <li key={change.name}><strong>{change.name}</strong><span>{change.from ?? t('python.manager.notInstalled')} → {change.to}</span></li>)}</ol></details>}
        <div className={css.toolbar}><input aria-label={t('python.manager.add')} placeholder={t('python.manager.addHint')} value={spec} onChange={e => setSpec(e.target.value)} /><button disabled={!spec.trim() || busy.preview} onClick={() => void preview('preview', [spec.trim()])}>{busy.preview ? t('python.manager.working') : t('python.manager.plan')}</button></div>
        <div className={css.toolbar}>
          <input aria-label={t('python.manager.search')} placeholder={t('python.manager.searchHint')} value={query} onChange={e => setQuery(e.target.value)} />
          <select aria-label={t('python.manager.source')} value={filter} onChange={e => setFilter(e.target.value)}><option value="all">{t('python.manager.all')}</option><option value="custom">{t('python.manager.custom')}</option><option value="updates">{t('python.manager.updates')}</option></select>
          {!!capabilities.length && <select aria-label={t('python.shared.capabilities')} value={capability} onChange={e => setCapability(e.target.value)}><option value="all">{t('python.shared.allCapabilities')}</option>{capabilities.map(value => <option key={value} value={value}>{value}</option>)}</select>}
          <button disabled={busy.check} onClick={() => void check()}>{busy.check ? t('python.manager.checkingUpdates') : t('python.manager.checkUpdates')}</button>
        </div>
        <details className={css.inventory} open={showInventory} onToggle={e => setRevealed(e.currentTarget.open)}>
          <summary className={css.inventorySummary}>{inventoryLoading || !inventoryMatches ? t('python.manager.refreshingInventory') : t('python.shared.inventory', { effective: info?.packageCount ?? 0, filtered: rows.length })}</summary>
          {showInventory && <>
            <div className={css.listHeader}><span>{t('python.manager.nameVersion')}</span><span>{t('python.manager.versionsActions')}</span></div>
            <div ref={list} className={css.list} role="list" aria-label={t('python.manager.list')} onScroll={e => setScrollTop(e.currentTarget.scrollTop)}>
              <div style={{ height: rows.length * rowHeight, position: 'relative' }}>
                {(inventoryMatches ? rows.slice(start, end) : []).map((pkg, index) => <div key={normalize(pkg.name)} className={css.row} role="listitem" style={{ position: 'absolute', top: (start + index) * rowHeight, height: rowHeight, insetInline: 0 }}>
                  <div className={css.package}><strong title={pkg.name}>{pkg.name}</strong><span>{pkg.version} · {pkg.customized ? t('python.manager.custom') : t('python.shared.managed')}</span></div>
                  <div className={css.rowActions}><span title={pkg.latestError}>{working && status.updateJob?.packageNames?.some(name => normalize(name) === normalize(pkg.name)) ? t('python.manager.upgrading') : busy[pkg.name] ? t('python.manager.processing') : pkg.latestError ? t('python.manager.checkFailed') : pkg.compatibleVersion ? t('python.manager.compatible', { version: pkg.compatibleVersion }) : pkg.latestVersion ? `PyPI ${pkg.latestVersion}` : t('python.manager.unchecked')}</span><div>
                    <button disabled={busy[pkg.name]} onClick={() => void check(pkg.name)}>{t('python.manager.check')}</button>
                    <button disabled={busy[pkg.name]} onClick={() => void preview(pkg.name, [pkg.name])}>{busy[pkg.name] ? t('python.manager.working') : t('python.manager.upgrade')}</button>
                    <button onClick={() => setDetail(pkg)}>{t('python.manager.details')}</button>
                  </div></div>
                </div>)}
              </div>
              {!rows.length && <p className={css.empty} role="status">{inventoryLoading ? t('python.manager.refreshingInventory') : t('python.manager.empty')}</p>}
            </div>
          </>}
        </details>
        <details className={css.history} open={working}><summary>{t('python.shared.operations')} · {events.length}</summary>{events.length ? <ol>{events.slice(-50).reverse().map((event, index) => <li key={`${event.requestId}-${event.createdAt}-${index}`}><div><strong>{['check_manifest', 'preview_sync', 'apply_sync', 'sync', 'progress', 'configure', 'diagnose', 'rollback'].includes(event.action) ? t(`python.shared.action.${event.action}` as 'python.shared.action.configure') : event.action}</strong><span className={event.status === 'failed' ? css.healthPending : css.healthValue}>{event.status === 'failed' ? t('python.shared.failed') : event.status === 'running' ? t('python.manager.refreshing') : event.taskId ? t('python.shared.submitted') : t('python.shared.succeeded')}</span><time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString()}</time></div>{event.message && <p>{event.message}</p>}<small title={event.requestId}>{event.taskId ?? event.requestId}</small></li>)}</ol> : <p>{t('python.shared.noOperations')}</p>}</details>
        <section className={css.advancedSection} aria-label={t('python.shared.diagnostics')}><h3>{t('python.shared.diagnostics')}</h3><dl><dt>{t('python.manager.interpreter')}</dt><dd>{info?.executable}</dd><dt>{t('python.shared.sitePackages')}</dt><dd>{info?.sitePackages}</dd><dt>{t('python.manager.scanned')}</dt><dd>{info?.scannedAt}</dd><dt>{t('python.manager.skills')}</dt><dd>{info?.skillAudit ? Object.entries(info.skillAudit.summary).map(([key, value]) => `${key}: ${value}`).join(" · ") : t('python.manager.noAudit')}</dd><dt>{t('python.shared.verification')}</dt><dd>{info?.verification?.message ?? status?.lastUpdateError ?? '—'}</dd><dt>pip</dt><dd title={diagnostics?.pip.message}>{diagnostics ? healthLabel(diagnostics.pip.status) : t('python.shared.pending')}</dd></dl></section>
      </div>
    </details>
    {installRuntime && <div className={css.backdrop}><section className={css.dialog} role="dialog" aria-modal="true" aria-label={t('python.shared.installTitle')}><h3>{t('python.shared.installTitle')}</h3><p>{t('python.shared.installHint')}</p><dl><dt>{t('python.manager.source')}</dt><dd>{t('python.shared.runtimeSource')}</dd><dt>{t('python.version')}</dt><dd>{status?.python?.version ?? t('python.shared.runtimeVersion')}</dd></dl><div className={css.actions}><button disabled={busy.bootstrap} onClick={() => setInstallRuntime(false)}>{t('python.manager.close')}</button><button disabled={busy.bootstrap} onClick={() => void perform('bootstrap', async () => { await api?.updateMcpEnvironment?.(); setInstallRuntime(false); setFeedback(t('python.manager.installQueued')) })}>{t('python.shared.downloadBase')}</button></div></section></div>}
    {(plan || detail) && <div className={css.backdrop}><section className={css.dialog} role="dialog" aria-modal="true" aria-label={plan ? t('python.manager.preview') : t('python.manager.packageDetails')}>
      <h3>{plan ? t('python.manager.preview') : detail?.name}</h3>
      {plan ? <>
        <p>{t('python.manager.previewHint')}</p>
        {planStale && <p className={css.warning} role="status">{t('python.manager.stalePlan')}</p>}
        {plan.error ? <pre>{plan.error}</pre> : plan.changes.length ? <ul>{plan.changes.map(change => <li key={change.name}>{change.name}: {change.from ?? t('python.manager.notInstalled')} → {change.to}</li>)}</ul> : <p>{t('python.manager.noChanges')}</p>}
        <div className={css.actions}>
          <button onClick={() => { setPlan(undefined); setPlanStale(false) }}>{t('python.manager.close')}</button>
          {!plan.error && !!plan.changes.length && <button disabled={busy.apply || planStale || (!!plan.manifestRevision && !callEnvironment)} onClick={() => void perform('apply', async () => {
            const result = plan.manifestRevision ? await callEnvironment?.({ action: 'apply_sync', requestId: crypto.randomUUID(), planId: plan.planId, manifestRevision: plan.manifestRevision, confirm: true }) : await api?.applyMcpPythonPackagePlan?.(plan.planId)
            if (!result) { setFeedback(t('python.unavailable')); return }
            if (result.taskId) setFeedback(t('python.manager.queued'))
            setPlan(undefined); setPlanStale(false)
          })}>{t('python.manager.apply')}</button>}
        </div>
      </> : <>
        <dl><dt>{t('python.manager.currentVersion')}</dt><dd>{detail?.version}</dd><dt>{t('python.manager.baseline')}</dt><dd>{detail?.requiredVersion ?? t('python.manager.userInstalled')}</dd><dt>{t('python.manager.shadowedVersion')}</dt><dd>{detail?.shadowedVersion ?? t('python.manager.none')}</dd><dt>{t('python.manager.location')}</dt><dd>{sharedSitePackages}</dd><dt>{t('python.manager.validation')}</dt><dd>{detail?.verificationMessage ?? t('python.manager.officialBaseline')}</dd><dt>{t('python.manager.dependencies')}</dt><dd>{detail?.dependencies?.join('; ') || t('python.manager.undeclared')}</dd></dl>
        {!!detail?.upgradeHistory?.length && <details><summary>{t('python.manager.history')}</summary><ul>{detail.upgradeHistory.map((entry, index) => <li key={index}>{entry.from ?? t('python.manager.notInstalled')} → {entry.to} · {entry.verifiedAt}</li>)}</ul></details>}
        <p>{t('python.shared.capabilities')}: {detail?.capabilities?.join(', ') || t('python.shared.pending')}</p>
        <details><summary>{t('python.shared.advanced')}</summary><dl><dt>{t('python.manager.location')}</dt><dd>{detail?.location ?? t('python.shared.pending')}</dd><dt>{t('python.shared.wheelSha')}</dt><dd>{detail?.sha256 ?? t('python.shared.pending')}</dd></dl></details>
        {(detail?.previousVersion || detail?.customized && detail?.requiredVersion) && <button onClick={() => { const target = detail.previousVersion ?? detail.requiredVersion; setDetail(undefined); void preview(normalize(detail.name), [`${detail.name}==${target}`]) }}>{t('python.manager.restorePackage')}</button>}
        <button onClick={() => setDetail(undefined)}>{t('python.manager.close')}</button>
      </>}
    </section></div>}
  </section>
}
