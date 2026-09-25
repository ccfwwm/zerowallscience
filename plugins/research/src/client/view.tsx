import { useEffect, useMemo, useReducer, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { TabComponentProps } from 'dsh-better-sidebar/client/service'
import { unwrapRemoteResult } from '../../../base/src/shared/client-helpers.ts'
import { NS, zh, type ZeroWallKey } from '../../../base/src/client/locales.ts'
import type {} from '../../lib/typert.remote-client.js'
import type { TypertRemoteNamespaceMap } from '@deepseek-ai/dsh-typert-protocol'
import type { JsonObject, ResearchRecordKind } from '@zerowallscience/research-store/types'
import { scienceTabReducer, type ScienceTabState } from './workbench-state.js'
import { WorkbenchSelectionContext, type WorkbenchSelection } from './workbench-selection.js'
import workbenchStyles from './workbench.module.css'
import { WorkbenchShell } from './workbench-shell.js'
// The descriptor table is authored by a sibling module. It is reached through a
// namespace import so a renamed export degrades to the home descriptor instead
// of failing the whole workbench import.
import * as descriptorModule from './tool-descriptors.js'
import { RESEARCH_TOOL_DESCRIPTORS, WORKBENCH_LOCALES } from './tool-descriptors.js'
import { SequenceViewer } from './sequence-viewer.js'
import { NativeEnginePanel } from './native-engine-panel.js'
import { ScientificEngineCenter } from './scientific-engine-center.js'
import { ReadOnlyImageViewer, ReadOnlyHeViewer } from './read-only-image-viewers.js'
import { SangerViewer } from './sanger-viewer.js'
import { FlowViewer } from './flow-viewer.js'
import { MoleculeViewer } from './molecule-viewer.js'
import { ReadOnlyCanvasViewer } from './read-only-canvas-viewer.js'
import { CellViewer } from './cell-viewer.js'
import { BrainViewer } from './brain-viewer.js'
import { scienceToolForImportedPath } from './imported-science-file.js'
import { NhanesSurveyPanel } from './nhanes-survey-panel.js'
import { GeneticAnalysisPanel } from './genetic-analysis-panel.js'
import { LocalAssetPanel } from './local-asset-panel.js'
import { Atom, Brain, Dna, Grid3x3, Home, Images, LayoutDashboard, Microscope, Radio, ScanEye } from 'lucide-react'

type Page = 'overview' | 'data' | 'plan' | 'evidence' | 'report'
type Study = { id: string; projectId: string; title: string; phase: string; status: string; gate1: string; gate2: string; version: number; currentQuestionId?: string; currentPlanId?: string; currentFreezeId?: string }
type Document = { id: string; kind: string; payload: Record<string, unknown>; version: number; updatedAt: string }
type Snapshot = { study: Study; documents: Document[]; freezes: Array<{ id: string; version: number; createdAt: string; snapshot: Record<string, unknown> }>; tasks?: ResearchTask[]; budget?: BudgetReport }
type ResearchTask = { id: string; name: string; kind: string; status: string; dependencies: string[]; attempt: number; exploratory: boolean; error?: string; runId?: string }
type BudgetReport = { accounting: string; limits: Record<string, number>; usage: Record<string, number>; available: Record<string, number>; exceeded: string[]; reservations: Array<{ taskId: string; attempt: number }> }
type Engine = { id: string; name: string; available: boolean; path?: string; version?: string; reason?: string }
type Remote = TypertRemoteNamespaceMap['zerowallResearch']
type ScienceToolId = 'imagej' | 'he' | 'molecule' | 'sanger' | 'flow' | 'canvas' | 'cells' | 'sequence' | 'brainglobe'
type ActiveKey = ScienceToolId | 'home'
/** The presentational shell is authored in parallel, so its own types are the contract. */
type ShellProps = Parameters<typeof WorkbenchShell>[0]
type ShellDescriptor = ShellProps['descriptor']
/**
 * The desktop bag and the workbench dictionary are separate key sets: the
 * workbench copy lives with the shell that paints it, while the desktop bag
 * owns everything else. A panel here reaches both, so the translator has to
 * accept either key, not just the bag's.
 */
type WorkbenchKey = keyof typeof WORKBENCH_LOCALES.zh
type TranslateKey = ZeroWallKey | WorkbenchKey
type Translate = (key: TranslateKey) => string

/** The 8-tab row of the approved design; every other tool lives in the overflow entry. */
const TAB_ORDER: ActiveKey[] = ['home', 'imagej', 'he', 'molecule', 'sanger', 'flow', 'canvas', 'cells']
const OVERFLOW_ORDER: ScienceToolId[] = ['sequence', 'brainglobe']
const LABEL_KEYS = {
  home: 'research.workbench.tab.home', imagej: 'research.workbench.tab.imagej', he: 'research.workbench.tab.he',
  molecule: 'research.workbench.tab.molecule', sanger: 'research.workbench.tab.sanger', flow: 'research.workbench.tab.flow',
  canvas: 'research.workbench.tab.canvas', cells: 'research.workbench.tab.cells', sequence: 'research.workbench.tab.sequence',
  brainglobe: 'research.workbench.tab.brainglobe',
} as const satisfies Record<ActiveKey, ZeroWallKey>
const TAB_ICONS: Record<ActiveKey, ReactNode> = {
  home: <Home size={16} />, imagej: <Microscope size={16} />, he: <Images size={16} />, molecule: <Atom size={16} />,
  sanger: <Radio size={16} />, flow: <ScanEye size={16} />, canvas: <LayoutDashboard size={16} />, cells: <Grid3x3 size={16} />,
  sequence: <Dna size={16} />, brainglobe: <Brain size={16} />,
}
/** Research pages have no tab of their own; they are sidebar destinations of the 主页 tab. */
const RESEARCH_PAGES: Array<{ page: Page; labelKey: ZeroWallKey; hintKey: ZeroWallKey }> = [
  { page: 'data', labelKey: 'research.workbench.pages.data', hintKey: 'research.workbench.pages.dataHint' },
  { page: 'plan', labelKey: 'research.workbench.pages.plan', hintKey: 'research.workbench.pages.planHint' },
  { page: 'evidence', labelKey: 'research.workbench.pages.evidence', hintKey: 'research.workbench.pages.evidenceHint' },
  { page: 'report', labelKey: 'research.workbench.pages.report', hintKey: 'research.workbench.pages.reportHint' },
]
/** Action values the shell forwards from a descriptor card to a research destination. */
const PAGE_BY_ACTION: Record<string, Page> = { overview: 'overview', data: 'data', plan: 'plan', evidence: 'evidence', report: 'report' }
export type ScienceWorkbenchProps = TabComponentProps & { remote: Remote; onSendMessage?: (text: string) => Promise<void> }

/**
 * Translation follows the host locale when the tab is mounted with the locale
 * service, and falls back to the Chinese source dictionary otherwise. An older
 * host would otherwise render raw `research.workbench.*` keys.
 *
 * The workbench dictionary resolves in front of the fallback for either form:
 * its copy is owned here, not by the desktop bag, so a host that has not spread
 * `WORKBENCH_LOCALES` into its locale bag would otherwise paint raw
 * `science.shell.*` keys.
 */
function translateFrom(ctx: unknown): Translate {
  const workbenchZh = WORKBENCH_LOCALES.zh as Record<string, string>
  const bound = (ctx as { locale?: { bind?: (ns: string) => unknown } } | undefined)?.locale?.bind?.(NS)
  if (typeof bound === 'function') {
    const translate = bound as (key: string) => string
    return (key: TranslateKey) => workbenchZh[key] ?? translate(key)
  }
  return (key: TranslateKey) => workbenchZh[key] ?? (zh as Record<string, string>)[key] ?? key
}

export function ScienceWorkbench(props: ScienceWorkbenchProps): JSX.Element {
  const remote = props.remote
  const ctx = (props as { ctx?: unknown }).ctx
  const t = useMemo(() => translateFrom(ctx), [ctx])
  const [page, setPage] = useState<Page>('overview')
  const [tabState, dispatchTab] = useReducer(scienceTabReducer, { tabs: [] } satisfies ScienceTabState)
  /**
   * The selection each mounted panel reads through `WorkbenchSelectionContext`.
   * Keyed by tool so a panel never has to search the tab list, and carrying
   * `revision` so a viewer can tell a repeat selection of the same asset from a
   * no-op re-render and re-run its open action.
   */
  const selections = useMemo(() => Object.fromEntries(tabState.tabs.map(tab => [tab.tool, { assetId: tab.assetId, viewerId: tab.viewerId, runId: tab.runId, revision: tab.revision }])) as Record<string, WorkbenchSelection>, [tabState.tabs])
  const activeTab = tabState.tabs.find(tab => tab.id === tabState.activeId)
  const activeKey: ActiveKey = activeTab?.tool && activeTab.tool !== 'home' ? activeTab.tool : 'home'
  const [projectId, setProjectId] = useState<string>()
  const [registrationNeeded, setRegistrationNeeded] = useState(false)
  const [studies, setStudies] = useState<Study[]>([])
  const [selectedStudy, setSelectedStudy] = useState<string>()
  const [snapshot, setSnapshot] = useState<Snapshot>()
  const [engines, setEngines] = useState<Engine[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [newTitle, setNewTitle] = useState('新建科研研究')
  const [documentKind, setDocumentKind] = useState('observation')
  const [documentText, setDocumentText] = useState('{\n  "status": "unverified"\n}')
  const [rationale, setRationale] = useState('')
  const [taskName, setTaskName] = useState('数据侦察')
  const [taskKind, setTaskKind] = useState('data-scout')
  const [taskBudget, setTaskBudget] = useState('{\n  "tokens": 100\n}')
  const [reportLoading, setReportLoading] = useState(false)
  const [reportResult, setReportResult] = useState<{ mode: string; report?: { uri: string }; manifest?: { uri: string }; needsReview?: boolean; blockers?: string[] }>()
  const [assistantText, setAssistantText] = useState('')
  const [assistantBusy, setAssistantBusy] = useState(false)
  const [engineSettingsOpen, setEngineSettingsOpen] = useState(false)
  const requestGeneration = useRef(0)
  /** The dialog's only exit besides the scrim, so it holds the initial focus. */
  const engineDialogClose = useRef<HTMLButtonElement>(null)
  /**
   * Focus, keyboard exit and scroll lock for the engine dialog. A modal that
   * leaves the page scrollable behind it reads as a floating panel, and Escape
   * is the exit a keyboard user reaches for first.
   */
  useEffect(() => {
    if (!engineSettingsOpen) return
    engineDialogClose.current?.focus()
    const onKeyDown = (event: KeyboardEvent): void => { if (event.key === 'Escape') setEngineSettingsOpen(false) }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown); document.body.style.overflow = previousOverflow }
  }, [engineSettingsOpen])

  const sessionId = props.scope.sessionId
  useEffect(() => {
    // A new workbench starts with the cards. Old localStorage tab preferences
    // and Host event history are not viewer commands.
    dispatchTab({ type: 'restore', tabs: [], activeId: null })
  }, [sessionId])
  const selectTool = (id: ScienceToolId): void => {
    dispatchTab({ type: 'open', id, tool: id, title: t(LABEL_KEYS[id]), sessionId })
  }

  const load = async (nextStudyId?: string): Promise<void> => {
    const generation = ++requestGeneration.current
    setLoading(true); setMessage('')
    try {
      let project = sessionId && remote.projectForSession ? unwrapRemoteResult('zerowallResearch/projectForSession', await remote.projectForSession({ sessionId })) as { id: string } | undefined : undefined
      if (!project?.id && sessionId && remote.registerSessionProject) {
        project = unwrapRemoteResult('zerowallResearch/registerSessionProject', await remote.registerSessionProject({ sessionId })) as { id: string }
      }
      if (!project?.id) {
        if (generation === requestGeneration.current) { setProjectId(undefined); setRegistrationNeeded(true) }
        throw new Error('科研目录尚未就绪，请刷新后重试。')
      }
      const listed = unwrapRemoteResult('zerowallResearch/listResearchStudies', await remote.listResearchStudies(project.id)) as Study[]
      const bound = remote.getActiveResearchStudy ? unwrapRemoteResult('getActiveResearchStudy', await remote.getActiveResearchStudy({ sessionId })) as Study | undefined : undefined
      const requested = nextStudyId ?? bound?.id ?? selectedStudy
      const id = listed.some(study => study.id === requested) ? requested : listed[0]?.id
      const data = id ? unwrapRemoteResult('getResearchStudySnapshot', await remote.getResearchStudySnapshot(id)) as Snapshot : undefined
      if (id && data && typeof remote.getResearchTaskBudget === 'function') data.budget = unwrapRemoteResult('getResearchTaskBudget', await remote.getResearchTaskBudget(id)) as BudgetReport
      if (generation !== requestGeneration.current) return
      setProjectId(project.id); setRegistrationNeeded(false); setStudies(listed); setSnapshot(data); setSelectedStudy(id)
    } catch (error) { if (generation === requestGeneration.current) setMessage(error instanceof Error ? error.message : String(error)) }
    finally { if (generation === requestGeneration.current) setLoading(false) }
  }
  useEffect(() => {
    setProjectId(undefined); setRegistrationNeeded(false); setStudies([]); setSnapshot(undefined); setSelectedStudy(undefined); setRationale('')
    void load()
    return () => { requestGeneration.current++ }
  }, [remote, sessionId])
  useEffect(() => {
    let disposed = false
    if (remote.probeScientificEngines) void remote.probeScientificEngines({ sessionId }).then(value => {
      if (!disposed) setEngines(unwrapRemoteResult('probeScientificEngines', value) as Engine[])
    }).catch(error => { if (!disposed) setMessage(String(error)) })
    return () => { disposed = true }
  }, [remote])
  const active = useMemo(() => studies.find(study => study.id === selectedStudy) ?? studies[0], [studies, selectedStudy])
  const registerWorkspace = async (): Promise<void> => {
    const generation = requestGeneration.current
    setLoading(true)
    try {
      if (!sessionId || !remote.registerSessionProject) throw new Error('当前 Host 不支持工作区登记，请升级 Host。')
      unwrapRemoteResult('registerSessionProject', await remote.registerSessionProject({ sessionId }))
      if (generation === requestGeneration.current) await load()
    } catch (error) { if (generation === requestGeneration.current) setMessage(error instanceof Error ? error.message : String(error)) }
    finally { if (generation === requestGeneration.current) setLoading(false) }
  }
  const selectStudy = async (studyId: string): Promise<void> => {
    try {
      if (!sessionId || !remote.setActiveResearchStudy) throw new Error('当前会话不支持研究绑定。')
      unwrapRemoteResult('setActiveResearchStudy', await remote.setActiveResearchStudy({ sessionId, studyId }))
      setRationale(''); await load(studyId)
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) }
  }

  const createStudy = async (): Promise<void> => {
    try {
      if (!projectId) throw new Error('项目尚未加载。')
      const created = unwrapRemoteResult('zerowallResearch/createResearchStudy', await remote.createResearchStudy({ projectId, title: newTitle.trim(), phase: 'question', budget: { maxRemoteThreads: 8, maxMemoryGiB: 24 } })) as Study
      await selectStudy(created.id); setMessage('研究记录已创建。请先登记观察、数据契约、问题和分析计划。')
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) }
  }
  const createDocument = async (): Promise<void> => {
    try {
      if (!active || !projectId) throw new Error('请先选择研究。')
      const payload = JSON.parse(documentText) as JsonObject
      const document = unwrapRemoteResult('zerowallResearch/createResearchDocument', await remote.createResearchDocument({ projectId, studyId: active.id, kind: documentKind as ResearchRecordKind, payload })) as Document
      if (documentKind === 'question' || documentKind === 'analysis-plan') {
        const current = unwrapRemoteResult('getResearchStudy', await remote.getResearchStudy(active.id)) as Study
        unwrapRemoteResult('updateResearchStudy', await remote.updateResearchStudy({ id: active.id, changes: { expectedVersion: current.version, [documentKind === 'question' ? 'currentQuestionId' : 'currentPlanId']: document.id } }))
      }
      await load(active.id); setMessage(`已登记 ${documentKind}。`)
    } catch (error) { setMessage(error instanceof Error ? error.message : `JSON 无法解析：${String(error)}`) }
  }
  const approveGate = async (gate: 1 | 2): Promise<void> => {
    try {
      if (!active) throw new Error('请先选择研究。')
      const updated = unwrapRemoteResult('zerowallResearch/approveResearchGate', await remote.approveResearchGate({ studyId: active.id, gate, status: 'approved', expectedVersion: active.version, rationale })) as Study
      setStudies(items => items.map(item => item.id === updated.id ? updated : item)); await load(updated.id); setMessage(`门禁${gate}已记录为人工批准。`)
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) }
  }
  const freeze = async (): Promise<void> => {
    try {
      if (!active) throw new Error('请先选择研究。')
      unwrapRemoteResult('zerowallResearch/freezeResearchStudy', await remote.freezeResearchStudy({ studyId: active.id, expectedVersion: active.version })); await load(active.id); setMessage('研究方案已冻结；后续修改必须通过 amendment。')
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) }
  }
  const createTask = async (): Promise<void> => {
    try {
      if (!active || !projectId || typeof remote.createResearchTask !== 'function') throw new Error('当前 Host 不支持研究任务图。')
      const budget = JSON.parse(taskBudget) as JsonObject
      unwrapRemoteResult('createResearchTask', await remote.createResearchTask({ projectId, studyId: active.id, name: taskName.trim(), kind: taskKind.trim(), budget }))
      await load(active.id); setMessage('研究任务已登记。')
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) }
  }
  const refreshTasks = async (): Promise<void> => {
    try {
      if (!active || typeof remote.refreshResearchTaskReadiness !== 'function') throw new Error('当前 Host 不支持任务就绪刷新。')
      unwrapRemoteResult('refreshResearchTaskReadiness', await remote.refreshResearchTaskReadiness(active.id)); await load(active.id); setMessage('任务依赖状态已刷新。')
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) }
  }
  const reconcileTask = async (task: ResearchTask): Promise<void> => {
    try {
      if (typeof remote.reconcileResearchTaskRun !== 'function') throw new Error('当前 Host 不支持 Run 对账。')
      unwrapRemoteResult('reconcileResearchTaskRun', await remote.reconcileResearchTaskRun({ id: task.id })); await load(active?.id); setMessage('已按绑定 Run 对账任务状态。')
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) }
  }
  const generateReport = async (mode: 'draft' | 'final'): Promise<void> => {
    try {
      if (!active || !sessionId || typeof remote.generateResearchReport !== 'function') throw new Error('当前 Host 不支持 IMRAD 报告生成。')
      setReportLoading(true)
      const result = unwrapRemoteResult('generateResearchReport', await remote.generateResearchReport({ sessionId, studyId: active.id, mode })) as { mode: string; report?: { uri: string }; manifest?: { uri: string }; needsReview?: boolean; blockers?: string[] }
      setReportResult(result); setMessage(mode === 'final' ? '正式 IMRAD 报告已登记。' : 'IMRAD 报告草稿已登记，仍需人工审阅。')
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) }
    finally { setReportLoading(false) }
  }

  const renderTool = (id: ScienceToolId): JSX.Element => <>
    {id === 'cells' && <CellViewer remote={remote} sessionId={sessionId} viewOnly onPickFile={pickFile} />}
    {id === 'imagej' && <ReadOnlyImageViewer remote={remote} sessionId={sessionId} onPickFile={pickFile} />}
    {id === 'sequence' && <SequenceViewer remote={remote} sessionId={sessionId} viewOnly onPickFile={pickFile} />}
    {id === 'sanger' && <SangerViewer remote={remote} sessionId={sessionId} viewOnly onPickFile={pickFile} />}
    {id === 'flow' && <FlowViewer remote={remote} sessionId={sessionId} viewOnly onPickFile={pickFile} />}
    {id === 'he' && <ReadOnlyHeViewer remote={remote} sessionId={sessionId} onPickFile={pickFile} />}
    {id === 'molecule' && <MoleculeViewer remote={remote} sessionId={sessionId} viewOnly onPickFile={pickFile} />}
    {id === 'canvas' && <ReadOnlyCanvasViewer remote={remote} sessionId={sessionId} />}
    {id === 'brainglobe' && <BrainViewer remote={remote} sessionId={sessionId} viewOnly active={activeKey === 'brainglobe'} />}
  </>

  const openPage = (next: Page): void => {
    if (activeKey !== 'home') dispatchTab({ type: 'blur' })
    setPage(next)
  }
  /** A picked file is routed by format unless a viewer is explicitly open. */
  const assetTarget = (): ScienceToolId | undefined => {
    if (activeKey !== 'home') return activeKey
    return undefined
  }
  const openImportedAsset = (assetId: string, sourcePath: string, name: string): void => {
    const tool = scienceToolForImportedPath(sourcePath, assetTarget())
    if (!tool) { setMessage(`${name} 已登记，但没有可用的查看器。`); return }
    const current = tabState.tabs.find(tab => tab.tool === tool)
    const revision = (current?.revision ?? 0) + 1
    dispatchTab({ type: 'open', id: tool, tool, title: t(LABEL_KEYS[tool]), sessionId, projectId, assetId })
    dispatchTab({ type: 'select', id: tool, assetId, revision })
    setMessage(`已复制、校验并登记 ${name}；正在打开${t(LABEL_KEYS[tool])}。`)
  }
  /**
   * The shell's 选择文件 entry. It re-selects the asset the on-screen viewer
   * already holds, bumping `revision` so the viewer re-runs its open action. It
   * never navigates: a picker that left the tab was the bug the tool tabs
   * reported. With nothing to hand over it stays put and says why, because the
   * only other destination it could reach — the 数据与资料 page — is not a
   * chooser and would hide the very viewer the click was meant to fill.
   */
  const importExternalPath = async (sourcePath: string): Promise<void> => {
    if (!sessionId || !projectId) { setMessage('请先登记当前项目，再导入项目外的科研文件。'); return }
    if (!remote.importLocalAsset) { setMessage('当前科研 Host 不支持导入科研文件。'); return }
    const descriptor = cardFor(activeKey)
    if (descriptor && (descriptor.acceptedExtensions.length === 0 || !descriptor.acceptedExtensions.some(ext => sourcePath.toLowerCase().endsWith(ext)))) {
      setMessage(`${descriptor.title}不支持此文件；请选择 ${descriptor.acceptedExtensions.join('、') || '对应的查看动作'}。`)
      return
    }
    try {
      setMessage(`正在复制并校验 ${sourcePath.split(/[\\/]/u).at(-1) ?? '科研文件'}…`)
      const imported = unwrapRemoteResult('zerowallResearch/importLocalAsset', await remote.importLocalAsset({ sessionId, sourcePath })) as { id: string; name: string }
      openImportedAsset(imported.id, sourcePath, imported.name)
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) }
  }
  const pickFile = async (): Promise<void> => {
    const chooser = window.zerowallDesktop?.chooseScienceFile
    if (!chooser) { setMessage('当前桌面不支持选择科研文件。'); return }
    const extensions = cardFor(activeKey)?.acceptedExtensions.filter(ext => ext !== '.zarr')
    if (extensions?.length === 0) { setMessage('此查看器不接受普通文件，请使用对应的查看动作。'); return }
    const sourcePath = await chooser(extensions)
    if (sourcePath) await importExternalPath(sourcePath)
  }
  const sendToConversation = async (text: string): Promise<void> => {
    const trimmed = text.trim()
    if (!trimmed || !props.onSendMessage || assistantBusy) return
    setAssistantBusy(true)
    try { await props.onSendMessage(trimmed) } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) } finally { setAssistantBusy(false) }
  }
  const submitComposer = async (): Promise<void> => {
    const text = assistantText.trim()
    if (!text) return
    await sendToConversation(text)
    setAssistantText('')
  }
  // Action-card values are descriptor copy owned by a sibling module, so only the
  // documented vocabulary is honoured and an unknown card changes nothing.
  const runAction = (kind: 'prompt' | 'action', value: string): void => {
    if (kind === 'prompt') { void sendToConversation(value); return }
    const action = value.replace(/^page:/u, '')
    const destination = PAGE_BY_ACTION[action]
    if (destination) { openPage(destination); return }
    if (action === 'engine-settings' || action === 'engines') { setEngineSettingsOpen(true); return }
    if (action === 'refresh') { void load(); return }
    if (action === 'register-workspace') { void registerWorkspace(); return }
    // A card that asks for a file routes through the same selection path as the
    // sidebar entry, so both hand the viewer an asset instead of leaving the tab.
    if (action === 'pick-file' || action === 'open-from-conversation') { pickFile(); return }
  }

  const cardFor = (id: ActiveKey) => RESEARCH_TOOL_DESCRIPTORS.find(tool => tool.id === id)
  const tabs = TAB_ORDER.map(id => ({ id, label: cardFor(id)?.title ?? t(LABEL_KEYS[id]), icon: TAB_ICONS[id], ...(cardFor(id) ? { description: cardFor(id)!.description, image: cardFor(id)!.image } : {}) }))
  const overflow = OVERFLOW_ORDER.map(id => ({ id, label: cardFor(id)?.title ?? t(LABEL_KEYS[id]), ...(cardFor(id) ? { description: cardFor(id)!.description, image: cardFor(id)!.image } : {}) }))
  const descriptorTable = (descriptorModule as unknown as { toolDescriptors?: Record<ActiveKey, ShellDescriptor> }).toolDescriptors
  const descriptor = descriptorTable?.[activeKey] ?? descriptorTable?.home ?? ({} as ShellDescriptor)
  const statusHint = ''

  return <>
    <WorkbenchShell
      tabs={tabs}
      activeTab={activeKey}
      onSelectTab={id => { if (id === 'home') { setPage('overview'); dispatchTab({ type: 'blur' }) } else selectTool(id) }}
      descriptor={descriptor}
      headerActions={{ onEngineSettings: () => setEngineSettingsOpen(true) }}
      status={{ text: message, hint: statusHint }}
      composer={{
        value: assistantText,
        placeholder: props.onSendMessage ? t('research.workbench.composerPlaceholder') : t('research.workbench.composerUnavailable'),
        disabled: !props.onSendMessage || assistantBusy,
        busy: assistantBusy,
        onChange: setAssistantText,
        onSubmit: () => void submitComposer(),
      }}
      onAction={runAction}
      overflow={overflow}
    >
      {registrationNeeded && <section aria-label={t('research.workbench.registration')} className={workbenchStyles.panel}>
        <p>{t('research.workbench.registerIntro')}</p>
        <button type="button" disabled={loading || !sessionId} onClick={() => void registerWorkspace()}>{t('research.workbench.register')}</button>
      </section>}
      {activeKey === 'home' && <div className={workbenchStyles.homeShell}>
        {/* The research pages replace the old top-level tabs: they stay reachable as
            sidebar entries of the 主页 tab, in the approved card style. */}
        <nav className={workbenchStyles.pageNav} aria-label={t('research.workbench.sidebarTitle')}>
          {RESEARCH_PAGES.map(item => <button
            type="button" key={item.page} disabled={loading}
            className={page === item.page ? workbenchStyles.pageCardActive : workbenchStyles.pageCard}
            aria-current={page === item.page ? 'page' : undefined}
            onClick={() => openPage(item.page)}
          ><strong>{t(item.labelKey)}</strong><span>{t(item.hintKey)}</span></button>)}
        </nav>
        <div className={workbenchStyles.homeMain}>
          {page === 'overview' && <HomePage active={active} snapshot={snapshot} engines={engines} onOpenEngineSettings={() => setEngineSettingsOpen(true)} t={t} />}
          {page === 'overview' && <Overview studies={studies} active={active} newTitle={newTitle} setNewTitle={setNewTitle} selectedStudy={selectedStudy} selectStudy={id => { void selectStudy(id) }} createStudy={() => void createStudy()} t={t} />}
          {page === 'data' && <>{projectId && sessionId && <LocalAssetPanel remote={remote} sessionId={sessionId} onImported={(assetId, sourcePath, name) => openImportedAsset(assetId, sourcePath, name)} />}<DataPage active={active} snapshot={snapshot} documentKind={documentKind} setDocumentKind={setDocumentKind} documentText={documentText} setDocumentText={setDocumentText} createDocument={() => void createDocument()} t={t} /></>}
          {page === 'plan' && <PlanPage active={active} snapshot={snapshot} rationale={rationale} setRationale={setRationale} approveGate={() => void approveGate(1)} freeze={() => void freeze()} taskName={taskName} setTaskName={setTaskName} taskKind={taskKind} setTaskKind={setTaskKind} taskBudget={taskBudget} setTaskBudget={setTaskBudget} createTask={() => void createTask()} refreshTasks={() => void refreshTasks()} reconcileTask={task => void reconcileTask(task)} t={t} />}
          {page === 'evidence' && <EvidencePage active={active} snapshot={snapshot} rationale={rationale} setRationale={setRationale} approveGate={() => void approveGate(2)} t={t} />}
          {page === 'report' && <ReportPage active={active} result={reportResult} loading={reportLoading} generateReport={mode => void generateReport(mode)} t={t} />}
        </div>
      </div>}
      <div hidden={page !== 'plan'}>{sessionId && active && snapshot && <NhanesSurveyPanel key={`${sessionId}:${active.id}`} remote={remote} sessionId={sessionId} study={active} documents={snapshot.documents} tasks={snapshot.tasks ?? []} onChanged={() => load(active.id)} />}</div>
      <div hidden={page !== 'plan'}>{sessionId && active && snapshot && <GeneticAnalysisPanel key={`${sessionId}:${active.id}`} remote={remote} sessionId={sessionId} study={active} documents={snapshot.documents} tasks={snapshot.tasks ?? []} onChanged={() => load(active.id)} />}</div>
      {sessionId && projectId ? activeKey !== 'home' && <div id={`science-panel-${activeKey}`} key={`${sessionId}:${activeKey}`} role="tabpanel" aria-label={t(LABEL_KEYS[activeKey])} style={{ '--viewer-image': `url("${cardFor(activeKey)?.image ?? ''}")` } as CSSProperties}><WorkbenchSelectionContext.Provider value={selections[activeKey] ?? {}}>{renderTool(activeKey)}</WorkbenchSelectionContext.Provider></div> : <Panel title={t('research.workbench.sessionPendingTitle')}><p>{loading ? '正在准备科研目录…' : '科研目录尚未就绪，请刷新状态。'}</p></Panel>}
    </WorkbenchShell>
    {engineSettingsOpen && sessionId && <div className={workbenchStyles.dialogScrim} onMouseDown={event => { if (event.target === event.currentTarget) setEngineSettingsOpen(false) }}>
      <section className={workbenchStyles.engineDialog} role="dialog" aria-modal="true" aria-label={t('research.workbench.engineSettings')} onMouseDown={event => event.stopPropagation()}>
        <div className={workbenchStyles.dialogHeader}>
          <h3>{t('research.workbench.engineSettings')}</h3>
          <button type="button" ref={engineDialogClose} onClick={() => setEngineSettingsOpen(false)}>{t('science.shell.close')}</button>
        </div>
        {/* The body scrolls so a long native-engine list cannot push the close
            button off screen the way the old inset box did. */}
        <div className={workbenchStyles.dialogBody}>
          <ScientificEngineCenter remote={remote} sessionId={sessionId} />
          <details className={workbenchStyles.details}><summary>{t('research.workbench.nativeEngines')}</summary><NativeEnginePanel remote={remote} sessionId={sessionId} /></details>
        </div>
      </section>
    </div>}
  </>
}

