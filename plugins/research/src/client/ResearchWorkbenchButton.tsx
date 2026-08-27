import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  Ban, BookOpen, Boxes, Check, Database, Download, Eye, FileCheck2, FileText,
  GitBranch, Microscope, PackageCheck, Pause, Pencil, Play, Plus, Presentation,
  RefreshCw, Snowflake, StepForward, Wifi, X,
} from 'lucide-react'
import type { SidebarFooterActionOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { PropsLocale, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from '@zerowallscience/plugin-base/client-helpers'
import type { ZeroWallKey } from '@zerowallscience/plugin-base/client'
import css from './ResearchWorkbenchButton.module.css'

type JsonPrimitive = string | number | boolean | null
type JsonValue = JsonPrimitive | JsonObject | JsonValue[]
export interface JsonObject { [key: string]: JsonValue }
interface Project { id: string; name: string; rootPath: string }
interface Item {
  id: string
  name?: string
  title?: string
  uri?: string
  mediaType?: string
  status?: string
  kind?: string
  relation?: string
  fromId?: string
  toId?: string
  command?: string
  workingDirectory?: string
  progress?: number
  error?: string
  updatedAt?: string
}
interface PublicationItem extends Item { status: string }
interface PresentationItem extends Item { status: string; slides?: unknown[] }
export interface ResearchWorkbenchSnapshot {
  contexts: Item[]
  assets: Item[]
  runs: Item[]
  artifacts: Item[]
  papers: Item[]
  decisions: Item[]
  edges: Item[]
  publications: PublicationItem[]
  presentations: PresentationItem[]
}
export interface ScientificPreviewPayload { uri: string; mediaType: string; byteSize: number; base64: string }
export interface ContextInput { projectId: string; name: string; kind: 'local' | 'wsl' | 'ssh'; config?: JsonObject }
export interface RunInput { projectId: string; executionContextId?: string; name: string; command: string; workingDirectory: string; timeoutMs?: number }
export interface DataInput { projectId: string; name: string; uri: string; location: 'local' | 'wsl' | 'ssh' | 'object-storage' | 'web'; mediaType: string; checksumAlgorithm?: 'sha256'; checksum?: string }
export interface ArtifactInput { projectId: string; name: string; uri: string; mediaType: string }
export interface PaperInput { projectId: string; title: string; doi?: string; uri?: string; notes?: string }
export interface DecisionInput { projectId: string; title: string; rationale: string; status: 'proposed' | 'accepted' | 'rejected' | 'superseded' }
export interface EdgeInput { projectId: string; fromId: string; toId: string; relation: string }
export interface PresentationChanges { title?: string; status?: 'draft' | 'outlining' | 'designing' | 'generating' | 'paused' | 'ready' | 'failed' | 'cancelled'; outline?: Array<{ title: string; points: string[] }> }
interface Actions {
  listProjects(): Promise<Project[]>
  load(projectId: string): Promise<ResearchWorkbenchSnapshot>
  createExecutionContext(input: ContextInput): Promise<void>
  probeExecutionContext(projectId: string, contextId?: string): Promise<{ ok: boolean; message: string }>
  submitRun(input: RunInput): Promise<void>
  cancelRun(id: string): Promise<void>
  pauseRun(id: string): Promise<void>
  resumeRun(id: string): Promise<void>
  readRunLog(id: string): Promise<string>
  harvestRun(id: string): Promise<void>
  createDataAsset(input: DataInput): Promise<void>
  createArtifact(input: ArtifactInput): Promise<void>
  createPaper(input: PaperInput): Promise<void>
  createDecision(input: DecisionInput): Promise<void>
  createEdge(input: EdgeInput): Promise<void>
  createPublication(input: { projectId: string; title: string; manifest: JsonObject }): Promise<void>
  freezePublication(id: string): Promise<void>
  validatePublication(id: string): Promise<void>
  reproducePublication(id: string): Promise<void>
  exportPublication(id: string, uri: string): Promise<void>
  createPresentation(projectId: string, title: string): Promise<void>
  updatePresentation(id: string, changes: PresentationChanges): Promise<void>
  generatePresentation(id: string): Promise<void>
  pausePresentation(id: string): Promise<void>
  resumePresentation(id: string): Promise<void>
  cancelPresentation(id: string): Promise<void>
  exportPresentation(id: string, format: 'pptx' | 'pdf', uri: string): Promise<void>
  previewFile(projectId: string, uri: string, mediaType?: string): Promise<ScientificPreviewPayload>
}
type Props = SidebarFooterActionOwnerProps & Actions & PropsLocale<typeof NS>
type Tab = keyof ResearchWorkbenchSnapshot
type EditorMode = 'contexts' | 'runs' | 'assets' | 'artifacts' | 'papers' | 'decisions' | 'edges' | 'publications' | 'presentations' | 'publication-export' | 'presentation-edit' | 'presentation-export'
interface EditorState { mode: EditorMode; item?: Item }
type EditorPayload =
  | { kind: 'context'; value: ContextInput }
  | { kind: 'run'; value: RunInput }
  | { kind: 'asset'; value: DataInput }
  | { kind: 'artifact'; value: ArtifactInput }
  | { kind: 'paper'; value: PaperInput }
  | { kind: 'decision'; value: DecisionInput }
  | { kind: 'edge'; value: EdgeInput }
  | { kind: 'publication'; value: { projectId: string; title: string; manifest: JsonObject } }
  | { kind: 'publication-export'; value: { id: string; uri: string } }
  | { kind: 'presentation'; value: { projectId: string; title: string } }
  | { kind: 'presentation-edit'; value: { id: string; title: string; outline: Array<{ title: string; points: string[] }> } }
  | { kind: 'presentation-export'; value: { id: string; format: 'pptx' | 'pdf'; uri: string } }

const TABS: Array<{ id: Tab; label: ZeroWallKey; icon: typeof Database }> = [
  { id: 'contexts', label: 'research.tab.contexts', icon: Microscope }, { id: 'runs', label: 'research.tab.runs', icon: Play },
  { id: 'assets', label: 'research.tab.assets', icon: Database }, { id: 'artifacts', label: 'research.tab.artifacts', icon: Boxes },
  { id: 'papers', label: 'research.tab.papers', icon: BookOpen }, { id: 'decisions', label: 'research.tab.decisions', icon: Check },
  { id: 'edges', label: 'research.tab.edges', icon: GitBranch }, { id: 'publications', label: 'research.tab.publications', icon: FileCheck2 },
  { id: 'presentations', label: 'research.tab.presentations', icon: Presentation },
]
const EMPTY: ResearchWorkbenchSnapshot = { contexts: [], assets: [], runs: [], artifacts: [], papers: [], decisions: [], edges: [], publications: [], presentations: [] }

export function ResearchWorkbenchButton(props: Props) {
  const [open, setOpen] = useState(false)
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState('')
  const [tab, setTab] = useState<Tab>('runs')
  const [data, setData] = useState<ResearchWorkbenchSnapshot>(EMPTY)
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<ScientificPreviewPayload>()
  const [editor, setEditor] = useState<EditorState>()
  const [log, setLog] = useState<{ title: string; content: string }>()

  const refresh = useCallback(async (selected = projectId) => {
    if (!selected) return
    setBusy(true)
    setError(undefined)
    try { setData(await props.load(selected)) } catch (reason) { setError(message(reason)) } finally { setBusy(false) }
  }, [projectId, props])

  useEffect(() => {
    if (!open) return
    void props.listProjects().then(items => {
      setProjects(items)
      const selected = projectId || items[0]?.id || ''
      setProjectId(selected)
      return refresh(selected)
    }).catch(reason => setError(message(reason)))
  }, [open])

  useEffect(() => {
    if (!open) return
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (preview !== undefined) setPreview(undefined)
      else if (log !== undefined) setLog(undefined)
      else if (editor !== undefined) setEditor(undefined)
      else setOpen(false)
    }
    window.addEventListener('keydown', escape, true)
    return () => window.removeEventListener('keydown', escape, true)
  }, [editor, log, open, preview])

  const act = async (operation: () => Promise<void>) => {
    setBusy(true)
    setError(undefined)
    try { await operation(); await refresh() } catch (reason) { setError(message(reason)) } finally { setBusy(false) }
  }
  const submitEditor = async (payload: EditorPayload) => {
    await act(async () => {
      if (payload.kind === 'context') await props.createExecutionContext(payload.value)
      else if (payload.kind === 'run') await props.submitRun(payload.value)
      else if (payload.kind === 'asset') await props.createDataAsset(payload.value)
      else if (payload.kind === 'artifact') await props.createArtifact(payload.value)
      else if (payload.kind === 'paper') await props.createPaper(payload.value)
      else if (payload.kind === 'decision') await props.createDecision(payload.value)
      else if (payload.kind === 'edge') await props.createEdge(payload.value)
      else if (payload.kind === 'publication') await props.createPublication(payload.value)
      else if (payload.kind === 'publication-export') await props.exportPublication(payload.value.id, payload.value.uri)
      else if (payload.kind === 'presentation') await props.createPresentation(payload.value.projectId, payload.value.title)
      else if (payload.kind === 'presentation-edit') await props.updatePresentation(payload.value.id, { title: payload.value.title, outline: payload.value.outline })
      else await props.exportPresentation(payload.value.id, payload.value.format, payload.value.uri)
    })
    setEditor(undefined)
  }
  const openPreview = async (item: Item) => {
    if (!projectId || !item.uri) return
    setBusy(true)
    setError(undefined)
    try { setPreview(await props.previewFile(projectId, item.uri, item.mediaType)) } catch (reason) { setError(message(reason)) } finally { setBusy(false) }
  }
  const openLog = async (item: Item) => {
    setBusy(true)
    setError(undefined)
    try { setLog({ title: item.name ?? item.id, content: await props.readRunLog(item.id) }) } catch (reason) { setError(message(reason)) } finally { setBusy(false) }
  }
  const items = data[tab]
  const project = projects.find(item => item.id === projectId)

  return <>
    <button className={css.trigger} type="button" onClick={() => setOpen(true)} title={props.t('research.trigger')} aria-label={props.t('research.trigger')}><Microscope size={18} />{props.wide && <span>{props.t('research.nav')}</span>}</button>
    {open && createPortal(<div className={css.backdrop} role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false) }}>
      <section className={css.panel} role="dialog" aria-modal="true" aria-label={props.t('research.title')}>
        <header className={css.header}><div><p>ZeroWall Science</p><h2>{props.t('research.title')}</h2></div><div className={css.headerActions}>
          <select aria-label={props.t('research.project')} value={projectId} onChange={event => { setProjectId(event.target.value); void refresh(event.target.value) }}>{projects.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select>
          <button type="button" onClick={() => void refresh()} title={props.t('common.refresh')} aria-label={props.t('common.refresh')}><RefreshCw size={17} /></button><button type="button" onClick={() => setOpen(false)} title={props.t('common.close')} aria-label={props.t('common.close')}><X size={18} /></button>
        </div></header>
        <div className={css.body}><nav className={css.tabs} aria-label={props.t('research.views')}>{TABS.map(entry => <button key={entry.id} className={tab === entry.id ? css.active : ''} type="button" onClick={() => setTab(entry.id)}><entry.icon size={16} /><span>{props.t(entry.label)}</span><b>{data[entry.id].length}</b></button>)}</nav>
          <main className={css.content} aria-busy={busy}><div className={css.toolbar}><div><h3>{props.t(TABS.find(entry => entry.id === tab)?.label ?? 'research.tab.runs')}</h3><p>{project?.rootPath ?? props.t('research.selectProject')}</p></div>
            <button type="button" disabled={!projectId || busy} onClick={() => setEditor({ mode: tab })}><Plus size={16} />{props.t('research.new')}</button>
          </div>{error && <p className={css.error} role="alert">{error}</p>}
          <div className={css.list}>{items.length === 0 && !busy ? <p className={css.empty}>{props.t('research.empty')}</p> : items.map(item => <article className={css.row} key={item.id}><div className={css.itemMain}><span className={css.kind}>{previewKind(item)}</span><div><h4>{item.name ?? item.title ?? item.relation ?? item.id}</h4><p>{item.uri ?? (item.fromId && item.toId ? `${short(item.fromId)} -> ${short(item.toId)}` : item.command ?? item.status ?? short(item.id))}</p>{item.error && <p className={css.rowError}>{item.error}</p>}</div></div>
            <div className={css.actions}>{item.status && <span className={css.status}>{item.status}</span>}
              {tab === 'contexts' && <button type="button" onClick={() => void act(async () => { const result = await props.probeExecutionContext(projectId, item.id); if (!result.ok) throw new Error(result.message) })} title={props.t('research.action.probe')} aria-label={props.t('research.action.probe')}><Wifi size={16} /></button>}
              {item.uri?.startsWith('file:') && <button type="button" onClick={() => void openPreview(item)} title={props.t('research.action.preview')} aria-label={props.t('research.action.preview')}><Eye size={16} /></button>}
              {tab === 'runs' && <button type="button" onClick={() => void openLog(item)} title={props.t('research.action.viewLog')} aria-label={props.t('research.action.viewLog')}><FileText size={16} /></button>}
              {tab === 'runs' && ['submitted', 'running', 'paused', 'cancelling'].includes(item.status ?? '') && <button type="button" onClick={() => void act(() => props.cancelRun(item.id))} title={props.t('research.action.cancel')} aria-label={props.t('research.action.cancel')}><Ban size={16} /></button>}
              {tab === 'runs' && item.status === 'running' && <button type="button" onClick={() => void act(() => props.pauseRun(item.id))} title={props.t('research.action.pause')} aria-label={props.t('research.action.pause')}><Pause size={16} /></button>}
              {tab === 'runs' && item.status === 'paused' && <button type="button" onClick={() => void act(() => props.resumeRun(item.id))} title={props.t('research.action.resume')} aria-label={props.t('research.action.resume')}><Play size={16} /></button>}
              {tab === 'runs' && ['succeeded', 'failed', 'cancelled', 'timed_out'].includes(item.status ?? '') && <button type="button" onClick={() => void act(() => props.harvestRun(item.id))} title={props.t('research.action.harvest')} aria-label={props.t('research.action.harvest')}><PackageCheck size={16} /></button>}
              {tab === 'publications' && item.status === 'draft' && <button type="button" onClick={() => void act(() => props.freezePublication(item.id))} title={props.t('research.action.freeze')} aria-label={props.t('research.action.freeze')}><Snowflake size={16} /></button>}
              {tab === 'publications' && (item.status === 'frozen' || item.status === 'failed') && <button type="button" onClick={() => void act(() => props.validatePublication(item.id))} title={props.t('research.action.validate')} aria-label={props.t('research.action.validate')}><FileCheck2 size={16} /></button>}
              {tab === 'publications' && ['frozen', 'ready', 'failed'].includes(item.status ?? '') && <button type="button" onClick={() => void act(() => props.reproducePublication(item.id))} title={props.t('research.action.reproduce')} aria-label={props.t('research.action.reproduce')}><RefreshCw size={16} /></button>}
              {tab === 'publications' && item.status === 'ready' && <button type="button" onClick={() => setEditor({ mode: 'publication-export', item })} title={props.t('research.action.export')} aria-label={props.t('research.action.export')}><Download size={16} /></button>}
              {tab === 'presentations' && <button type="button" onClick={() => setEditor({ mode: 'presentation-edit', item })} title={props.t('research.action.edit')} aria-label={props.t('research.action.edit')}><Pencil size={16} /></button>}
              {tab === 'presentations' && ['draft', 'failed', 'ready'].includes(item.status ?? '') && <button type="button" onClick={() => void act(() => props.generatePresentation(item.id))} title={props.t('research.action.generate')} aria-label={props.t('research.action.generate')}><StepForward size={16} /></button>}
              {tab === 'presentations' && ['outlining', 'designing', 'generating'].includes(item.status ?? '') && <button type="button" onClick={() => void act(() => props.pausePresentation(item.id))} title={props.t('research.action.pause')} aria-label={props.t('research.action.pause')}><Pause size={16} /></button>}
              {tab === 'presentations' && item.status === 'paused' && <button type="button" onClick={() => void act(() => props.resumePresentation(item.id))} title={props.t('research.action.resume')} aria-label={props.t('research.action.resume')}><Play size={16} /></button>}
              {tab === 'presentations' && ['outlining', 'designing', 'generating', 'paused'].includes(item.status ?? '') && <button type="button" onClick={() => void act(() => props.cancelPresentation(item.id))} title={props.t('research.action.cancel')} aria-label={props.t('research.action.cancel')}><Ban size={16} /></button>}
              {tab === 'presentations' && item.status === 'ready' && <button type="button" onClick={() => setEditor({ mode: 'presentation-export', item })} title={props.t('research.action.export')} aria-label={props.t('research.action.export')}><Download size={16} /></button>}
            </div></article>)}</div>
          </main></div>
        {preview && <div className={css.previewLayer}><header><div><strong>{preview.uri.split('/').pop()}</strong><span>{formatBytes(preview.byteSize)} · {preview.mediaType}</span></div><button type="button" onClick={() => setPreview(undefined)} title={props.t('research.preview.close')} aria-label={props.t('research.preview.close')}><X size={18} /></button></header><PreviewSurface payload={preview} t={props.t} /></div>}
        {log && <div className={css.previewLayer} role="dialog" aria-label={props.t('research.log.title')}><header><div><strong>{log.title}</strong><span>{props.t('research.log.durable')}</span></div><button type="button" onClick={() => setLog(undefined)} title={props.t('research.log.close')} aria-label={props.t('research.log.close')}><X size={18} /></button></header><pre className={css.textPreview}>{log.content || props.t('research.log.empty')}</pre></div>}
        {editor && project && <RecordEditor state={editor} project={project} snapshot={data} t={props.t} onCancel={() => setEditor(undefined)} onSubmit={submitEditor} />}
      </section></div>, document.body)}
  </>
}

