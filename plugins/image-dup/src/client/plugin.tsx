import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { TabComponentProps, SessionScope } from 'dsh-better-sidebar/client/service'
import type { IWorkspaces } from '@deepseek-ai/dsh-client-runtime/client'
import type { DirectoryListing } from '@deepseek-ai/dsh-api-remotes/client'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import type { ImageDupJob, ImageDupOptions, PdfDupOptions, ReportArtifact } from '../shared/types.js'
import { CheckCircle2, Download, ExternalLink, FileImage, FolderOpen, RefreshCw, ScanLine, X } from 'lucide-react'
import styles from './workbench.module.css'

interface ImageDupRemote {
  listJobs(input: { sessionId: string }): Promise<RemoteResult<ImageDupJob[]>>
  getJob(input: { sessionId: string; jobId: string }): Promise<RemoteResult<ImageDupJob>>
  scanWorkspace(input: { sessionId: string; relativeDirectory?: string; directoryPath?: string; directoryGrant?: string; options?: ImageDupOptions }): Promise<RemoteResult<ImageDupJob>>
  grantDirectory(input: { sessionId: string; path: string }): Promise<RemoteResult<{ grant: string; path: string; expiresAt: string }>>
  scanAttachments(input: { sessionId: string; attachmentIds: string[]; options?: ImageDupOptions }): Promise<RemoteResult<ImageDupJob>>
  scanPdf(input: { sessionId: string; attachmentId: string; options?: PdfDupOptions }): Promise<RemoteResult<ImageDupJob>>
  cancel(input: { sessionId: string; jobId: string }): Promise<RemoteResult<void>>
  exportReport(input: { sessionId: string; jobId: string; format: 'html' | 'md' | 'json' }): Promise<RemoteResult<ReportArtifact>>
}

interface DesktopDirectoryBridge {
  chooseDirectory?: () => Promise<string | null>
}

declare global {
  interface Window { zerowallDesktop?: DesktopDirectoryBridge }
}
function unwrap<T>(result: RemoteResult<T>): T { if (result.ok) return result.value; throw new Error(result.error.message) }
function jobIdOf(value: unknown): string | undefined { return value && typeof value === 'object' && typeof (value as { jobId?: unknown }).jobId === 'string' ? (value as { jobId: string }).jobId : undefined }
function portableAbsolute(value: string): boolean { return /^(?:[A-Za-z]:[\\/]|\\\\|\/)/u.test(value) }
function pathKey(value: string): string { return value.replace(/\\/gu, '/').replace(/\/+/gu, '/').replace(/\/$/u, '').toLocaleLowerCase() }
function decodeFileUri(value: string): string | undefined { try { const parsed = new URL(value); if (parsed.protocol !== 'file:') return undefined; return decodeURIComponent(parsed.pathname).replace(/^\/([A-Za-z]:)/u, '$1') } catch { return undefined } }
function joinReportedPath(root: string, child: string): string { const base = root.replace(/[\\/]$/u, ''); const leaf = child.replace(/^[\\/]+/u, ''); return `${base}\\${leaf.replace(/\//gu, '\\')}` }

export interface ImageDupOpenDetail { sessionId: string; jobId?: string; projectId?: string; cwd?: string; title?: string }
export function openImageDupWorkbench(service: { openTab(seed: { type: string; id?: string; title?: string; meta?: unknown }, scope?: SessionScope): void }, detail: ImageDupOpenDetail): void {
  service.openTab({ type: 'zerowall:image-dup', id: detail.jobId ? `zerowall:image-dup:${detail.jobId}` : 'zerowall:image-dup', title: detail.title ?? '科研图片查重', meta: { ...(detail.jobId ? { jobId: detail.jobId } : {}), ...(detail.projectId ? { projectId: detail.projectId } : {}) } }, { sessionId: detail.sessionId, ...(detail.cwd ? { cwd: detail.cwd } : {}) })
}