/**
 * The 主页 tab's status strip. It is deliberately two panels: the counts and the
 * engines. The three-panel version repeated the page navigation that already
 * sits above it and the engine dialog trigger that the 引擎设置 action already
 * carries, and its explanatory paragraphs pushed the actual numbers off screen.
 */
function HomePage({ active, snapshot, engines, onOpenEngineSettings, t }: { active?: Study | undefined; snapshot?: Snapshot | undefined; engines: Engine[]; onOpenEngineSettings: () => void; t: Translate }): JSX.Element {
  // `active` feeds the workspace status only. The study title belongs to the
  // 概览 panel; repeating it here made the same title appear twice on one screen.
  const tasks = snapshot?.tasks ?? []
  const documents = snapshot?.documents ?? []
  const running = tasks.filter(task => task.status === 'running' || task.status === 'queued').length
  const artifacts = documents.filter(document => document.kind === 'evidence' || document.kind === 'claim').length
  return <div className={workbenchStyles.homeGrid}>
    <Panel title={t('research.workbench.recentActivity')}><div className={workbenchStyles.metricGrid}><StatusLine label={t('research.workbench.field.running')} value={String(running)} /><StatusLine label={t('research.workbench.field.artifacts')} value={String(artifacts)} /><StatusLine label={t('research.workbench.field.workspace')} value={active ? active.status : t('research.workbench.waitingRegistration')} /></div></Panel>
    <Panel title={t('research.workbench.engineStatus')}><div aria-live="polite">{engines.length ? engines.slice(0, 4).map(engine => <StatusLine key={engine.id} label={engine.name} value={engine.available ? `${t('research.workbench.available')}${engine.version ? ` · ${engine.version}` : ''}` : `${t('research.workbench.notConfigured')}${engine.reason ? ` · ${engine.reason}` : ''}`} />) : <p className={workbenchStyles.muted}>{t('research.workbench.probePending')}</p>}</div><div className={workbenchStyles.inline}><button type="button" onClick={onOpenEngineSettings}>{t('research.workbench.openEngineSettings')}</button></div></Panel>
  </div>
}

