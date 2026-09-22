import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { TabComponentProps } from 'dsh-better-sidebar/client/service'
import { unwrapRemoteResult } from '../../../base/src/shared/client-helpers.ts'
import type {} from '../../lib/typert.remote-client.js'
import type { TypertRemoteNamespaceMap } from '@deepseek-ai/dsh-typert-protocol'
import type { JsonObject, ResearchRecordKind } from '@zerowallscience/research-store/types'
import { SequenceViewer } from './sequence-viewer.js'
import { NativeEnginePanel } from './native-engine-panel.js'
import { ImageViewer } from './image-viewer.js'
import { SangerViewer } from './sanger-viewer.js'
import { FlowViewer } from './flow-viewer.js'
import { HeViewer } from './he-viewer.js'
import { MoleculeViewer } from './molecule-viewer.js'
import { CanvasViewer } from './canvas-viewer.js'
import { FijiExperimentPanel } from './fiji-experiment-panel.js'
import { CellViewer } from './cell-viewer.js'
import { BrainViewer } from './brain-viewer.js'
import { NhanesSurveyPanel } from './nhanes-survey-panel.js'
import { GeneticAnalysisPanel } from './genetic-analysis-panel.js'
import { PilotEvaluationPanel } from './pilot-evaluation-panel.js'
import { LocalAssetPanel } from './local-asset-panel.js'

type Page = 'overview' | 'data' | 'plan' | 'tools' | 'evidence' | 'report'
type Study = { id: string; projectId: string; title: string; phase: string; status: string; gate1: string; gate2: string; version: number; currentQuestionId?: string; currentPlanId?: string; currentFreezeId?: string }
type Document = { id: string; kind: string; payload: Record<string, unknown>; version: number; updatedAt: string }
type Snapshot = { study: Study; documents: Document[]; freezes: Array<{ id: string; version: number; createdAt: string; snapshot: Record<string, unknown> }>; tasks?: ResearchTask[]; budget?: BudgetReport }
type ResearchTask = { id: string; name: string; kind: string; status: string; dependencies: string[]; attempt: number; exploratory: boolean; error?: string; runId?: string }
type BudgetReport = { accounting: string; limits: Record<string, number>; usage: Record<string, number>; available: Record<string, number>; exceeded: string[]; reservations: Array<{ taskId: string; attempt: number }> }
type Engine = { id: string; name: string; available: boolean; path?: string; version?: string; reason?: string }
type Remote = TypertRemoteNamespaceMap['zerowallResearch']
type Tool = { id: string; name: string; formats: string; location: string; state: 'ready' | 'partial' | 'planned' }

const tools: Tool[] = [
  { id: 'cells', name: '细胞查看器', formats: 'H5AD · UMAP/PCA · QC · marker', location: '内置查看 + OmicVerse 远程', state: 'partial' },
  { id: 'imagej', name: 'ImageJ / 多维图像', formats: 'TIFF · OME-TIFF · OME-Zarr · ROI', location: '本地 Fiji / napari', state: 'partial' },
  { id: 'he', name: 'HE 查看器', formats: 'SVS · NDPI · TIFF · 金字塔/标定 · CPU StarDist分块核分割/标签/计数', location: 'OpenSlide + 内置多层查看', state: 'partial' },
  { id: 'structure', name: '分子结构', formats: 'PDB · mmCIF · 链/残基 · 测距 · 表面 · SDF · 视角/PNG/结构导出 · Vina远程对接', location: '本地 Mol* 5.11.0', state: 'partial' },
  { id: 'sequence', name: 'Motif 序列工作台', formats: 'FASTA/GenBank · 环形/线性注释图谱 · 反向互补 · 翻译 · 五种限制酶 · PCR/Gibson/GoldenGate · SpCas9/NGG候选', location: '本地确定性计算', state: 'partial' },
  { id: 'sanger', name: 'Sanger 峰图', formats: 'SCF/AB1 · 四色峰 · 质量裁剪 · 参考比对 · 双向核对', location: '内置解析', state: 'partial' },
  { id: 'flow', name: '流式细胞', formats: 'FCS 3.0 · 补偿 · arcsinh · 矩形门控 · GatingML 子集', location: '内置交互；远程批处理待部署', state: 'partial' },
  { id: 'canvas', name: '科研画布', formats: '多面板 · 坐标轴/图例/配色 · SVG/PNG/PDF/工程 · 源数据溯源', location: '内置确定性渲染', state: 'partial' },
  { id: 'brainglobe', name: '脑图谱', formats: 'Allen 小鼠 25 µm · 脑区查询 · 坐标映射', location: '独立 BrainGlobe 引擎', state: 'partial' },
]
const pages: Array<[Page, string]> = [['overview', '研究概览'], ['data', '数据与资料'], ['plan', '研究计划'], ['tools', '专业工具'], ['evidence', '证据与结论'], ['report', '报告与评估']]

