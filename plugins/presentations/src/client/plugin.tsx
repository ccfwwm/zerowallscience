import { useCallback, useEffect, useRef, useState } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { TabComponentProps, SessionScope } from 'dsh-better-sidebar/client/service'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import { Ban, Copy, ExternalLink, FolderOpen, ImagePlus, LoaderCircle, MoreHorizontal, Pause, Play, Plus, Presentation, RefreshCw, RotateCw, Trash2 } from 'lucide-react'
import type { CreatePresentationInput, PresentationRecord, UpdatePresentationChanges } from '@zerowallscience/research-store/types'
import type { PresentationSlidePreview } from '@zerowallscience/plugin-presentations/types'
import styles from './workbench.module.css'

interface PresentationRemote {
  list(projectId: string): Promise<RemoteResult<PresentationRecord[]>>
  get(id: string): Promise<RemoteResult<PresentationRecord>>
  create(input: CreatePresentationInput): Promise<RemoteResult<PresentationRecord>>
  ensureProjectForSession(sessionId: string): Promise<RemoteResult<ProjectView>>
  update(input: { id: string; changes: UpdatePresentationChanges }): Promise<RemoteResult<PresentationRecord>>
  generate(id: string): Promise<RemoteResult<PresentationRecord>>
  pause(id: string): Promise<RemoteResult<PresentationRecord>>
  resume(id: string): Promise<RemoteResult<PresentationRecord>>
  cancel(id: string): Promise<RemoteResult<PresentationRecord>>
  previewSlide(input: { presentationId: string; slideId: string }): Promise<RemoteResult<PresentationSlidePreview>>
  retrySlide(input: { presentationId: string; slideId: string }): Promise<RemoteResult<PresentationRecord>>
  delete(id: string): Promise<RemoteResult<void>>
  rebuildEditable(input: { presentationId?: string; sourcePresentationId?: string; sourceSlideIds?: string[]; instruction?: string; concurrency?: number }): Promise<RemoteResult<PresentationRecord>>
}
interface ProjectView { id: string; name: string; rootPath: string }
interface ProjectRemote { list(): Promise<RemoteResult<ProjectView[]>> }
interface OpenDetail { presentationId: string; sessionId: string; projectId?: string; cwd?: string; title?: string }
interface PresentationProgressDetail {
  presentationId: string
  generationId: string
  slideId?: string
  slideIndex?: number
  status: 'generating' | 'ready' | 'failed' | 'assembling' | 'complete'
  visualAttempt?: number
  visualError?: string
  visualUri?: string
  attachment?: NonNullable<PresentationRecord['slides'][number]['visual']>['attachment']
  quality?: 'auto' | 'low' | 'medium' | 'high'
  updatedAt: string
}
function unwrap<T>(result: RemoteResult<T>): T { if (result.ok) return result.value; throw new Error(result.error.message) }
function presentationIdOf(value: unknown): string | undefined { return value && typeof value === 'object' && typeof (value as { presentationId?: unknown }).presentationId === 'string' ? (value as { presentationId: string }).presentationId : undefined }
function normalizedPath(value: string): string { return value.replace(/\\/gu, '/').replace(/\/+$/gu, '').toLocaleLowerCase() }
function statusLabel(value: string): string {
  return ({ draft: '草稿', outlining: '整理大纲', designing: '设计页面', generating: '生成内容', ready: '已完成', failed: '生成失败', paused: '已暂停', cancelled: '已取消' } as Record<string, string>)[value] ?? value
}
function stageLabel(value: string): string {
  return ({ outlining: '整理大纲', designing: '规划视觉', visual: '逐页生成视觉', html: '生成 HTML', pptx: '组装 PPTX', rendering: '组装 PPTX', quality: '完成生成', ready: '已完成', failed: '失败', paused: '已暂停', cancelled: '已取消' } as Record<string, string>)[value] ?? value
}
function localArtifactPath(uri: string): string | undefined {
  try {
    const parsed = new URL(uri)
    if (parsed.protocol === 'file:') return decodeURIComponent(parsed.pathname).replace(/^\/([A-Za-z]:)/u, '$1').replace(/\//gu, '\\')
  } catch {
    // Older records stored a native path instead of a file URI.
  }
  if (/^(?:[A-Za-z]:[\\/]|\\\\|\/)/u.test(uri)) return uri.replace(/\//gu, '\\')
  return undefined
}
function artifactName(uri: string): string {
  const path = localArtifactPath(uri) ?? uri
  return path.split(/[\\/]/u).filter(Boolean).pop() ?? uri
}
function currentArtifact(presentation: PresentationRecord, kind: PresentationRecord['artifacts'][number]['kind']): PresentationRecord['artifacts'][number] | undefined {
  const artifact = presentation.artifacts.find(item => item.kind === kind)
  if (artifact) return artifact
  const uri = presentation.exportUris[kind]
  return uri ? { kind, uri, mediaType: kind === 'pptx' ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation' : 'application/pdf' } : undefined
}
function uniquePresentations(values: PresentationRecord[]): PresentationRecord[] { return values }

export async function ensurePresentationProject(remote: Pick<PresentationRemote, 'ensureProjectForSession'>, projects: ProjectView[], projectId: string | undefined, sessionId: string): Promise<ProjectView> {
  if (projectId) {
    const selected = projects.find(project => project.id === projectId)
    if (selected) return selected
  }
  return unwrap(await remote.ensureProjectForSession(sessionId))
}

export function openPresentationWorkbench(service: { openTab(seed: { type: string; id?: string; title?: string; meta?: unknown }, scope?: SessionScope): void }, detail: OpenDetail): void {
  service.openTab({ type: 'zerowall:presentation-workbench', id: `zerowall:presentation:${detail.presentationId}`, title: detail.title ?? '演示文稿', meta: { presentationId: detail.presentationId, ...(detail.projectId ? { projectId: detail.projectId } : {}) } }, { sessionId: detail.sessionId, ...(detail.cwd ? { cwd: detail.cwd } : {}) })
}

async function openLinkedConversation(ctx: ClientContext, scope: SessionScope, title: string, presentationId: string): Promise<string | undefined> {
  if (!scope.cwd) return undefined
  const sessions = ctx.sessions as unknown as { create(input: { cwd: string }): Promise<string> }
  const sessionId = await sessions.create({ cwd: scope.cwd })
  ctx.sessions.open(sessionId)
  const face = ctx.sessions.binding(sessionId)?.session
  if (face) {
    await face.rename(title)
    await face.prompt([{ type: 'text', text: `已打开同一份 ZeroWall 演示文稿“${title}”（presentationId: ${presentationId}）。后续修改请使用 update_presentation 原地更新，不要创建新的同名文件。` }], 'queue').catch(() => undefined)
  }
  return String(sessionId)
}

export async function resolvePresentationSlideImage(_ctx: ClientContext, remote: Pick<PresentationRemote, 'previewSlide'>, presentationId: string, _sessionId: string, slide: PresentationRecord['slides'][number]): Promise<string> {
  const preview = unwrap(await remote.previewSlide({ presentationId, slideId: slide.id }))
  return `data:${preview.mediaType};base64,${preview.base64}`
}

function base64Bytes(value: string): Uint8Array {
  const decoded = atob(value)
  const bytes = new Uint8Array(decoded.length)
  for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index)
  return bytes
}

export async function addPresentationSlideToDraft(ctx: ClientContext, remote: Pick<PresentationRemote, 'previewSlide'>, sessionId: string, presentationId: string, slide: PresentationRecord['slides'][number], slideIndex: number): Promise<void> {
  const preview = unwrap(await remote.previewSlide({ presentationId, slideId: slide.id }))
  await ctx.conversation.addImageBytesToDraft(sessionId as never, {
    data: base64Bytes(preview.base64),
    mediaType: preview.mediaType,
    name: preview.name,
    contextText: `PPT 页面引用：presentationId=${presentationId}, slideId=${slide.id}, page=${slideIndex + 1}`,
  })
}

function useSlideImage(ctx: ClientContext, remote: Pick<PresentationRemote, 'previewSlide'>, presentationId: string, sessionId: string, slide: PresentationRecord['slides'][number] | undefined, reload: number): { url?: string; failed: boolean; markFailed(): void } {
  const [url, setUrl] = useState<string>()
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let active = true
    setUrl(undefined)
    setFailed(false)
    if (slide) void resolvePresentationSlideImage(ctx, remote, presentationId, sessionId, slide)
      .then(value => { if (active) setUrl(value) })
      .catch(() => { if (active) setFailed(true) })
    return () => { active = false }
  }, [ctx, presentationId, reload, remote, sessionId, slide?.id, slide?.visual?.attachment?.attachmentId, slide?.visualUpdatedAt, slide?.visualUri])
  return { url, failed, markFailed: () => setFailed(true) }
}