function Overview({ studies, active, newTitle, setNewTitle, selectedStudy, selectStudy, createStudy, t }: { studies: Study[]; active?: Study | undefined; newTitle: string; setNewTitle: (value: string) => void; selectedStudy?: string | undefined; selectStudy: (id: string) => void; createStudy: () => void; t: Translate }): JSX.Element {
  return <div className={workbenchStyles.grid}><Panel title={t('research.workbench.overview')}><StatusLine label={t('research.workbench.field.active')} value={active?.title ?? t('research.workbench.notCreated')} /><StatusLine label={t('research.workbench.field.stage')} value={active?.phase ?? 'question'} /><StatusLine label={t('research.workbench.field.status')} value={active?.status ?? 'draft'} /><StatusLine label={t('research.workbench.field.gate')} value={active ? `${t('research.workbench.field.gate1')} ${active.gate1} · ${t('research.workbench.field.gate2')} ${active.gate2}` : 'pending'} /></Panel><Panel title={t('research.workbench.studySelect')}><select aria-label={t('research.workbench.studySwitch')} value={selectedStudy ?? ''} onChange={event => selectStudy(event.target.value)}><option value="">{t('research.workbench.studySelect')}</option>{studies.map(study => <option key={study.id} value={study.id}>{study.title} · v{study.version}</option>)}</select><div className={workbenchStyles.inline}><input aria-label={t('research.workbench.studyTitle')} value={newTitle} onChange={event => setNewTitle(event.target.value)} /><button type="button" onClick={createStudy}>{t('research.workbench.newStudy')}</button></div><p>{t('research.workbench.genericStudyHint')}</p></Panel></div>
}

