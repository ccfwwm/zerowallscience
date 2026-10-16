import { useCallback, useEffect, useRef, useState } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from '@zerowallscience/plugin-base/client-helpers'
import type { McpEnvironmentStatus, McpPythonInfo, PythonDependencyTask, PythonEnvironmentResponse, PythonMirrorPresetInfo } from '../../../base/src/client/desktop-api.js'
import { mergePythonInventory, coreNeedsInstallation } from './python-inventory-state.js'
import { localizePythonText } from './python-localization.js'
import css from './PythonEnvironmentPanel.module.css'

const DEFAULT_MIRROR = 'https://mirrors.ustc.edu.cn/pypi/simple'
const normalize = (name: string) => name.toLowerCase().replace(/[-_.]+/gu, '-')
const activeTask = (task?: PythonDependencyTask) => task?.state === 'running' || task?.state === 'queued'
const sameIndex = (a: string, b: string) => a.replace(/\/+$/u, '').toLowerCase() === b.replace(/\/+$/u, '').toLowerCase()

export function PythonEnvironmentPanel({ t }: PropsLocale<typeof NS>) {
  const api = window.zerowallDesktop
  const call = api?.pythonEnvironment
  const en = t('python.shared.advanced') === 'Advanced settings'
  const L = (zh: string, english: string) => en ? english : zh
  const [info, setInfo] = useState<McpPythonInfo>()
  const [status, setStatus] = useState<McpEnvironmentStatus>()
  const [task, setTask] = useState<PythonDependencyTask>()
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [root, setRoot] = useState<string>()
  const [restart, setRestart] = useState(false)
  const [mirror, setMirror] = useState(DEFAULT_MIRROR)
  const [presets, setPresets] = useState<PythonMirrorPresetInfo[]>([])
  const [revision, setRevision] = useState<number>()
  const [query, setQuery] = useState('')
  const [spec, setSpec] = useState('')
  const [diagnostics, setDiagnostics] = useState<PythonEnvironmentResponse['diagnostics']>()
  const scanRequest = useRef(0)
  const alive = useRef(true)
  const pendingRoot = useRef(false)
  const completedTask = useRef<string>()
  const refreshing = useRef(false)
  const working = activeTask(task) || busy
  const acceptInventory = useCallback((next?: McpPythonInfo) => {
    if (next && alive.current) setInfo(previous => mergePythonInventory(previous, next))
  }, [])
  const loadStatus = useCallback(async () => {
    const next = await call?.({ action: 'status', requestId: crypto.randomUUID() })
    if (!next || !alive.current) return
    if (next.status) setStatus(next.status)
    acceptInventory(next.inventory)
    if (next.task) setTask(next.task)
    if (!pendingRoot.current && next.runtimeRoot) setRoot(next.runtimeRoot)
  }, [call, acceptInventory])
  const refresh = useCallback(async () => {
    if (refreshing.current) return
    refreshing.current = true
    const id = ++scanRequest.current
    setLoading(true)
    try {
      if (!call) { acceptInventory(await api?.getMcpPythonInfo?.()); return }
      const started = await call({ action: 'scan_local', requestId: crypto.randomUUID() })
      const deadline = Date.now() + 46_000
      let scan = started.scan
      while (scan?.state === 'running' && alive.current && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 300))
        const value = await call({ action: 'status', requestId: crypto.randomUUID() })
        if (id !== scanRequest.current || !alive.current) return
        if (value.task) setTask(value.task)
        scan = value.scan
        if (scan && scan.scanId !== started.scanId) return
      }
      if (!alive.current || id !== scanRequest.current) return
      if (scan?.inventory?.inventoryComplete) acceptInventory(scan.inventory)
      else if (scan?.error) setFeedback(scan.error)
      else if (scan?.state === 'running') setFeedback('PYTHON_SCAN_TIMEOUT: ' + (en ? 'Local scan timed out.' : '本地检测超时，请重试。'))
      await loadStatus()
    } catch (error) { if (alive.current) setFeedback(error instanceof Error ? error.message : String(error)) }
    finally { refreshing.current = false; if (alive.current && id === scanRequest.current) setLoading(false) }
  }, [api, call, acceptInventory, loadStatus, en])
  useEffect(() => {
    alive.current = true
    void loadStatus().catch(error => setFeedback(String(error)))
    void refresh()
    void call?.({ action: 'configure', requestId: crypto.randomUUID() }).then(value => {
      if (!alive.current) return
      setMirror(value.mirrorUrl ?? DEFAULT_MIRROR); setPresets(value.mirrorPresets ?? []); setRevision(value.revision)
    }).catch(error => setFeedback(String(error)))
    const unsubscribe = api?.onMcpEnvironmentStatus?.(next => {
      if (!alive.current) return
      setStatus(next)
      if (next.packageInventory?.inventoryComplete) acceptInventory(next.packageInventory)
    })
    return () => { alive.current = false; scanRequest.current++; unsubscribe?.() }
  }, [api, call, loadStatus, refresh, acceptInventory])
  useEffect(() => {
    if (!activeTask(task)) return
    const timer = window.setInterval(() => { void loadStatus().catch(() => undefined) }, 1000)
    return () => window.clearInterval(timer)
  }, [task?.state, loadStatus])
  useEffect(() => {
    if (!task || activeTask(task) || completedTask.current === task.taskId) return
    completedTask.current = task.taskId
    if (['sync', 'apply_sync', 'install_package', 'install_runtime'].includes(task.action)) void refresh()
  }, [task, refresh])
  const perform = async (work: () => Promise<unknown>) => {
    setBusy(true); setFeedback('')
    try { await work() } catch (error) { setFeedback(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false); void loadStatus().catch(() => undefined) }
  }
  const install = (layer: 'core' | 'science') => void perform(async () => {
    const result = await call?.({ action: 'sync', layer, confirm: true, requestId: crypto.randomUUID() })
    if (result?.task) setTask(result.task)
  })
  const installPackage = (packageSpec: string) => void perform(async () => {
    const result = await call?.({ action: 'install_package', packageSpec, confirm: true, requestId: crypto.randomUUID() })
    if (result?.task) setTask(result.task)
    setSpec('')
  })
  const saveMirror = (value: string) => void perform(async () => {
    const result = await call?.({ action: 'configure', mirrorUrl: value, expectedRevision: revision, requestId: crypto.randomUUID() })
    if (result) { setMirror(result.mirrorUrl ?? value); setRevision(result.revision) }
  })
  const changePath = () => void perform(async () => {
    const selected = await api?.chooseDirectory?.()
    if (!selected) return
    const result = await call?.({ action: 'configure', runtimeRoot: selected, requestId: crypto.randomUUID() })
    if (result?.runtimeRoot) setRoot(result.runtimeRoot)
    pendingRoot.current = result?.restartRequired === true
    setRestart(pendingRoot.current)
  })
  const shell = () => void perform(async () => {
    // New worker action travels through the existing ABI 1 request bridge.
    const request = call as unknown as (input: { action: 'open_shell'; requestId: string }) => Promise<{ opened: boolean }>
    if (!request || !(await request({ action: 'open_shell', requestId: crypto.randomUUID() })).opened) throw new Error(L('无法打开 Python 命令行。', 'Unable to open the Python shell.'))
  })
  const known = info?.inventoryComplete === true
  const coreMissing = coreNeedsInstallation(info)
  const coreTotal = info?.officialPackageCount ?? 0
  const scienceTotal = info?.sciencePackageCount ?? 0
  const missing = (total: number, installed?: number) => Math.max(0, total - (installed ?? 0))
  const percent = task?.totalPackages ? Math.floor((task.completedPackages ?? 0) / task.totalPackages * 100) : undefined
  const installedRows = (info?.packages ?? []).filter(pkg => normalize(pkg.name).includes(normalize(query.trim())))
  const failures = (task?.result?.skippedPackages as Array<{ name: string; message: string }> | undefined) ?? []
  const mirrorId = presets.find(preset => sameIndex(preset.indexUrl, mirror))?.id ?? (sameIndex(mirror, DEFAULT_MIRROR) ? 'ustc' : 'custom')
  const text = (value?: string) => localizePythonText(value, en ? 'en' : 'zh')
  const layerCard = (layer: 'core' | 'science', title: string, total: number, installed?: number) => <section className={css.layerCard}>
    <div><strong>{title}</strong><span>{known && total ? `${installed ?? 0} / ${total}` : L('待检测', 'Not checked')}</span></div>
    <p>{known && total ? missing(total, installed) ? L(`缺少 ${missing(total, installed)} 个包`, `${missing(total, installed)} packages missing`) : L('已安装', 'Installed') : loading ? L('正在检测本地安装包…', 'Reading local packages…') : L('点击检测，或直接安装所需依赖', 'Check packages or install dependencies')}</p>
    <button className={css.primary} disabled={working || restart || !call} onClick={() => install(layer)}>{known && total && !missing(total, installed) ? L('检查并补装', 'Check and install missing') : layer === 'core' ? L('安装基础依赖', 'Install core dependencies') : L('安装科研依赖', 'Install science dependencies')}</button>
  </section>
  return <section className={css.panel} aria-label={t('python.title')}>
    <header className={css.heading}>
      <div><h2>{t('python.title')}</h2><p className={css.subtitle}>{L('一个共享环境，按本机已安装的包补缺', 'One shared environment; install only missing packages')}</p></div>
      <div className={css.headingActions}><span className={`${css.statusPill} ${info?.ready ? coreMissing ? css.warning : css.success : css.muted}`}>{loading && !known ? L('检测中', 'Checking') : !known ? L('待检测', 'Not checked') : coreMissing ? L('基础依赖未齐', 'Core dependencies missing') : info?.ready ? L('可用', 'Ready') : L('未安装', 'Not installed')}</span><button disabled={loading} onClick={() => void refresh()}>{loading ? L('检测中…', 'Checking…') : L('检测 / 刷新', 'Check / refresh')}</button></div>
    </header>
    <div className={css.summary}>
      <div className={css.metric}><span>{t('python.version')}</span><strong>{info?.version ?? '—'}</strong></div>
      <div className={css.metric}><span>{L('本机已安装包', 'Installed packages')}</span><strong>{info?.packageCount ?? '—'}</strong></div>
      <div className={css.metric}><span>{L('最近检测', 'Last local scan')}</span><small>{info?.scannedAt ? new Date(info.scannedAt).toLocaleString() : '—'}</small></div>
    </div>
    <div className={css.layerCards}>
      {layerCard('core', L('基础依赖', 'Core dependencies'), coreTotal, info?.corePackageCount)}
      {layerCard('science', L('科研依赖', 'Science dependencies'), scienceTotal, info?.scienceInstalledPackageCount)}
    </div>
    {task && <section className={css.update} aria-live="polite">
      <div><strong>{activeTask(task) ? task.stage === 'installing' ? L('逐包安装中', 'Installing packages') : text(task.message) : task.state === 'succeeded' ? L('安装完成', 'Completed') : text(task.message)}</strong>{activeTask(task) && task.currentPackage && <span>{task.currentPackage}</span>}</div>
      {task.totalPackages !== undefined && <><progress max={task.totalPackages || 1} value={task.completedPackages ?? 0} /><div className={css.progressLine}><span>{L('安装成功', 'Successfully installed')} {task.completedPackages ?? 0} / {task.totalPackages}</span><span>{percent ?? 0}%</span></div></>}
      {task.error && <p className={css.warning}>{text(task.error)}</p>}
      {!!failures.length && <details><summary>{L(`失败 ${failures.length} 个包`, `${failures.length} packages failed`)}</summary>{failures.map(failure => <p key={failure.name}><strong>{failure.name}</strong> {text(failure.message)} <button disabled={working} onClick={() => installPackage(failure.name)}>{L('重试', 'Retry')}</button></p>)}</details>}
      {activeTask(task) && <button disabled={busy} onClick={() => void perform(async () => { const result = await call?.({ action: 'cancel', taskId: task.taskId, requestId: crypto.randomUUID() }); if (result?.task) setTask(result.task) })}>{L('取消安装', 'Cancel installation')}</button>}
      {!!task.logLines.length && <details className={css.liveLog}><summary>{L('查看安装日志', 'View installation log')}</summary><pre role="log">{task.logLines.map(line => text(line)).join('\n')}</pre></details>}
    </section>}
    {feedback && <p className={css.feedback} role="status">{text(feedback)}</p>}
    <div className={css.environmentGrid}>
      <section className={css.card}><h3>{L('Python 路径', 'Python path')}</h3><div className={css.pathBox} title={root}>{root ?? '—'}</div><div className={css.cardActions}><button disabled={!root} onClick={() => void api?.copyText?.(root!)}>{L('复制路径', 'Copy path')}</button><button disabled={!root} onClick={() => void api?.revealPath?.(root!)}>{L('打开文件夹', 'Open folder')}</button><button disabled={!info?.ready || restart || busy} onClick={shell}>{L('打开 Python 命令行', 'Open Python shell')}</button></div></section>
      <section className={css.card}><h3>{L('下载镜像', 'Package mirror')}</h3><select className={css.mirrorInput} aria-label={L('下载镜像', 'Package mirror')} value={mirrorId} disabled={working} onChange={event => { const preset = presets.find(value => value.id === event.target.value); if (preset) saveMirror(preset.indexUrl); else setMirror('') }}>
        {!presets.length && <option value="ustc">{L('中科大', 'USTC')}</option>}{presets.filter(preset => !preset.custom).map(preset => <option key={preset.id} value={preset.id}>{en ? ({ ustc: 'USTC', aliyun: 'Alibaba Cloud', tuna: 'Tsinghua University', tencent: 'Tencent Cloud', huawei: 'Huawei Cloud', official: 'Official PyPI', pypi: 'Official PyPI' } as Record<string, string>)[preset.id] ?? new URL(preset.indexUrl).hostname : preset.label}</option>)}<option value="custom">{L('自定义', 'Custom')}</option>
      </select>{mirrorId === 'custom' && <div className={css.toolbar}><input aria-label={L('镜像网址', 'Mirror URL')} value={mirror} onChange={event => setMirror(event.target.value)} /><button disabled={working || !mirror.trim()} onClick={() => saveMirror(mirror)}>{L('保存', 'Save')}</button></div>}</section>
    </div>
    <section className={css.card}>
      <h3>{L('安装其他包', 'Install another package')}</h3><div className={css.toolbar}><input aria-label={L('包名', 'Package name')} placeholder={L('例如 pandas', 'e.g. pandas')} value={spec} onChange={event => setSpec(event.target.value)} /><button disabled={!spec.trim() || working || restart} onClick={() => installPackage(spec.trim())}>{L('安装', 'Install')}</button></div>
      <details className={css.inventory}><summary>{L('查看已安装包', 'View installed packages')} ({info?.packageCount ?? '—'})</summary><input className={css.mirrorInput} aria-label={L('搜索已安装包', 'Search installed packages')} placeholder={L('搜索包名', 'Search by package name')} value={query} onChange={event => setQuery(event.target.value)} /><div className={css.list}>{installedRows.slice(0, 100).map(pkg => <div className={css.row} key={normalize(pkg.name)}><strong>{pkg.name}</strong><span>{pkg.version}</span></div>)}{installedRows.length > 100 && <p>{L('请搜索包名缩小列表', 'Search to narrow the list')}</p>}</div></details>
    </section>
    <details className={css.advanced}><summary>{L('高级设置', 'Advanced settings')}</summary><div className={css.advancedBody}>
      <div className={css.actions}><button disabled={working} onClick={changePath}>{L('更改 Python 路径', 'Change Python path')}</button><button disabled={working} onClick={() => saveMirror(DEFAULT_MIRROR)}>{L('恢复中科大镜像', 'Reset to USTC')}</button><button disabled={working} onClick={() => void perform(async () => { const value = await call?.({ action: 'diagnose', requestId: crypto.randomUUID() }); setDiagnostics(value?.diagnostics) })}>{L('运行诊断', 'Run diagnostics')}</button>{status?.rollbackAvailable && <button disabled={working} onClick={() => void perform(async () => { await api?.rollbackMcpEnvironment?.(); completedTask.current = undefined; await refresh() })}>{L('回滚上次环境更新', 'Roll back runtime update')}</button>}</div>
      {restart && <p>{L('新路径将在重启后使用。', 'Restart to use the new path.')} <button onClick={() => void api?.restart?.()}>{L('重启软件', 'Restart')}</button></p>}
      {diagnostics && <div className={css.healthList}>{(['python', 'pip', 'tls', 'mirror'] as const).map(key => <div key={key}><strong>{key === 'mirror' ? L('镜像连接', 'Mirror') : key === 'tls' ? L('安全连接', 'TLS') : key === 'python' ? 'Python' : 'pip'}</strong><span>{text(diagnostics[key].status)}</span>{diagnostics[key].message && <p>{text(diagnostics[key].message)}</p>}</div>)}</div>}
    </div></details>
  </section>
}