function RecordEditor({ state, project, snapshot, t, onCancel, onSubmit }: { state: EditorState; project: Project; snapshot: ResearchWorkbenchSnapshot; t: TranslateNS<typeof NS>; onCancel(): void; onSubmit(payload: EditorPayload): Promise<void> }) {
  const [name, setName] = useState(state.item?.name ?? state.item?.title ?? '')
  const [kind, setKind] = useState<'local' | 'wsl' | 'ssh'>('local')
  const [uri, setUri] = useState('')
  const [mediaType, setMediaType] = useState('')
  const [location, setLocation] = useState<DataInput['location']>('local')
  const [command, setCommand] = useState('')
  const [workingDirectory, setWorkingDirectory] = useState(project.rootPath)
  const [contextId, setContextId] = useState('')
  const [timeout, setTimeoutValue] = useState('')
  const [host, setHost] = useState('')
  const [user, setUser] = useState('')
  const [port, setPort] = useState('22')
  const [distro, setDistro] = useState('')
  const [privateKeyPath, setPrivateKeyPath] = useState('')
  const [doi, setDoi] = useState('')
  const [notes, setNotes] = useState('')
  const [rationale, setRationale] = useState('')
  const [decisionStatus, setDecisionStatus] = useState<DecisionInput['status']>('proposed')
  const nodes = [...snapshot.assets, ...snapshot.runs, ...snapshot.artifacts, ...snapshot.papers, ...snapshot.decisions]
  const [fromId, setFromId] = useState(nodes[0]?.id ?? '')
  const [toId, setToId] = useState(nodes[1]?.id ?? nodes[0]?.id ?? '')
  const [relation, setRelation] = useState('supports')
  const [checksum, setChecksum] = useState('')
  const [outline, setOutline] = useState('')
  const [format, setFormat] = useState<'pptx' | 'pdf'>('pptx')
  const mode = state.mode
  const title = editorTitle(mode, t)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (mode === 'contexts') {
      const config: JsonObject = kind === 'ssh'
        ? { host, ...(user ? { user } : {}), ...(port ? { port: Number(port) } : {}), ...(privateKeyPath ? { privateKeyPath } : {}) }
        : kind === 'wsl' ? { distro } : {}
      await onSubmit({ kind: 'context', value: { projectId: project.id, name, kind, config } })
    } else if (mode === 'runs') await onSubmit({ kind: 'run', value: { projectId: project.id, ...(contextId ? { executionContextId: contextId } : {}), name, command, workingDirectory, ...(timeout ? { timeoutMs: Number(timeout) * 1000 } : {}) } })
    else if (mode === 'assets') await onSubmit({ kind: 'asset', value: { projectId: project.id, name, uri, location, mediaType, ...(checksum ? { checksumAlgorithm: 'sha256', checksum } : {}) } })
    else if (mode === 'artifacts') await onSubmit({ kind: 'artifact', value: { projectId: project.id, name, uri, mediaType } })
    else if (mode === 'papers') await onSubmit({ kind: 'paper', value: { projectId: project.id, title: name, ...(doi ? { doi } : {}), ...(uri ? { uri } : {}), ...(notes ? { notes } : {}) } })
    else if (mode === 'decisions') await onSubmit({ kind: 'decision', value: { projectId: project.id, title: name, rationale, status: decisionStatus } })
    else if (mode === 'edges') await onSubmit({ kind: 'edge', value: { projectId: project.id, fromId, toId, relation } })
    else if (mode === 'publications') await onSubmit({ kind: 'publication', value: { projectId: project.id, title: name, manifest: { reproduction: { command, workingDirectory, ...(contextId ? { executionContextId: contextId } : {}), ...(timeout ? { timeoutMs: Number(timeout) * 1000 } : {}) } } } })
    else if (mode === 'publication-export') await onSubmit({ kind: 'publication-export', value: { id: state.item!.id, uri } })
    else if (mode === 'presentations') await onSubmit({ kind: 'presentation', value: { projectId: project.id, title: name } })
    else if (mode === 'presentation-edit') await onSubmit({ kind: 'presentation-edit', value: { id: state.item!.id, title: name, outline: parseOutline(outline) } })
    else await onSubmit({ kind: 'presentation-export', value: { id: state.item!.id, format, uri } })
  }
  return <div className={css.editorLayer} role="presentation"><form className={css.editorCard} onSubmit={event => void submit(event)} aria-label={title}>
    <header><h3>{title}</h3><button type="button" onClick={onCancel} title={t('common.close')} aria-label={t('common.close')}><X size={18} /></button></header>
    <div className={css.formGrid}>
      {!['publication-export', 'presentation-export', 'edges'].includes(mode) && <label><span>{['papers', 'decisions', 'publications', 'presentations', 'presentation-edit'].includes(mode) ? t('common.title') : t('common.name')}</span><input required value={name} onChange={event => setName(event.target.value)} /></label>}
      {mode === 'contexts' && <><label><span>{t('research.field.kind')}</span><select value={kind} onChange={event => setKind(event.target.value as typeof kind)}><option value="local">{t('research.field.local')}</option><option value="wsl">WSL</option><option value="ssh">SSH</option></select></label>{kind === 'wsl' && <label><span>{t('research.field.distribution')}</span><input required value={distro} onChange={event => setDistro(event.target.value)} /></label>}{kind === 'ssh' && <><label><span>{t('research.field.host')}</span><input required value={host} onChange={event => setHost(event.target.value)} /></label><label><span>{t('research.field.user')}</span><input value={user} onChange={event => setUser(event.target.value)} /></label><label><span>{t('research.field.port')}</span><input type="number" min="1" max="65535" value={port} onChange={event => setPort(event.target.value)} /></label><label><span>{t('research.field.privateKeyPath')}</span><input value={privateKeyPath} onChange={event => setPrivateKeyPath(event.target.value)} /></label></>}</>}
      {mode === 'runs' && <><label><span>{t('research.field.environment')}</span><select value={contextId} onChange={event => setContextId(event.target.value)}><option value="">{t('research.field.localDefault')}</option>{snapshot.contexts.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className={css.wideField}><span>{t('research.field.command')}</span><textarea required value={command} onChange={event => setCommand(event.target.value)} /></label><label className={css.wideField}><span>{t('research.field.workingDirectory')}</span><input required value={workingDirectory} onChange={event => setWorkingDirectory(event.target.value)} /></label><label><span>{t('research.field.timeout')}</span><input type="number" min="1" value={timeout} onChange={event => setTimeoutValue(event.target.value)} /></label></>}
      {mode === 'publications' && <><label><span>{t('research.field.reproductionEnvironment')}</span><select value={contextId} onChange={event => setContextId(event.target.value)}><option value="">{t('research.field.localDefault')}</option>{snapshot.contexts.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className={css.wideField}><span>{t('research.field.reproductionCommand')}</span><textarea required value={command} onChange={event => setCommand(event.target.value)} /></label><label className={css.wideField}><span>{t('research.field.workingDirectory')}</span><input required value={workingDirectory} onChange={event => setWorkingDirectory(event.target.value)} /></label><label><span>{t('research.field.timeout')}</span><input type="number" min="1" value={timeout} onChange={event => setTimeoutValue(event.target.value)} /></label></>}
      {mode === 'assets' && <><label><span>{t('research.field.location')}</span><select value={location} onChange={event => setLocation(event.target.value as typeof location)}><option value="local">{t('research.field.local')}</option><option value="wsl">WSL</option><option value="ssh">SSH</option><option value="object-storage">{t('research.field.objectStorage')}</option><option value="web">{t('research.field.web')}</option></select></label><UriFields uri={uri} setUri={setUri} mediaType={mediaType} setMediaType={setMediaType} t={t} /><label className={css.wideField}><span>{t('research.field.checksum')}</span><input value={checksum} onChange={event => setChecksum(event.target.value)} /></label></>}
      {mode === 'artifacts' && <UriFields uri={uri} setUri={setUri} mediaType={mediaType} setMediaType={setMediaType} t={t} />}
      {mode === 'papers' && <><label><span>DOI</span><input value={doi} onChange={event => setDoi(event.target.value)} /></label><label><span>{t('research.field.uri')}</span><input value={uri} onChange={event => setUri(event.target.value)} /></label><label className={css.wideField}><span>{t('research.field.notes')}</span><textarea value={notes} onChange={event => setNotes(event.target.value)} /></label></>}
      {mode === 'decisions' && <><label><span>{t('common.status')}</span><select value={decisionStatus} onChange={event => setDecisionStatus(event.target.value as typeof decisionStatus)}><option value="proposed">{t('research.field.proposed')}</option><option value="accepted">{t('research.field.accepted')}</option><option value="rejected">{t('research.field.rejected')}</option><option value="superseded">{t('research.field.superseded')}</option></select></label><label className={css.wideField}><span>{t('research.field.rationale')}</span><textarea required value={rationale} onChange={event => setRationale(event.target.value)} /></label></>}
      {mode === 'edges' && <><label><span>{t('research.field.from')}</span><select required value={fromId} onChange={event => setFromId(event.target.value)}>{nodes.map(item => <option key={item.id} value={item.id}>{item.name ?? item.title ?? short(item.id)}</option>)}</select></label><label><span>{t('research.field.to')}</span><select required value={toId} onChange={event => setToId(event.target.value)}>{nodes.map(item => <option key={item.id} value={item.id}>{item.name ?? item.title ?? short(item.id)}</option>)}</select></label><label className={css.wideField}><span>{t('research.field.relation')}</span><input required value={relation} onChange={event => setRelation(event.target.value)} /></label></>}
      {mode === 'presentation-edit' && <label className={css.wideField}><span>{t('research.field.outline')}</span><textarea value={outline} onChange={event => setOutline(event.target.value)} /></label>}
      {mode === 'presentation-export' && <label><span>{t('research.field.format')}</span><select value={format} onChange={event => setFormat(event.target.value as typeof format)}><option value="pptx">PPTX</option><option value="pdf">PDF</option></select></label>}
      {['publication-export', 'presentation-export'].includes(mode) && <label className={css.wideField}><span>{t('research.field.destination')}</span><input required value={uri} onChange={event => setUri(event.target.value)} placeholder="file:///..." /></label>}
    </div>
    <footer><button type="button" onClick={onCancel}>{t('common.cancel')}</button><button type="submit"><Check size={16} />{t('common.save')}</button></footer>
  </form></div>
}

function UriFields({ uri, setUri, mediaType, setMediaType, t }: { uri: string; setUri(value: string): void; mediaType: string; setMediaType(value: string): void; t: TranslateNS<typeof NS> }) {
  return <><label className={css.wideField}><span>{t('research.field.uri')}</span><input required value={uri} onChange={event => setUri(event.target.value)} /></label><label className={css.wideField}><span>{t('research.field.mediaType')}</span><input required value={mediaType} onChange={event => setMediaType(event.target.value)} placeholder="text/csv" /></label></>
}

function editorTitle(mode: EditorMode, t: TranslateNS<typeof NS>): string {
  return ({ contexts: t('research.editor.contexts'), runs: t('research.editor.runs'), assets: t('research.editor.assets'), artifacts: t('research.editor.artifacts'), papers: t('research.editor.papers'), decisions: t('research.editor.decisions'), edges: t('research.editor.edges'), publications: t('research.editor.publications'), presentations: t('research.editor.presentations'), 'publication-export': t('research.editor.publicationExport'), 'presentation-edit': t('research.editor.presentationEdit'), 'presentation-export': t('research.editor.presentationExport') })[mode]
}
function parseOutline(value: string): Array<{ title: string; points: string[] }> {
  return value.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
    const [title = '', points = ''] = line.split('|', 2)
    return { title: title.trim(), points: points.split(';').map(point => point.trim()).filter(Boolean) }
  })
}
function message(reason: unknown): string { return reason instanceof Error ? reason.message : String(reason) }
function short(value: string) { return value.slice(0, 8) }
function formatBytes(value: number) { return value < 1024 ? `${value} B` : value < 1024 * 1024 ? `${(value / 1024).toFixed(1)} KB` : `${(value / 1024 / 1024).toFixed(1)} MB` }
function previewKind(item: Item): string {
  const value = `${item.mediaType ?? ''} ${item.uri ?? ''}`.toLowerCase()
  if (/pdf/.test(value)) return 'PDF'
  if (/docx|wordprocessing/.test(value)) return 'DOCX'
  if (/xlsx|spreadsheet|csv|tsv/.test(value)) return 'TABLE'
  if (/pptx|presentation/.test(value)) return 'SLIDES'
  if (/pdb|mol|sdf|chemical/.test(value)) return 'MOLECULE'
  if (/fasta|fastq|sequence/.test(value)) return 'SEQUENCE'
  if (/png|jpe?g|svg|image/.test(value)) return 'IMAGE'
  if (item.kind) return item.kind.toUpperCase()
  return item.status ? 'TASK' : 'RECORD'
}

