import { useCallback, useEffect, useRef, useState } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { TabComponentProps, SessionScope } from 'dsh-better-sidebar/client/service'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import { AlertTriangle, Ban, Copy, ExternalLink, Pause, Play, Plus, Presentation, RefreshCw, RotateCw, Trash2 } from 'lucide-react'
import type { CreatePresentationInput, PresentationRecord, UpdatePresentationChanges } from '@zerowallscience/research-store/types'
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
  delete(id: string): Promise<RemoteResult<void>>
}
interface ProjectView { id: string; name: string; rootPath: string }
interface ProjectRemote { list(): Promise<RemoteResult<ProjectView[]>> }
interface OpenDetail { presentationId: string; sessionId: string; projectId?: string; cwd?: string; title?: string }
function unwrap<T>(result: RemoteResult<T>): T { if (result.ok) return result.value; throw new Error(result.error.message) }
function presentationIdOf(value: unknown): string | undefined { return value && typeof value === 'object' && typeof (value as { presentationId?: unknown }).presentationId === 'string' ? (value as { presentationId: string }).presentationId : undefined }
function normalizedPath(value: string): string { return value.replace(/\\/gu, '/').replace(/\/+$/gu, '').toLocaleLowerCase() }
function statusLabel(value: string): string {
  return ({ draft: '草稿', outlining: '整理大纲', designing: '设计页面', generating: '生成内容', ready: '已完成', failed: '生成失败', paused: '已暂停', cancelled: '已取消' } as Record<string, string>)[value] ?? value
}
function stageLabel(value: string): string {
  return ({ outlining: '整理大纲', designing: '规划视觉', visual: '逐页生成视觉', html: '生成 HTML', pptx: '组装 PPTX', rendering: '生成 PDF', quality: '质量检查', ready: '已完成', failed: '失败', paused: '已暂停', cancelled: '已取消' } as Record<string, string>)[value] ?? value
}
function artifactLabel(value: string): string {
  return ({ pptx: 'PowerPoint 文件', pdf: 'PDF 文件', html: 'HTML 预览', preview: '预览图', outline: '大纲', 'quality-report': '质量报告', 'visual-review': '视觉审阅' } as Record<string, string>)[value] ?? value
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
  const [visualUrl, setVisualUrl] = useState<string>()
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
  useEffect(() => {
    let active = true
    setVisualUrl(undefined)
    const attachment = slide?.visual?.attachment
    if (attachment) void ctx.conversation.resolveImage(scope.sessionId, { ...attachment, attachmentId: attachment.attachmentId as never }).then(url => { if (active) setVisualUrl(url) }).catch(() => undefined)
    return () => { active = false }
  }, [ctx.conversation, scope.sessionId, slide?.id, slide?.visual?.attachment])
  return <section className={styles.workbench} aria-busy={busy}>
    <header className={styles.header}><div><span>演示文稿工作台</span><strong>{presentation?.title ?? '当前项目演示文稿'}</strong></div><div className={styles.toolbar}><button type="button" title="刷新" onClick={() => void refresh()}><RefreshCw size={16} /></button></div></header>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {!presentation && <div className={styles.state}><div className={styles.intro}><h2>从研究材料生成可编辑演示文稿</h2><p>手工选择研究项目并填写标题，或使用当前工作区自动关联。点击后立即进入 ZeroWall PPT 生成流程。</p></div><div className={styles.introGrid}><div className={styles.introCard}><strong>1 · 选择项目</strong><span>选择已有研究项目，或自动关联当前工作区。</span></div><div className={styles.introCard}><strong>2 · 填写标题并生成</strong><span>输入标题后点击“创建并开始”。</span></div><div className={styles.introCard}><strong>3 · 审阅导出</strong><span>检查缩略图、质量状态，再打开或导出产物。</span></div></div><div className={styles.newForm}><label className={styles.formField}><span>研究项目</span><select aria-label="研究项目" value={projectId ?? ''} onChange={event => { setProjectId(event.target.value || undefined); setPresentation(undefined); setItems([]) }}><option value="">当前工作区（自动关联）</option>{projects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className={styles.formField}><span>演示文稿标题</span><input aria-label="演示文稿标题" value={title} onChange={event => setTitle(event.target.value)} placeholder="例如：2026 年度研究进展汇报" /></label><button type="button" disabled={!title.trim() || busy} onClick={() => void create()}><Plus size={15} />{busy ? '正在创建…' : '创建并开始'}</button></div>{!projectId && <div className={styles.hint}>当前选择“自动关联”：创建时会复用当前工作区对应的研究项目；若不存在，则自动建立项目。</div>}<h3>历史演示文稿</h3>{items.length === 0 ? <p>{projectId ? '当前项目暂无演示文稿。创建后可在此继续生成、暂停或导出。' : '选择已有项目可查看历史演示文稿；选择当前工作区后可直接创建。'}</p> : <ul>{items.map(item => <li key={item.id}><div className={styles.historyRow}><button type="button" className={styles.historyOpen} onClick={() => openPresentationWorkbench(ctx.betterSidebar, { presentationId: item.id, sessionId: scope.sessionId, projectId: item.projectId, cwd: scope.cwd, title: item.title })}><strong>{item.title}</strong><span>{statusLabel(item.status)} · {new Date(item.updatedAt).toLocaleString()}</span><small>{item.id}</small></button><button type="button" className={styles.historyDelete} title="删除历史演示文稿" aria-label={`删除${item.title}`} onClick={() => void remove(item)} disabled={busy}><Trash2 size={14} /></button></div></li>)}</ul>}</div>}
    {presentation && <><div className={styles.header}><div className={styles.stage}><span className={styles.status}>{statusLabel(presentation.status)}</span>{presentation.generation && <><small>{stageLabel(presentation.generation.stage)} · 第 {presentation.generation.revision} 次生成 · 最后更新 {new Date(presentation.generation.updatedAt).toLocaleTimeString()}</small><div className={styles.progressTrack} aria-label="生成进度"><span style={{ width: `${Math.round(presentation.generation.progress * 100)}%` }} /></div></>}</div><div className={styles.toolbar}><button type="button" title="刷新状态" onClick={() => void refresh()}><RefreshCw size={16} /><span>刷新</span></button>{['draft', 'failed', 'ready'].includes(presentation.status) && <button type="button" title="开始生成或重新生成" onClick={() => void act(id => remote.generate(id))}><Play size={16} /><span>{presentation.status === 'ready' ? '重新生成' : '开始生成'}</span></button>}{['outlining', 'designing', 'generating'].includes(presentation.status) && <button type="button" title="暂停生成" onClick={() => void act(id => remote.pause(id))}><Pause size={16} /><span>暂停</span></button>}{presentation.status === 'paused' && <button type="button" title="继续生成" onClick={() => void act(id => remote.resume(id))}><RotateCw size={16} /><span>继续</span></button>}{!['ready', 'cancelled'].includes(presentation.status) && <button type="button" title="取消生成" onClick={() => void act(id => remote.cancel(id))}><Ban size={16} /><span>取消</span></button>}</div></div><div className={styles.columns}><nav className={styles.slides} aria-label="页面缩略图"><h3>页面 ({presentation.slides.length})</h3>{presentation.slides.map((item, index) => <button type="button" className={selectedSlide === index ? styles.selected : ''} key={item.id} onClick={() => setSelectedSlide(index)}><span>{index + 1}</span><strong>{item.title}</strong></button>)}{presentation.slides.length === 0 && <p>生成完成后将在这里显示页面。</p>}</nav><main className={styles.preview}>{slide ? <article>{visualUrl && <img src={visualUrl} alt={slide.title} style={{ width: '100%', aspectRatio: '16 / 9', objectFit: 'contain', background: '#111' }} />}<small>第 {selectedSlide + 1} 页，共 {presentation.slides.length} 页</small><h2>{slide.title}</h2><p>{slide.body}</p>{slide.visual?.model && <p className={styles.muted}>视觉模型：{slide.visual.model.modelId} · 分组 {slide.visual.model.groupId}</p>}{slide.notes && <aside>{slide.notes}</aside>}</article> : <div className={styles.empty}>{presentation.status === 'ready' ? '没有可预览的页面' : '正在生成页面预览…'}</div>}</main><aside className={styles.details}><h3>质量门禁</h3>{presentation.quality ? <><strong className={styles[presentation.quality.overall]}>{presentation.quality.overall === 'unverified' ? '待人工确认' : presentation.quality.overall === 'passed' ? '通过' : '未通过'}</strong>{presentation.quality.warnings.map(warning => <p className={styles.warning} key={warning}><AlertTriangle size={14} />{warning}</p>)}</> : <p>生成完成后检查</p>}<h3>当前 PPTX 文件</h3>{currentArtifact(presentation, 'pptx') ? <div className={styles.currentArtifact}><strong>{artifactName(currentArtifact(presentation, 'pptx')!.uri)}</strong><code>{localArtifactPath(currentArtifact(presentation, 'pptx')!.uri) ?? currentArtifact(presentation, 'pptx')!.uri}</code><button type="button" title="打开当前 PPTX" onClick={() => openArtifact(ctx, scope, currentArtifact(presentation, 'pptx')!.uri, '当前 PPTX')}><ExternalLink size={14} />打开 PPTX</button></div> : <p className={styles.muted}>生成完成后，当前 PPTX 会出现在这里。</p>}<h3>全部产物</h3>{presentation.artifacts.length === 0 && <p className={styles.muted}>生成完成后，PPTX、PDF 和预览会出现在这里。</p>}{presentation.artifacts.map(artifact => <div className={styles.artifacts} key={artifact.kind + ':' + artifact.uri}><span><strong>{artifactLabel(artifact.kind)}</strong><small>{artifactName(artifact.uri)}</small></span><div><button type="button" title="复制路径" aria-label="复制路径" onClick={() => void navigator.clipboard.writeText(localArtifactPath(artifact.uri) ?? artifact.uri)}><Copy size={14} /></button><button type="button" title="打开产物" aria-label={`打开${artifactLabel(artifact.kind)}`} onClick={() => openArtifact(ctx, scope, artifact.uri, artifactLabel(artifact.kind))}><ExternalLink size={14} /></button></div></div>)}</aside></div></>}
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
  })
}