export function ScienceWorkbench(props: TabComponentProps & { remote: Remote }): JSX.Element {
  const remote = props.remote
  const [page, setPage] = useState<Page>('overview')
  const [toolsOpened, setToolsOpened] = useState(false)
  const [openedTools, setOpenedTools] = useState<string[]>([])
  const [activeTool, setActiveTool] = useState('')
  const [projectId, setProjectId] = useState<string>()
  const [registrationNeeded, setRegistrationNeeded] = useState(false)
  const [studies, setStudies] = useState<Study[]>([])
  const [selectedStudy, setSelectedStudy] = useState<string>()
  const [snapshot, setSnapshot] = useState<Snapshot>()
  const [engines, setEngines] = useState<Engine[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [newTitle, setNewTitle] = useState('肥胖—脱发先导研究')
  const [documentKind, setDocumentKind] = useState('observation')
  const [documentText, setDocumentText] = useState('{\n  "status": "unverified"\n}')
  const [rationale, setRationale] = useState('')
  const [taskName, setTaskName] = useState('数据侦察')
  const [taskKind, setTaskKind] = useState('data-scout')
  const [taskBudget, setTaskBudget] = useState('{\n  "tokens": 100\n}')
  const [reconLoading, setReconLoading] = useState(false)
  const [reportLoading, setReportLoading] = useState(false)
  const [reportResult, setReportResult] = useState<{ mode: string; report?: { uri: string }; manifest?: { uri: string }; needsReview?: boolean; blockers?: string[] }>()
  const requestGeneration = useRef(0)

  const sessionId = props.scope.sessionId
  useEffect(() => {
    let opened: string[] = []; let active = ''
    try {
      const saved = JSON.parse(localStorage.getItem(`zerowall:science-tools:${sessionId}`) ?? '{}')
      opened = Array.isArray(saved.opened) ? [...new Set<string>(saved.opened.filter((id: unknown) => tools.some(tool => tool.id === id)))] : []
      active = opened.includes(saved.active) ? saved.active : opened[0] ?? ''
    } catch { /* A malformed UI preference cannot prevent opening the workbench. */ }
    setOpenedTools(opened); setActiveTool(active)
  }, [sessionId])
  const selectTool = (id: string): void => {
    const opened = openedTools.includes(id) ? openedTools : [...openedTools, id]
    setOpenedTools(opened); setActiveTool(id)
    try { localStorage.setItem(`zerowall:science-tools:${sessionId}`, JSON.stringify({ opened, active: id })) } catch { /* Viewer data is persisted by Host independently. */ }
  }
  const closeTool = (id: string): void => {
    const opened = openedTools.filter(tool => tool !== id)
    const active = activeTool === id ? opened[Math.max(0, openedTools.indexOf(id) - 1)] ?? opened[0] ?? '' : activeTool
    setOpenedTools(opened); setActiveTool(active)
    try { localStorage.setItem(`zerowall:science-tools:${sessionId}`, JSON.stringify({ opened, active })) } catch { /* Closing a view does not cancel its persistent task. */ }
  }

  const load = async (nextStudyId?: string): Promise<void> => {
    const generation = ++requestGeneration.current
    setLoading(true); setMessage('')
    try {
      const project = sessionId && remote.projectForSession ? unwrapRemoteResult('zerowallResearch/projectForSession', await remote.projectForSession({ sessionId })) as { id: string } | undefined : undefined
      if (!project?.id) {
        if (generation === requestGeneration.current) { setProjectId(undefined); setRegistrationNeeded(true) }
        throw new Error('当前工作区尚未登记。登记后可以查看资产和保存分析；研究方案可按需建立。')
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
    if (page === 'tools') setToolsOpened(true)
  }, [page])
  useEffect(() => {
    setProjectId(undefined); setRegistrationNeeded(false); setStudies([]); setSnapshot(undefined); setSelectedStudy(undefined); setRationale('')
    void load()
    return () => { requestGeneration.current++ }
  }, [remote, sessionId])
  useEffect(() => {
    let disposed = false
    if (remote.probeScientificEngines) void remote.probeScientificEngines().then(value => {
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
  const createPilot = async (): Promise<void> => {
    try { if (!projectId) throw new Error('项目尚未加载。'); const result = unwrapRemoteResult('zerowallResearch/createObesityAlopeciaPilot', await remote.createObesityAlopeciaPilot(projectId)) as Snapshot; setSnapshot(result); setSelectedStudy(result.study.id); if (sessionId && remote.setActiveResearchStudy) unwrapRemoteResult('setActiveResearchStudy', await remote.setActiveResearchStudy({ sessionId, studyId: result.study.id })); await load(result.study.id); setMessage('先导模板已建立，所有表型仍处于待核验状态。') }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)) }
  }
  const runPilotRecon = async (): Promise<void> => {
    try {
      if (!active || !sessionId || typeof remote.runObesityAlopeciaRecon !== 'function') throw new Error('当前 Host 不支持肥胖—脱发目录侦察。')
      setReconLoading(true)
      const result = unwrapRemoteResult('runObesityAlopeciaRecon', await remote.runObesityAlopeciaRecon({ sessionId, studyId: active.id })) as { record?: { status?: string } }
      await load(active.id)
      setMessage(`目录侦察已完成：${result.record?.status ?? '结果已登记'}。未选择具体脱发表型，需在门禁一前核验周期与代码本。`)
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) }
    finally { setReconLoading(false) }
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

  return <div style={styles.root}>
    <header style={styles.header}><div><h2 style={{ margin: 0 }}>科研可视化与分析工作台</h2><small>ZeroWall Science 7.0.0 · 研究记录、专业工具与远程计算</small></div><button type="button" onClick={() => void load()} disabled={loading}>{loading ? '检查中…' : '刷新状态'}</button></header>
    <nav style={styles.nav} aria-label="工作台页面">{pages.map(([id, label]) => <button type="button" key={id} onClick={() => setPage(id)} aria-pressed={page === id}>{label}</button>)}</nav>
    {message && <div role="status" style={styles.message}>{message}</div>}
    {registrationNeeded && <section aria-label="工作区登记" style={styles.panel}><p>登记当前会话目录以保存资产、任务和查看状态。原始文件保留在当前目录。</p><button type="button" disabled={loading || !sessionId} onClick={() => void registerWorkspace()}>登记当前工作区</button></section>}
    {page === 'overview' && <Overview studies={studies} active={active} newTitle={newTitle} setNewTitle={setNewTitle} selectedStudy={selectedStudy} selectStudy={id => { void selectStudy(id) }} createStudy={() => void createStudy()} createPilot={() => void createPilot()} runPilotRecon={() => void runPilotRecon()} reconLoading={reconLoading} />}
    {page === 'data' && <>{projectId && sessionId && <LocalAssetPanel remote={remote} sessionId={sessionId} />}<DataPage active={active} snapshot={snapshot} documentKind={documentKind} setDocumentKind={setDocumentKind} documentText={documentText} setDocumentText={setDocumentText} createDocument={() => void createDocument()} /></>}
    {page === 'plan' && <PlanPage active={active} snapshot={snapshot} rationale={rationale} setRationale={setRationale} approveGate={() => void approveGate(1)} freeze={() => void freeze()} taskName={taskName} setTaskName={setTaskName} taskKind={taskKind} setTaskKind={setTaskKind} taskBudget={taskBudget} setTaskBudget={setTaskBudget} createTask={() => void createTask()} refreshTasks={() => void refreshTasks()} reconcileTask={task => void reconcileTask(task)} />}
    <div hidden={page !== 'plan'}>{sessionId && active && snapshot && <NhanesSurveyPanel key={`${sessionId}:${active.id}`} remote={remote} sessionId={sessionId} study={active} documents={snapshot.documents} tasks={snapshot.tasks ?? []} onChanged={() => load(active.id)} />}</div>
    <div hidden={page !== 'plan'}>{sessionId && active && snapshot && <GeneticAnalysisPanel key={`${sessionId}:${active.id}`} remote={remote} sessionId={sessionId} study={active} documents={snapshot.documents} tasks={snapshot.tasks ?? []} onChanged={() => load(active.id)} />}</div>
    <div hidden={page !== 'tools'}><Tools engines={engines} onOpen={selectTool} />{toolsOpened && sessionId && <div key={sessionId}>
      {openedTools.length > 0 && <div role="tablist" aria-label="已打开的专业工具" style={{ ...styles.nav, marginTop: 16 }}>{openedTools.map(id => <span key={id} style={{ display: 'inline-flex' }}><button type="button" role="tab" id={`science-tool-${id}`} aria-selected={activeTool === id} aria-controls={`science-panel-${id}`} onClick={() => selectTool(id)}>{tools.find(tool => tool.id === id)?.name}</button><button type="button" aria-label={`关闭${tools.find(tool => tool.id === id)?.name}视图`} title="仅关闭视图；分析任务继续运行" onClick={() => closeTool(id)}>×</button></span>)}</div>}
      {openedTools.map(id => <section key={id} role="tabpanel" id={`science-panel-${id}`} aria-labelledby={`science-tool-${id}`} hidden={activeTool !== id}>
        {id === 'cells' && <CellViewer remote={remote} sessionId={sessionId} />}
        {id === 'imagej' && <><ImageViewer remote={remote} sessionId={sessionId} /><NativeEnginePanel remote={remote} sessionId={sessionId} /><FijiExperimentPanel remote={remote} sessionId={sessionId} /></>}
        {id === 'sequence' && <SequenceViewer remote={remote} sessionId={sessionId} />}
        {id === 'sanger' && <SangerViewer remote={remote} sessionId={sessionId} />}
        {id === 'flow' && <FlowViewer remote={remote} sessionId={sessionId} />}
        {id === 'he' && <HeViewer remote={remote} sessionId={sessionId} />}
        {id === 'structure' && <MoleculeViewer remote={remote} sessionId={sessionId} />}
        {id === 'canvas' && <CanvasViewer remote={remote} sessionId={sessionId} />}
        {id === 'brainglobe' && <BrainViewer remote={remote} sessionId={sessionId} />}
      </section>)}
    </div>}</div>
    {page === 'evidence' && <EvidencePage active={active} snapshot={snapshot} rationale={rationale} setRationale={setRationale} approveGate={() => void approveGate(2)} />}
    {page === 'report' && <><ReportPage active={active} result={reportResult} loading={reportLoading} generateReport={mode => void generateReport(mode)} />{active && sessionId && <PilotEvaluationPanel remote={remote} sessionId={sessionId} studyId={active.id} />}</>}
  </div>
}

function Overview({ studies, active, newTitle, setNewTitle, selectedStudy, selectStudy, createStudy, createPilot, runPilotRecon, reconLoading }: { studies: Study[]; active?: Study | undefined; newTitle: string; setNewTitle: (value: string) => void; selectedStudy?: string | undefined; selectStudy: (id: string) => void; createStudy: () => void; createPilot: () => void; runPilotRecon: () => void; reconLoading: boolean }): JSX.Element {
  return <div style={styles.grid}><Panel title="研究概览"><StatusLine label="当前研究" value={active?.title ?? '尚未建立'} /><StatusLine label="阶段" value={active?.phase ?? 'question'} /><StatusLine label="状态" value={active?.status ?? 'draft'} /><StatusLine label="人工门禁" value={active ? `门禁一 ${active.gate1} · 门禁二 ${active.gate2}` : 'pending'} /></Panel><Panel title="研究记录"><select aria-label="选择研究" value={selectedStudy ?? ''} onChange={event => selectStudy(event.target.value)}><option value="">选择研究</option>{studies.map(study => <option key={study.id} value={study.id}>{study.title} · v{study.version}</option>)}</select><div style={styles.inline}><input aria-label="研究标题" value={newTitle} onChange={event => setNewTitle(event.target.value)} /><button type="button" onClick={createStudy}>新建研究</button><button type="button" onClick={createPilot}>建立肥胖—脱发先导模板</button><button type="button" onClick={runPilotRecon} disabled={!active || reconLoading}>{reconLoading ? '侦察中…' : '运行目录侦察'}</button></div><p>创建后按观察核验 → 数据契约 → 问题 → 分析计划 → 门禁一推进。目录侦察只核验变量元数据，不选择结局或预设阳性结果。</p></Panel></div>
}

function DataPage({ active, snapshot, documentKind, setDocumentKind, documentText, setDocumentText, createDocument }: { active?: Study | undefined; snapshot?: Snapshot | undefined; documentKind: string; setDocumentKind: (value: string) => void; documentText: string; setDocumentText: (value: string) => void; createDocument: () => void }): JSX.Element {
  return <div style={styles.grid}><Panel title="数据与资料"><StatusLine label="研究" value={active?.title ?? '未选择'} /><p>数据契约需记录版本、变量、单位、观察单位、供者、祖源、权重、缺失、权限和独立性。未知值保持未知。</p><div style={styles.inline}><select aria-label="记录类型" value={documentKind} onChange={event => setDocumentKind(event.target.value)}>{['observation', 'dataset-contract', 'question', 'analysis-plan', 'evidence', 'claim'].map(kind => <option key={kind}>{kind}</option>)}</select><button type="button" onClick={createDocument}>登记记录</button></div><textarea aria-label="记录 JSON" value={documentText} onChange={event => setDocumentText(event.target.value)} rows={8} style={styles.textarea} /></Panel><Panel title="已登记记录">{snapshot?.documents.length ? <ul>{snapshot.documents.map(document => <li key={document.id}><code>{document.kind}</code> · v{document.version} · {document.updatedAt}</li>)}</ul> : <p>暂无记录。</p>}</Panel></div>
}

function PlanPage({ active, snapshot, rationale, setRationale, approveGate, freeze, taskName, setTaskName, taskKind, setTaskKind, taskBudget, setTaskBudget, createTask, refreshTasks, reconcileTask }: { active?: Study | undefined; snapshot?: Snapshot | undefined; rationale: string; setRationale: (value: string) => void; approveGate: () => void; freeze: () => void; taskName: string; setTaskName: (value: string) => void; taskKind: string; setTaskKind: (value: string) => void; taskBudget: string; setTaskBudget: (value: string) => void; createTask: () => void; refreshTasks: () => void; reconcileTask: (task: ResearchTask) => void }): JSX.Element {
  const tasks = snapshot?.tasks ?? []
  const budget = snapshot?.budget
  return <div style={styles.grid}><Panel title="研究计划"><StatusLine label="门禁一" value={active?.gate1 ?? 'pending'} /><StatusLine label="冻结版本" value={active?.currentFreezeId ?? '尚未冻结'} /><p>冻结前必须存在当前问题、合格数据契约和完整分析计划。冻结后通过 amendment 建立新版本。</p><textarea aria-label="人工审阅理由" value={rationale} onChange={event => setRationale(event.target.value)} rows={3} style={styles.textarea} /><div style={styles.inline}><button type="button" onClick={approveGate} disabled={!active || active.gate1 === 'approved'}>人工批准门禁一</button><button type="button" onClick={freeze} disabled={!active || active.gate1 !== 'approved' || Boolean(active.currentFreezeId)}>冻结研究方案</button></div></Panel><Panel title="任务图"><p>任务依赖、失败阻断和尝试次数保存在研究记录中。累计预算按每次声明的估算额度计费；并发资源在任务终态时释放。</p>{budget && <div><StatusLine label="预算记账" value={budget.accounting} />{Object.keys(budget.usage).map(key => <StatusLine key={key} label={key} value={`${budget.usage[key]} · 可用 ${budget.available[key]}`} />)}</div>}<div style={styles.inline}><input aria-label="任务名称" value={taskName} onChange={event => setTaskName(event.target.value)} /><input aria-label="任务类型" value={taskKind} onChange={event => setTaskKind(event.target.value)} /><button type="button" onClick={createTask} disabled={!active}>登记任务</button><button type="button" onClick={refreshTasks} disabled={!active}>刷新依赖</button></div><textarea aria-label="任务预算 JSON" value={taskBudget} onChange={event => setTaskBudget(event.target.value)} rows={3} style={styles.textarea} />{tasks.length ? <ul>{tasks.map(task => <li key={task.id}><strong>{task.name}</strong> · <code>{task.status}</code> · attempt {task.attempt}{task.exploratory ? ' · 探索' : ''}{task.dependencies.length ? ` · 依赖 ${task.dependencies.length}` : ''}{task.error ? ` · ${task.error}` : ''}{task.status === 'running' && <button type="button" onClick={() => reconcileTask(task)}>Run 对账</button>}</li>)}</ul> : <p>尚未建立任务。</p>}</Panel></div>
}

function EvidencePage({ active, snapshot, rationale, setRationale, approveGate }: { active?: Study | undefined; snapshot?: Snapshot | undefined; rationale: string; setRationale: (value: string) => void; approveGate: () => void }): JSX.Element {
  const claims = snapshot?.documents.filter(document => document.kind === 'claim') ?? []
  return <Panel title="证据与结论"><StatusLine label="门禁二" value={active?.gate2 ?? 'pending'} /><StatusLine label="核心主张" value={`${claims.length} 条`} /><p>计算成功、证据通过检查和人工认可主张分别记录。冲突、阴性、失败和合理停止不能被隐藏。</p><textarea aria-label="最终主张审阅理由" value={rationale} onChange={event => setRationale(event.target.value)} rows={3} style={styles.textarea} /><button type="button" onClick={approveGate} disabled={!active || !active.currentFreezeId}>人工批准门禁二</button></Panel>
}
function ReportPage({ active, result, loading, generateReport }: { active?: Study | undefined; result?: { mode: string; report?: { uri: string }; manifest?: { uri: string }; needsReview?: boolean; blockers?: string[] } | undefined; loading: boolean; generateReport: (mode: 'draft' | 'final') => void }): JSX.Element {
  return <Panel title="报告与评估"><p>IMRAD 报告只读取 ResearchStore 中已登记的问题、数据契约、计划、证据、主张和任务；草稿可生成，正式版要求门禁二和主张审计通过。</p><StatusLine label="当前研究" value={active?.title ?? '未选择'} /><StatusLine label="状态" value={active?.status ?? '未建立'} /><div style={styles.inline}><button type="button" disabled={!active || loading} onClick={() => generateReport('draft')}>{loading ? '生成中…' : '生成 IMRAD 草稿'}</button><button type="button" disabled={!active || loading || active.gate2 !== 'approved'} onClick={() => generateReport('final')}>生成正式报告</button></div>{result && <div role="status"><StatusLine label="报告模式" value={result.mode} /><StatusLine label="复核状态" value={result.needsReview ? '需要人工复核' : '可交付'} /><p>报告：<code>{result.report?.uri}</code><br />清单：<code>{result.manifest?.uri}</code></p>{result.blockers?.length ? <p>阻断：{result.blockers.join('；')}</p> : null}</div>}</Panel>
}

function Tools({ engines, onOpen }: { engines: Engine[]; onOpen: (id: string) => void }): JSX.Element { return <div style={styles.grid}><Panel title="专业工具"><div style={styles.cards}>{tools.map(tool => <article key={tool.id} style={styles.card}><strong>{tool.name}</strong><p>{tool.formats}</p><small>{tool.location}</small><div style={{ marginTop: 8, color: tool.state === 'ready' ? 'var(--dsw-color-success)' : tool.state === 'partial' ? 'var(--dsw-color-warning)' : 'var(--dsw-alias-label-secondary)' }}>{tool.state === 'ready' ? '可用' : tool.state === 'partial' ? '基础能力可用，深度流程建设中' : '计划中，尚未宣称可用'}</div><button type="button" style={{ marginTop: 10 }} onClick={() => onOpen(tool.id)} aria-label={`打开${tool.name}`}>打开工具</button></article>)}</div></Panel><Panel title="本地引擎健康状态">{engines.length ? engines.map(engine => <StatusLine key={engine.id} label={engine.name} value={`${engine.available ? '可用' : '不可用'} · ${engine.version ?? engine.reason ?? ''}`} />) : <p>尚未完成引擎探测。</p>}</Panel></div> }
function Panel({ title, children }: { title: string; children: ReactNode }): JSX.Element { return <section style={styles.panel}><h3 style={{ marginTop: 0 }}>{title}</h3>{children}</section> }
function StatusLine({ label, value }: { label: string; value: string }): JSX.Element { return <div style={styles.status}><strong>{label}</strong><span>{value}</span></div> }
const styles = { root: { fontFamily: 'Segoe UI, Microsoft YaHei, system-ui, sans-serif', fontSize: 14, lineHeight: 1.55, height: '100%', overflow: 'auto', padding: 16, color: 'var(--dsw-alias-label-primary)' }, header: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 14 }, nav: { display: 'flex', flexWrap: 'wrap' as const, gap: 6, borderBottom: '1px solid var(--dsw-alias-border-l1)', paddingBottom: 10, marginBottom: 14 }, message: { background: 'var(--dsw-color-warning-bg)', border: '1px solid var(--dsw-color-warning)', padding: 9, marginBottom: 12 }, grid: { display: 'grid', gap: 14 }, panel: { border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 8, padding: 14 }, status: { display: 'flex', gap: 12, padding: '7px 0', borderBottom: '1px solid var(--dsw-alias-border-l1)', alignItems: 'baseline' }, inline: { display: 'flex', gap: 8, flexWrap: 'wrap' as const, marginTop: 10 }, textarea: { width: '100%', boxSizing: 'border-box' as const, marginTop: 10, fontFamily: 'ui-monospace, monospace' }, cards: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10 }, card: { border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 6, padding: 11 } }