function DataPage({ active, snapshot, documentKind, setDocumentKind, documentText, setDocumentText, createDocument, t }: { active?: Study | undefined; snapshot?: Snapshot | undefined; documentKind: string; setDocumentKind: (value: string) => void; documentText: string; setDocumentText: (value: string) => void; createDocument: () => void; t: Translate }): JSX.Element {
  return <div className={workbenchStyles.grid}><Panel title={t('research.workbench.pages.data')}><StatusLine label={t('research.workbench.field.study')} value={active?.title ?? t('research.workbench.notSelected')} /><p>{t('research.workbench.contractHint')}</p><div className={workbenchStyles.inline}><select aria-label={t('research.workbench.recordType')} value={documentKind} onChange={event => setDocumentKind(event.target.value)}>{['observation', 'dataset-contract', 'question', 'analysis-plan', 'evidence', 'claim'].map(kind => <option key={kind}>{kind}</option>)}</select><button type="button" onClick={createDocument}>{t('research.workbench.registerRecord')}</button></div><textarea aria-label={t('research.workbench.recordJson')} value={documentText} onChange={event => setDocumentText(event.target.value)} rows={8} className={workbenchStyles.textarea} /></Panel><Panel title={t('research.workbench.records')}>{snapshot?.documents.length ? <ul>{snapshot.documents.map(document => <li key={document.id}><code>{document.kind}</code> · v{document.version} · {document.updatedAt}</li>)}</ul> : <p>{t('research.workbench.noRecords')}</p>}</Panel></div>
}