function PreviewSurface({ payload, t }: { payload: ScientificPreviewPayload; t: TranslateNS<typeof NS> }) {
  const host = useRef<HTMLDivElement>(null)
  const bytes = useCallback(() => Uint8Array.from(atob(payload.base64), character => character.charCodeAt(0)), [payload.base64])
  const blobUrl = useCallback(() => URL.createObjectURL(new Blob([bytes()], { type: payload.mediaType })), [bytes, payload.mediaType])
  useEffect(() => {
    const element = host.current
    if (!element || !/docx|spreadsheet|presentation/.test(payload.mediaType)) return
    let disposed = false
    let destroy: (() => void) | undefined
    void (async () => {
      element.textContent = t('research.preview.loading')
      try {
        if (/wordprocessing/.test(payload.mediaType)) {
          const module = await dynamicImport('/zerowall-preview-runtime/docx-preview.mjs') as { renderAsync(input: ArrayBuffer, body: HTMLElement, style?: HTMLElement, options?: Record<string, unknown>): Promise<unknown> }
          if (!disposed) await module.renderAsync(bytes().buffer, element, element, { inWrapper: true, experimental: true, renderHeaders: true, renderFooters: true })
        } else if (/spreadsheet/.test(payload.mediaType)) {
          const xlsx = await loadXlsx(t)
          const workbook = xlsx.read(bytes(), { type: 'array' })
          const sheet = workbook.Sheets[workbook.SheetNames[0] ?? '']
          if (!disposed) {
            if (sheet) element.innerHTML = xlsx.utils.sheet_to_html(sheet)
            else { element.replaceChildren(); const empty = document.createElement('p'); empty.textContent = t('research.preview.noSheets'); element.appendChild(empty) }
          }
        } else {
          // PPTX previews are owned by the ZeroWall presentation workbench,
          // which renders the persisted per-slide PNGs. Keeping a second
          // OOXML viewer here produced a different source of truth and could
          // show stale decks from the generic research artifact list.
          if (!disposed) {
            element.replaceChildren()
            const note = document.createElement('p')
            note.textContent = '请在“演示文稿”工作台查看逐页预览；此处仅提供 PPTX 文件打开。'
            element.appendChild(note)
          }
        }
      } catch (reason) { if (!disposed) element.textContent = message(reason) }
    })()
    return () => { disposed = true; destroy?.(); element.replaceChildren() }
  }, [bytes, payload.mediaType, t])
  if (payload.mediaType.startsWith('image/')) { const url = blobUrl(); return <img className={css.imagePreview} src={url} onLoad={() => URL.revokeObjectURL(url)} alt={t('research.preview.scientific')} /> }
  if (payload.mediaType === 'application/pdf') { const url = blobUrl(); return <iframe className={css.framePreview} src={url} title={t('research.preview.pdf')} onLoad={() => setTimeout(() => URL.revokeObjectURL(url), 1_000)} /> }
  if (/docx|spreadsheet|presentation/.test(payload.mediaType)) return <div className={css.officePreview} ref={host} />
  return <pre className={css.textPreview}>{new TextDecoder().decode(bytes())}</pre>
}

const dynamicImport = (url: string): Promise<unknown> => Function('url', 'return import(url)')(url) as Promise<unknown>
interface XlsxApi { read(input: Uint8Array, options: Record<string, unknown>): { SheetNames: string[]; Sheets: Record<string, unknown> }; utils: { sheet_to_html(sheet: unknown): string } }
async function loadXlsx(t: TranslateNS<typeof NS>): Promise<XlsxApi> {
  const windowWithXlsx = window as Window & { XLSX?: XlsxApi }
  if (windowWithXlsx.XLSX) return windowWithXlsx.XLSX
  await new Promise<void>((resolve, reject) => { const script = document.createElement('script'); script.src = '/zerowall-preview-runtime/xlsx.mini.min.js'; script.onload = () => resolve(); script.onerror = () => reject(new Error(t('research.preview.loadSpreadsheetError'))); document.head.appendChild(script) })
  if (!windowWithXlsx.XLSX) throw new Error(t('research.preview.spreadsheetInitError'))
  return windowWithXlsx.XLSX
}