function SlideThumbnail({ ctx, remote, presentationId, sessionId, slide, index, selected, reload, onSelect, onRetry }: { ctx: ClientContext; remote: Pick<PresentationRemote, 'previewSlide'>; presentationId: string; sessionId: string; slide: PresentationRecord['slides'][number]; index: number; selected: boolean; reload: number; onSelect(): void; onRetry(): void }) {
  const image = useSlideImage(ctx, remote, presentationId, sessionId, slide, reload)
  return <div className={`${styles.slideItem} ${selected ? styles.selected : ''}`}>
    <button type="button" className={styles.slideSelect} onClick={onSelect} aria-label={`选择第 ${index + 1} 页`}>
      <span>{index + 1}</span>
      {image.url && !image.failed ? <img alt={`第 ${index + 1} 页缩略图`} src={image.url} onError={image.markFailed} /> : <span className={styles.slideState}>{slide.visualStatus === 'generating' ? '生成中' : slide.visualStatus === 'failed' ? '生成失败' : image.failed ? '图片加载失败' : '等待图片'}</span>}
    </button>
    {slide.visualStatus === 'failed' && <button type="button" className={styles.slideRetry} onClick={onRetry}>重试此页</button>}
  </div>
}

function PresentationWorkbench({ ctx, remote, scope, tab }: TabComponentProps & { ctx: ClientContext; remote: PresentationRemote }) {
  const selectedId = presentationIdOf(tab.meta)
  const [projects, setProjects] = useState<ProjectView[]>([])
  const [projectId, setProjectId] = useState<string | undefined>(typeof tab.meta === 'object' && tab.meta !== null && typeof (tab.meta as { projectId?: unknown }).projectId === 'string' ? (tab.meta as { projectId: string }).projectId : undefined)
  const [items, setItems] = useState<PresentationRecord[]>([])
  const [presentation, setPresentation] = useState<PresentationRecord>()
  const [selectedSlide, setSelectedSlide] = useState(0)
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [reloadImages, setReloadImages] = useState<Record<string, number>>({})
  const refresh = useCallback(async () => {
    setError(undefined)
    try {
      if (!projectId) return
      const listed = unwrap(await remote.list(projectId)); setItems(uniquePresentations(listed))
      if (selectedId) setPresentation(unwrap(await remote.get(selectedId)))
      else if (presentation?.id) setPresentation(unwrap(await remote.get(presentation.id)))
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
  }, [presentation?.id, projectId, remote, selectedId])
  useEffect(() => { void (async () => { try { const values = unwrap(await (ctx.remote as { zerowallProjects: ProjectRemote }).zerowallProjects.list()); setProjects(values); if (!projectId) { const matching = scope.cwd ? values.find(project => normalizedPath(project.rootPath) === normalizedPath(scope.cwd ?? '')) : undefined; if (matching) setProjectId(matching.id) } } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } })() }, [ctx.remote, projectId, scope.cwd])
  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    if (!presentation || !['outlining', 'designing', 'generating'].includes(presentation.status)) return
    const timer = window.setInterval(() => { void refresh() }, 1000)
    return () => window.clearInterval(timer)
  }, [presentation?.status, refresh])
  useEffect(() => {
    const onProgress = (event: Event) => {
      const detail = (event as CustomEvent<PresentationProgressDetail>).detail
      if (!detail || detail.presentationId !== presentation?.id) return
      if (detail.slideId) {
        setPresentation(current => current ? { ...current, slides: current.slides.map(slide => slide.id !== detail.slideId ? slide : {
          ...slide,
          visualStatus: detail.status === 'generating' ? 'generating' : detail.status === 'failed' ? 'failed' : detail.status === 'ready' ? 'ready' : slide.visualStatus,
          ...(detail.visualAttempt === undefined ? {} : { visualAttempt: detail.visualAttempt }),
          ...(detail.visualError === undefined ? {} : { visualError: detail.visualError }),
          ...(detail.visualUri === undefined ? {} : { visualUri: detail.visualUri }),
          visualUpdatedAt: detail.updatedAt,
          ...(detail.attachment === undefined || slide.visual === undefined ? {} : { visual: { ...slide.visual, attachment: detail.attachment, ...(detail.quality === undefined ? {} : { requestedQuality: detail.quality }) } }),
        }) } : current)
      }
      if (detail.status === 'complete' || detail.status === 'assembling') void refresh()
    }
    window.addEventListener('zerowall:presentation-progress', onProgress)
    return () => window.removeEventListener('zerowall:presentation-progress', onProgress)
  }, [presentation?.id, refresh])
  const create = async () => {
    if (!title.trim()) return
    setBusy(true); setError(undefined)
    try {
      const project = await ensurePresentationProject(remote, projects, projectId, scope.sessionId)
      if (!projects.some(item => item.id === project.id)) setProjects(items => [...items, project])
      setProjectId(project.id)
      const created = unwrap(await remote.create({ projectId: project.id, title: title.trim() }))
      const started = unwrap(await remote.generate(created.id))
      setPresentation(started); setTitle('')
      const linkedScope = { ...scope, cwd: project.rootPath }
      const linkedSessionId = await openLinkedConversation(ctx, linkedScope, started.title, started.id)
      openPresentationWorkbench(ctx.betterSidebar, { presentationId: started.id, sessionId: linkedSessionId ?? scope.sessionId, projectId: project.id, cwd: project.rootPath, title: started.title })
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } finally { setBusy(false) }
  }
  const act = async (operation: (id: string) => Promise<RemoteResult<PresentationRecord>>) => { if (!presentation) return; setBusy(true); try { setPresentation(unwrap(await operation(presentation.id))); await refresh() } catch (cause) { setError(String(cause)) } finally { setBusy(false) } }
  const retrySlide = async (slideId: string) => { if (!presentation) return; setBusy(true); try { setPresentation(unwrap(await remote.retrySlide({ presentationId: presentation.id, slideId }))); await refresh() } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } finally { setBusy(false) } }
  const remove = async (item: PresentationRecord) => {
    if (!window.confirm(`删除历史演示文稿“${item.title}”？此操作不会删除已导出的文件。`)) return
    setBusy(true); setError(undefined)
    try {
      unwrap(await remote.delete(item.id))
      if (presentation?.id === item.id) setPresentation(undefined)
      await refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } finally { setBusy(false) }
  }
  const slide = presentation?.slides[selectedSlide]
  const visual = useSlideImage(ctx, remote, presentation?.id ?? '', scope.sessionId, slide, slide ? reloadImages[slide.id] ?? 0 : 0)
  const addToConversation = async () => {
    if (!presentation || !slide) throw new Error('当前页面没有可加入对话的图片。')
    await addPresentationSlideToDraft(ctx, remote, scope.sessionId, presentation.id, slide, selectedSlide)
  }
  const regenerateAll = async () => {
    if (!presentation || !window.confirm('确定重新生成整套演示文稿吗？这会重新生成所有页面的内容和图片。')) return
    await act(id => remote.generate(id))
  }
  const revealPptx = async (path: string) => {
    const revealPath = window.zerowallDesktop?.revealPath
    if (!revealPath) throw new Error('当前桌面运行时不支持打开系统文件资源管理器。')
    await revealPath(path)
  }
  const rebuildEditable = async (slideOnly = false) => {
    if (!presentation) return
    setBusy(true); setError(undefined)
    try {
      const next = unwrap(await remote.rebuildEditable({ presentationId: presentation.id, ...(slideOnly && slide ? { sourceSlideIds: [slide.id] } : {}), concurrency: 4 }))
      setPresentation(next)
      await refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } finally { setBusy(false) }
  }
  const openPptx = async (path: string) => {
    const opener = window.zerowallDesktop?.openPptx
    if (!opener) { await revealPptx(path); return }
    if (!await opener(path)) throw new Error('无法打开 PPTX 文件。')
  }
  const copySlideReference = async () => {
    if (!presentation || !slide) return
    await navigator.clipboard.writeText(JSON.stringify({ presentationId: presentation.id, slideId: slide.id, page: selectedSlide + 1, image: slide.visualUri ?? slide.visual?.attachment?.attachmentId }, null, 2))
  }
  const pptxArtifact = presentation ? currentArtifact(presentation, 'editable-pptx') ?? currentArtifact(presentation, 'pptx') : undefined
  const pptxPath = pptxArtifact ? localArtifactPath(pptxArtifact.uri) ?? pptxArtifact.uri : undefined
  return <section className={styles.workbench} aria-busy={busy}>
    <header className={styles.header}>
      <div><span>演示文稿工作台</span><strong>{presentation?.title ?? '当前项目演示文稿'}</strong></div>
      <div className={styles.toolbar}><button type="button" title="刷新" aria-label="刷新演示文稿" onClick={() => void refresh()} disabled={busy}><RefreshCw size={18} /></button></div>
    </header>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {!presentation && <div className={styles.state}><div className={styles.intro}><h2>从研究材料生成可编辑演示文稿</h2><p>手工选择研究项目并填写标题，或使用当前工作区自动关联。点击后立即进入 ZeroWall PPT 生成流程。</p></div><div className={styles.introGrid}><div className={styles.introCard}><strong>1 · 选择项目</strong><span>选择已有研究项目，或自动关联当前工作区。</span></div><div className={styles.introCard}><strong>2 · 填写标题并生成</strong><span>输入标题后点击“创建并开始”。</span></div><div className={styles.introCard}><strong>3 · 审阅导出</strong><span>检查逐页缩略图，再打开或导出 PPTX。</span></div></div><div className={styles.newForm}><label className={styles.formField}><span>研究项目</span><select aria-label="研究项目" value={projectId ?? ''} onChange={event => { setProjectId(event.target.value || undefined); setPresentation(undefined); setItems([]) }}><option value="">当前工作区（自动关联）</option>{projects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className={styles.formField}><span>演示文稿标题</span><input aria-label="演示文稿标题" value={title} onChange={event => setTitle(event.target.value)} placeholder="例如：2026 年度研究进展汇报" /></label><button type="button" disabled={!title.trim() || busy} onClick={() => void create()}><Plus size={15} />{busy ? '正在创建…' : '创建并开始'}</button></div>{!projectId && <div className={styles.hint}>当前选择“自动关联”：创建时会复用当前工作区对应的研究项目；若不存在，则自动建立项目。</div>}<h3>历史演示文稿</h3>{items.length === 0 ? <p>{projectId ? '当前项目暂无演示文稿。创建后可在此继续生成、暂停或导出。' : '选择已有项目可查看历史演示文稿；选择当前工作区后可直接创建。'}</p> : <ul>{items.map(item => <li key={item.id}><div className={styles.historyRow}><button type="button" className={styles.historyOpen} onClick={() => openPresentationWorkbench(ctx.betterSidebar, { presentationId: item.id, sessionId: scope.sessionId, projectId: item.projectId, cwd: scope.cwd, title: item.title })}><strong>{item.title}</strong><span>{statusLabel(item.status)} · {new Date(item.updatedAt).toLocaleString()}</span><small>{item.id}</small></button><button type="button" className={styles.historyDelete} title="删除历史演示文稿" aria-label={`删除${item.title}`} onClick={() => void remove(item)} disabled={busy}><Trash2 size={14} /></button></div></li>)}</ul>}</div>}
    {presentation && <>
      <div className={styles.header}>
        <div className={styles.stage}>
          <div className={styles.statusRow}>
            <span className={styles.status}>{statusLabel(presentation.status)}</span>
          </div>
          {presentation.generation && <><small>{stageLabel(presentation.generation.stage)} · 第 {presentation.generation.revision} 次生成 · 最后更新 {new Date(presentation.generation.updatedAt).toLocaleTimeString()}</small><div className={styles.progressTrack} aria-label="生成进度"><span style={{ width: `${Math.round(presentation.generation.progress * 100)}%` }} /></div></>}
          {presentation.rebuildJob && <><small>可编辑转换：{presentation.rebuildJob.stage} · {Math.round(presentation.rebuildJob.progress * 100)}% · 并发 {presentation.rebuildJob.concurrency}</small><div className={styles.progressTrack} aria-label="可编辑转换进度"><span style={{ width: `${Math.round(presentation.rebuildJob.progress * 100)}%`, background: '#0f766e' }} /></div></>}
        </div>
        <div className={styles.toolbar}>
          <button type="button" title="刷新状态" onClick={() => void refresh()} disabled={busy}><RefreshCw size={18} /><span>刷新</span></button>
          {presentation.status === 'draft' && <button type="button" className={styles.primaryCommand} title="开始生成" onClick={() => void act(id => remote.generate(id))} disabled={busy}><Play size={18} /><span>开始生成</span></button>}
          {['ready', 'failed'].includes(presentation.status) && slide && <button type="button" className={styles.regenerateCommand} title="只重新生成当前页" onClick={() => void retrySlide(slide.id)} disabled={busy}>{busy ? <LoaderCircle className={styles.spin} size={18} /> : <RotateCw size={18} />}<span>重新生成当前页</span></button>}
          <button type="button" className={styles.editableCommand} title="将整套演示文稿转换为可编辑 PPTX（全部页面）" aria-label="将整套演示文稿转换为可编辑 PPTX（全部页面）" onClick={() => void rebuildEditable(false)} disabled={busy || presentation.slides.length === 0 || ['outlining', 'designing', 'generating'].includes(presentation.status)}><Presentation size={18} /><span>全部转换为可编辑 PPTX</span></button>
          {['outlining', 'designing', 'generating'].includes(presentation.status) && <button type="button" title="暂停生成" onClick={() => void act(id => remote.pause(id))} disabled={busy}><Pause size={18} /><span>暂停</span></button>}
          {presentation.status === 'paused' && <button type="button" title="继续生成" onClick={() => void act(id => remote.resume(id))} disabled={busy}><RotateCw size={18} /><span>继续</span></button>}
          {!['ready', 'cancelled'].includes(presentation.status) && <button type="button" title="取消生成" onClick={() => void act(id => remote.cancel(id))} disabled={busy}><Ban size={18} /><span>取消</span></button>}
          {presentation.slides.length > 0 && !['outlining', 'designing', 'generating'].includes(presentation.status) && <details className={styles.moreMenu}><summary title="更多生成操作" aria-label="更多生成操作"><MoreHorizontal size={18} /></summary><div><button type="button" onClick={() => void regenerateAll()} disabled={busy}>重新生成整套</button></div></details>}
        </div>
      </div>
      <div className={styles.columns}>
        <nav className={styles.slides} aria-label="页面缩略图"><h3>页面 ({presentation.slides.length})</h3>{presentation.slides.map((item, index) => <SlideThumbnail ctx={ctx} remote={remote} presentationId={presentation.id} sessionId={scope.sessionId} slide={item} index={index} selected={selectedSlide === index} reload={reloadImages[item.id] ?? 0} key={item.id} onSelect={() => setSelectedSlide(index)} onRetry={() => void retrySlide(item.id)} />)}{presentation.slides.length === 0 && <p>生成完成后将在这里显示页面。</p>}</nav>
        <main className={styles.preview}>
          {slide ? <article className={styles.slidePreview}>
            {visual.url && !visual.failed ? <img src={visual.url} alt={slide.title} onError={visual.markFailed} /> : <div className={styles.visualState}>{slide.visualStatus === 'generating' ? '正在生成此页图片…' : slide.visualStatus === 'failed' ? <><strong>此页图片生成失败</strong><span>{slide.visualError}</span><button type="button" onClick={() => void retrySlide(slide.id)}>重试此页</button></> : visual.failed ? '图片加载失败，请重新加载。' : '此页尚无图片'}</div>}
            <footer><span>第 {selectedSlide + 1} 页，共 {presentation.slides.length} 页</span><code>{slide.id}</code><div className={styles.slideActions}>
              <button type="button" className={styles.actionPrimary} title="加入当前对话输入框" aria-label="加入当前对话输入框" onClick={() => void addToConversation().catch(cause => setError(cause instanceof Error ? cause.message : String(cause)))} disabled={busy || (!slide.visualUri && slide.visualStatus !== 'ready')}><ImagePlus size={18} /></button>
              <button type="button" className={styles.actionRegenerate} title="只重新生成当前页视觉内容" aria-label="重新生成当前页视觉内容" onClick={() => void retrySlide(slide.id)} disabled={busy}><span>{busy ? <LoaderCircle className={styles.spin} size={17} /> : <RotateCw size={17} />}</span><span>重新生成当前页</span></button>
              <button type="button" className={styles.actionEditable} title={`只将第 ${selectedSlide + 1} 页重新转换为可编辑 PPTX`} aria-label={`只将第 ${selectedSlide + 1} 页重新转换为可编辑 PPTX`} onClick={() => void rebuildEditable(true)} disabled={busy || ['outlining', 'designing', 'generating'].includes(presentation.status)}><Presentation size={17} /><span>仅转换第 {selectedSlide + 1} 页</span></button>
              <button type="button" title="复制图片路径" aria-label="复制图片路径" onClick={() => void navigator.clipboard.writeText(localArtifactPath(slide.visualUri ?? '') ?? slide.visualUri ?? '')} disabled={!slide.visualUri}><Copy size={18} /></button>
              <button type="button" title="复制页面引用" aria-label="复制页面引用" onClick={() => void copySlideReference()}><Copy size={18} /></button>
              <button type="button" title="重新加载图片" aria-label="重新加载图片" onClick={() => setReloadImages(value => ({ ...value, [slide.id]: (value[slide.id] ?? 0) + 1 }))}><RefreshCw size={18} /></button>
            </div></footer>
            <div className={styles.editableMeta} aria-live="polite">
              <span>可编辑状态：{slide.editableStatus === 'ready' ? '已转换' : slide.editableStatus === 'processing' ? '转换中' : slide.editableStatus === 'failed' ? '失败' : '未转换'}</span>
              {slide.nativeObjectCount !== undefined && <span>原生对象 {slide.nativeObjectCount}</span>}
              {slide.rasterizedObjectCount !== undefined && <span>图片对象 {slide.rasterizedObjectCount}</span>}
              {slide.rebuildError && <span role="alert">{slide.rebuildError}</span>}
            </div>
          </article> : <div className={styles.empty}>{presentation.status === 'ready' ? '没有可预览的页面' : '正在生成页面预览…'}</div>}
        </main>
        <aside className={styles.details}>
          <h3>当前 PPTX 文件</h3>
          {pptxArtifact && pptxPath ? <div className={styles.currentArtifact}>
            <strong>{artifactName(pptxArtifact.uri)}</strong>
            <code>{pptxPath}</code>
            <div className={styles.fileActions}>
              <button type="button" title="在 PowerPoint 中打开 PPTX" onClick={() => void openPptx(pptxPath).catch(cause => setError(cause instanceof Error ? cause.message : String(cause)))}><ExternalLink size={16} />打开 PowerPoint</button>
              <button type="button" title="在 Windows 文件资源管理器中定位 PPTX" onClick={() => void revealPptx(pptxPath).catch(cause => setError(cause instanceof Error ? cause.message : String(cause)))}><FolderOpen size={16} />打开所在文件夹</button>
            </div>
          </div> : <p className={styles.muted}>生成完成后，当前 PPTX 会出现在这里。</p>}
        </aside>
      </div>
    </>}
  </section>
}
function openArtifact(ctx: ClientContext, scope: TabComponentProps['scope'], uri: string, title: string): void {
  const path = localArtifactPath(uri)
  if (path) { ctx.betterSidebar.openFile(scope, path, title); return }
  void navigator.clipboard.writeText(uri)
}