function PlanPage({ active, snapshot, rationale, setRationale, approveGate, freeze, taskName, setTaskName, taskKind, setTaskKind, taskBudget, setTaskBudget, createTask, refreshTasks, reconcileTask, t }: { active?: Study | undefined; snapshot?: Snapshot | undefined; rationale: string; setRationale: (value: string) => void; approveGate: () => void; freeze: () => void; taskName: string; setTaskName: (value: string) => void; taskKind: string; setTaskKind: (value: string) => void; taskBudget: string; setTaskBudget: (value: string) => void; createTask: () => void; refreshTasks: () => void; reconcileTask: (task: ResearchTask) => void; t: Translate }): JSX.Element {
  const tasks = snapshot?.tasks ?? []
  const budget = snapshot?.budget
  return <div className={workbenchStyles.grid}><Panel title={t('research.workbench.pages.plan')}><StatusLine label={t('research.workbench.field.gate1')} value={active?.gate1 ?? 'pending'} /><StatusLine label={t('research.workbench.field.freeze')} value={active?.currentFreezeId ?? t('research.workbench.notCreated')} /><p>{t('research.workbench.planIntro')}</p><textarea aria-label={t('research.workbench.reviewRationale')} value={rationale} onChange={event => setRationale(event.target.value)} rows={3} className={workbenchStyles.textarea} /><div className={workbenchStyles.inline}><button type="button" onClick={approveGate} disabled={!active || active.gate1 === 'approved'}>{t('research.workbench.approveGate1')}</button><button type="button" onClick={freeze} disabled={!active || active.gate1 !== 'approved' || Boolean(active.currentFreezeId)}>{t('research.workbench.freezePlan')}</button></div></Panel><Panel title={t('research.workbench.taskGraph')}><p>{t('research.workbench.taskGraphHint')}</p>{budget && <div><StatusLine label={t('research.workbench.budget')} value={budget.accounting} />{Object.keys(budget.usage).map(key => <StatusLine key={key} label={key} value={`${budget.usage[key]} · ${t('research.workbench.available2')} ${budget.available[key]}`} />)}</div>}<div className={workbenchStyles.inline}><input aria-label={t('research.workbench.taskName')} value={taskName} onChange={event => setTaskName(event.target.value)} /><input aria-label={t('research.workbench.taskKind')} value={taskKind} onChange={event => setTaskKind(event.target.value)} /><button type="button" onClick={createTask} disabled={!active}>{t('research.workbench.taskRegister')}</button><button type="button" onClick={refreshTasks} disabled={!active}>{t('research.workbench.taskRefresh')}</button></div><textarea aria-label={t('research.workbench.taskBudget')} value={taskBudget} onChange={event => setTaskBudget(event.target.value)} rows={3} className={workbenchStyles.textarea} />{tasks.length ? <ul>{tasks.map(task => <li key={task.id}><strong>{task.name}</strong> · <code>{task.status}</code> · attempt {task.attempt}{task.exploratory ? ` · ${t('research.workbench.exploratory')}` : ''}{task.dependencies.length ? ` · ${t('research.workbench.dependency')} ${task.dependencies.length}` : ''}{task.error ? ` · ${task.error}` : ''}{task.status === 'running' && <button type="button" onClick={() => reconcileTask(task)}>{t('research.workbench.reconcile')}</button>}</li>)}</ul> : <p>{t('research.workbench.noTasks')}</p>}</Panel></div>
}