function Workbench({ remote, workspaces, ...props }: TabComponentProps & { remote: ImageDupRemote; workspaces: IWorkspaces }) {
  const selectedJobId = jobIdOf(props.tab.meta)
  const [jobs, setJobs] = useState<ImageDupJob[]>([])
  const [job, setJob] = useState<ImageDupJob | undefined>()
  const [folder, setFolder] = useState('.')
  const [selectedDirectory, setSelectedDirectory] = useState('')
  const [directoryGrant, setDirectoryGrant] = useState<string>()
  const [attachmentIds, setAttachmentIds] = useState('')
  const [pdfAttachmentId, setPdfAttachmentId] = useState('')
  const [source, setSource] = useState<'workspace' | 'attachments' | 'pdf'>('workspace')
  const [threshold, setThreshold] = useState(8)
  const [options, setOptions] = useState({ recursive: true, copyMove: true, crossImage: true, crossPageOnly: false })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [reportArtifact, setReportArtifact] = useState<ReportArtifact>()
  const [reportPreview, setReportPreview] = useState<string>()
  const [browser, setBrowser] = useState<DirectoryListing>()
  const [browserError, setBrowserError] = useState<string>()
  const [selectedPair, setSelectedPair] = useState<number>(0)
  const refresh = useCallback(async () => {
    setError(undefined)
    try { const listed = unwrap(await remote.listJobs({ sessionId: props.scope.sessionId })); setJobs(listed); if (selectedJobId) setJob(unwrap(await remote.getJob({ sessionId: props.scope.sessionId, jobId: selectedJobId }))); else if (job?.jobId) setJob(unwrap(await remote.getJob({ sessionId: props.scope.sessionId, jobId: job.jobId }))) }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
  }, [job?.jobId, props.scope.sessionId, remote, selectedJobId])
  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    if (!job || !['queued', 'running'].includes(job.status)) return
    const timer = window.setInterval(() => void refresh(), 1500)
    return () => window.clearInterval(timer)
  }, [job, refresh])
  const chooseDirectory = async () => {
    try {
      // Desktop has a native Electron dialog that is independent of the DSH
      // directory-picker capability. Prefer it here so a failed host-side
      // COM worker cannot make the image workbench unusable. Browser/remote
      // clients continue to use the composed workspace picker.
      const desktopPick = typeof window === 'undefined' ? undefined : window.zerowallDesktop?.chooseDirectory
      const value = desktopPick === undefined ? await workspaces.pickDirectory() : await desktopPick()
      if (value) { setSelectedDirectory(value); const grant = unwrap(await remote.grantDirectory({ sessionId: props.scope.sessionId, path: value })); setDirectoryGrant(grant.grant) }
    } catch (cause) {
      setBrowserError(cause instanceof Error ? cause.message : String(cause))
      try { setBrowser(await workspaces.listDirectory()) } catch (browseCause) { setError(`${cause instanceof Error ? cause.message : String(cause)}；应用内目录浏览也不可用：${browseCause instanceof Error ? browseCause.message : String(browseCause)}`) }
    }
  }
  const openBrowser = async (path?: string) => { try { setBrowserError(undefined); setBrowser(await workspaces.listDirectory(path)) } catch (cause) { setBrowserError(cause instanceof Error ? cause.message : String(cause)) } }
  const scan = async () => {
    setBusy(true); setError(undefined)
    try {
      const common = { threshold, recursive: options.recursive, copyMove: options.copyMove, crossImage: options.crossImage }
      const result = source === 'workspace' ? await remote.scanWorkspace({ sessionId: props.scope.sessionId, ...(selectedDirectory ? { directoryPath: selectedDirectory, ...(directoryGrant ? { directoryGrant } : {}) } : { relativeDirectory: folder || '.' }), options: common }) : source === 'attachments' ? await remote.scanAttachments({ sessionId: props.scope.sessionId, attachmentIds: attachmentIds.split(/[\s,]+/u).filter(Boolean), options: common }) : await remote.scanPdf({ sessionId: props.scope.sessionId, attachmentId: pdfAttachmentId.trim(), options: { ...common, crossPageOnly: options.crossPageOnly } })
      setJob(unwrap(result)); await refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } finally { setBusy(false) }
  }
  const cancel = async () => { if (!job) return; setBusy(true); try { setJob(unwrap(await remote.cancel({ sessionId: props.scope.sessionId, jobId: job.jobId }))) } catch (cause) { setError(String(cause)) } finally { setBusy(false) } }
  const exportReport = async (format: 'html' | 'md' | 'json') => {
    if (!job) return
    try {
      const artifact = unwrap(await remote.exportReport({ sessionId: props.scope.sessionId, jobId: job.jobId, format }))
      setReportArtifact(artifact)
      setReportPreview(new TextDecoder().decode(Uint8Array.from(atob(artifact.data), char => char.charCodeAt(0))))
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
  }
  const downloadReport = () => {
    if (!reportArtifact) return
    const bytes = Uint8Array.from(atob(reportArtifact.data), char => char.charCodeAt(0))
    const url = URL.createObjectURL(new Blob([bytes], { type: reportArtifact.mediaType }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = reportArtifact.name; anchor.click(); URL.revokeObjectURL(url)
  }
  const openPairFile = (path: string) => {
    const map = job?.sourceFiles ?? {}
    const reported = job?.report?.files?.find(file => pathKey(file.name) === pathKey(path))
    const mapped = Object.entries(map).find(([key]) => pathKey(key) === pathKey(path))?.[1] ?? reported?.path
    const root = job?.sourcePath
    const candidate = mapped ?? (root && !portableAbsolute(path) ? joinReportedPath(root, path) : path)
    const fullPath = candidate ? (decodeFileUri(candidate) ?? candidate) : undefined
    if (!fullPath || !portableAbsolute(fullPath)) { setError(`无法定位图片“${path}”，请重新扫描以刷新文件映射。`); return }
    props.ctx.betterSidebar.openFile(props.scope, fullPath, fullPath.split(/[\\/]/u).pop() ?? '图片')
  }
  const pairs = useMemo(() => job?.report?.pairs ?? [], [job?.report?.pairs])
  return <section className={styles.root} aria-busy={busy}>
    {browser && <div className={styles.browserOverlay} role="dialog" aria-modal="true" aria-label="选择本机目录"><div className={styles.browser}><div className={styles.status}><div><h2>选择本机目录</h2><span className={styles.muted}>{browser.path}</span></div><button className={styles.button} type="button" onClick={() => setBrowser(undefined)}>取消</button></div>{browserError && <p className={styles.error}>{browserError}</p>}<div className={styles.browserCrumbs}>{browser.crumbs.map(crumb => <button className={styles.button} type="button" key={crumb.path} onClick={() => void openBrowser(crumb.path)}>{crumb.name}</button>)}</div><div className={styles.browserEntries}>{browser.entries.map(entry => <button className={styles.browserEntry} type="button" key={entry.path} onClick={() => void openBrowser(entry.path)}><FolderOpen size={16} />{entry.name}</button>)}</div><div className={styles.browserFooter}><span className={styles.muted}>选择当前目录：{browser.path}</span><button className={styles.buttonPrimary} type="button" onClick={() => void (async () => { const grant = unwrap(await remote.grantDirectory({ sessionId: props.scope.sessionId, path: browser.path })); setSelectedDirectory(browser.path); setDirectoryGrant(grant.grant); setFolder(''); setBrowser(undefined) })()}>使用此目录</button></div></div></div>}
    <header className={styles.header}><div><div className={styles.eyebrow}>本地运行 · 不上传原始图片</div><h1 className={styles.title}><FileImage size={22} />科研图片查重</h1><p className={styles.muted}>检查图片翻转、缩放、旋转、局部复制和跨图复用。选择来源后开始扫描。</p></div><button className={styles.button} type="button" title="刷新任务" onClick={() => void refresh()}><RefreshCw size={16} />刷新</button></header>
    <div className={styles.layout}><aside className={styles.panel}><h2>开始一次检查</h2><ol className={styles.steps}><li className={styles.step}><span className={styles.number}>1</span><div><strong>选择来源</strong>目录、会话附件或 PDF</div></li><li className={styles.step}><span className={styles.number}>2</span><div><strong>调整规则</strong>默认设置适合大多数科研图片</div></li><li className={styles.step}><span className={styles.number}>3</span><div><strong>查看结果</strong>选择一对图片并打开原文件</div></li></ol><form className={styles.form} onSubmit={event => { event.preventDefault(); void scan() }}><label className={styles.field}>检查来源<select value={source} onChange={event => setSource(event.target.value as typeof source)}><option value="workspace">本机目录</option><option value="attachments">会话附件</option><option value="pdf">PDF 附件</option></select></label>{source === 'workspace' && <><div className={styles.row}><button className={styles.button} type="button" onClick={() => void chooseDirectory()}><FolderOpen size={15} />选择本机目录</button><span className={styles.muted}>或使用工作区相对目录</span></div>{selectedDirectory ? <div className={styles.path}><CheckCircle2 size={14} />{selectedDirectory}</div> : <label className={styles.field}>工作区相对目录<input value={folder} onChange={event => { setFolder(event.target.value); setSelectedDirectory('') }} placeholder="例如 data/images" /></label>}</>}{source === 'attachments' && <label className={styles.field}>附件 ID（逗号或空格分隔）<input value={attachmentIds} onChange={event => setAttachmentIds(event.target.value)} placeholder="从会话附件复制 ID" required /></label>}{source === 'pdf' && <label className={styles.field}>PDF 附件 ID<input value={pdfAttachmentId} onChange={event => setPdfAttachmentId(event.target.value)} placeholder="从会话附件复制 ID" required /></label>}<label className={styles.field}>相似度阈值（0–64）<input type="number" min={0} max={64} value={threshold} onChange={event => setThreshold(Number(event.target.value))} /></label><div className={styles.checks}><label className={styles.check}><input type="checkbox" checked={options.recursive} onChange={event => setOptions(value => ({ ...value, recursive: event.target.checked }))} />递归扫描子目录</label><label className={styles.check}><input type="checkbox" checked={options.copyMove} onChange={event => setOptions(value => ({ ...value, copyMove: event.target.checked }))} />检测局部复制区域</label><label className={styles.check}><input type="checkbox" checked={options.crossImage} onChange={event => setOptions(value => ({ ...value, crossImage: event.target.checked }))} />检测跨图片复用</label>{source === 'pdf' && <label className={styles.check}><input type="checkbox" checked={options.crossPageOnly} onChange={event => setOptions(value => ({ ...value, crossPageOnly: event.target.checked }))} />仅比较不同页</label>}</div><button className={styles.buttonPrimary} type="submit" disabled={busy}><ScanLine size={16} />{busy ? '正在扫描…' : '开始扫描'}</button></form></aside><main className={styles.panel}><div className={styles.status}><div><h2>扫描结果</h2><span className={styles.muted}>{job ? `任务 ${job.jobId}` : '完成扫描后将在这里显示重复项'}</span></div>{job && <div className={job.status === 'ready' ? styles.badgeReady : job.status === 'failed' ? styles.badgeFailed : styles.badge}>{job.status === 'ready' ? '已完成' : job.status === 'failed' ? '失败' : job.status === 'running' ? '扫描中' : job.status}</div>}{job && ['queued', 'running'].includes(job.status) && <button className={styles.button} type="button" title="取消扫描" onClick={() => void cancel()}><X size={15} />取消</button>}</div>{error && <p className={styles.error} role="alert">{error}</p>}{job?.report ? <><div className={styles.stats}><div className={styles.stat}><strong>{job.report.total}</strong><span>图片总数</span></div><div className={styles.stat}><strong>{pairs.length}</strong><span>疑似重复对</span></div><div className={styles.stat}><strong>{job.report.skipped.length}</strong><span>跳过文件</span></div></div><h2>需要人工复核</h2><div className={styles.pairs}>{pairs.length === 0 ? <p className={styles.muted}>未发现超过阈值的重复图片。</p> : pairs.slice(0, 100).map((pair, index) => <button className={`${styles.pair} ${selectedPair === index ? styles.pairSelected : ''}`} type="button" key={`${pair.a}:${pair.b}`} onClick={() => setSelectedPair(index)}><span className={styles.pairPath}><strong>{pair.a}</strong><br /><strong>{pair.b}</strong><br /><span className={styles.muted}>{pair.transform}</span></span><span className={styles.similarity}>{Math.round(pair.similarity * 100)}%</span></button>)}</div>{pairs[selectedPair] && <div className={styles.compare}><div><h3>当前复核对</h3><p className={styles.muted}>相似度 {Math.round(pairs[selectedPair]!.similarity * 100)}% · {pairs[selectedPair]!.transform}</p><div className={styles.row}><button className={styles.button} type="button" onClick={() => openPairFile(pairs[selectedPair]!.a)}><ExternalLink size={14} />打开图片 A</button><button className={styles.button} type="button" onClick={() => openPairFile(pairs[selectedPair]!.b)}><ExternalLink size={14} />打开图片 B</button></div></div></div>}<div className={styles.reportActions}><span className={styles.muted}>报告</span><button className={styles.button} type="button" onClick={() => void exportReport('html')}>查看 HTML</button><button className={styles.button} type="button" onClick={() => void exportReport('md')}>查看 Markdown</button><button className={styles.button} type="button" onClick={() => void exportReport('json')}>查看 JSON</button>{reportArtifact && <><button className={styles.button} type="button" onClick={downloadReport}><Download size={14} />下载 {reportArtifact.name}</button><button className={styles.button} type="button" onClick={() => { const path = decodeFileUri(reportArtifact.uri); if (path) props.ctx.betterSidebar.openFile(props.scope, path, reportArtifact.name) }}><ExternalLink size={14} />打开文件</button></>}</div>{reportPreview && <details className={styles.reportPreview} open><summary>报告内容预览</summary><pre>{reportPreview}</pre></details>}</> : <p className={styles.muted}>{job?.error ?? '还没有结果。先在左侧选择来源并开始扫描。'}</p>}{!job && jobs.length > 0 && <div className={styles.history}><h2>最近任务</h2>{jobs.slice(0, 10).map(item => <button key={item.jobId} type="button" onClick={() => openImageDupWorkbench(props.ctx.betterSidebar, { sessionId: props.scope.sessionId, jobId: item.jobId, title: '科研图片查重' })}>{item.status} · {item.jobId}</button>)}</div>}</main></div>
  </section>
}

export const inject = ['betterSidebar', 'slots', 'workspaces', 'remote', 'remote.zerowallImageDup']
export function apply(ctx: ClientContext): void {
  const remote = (ctx.remote as { zerowallImageDup: ImageDupRemote }).zerowallImageDup
  ctx.effect(() => ctx.betterSidebar.registerTab({ id: 'zerowall:image-dup', title: '科研图片查重', order: 40, icon: size => <FileImage size={size} />, dedupeKey: tab => jobIdOf(tab.meta), component: props => <Workbench {...props} remote={remote} workspaces={ctx.workspaces} /> }), 'zerowall: image duplicate workbench')
  ctx.effect(() => { const open = (event: Event) => { const detail = (event as CustomEvent<ImageDupOpenDetail>).detail; if (detail?.sessionId) openImageDupWorkbench(ctx.betterSidebar, detail) }; window.addEventListener('zerowall:image-dup-open', open); return () => window.removeEventListener('zerowall:image-dup-open', open) }, 'zerowall: image duplicate open event')
  ctx.slots.inject('tool.call.toolview', function* () {
    yield ctx.slots.register({ name: 'tool.call.toolview', key: 'check_image_duplicates' }, (props: ToolCallViewProps) => {
      const settled = 'kind' in props.block
      const meta = settled && props.block.meta && typeof props.block.meta === 'object' ? props.block.meta as Record<string, unknown> : undefined
      const id = typeof meta?.jobId === 'string' ? meta.jobId : undefined
      return <section style={{ display: 'grid', gap: 6, padding: 8 }}><strong>科研图片查重</strong><span>{settled ? (id ? `任务 ${id}` : '扫描完成') : '扫描中…'}</span>{settled && id && <button type="button" onClick={() => openImageDupWorkbench(ctx.betterSidebar, { sessionId: props.sessionId, jobId: id })}>打开查重工作台</button>}</section>
    })
  })
}