export const inject = ['betterSidebar', 'conversation', 'slots', 'sessions', 'workspaces', 'remote', 'remote.zerowallPresentation', 'remote.zerowallProjects']
export function apply(ctx: ClientContext): void {
  const remote = (ctx.remote as { zerowallPresentation: PresentationRemote }).zerowallPresentation
  ctx.effect(() => ctx.betterSidebar.registerTab({ id: 'zerowall:presentation-workbench', title: '演示文稿', order: 50, icon: size => <Presentation size={size} />, dedupeKey: tab => presentationIdOf(tab.meta), component: props => <PresentationWorkbench {...props} ctx={ctx} remote={remote} /> }), 'zerowall: presentation workbench')
  ctx.effect(() => { const open = (event: Event) => { const detail = (event as CustomEvent<OpenDetail>).detail; if (detail?.presentationId && detail.sessionId) openPresentationWorkbench(ctx.betterSidebar, detail) }; window.addEventListener('zerowall:presentation-open', open); return () => window.removeEventListener('zerowall:presentation-open', open) }, 'zerowall: presentation open event')
  ctx.effect(() => ctx.remote.$on('zerowall/presentation-open', (detail: OpenDetail) => {
    const sessionId = detail?.sessionId ?? ctx.betterSidebar.getSnapshot().sessionId
    if (detail?.presentationId && sessionId) window.dispatchEvent(new CustomEvent('zerowall:presentation-open', { detail: { ...detail, sessionId } }))
  }), 'zerowall: presentation remote open bridge')
  ctx.effect(() => ctx.remote.$on('zerowall/presentation-progress', (detail: PresentationProgressDetail) => {
    window.dispatchEvent(new CustomEvent('zerowall:presentation-progress', { detail }))
  }), 'zerowall: presentation progress bridge')
  ctx.slots.inject('tool.call.toolview', function* () {
    const View = (props: ToolCallViewProps) => {
      const opened = useRef(false)
      const settled = props.block.kind === 'tool-result'
      const meta = settled && props.block.meta && typeof props.block.meta === 'object' ? props.block.meta as Record<string, unknown> : undefined
      const presentationId = typeof meta?.presentationId === 'string' ? meta.presentationId : undefined
      const sessionId = typeof meta?.sessionId === 'string' ? meta.sessionId : props.sessionId
      const title = typeof meta?.title === 'string' ? meta.title : '演示文稿'
      useEffect(() => {
        if (!settled || !presentationId || opened.current || !sessionId) return
        opened.current = true
        openPresentationWorkbench(ctx.betterSidebar, { presentationId, sessionId, ...(typeof meta?.projectId === 'string' ? { projectId: meta.projectId } : {}), title })
      }, [meta?.projectId, presentationId, sessionId, settled, title])
      return <section style={{ display: 'grid', gap: 6, padding: 8 }}><strong>ZeroWall PPT</strong><span>{settled ? `已处理“${title}”，正在右侧工作台生成。` : '正在处理演示文稿…'}</span>{settled && presentationId && <button type="button" onClick={() => sessionId && openPresentationWorkbench(ctx.betterSidebar, { presentationId, sessionId, ...(typeof meta?.projectId === 'string' ? { projectId: meta.projectId } : {}), title })}>打开演示文稿工作台</button>}</section>
    }
    yield ctx.slots.register({ name: 'tool.call.toolview', key: 'create_presentation' }, View)
    yield ctx.slots.register({ name: 'tool.call.toolview', key: 'update_presentation' }, View)
    yield ctx.slots.register({ name: 'tool.call.toolview', key: 'rebuild_presentation' }, View)
    yield ctx.slots.register({ name: 'tool.call.toolview', key: 'edit_presentation_objects' }, View)
  })
}