function EvidencePage({ active, snapshot, rationale, setRationale, approveGate, t }: { active?: Study | undefined; snapshot?: Snapshot | undefined; rationale: string; setRationale: (value: string) => void; approveGate: () => void; t: Translate }): JSX.Element {
  const claims = snapshot?.documents.filter(document => document.kind === 'claim') ?? []
  return <Panel title={t('research.workbench.pages.evidence')}><StatusLine label={t('research.workbench.field.gate2')} value={active?.gate2 ?? 'pending'} /><StatusLine label={t('research.workbench.field.claims')} value={`${claims.length}`} /><p>{t('research.workbench.evidenceHint')}</p><textarea aria-label={t('research.workbench.finalRationale')} value={rationale} onChange={event => setRationale(event.target.value)} rows={3} className={workbenchStyles.textarea} /><button type="button" onClick={approveGate} disabled={!active || !active.currentFreezeId}>{t('research.workbench.approveGate2')}</button></Panel>
}
function ReportPage({ active, result, loading, generateReport, t }: { active?: Study | undefined; result?: { mode: string; report?: { uri: string }; manifest?: { uri: string }; needsReview?: boolean; blockers?: string[] } | undefined; loading: boolean; generateReport: (mode: 'draft' | 'final') => void; t: Translate }): JSX.Element {
  return <Panel title={t('research.workbench.pages.report')}><p>{t('research.workbench.reportHint')}</p><StatusLine label={t('research.workbench.field.active')} value={active?.title ?? t('research.workbench.notSelected')} /><StatusLine label={t('research.workbench.field.status')} value={active?.status ?? t('research.workbench.notCreated')} /><div className={workbenchStyles.inline}><button type="button" disabled={!active || loading} onClick={() => generateReport('draft')}>{loading ? t('research.workbench.generating') : t('research.workbench.draftReport')}</button><button type="button" disabled={!active || loading || active.gate2 !== 'approved'} onClick={() => generateReport('final')}>{t('research.workbench.finalReport')}</button></div>{result && <div role="status"><StatusLine label={t('research.workbench.field.mode')} value={result.mode} /><StatusLine label={t('research.workbench.field.review')} value={result.needsReview ? t('research.workbench.needsReview') : t('research.workbench.deliverable')} /><p>{t('research.workbench.report')}：<code>{result.report?.uri}</code><br />{t('research.workbench.manifest')}：<code>{result.manifest?.uri}</code></p>{result.blockers?.length ? <p>{t('research.workbench.blockers')}：{result.blockers.join('；')}</p> : null}</div>}</Panel>
}

function Panel({ title, children }: { title: string; children: ReactNode }): JSX.Element { return <section className={workbenchStyles.panel}><h3>{title}</h3>{children}</section> }
function StatusLine({ label, value }: { label: string; value: string }): JSX.Element { return <div className={workbenchStyles.status}><strong>{label}</strong><span>{value}</span></div> }
