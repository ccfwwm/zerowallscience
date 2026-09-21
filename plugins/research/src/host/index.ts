import type { Context } from '@deepseek-ai/cordis'
import { SessionId, type Session, type SessionEvent } from '@deepseek-ai/dsh-session'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { defineTool, type ToolRunContext } from '@deepseek-ai/dsh-tools'
import {
  type ArtifactRecord, type AuditEventRecord, type CreateArtifactInput, type CreateDataAssetInput,
  type CreateDecisionInput, type CreateExecutionContextInput, type CreatePaperInput, type CreateResearchEdgeInput,
  type CreateRunInput, type DataAssetRecord, type DecisionRecord, type ExecutionContextRecord, type PaperRecord,
  type ProjectRecord, type ResearchEdgeRecord, type ResearchProjectSnapshot, type RunRecord, type UpdateRunChanges, type AuditReport,
  type JsonObject, type LiteratureGraph, type LiteratureSnapshot,
  type ResearchStudyRecord, type ResearchDocumentRecord, type StudyFreezeRecord, type ResearchStudySnapshot,
  type CreateResearchStudyInput, type UpdateResearchStudyInput, type CreateResearchDocumentInput, type UpdateResearchDocumentInput,
  type ResearchRecordKind,
  type ResearchTaskRecord, type CreateResearchTaskInput, type UpdateResearchTaskInput,
  type ResearchTaskBudgetReport,
  type LocalScienceWorkflow,
} from '@zerowallscience/research-store/types'
import { ResearchStore } from '@zerowallscience/research-store'
import type {} from 'zod'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { assemblySessionId, researchContextText } from './research-context.js'
import { evaluateMethod } from './method-check.js'
import { validateNhanesContract } from './nhanes-contract.js'
import { validateGeneticContract } from './genetic-contract.js'
import { OBESITY_ALOPECIA_RECON_QUERIES, buildReconFindings, buildReconRecord, summarizeReconRemoteRuns } from './obesity-alopecia-recon.js'
import { ScienceViewerService } from './science-viewer.js'
import { ImageViewerService } from './image-viewer.js'
import { FijiWorkflowService } from './fiji-workflow.js'
import { FijiExperimentService } from './fiji-experiments.js'
import { SangerService } from './sanger.js'
import { FlowService } from './flow.js'
import { HeService } from './he.js'
import { CanvasService } from './canvas.js'
import { ReportService } from './report.js'
import { CellViewerService } from './cell-viewer.js'
import { BrainAtlasService } from './brain-atlas.js'
import type { CanvasRequest, FijiExperimentRequest, FijiExperimentResponse, FlowRequest, HeRequest, SangerRequest } from '../shared/types.js'
import type { FijiWorkflowRequest, FijiWorkflowResponse } from '../shared/types.js'
import { engineEnvironment, engineExecutable, NativeEngineService } from './native-engines.js'
import { readFile, stat, access } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ScientificPreviewPayload, ScientificEngineLaunchResult, ScientificEngineStatus, ScienceViewerRequest, ScienceViewerResponse, CellViewerRequest, BrainAtlasRequest } from '../shared/types.js'

export type { ScientificPreviewPayload } from '../shared/types.js'
export const inject = ['tools'] as const

declare module '@deepseek-ai/cordis' {
  interface Context { zerowallResearch: ZeroWallResearchService }
  interface Context { localScienceWorkflow: LocalScienceWorkflow }
  interface Context { researchWorkflow?: { get(): { run(id: string, parameters: JsonObject, exec: ToolRunContext): Promise<JsonObject> } } }
}

export class ZeroWallResearchService extends TypertRemoteService {
  private readonly store: ResearchStore
  private readonly viewer: ScienceViewerService
  private readonly nativeEngines: NativeEngineService
  private readonly imageViewer: ImageViewerService
  private readonly fijiWorkflows: FijiWorkflowService
  private readonly fijiExperiments: FijiExperimentService
  private readonly sanger: SangerService
  private readonly flow: FlowService
  private readonly he: HeService
  private readonly canvas: CanvasService
  private readonly reports: ReportService
  private readonly cells: CellViewerService
  private readonly brain: BrainAtlasService

  constructor(ctx: Context) {
    super(ctx, 'zerowallResearch')
    const path = process.env.ZEROWALL_RESEARCH_DB?.trim()
    if (!path) throw new Error('ZEROWALL_RESEARCH_DB is required.')
    this.store = new ResearchStore(path)
    this.viewer = new ScienceViewerService(this.store)
    this.nativeEngines = new NativeEngineService(this.store)
    this.imageViewer = new ImageViewerService(this.store, this.nativeEngines)
    this.fijiWorkflows = new FijiWorkflowService(this.store)
    this.fijiExperiments = new FijiExperimentService(this.store)
    this.sanger = new SangerService(this.store)
    this.flow = new FlowService(this.store)
    this.he = new HeService(this.store)
    this.canvas = new CanvasService(this.store)
    this.reports = new ReportService(this.store)
    this.cells = new CellViewerService(this.store)
    this.brain = new BrainAtlasService(this.store)
    ctx.provide('localScienceWorkflow', {
      list: () => ({ workflow_id: 'fiji', skill: 'zerowall-fiji', operation_count: 5, location: 'local' }),
      describe: operation => {
        const id = operation ?? 'fiji.western-blot'
        if(!['fiji.western-blot','fiji.scratch-wound','fiji.colony-formation','fiji.bacterial-cfu','fiji.tube-formation'].includes(id)) throw new Error('UNKNOWN_LOCAL_OPERATION')
        return id === 'fiji.western-blot' ? { workflow_id: 'fiji', id, skill: 'zerowall-fiji-western-blot', location: 'local', runner_version: 1, summary: 'ImageJ raw grayscale blot quantification with ROI/background/saturation/loading/control audit', parameters: { request_id: 'Stable idempotency key', operation: id, arguments: { viewerId: 'Image viewer ID', expectedVersion: 'Current viewer integer revision', annotationRevisionId: 'Current accepted ROI revision ID', plan: { polarity: 'dark|bright', saturation: { lower: 'number', upper: 'number', source: 'acquisition specification' }, normalization: 'none|housekeeping|total-protein', controlGroup: 'group name or null', lanes: [{ sampleId: 'unique lane ID', biologicalReplicate: 'actual biological replicate', group: 'group name', bandRoiId: 'ROI ID', backgroundRoiId: 'ROI ID', loadingRoiId: 'required when normalized', loadingBackgroundRoiId: 'required when normalized' }] } } } } : { workflow_id: 'fiji', id, skill: 'zerowall-fiji', location: 'local', runner_version: 1, summary: id === 'fiji.bacterial-cfu' ? 'Deterministic CFU metrics plus optional project-local grayscale ROI colony segmentation' : 'Deterministic traceable Fiji experiment metric runner; image segmentation remains linked through the calling run.', parameters: { request_id: 'Stable idempotency key', operation: id, arguments: { measurements: 'Array of experiment-specific measurements with explicit sample/time/well/plate identifiers and units.', sourceAssetId: 'Required for bacterial-cfu image mode.', image: 'bacterial-cfu only: ROI, threshold, polarity, min/max component area, dilution and plated volume.' } } }
      },
      execute: async (sessionId,action,parameters,runId) => {
        if(action === 'run' && typeof parameters.operation === 'string' && parameters.operation !== 'fiji.western-blot') {
          const experiment = String(parameters.operation).slice('fiji.'.length) as 'scratch-wound'|'colony-formation'|'bacterial-cfu'|'tube-formation'
          const project = this.projectForSession({ sessionId }); if (!project) throw new Error('An active registered project session is required.')
          const args = requireJsonObject(parameters.arguments)
          const result = await this.fijiExperiments.execute(project, { sessionId, action: 'analyze', experiment, requestId: String(parameters.request_id ?? ''), ...(args.measurements === undefined ? {} : { measurements: requireJsonArray(args.measurements).map(requireJsonObject) }), ...(args.sourceAssetId === undefined ? {} : { sourceAssetId: String(args.sourceAssetId) }), ...(args.image === undefined ? {} : { image: requireJsonObject(args.image) as any }) })
          return JSON.parse(JSON.stringify({ workflow_id: 'fiji', run_id: result.run?.id, status: result.run?.status, ...result })) as JsonObject
        }
        const args = action === 'run' ? requireJsonObject(parameters.arguments) : {}
        const input: FijiWorkflowRequest = action === 'run' ? { sessionId, action: 'submit', requestId: String(parameters.request_id??''), ...(parameters.research_task_id === undefined ? {} : { researchTaskId: String(parameters.research_task_id) }), viewerId: String(args.viewerId??''), expectedVersion: Number(args.expectedVersion), annotationRevisionId: String(args.annotationRevisionId??''), plan: args.plan as unknown as NonNullable<FijiWorkflowRequest['plan']> } : { sessionId, action: action as 'status'|'cancel', ...(runId?{runId}:{}) }
        const result = await this.fijiWorkflow(input)
        return JSON.parse(JSON.stringify({ workflow_id:'fiji', run_id: result.run?.id, status: result.run?.status, ...result })) as JsonObject
      },
    })
    ctx.inject(['systemPrompt'], promptCtx => {
      promptCtx.systemPrompt.context({
        name: 'zerowall:research-context', order: 940,
        text: context => {
          const sessionId = assemblySessionId(context)
          if (!sessionId) return ''
          const study = this.getActiveResearchStudy({ sessionId })
          return researchContextText(study ? this.store.getResearchStudySnapshot(study.id) : undefined)
        },
      })
    })
    ctx.on('session/event', (session: Session, event: SessionEvent) => {
      if (event.type !== 'tool/call' && event.type !== 'tool/result') return
      const project = this.store.listProjects().find(item => session.header.cwd !== undefined && isWithin(session.header.cwd, item.rootPath))
      if (project === undefined) return
      if (event.type === 'tool/call') {
        this.store.recordAuditEvent(project.id, 'session.tool-call', {
          sessionId: String(session.id), turn: event.data.turn, step: event.data.step,
          callId: String(event.data.callId), tool: event.data.name,
        })
      } else {
        const content = event.data.message.content
        this.store.recordAuditEvent(project.id, 'session.tool-result', {
          sessionId: String(session.id), turn: event.data.turn, step: event.data.step,
          outcome: event.data.error === undefined ? 'success' : 'error',
          contentBlocks: content.length, contentChars: content.reduce((total, block) => total + ('text' in block && typeof block.text === 'string' ? block.text.length : 0), 0),
        })
      }
    })
    ctx.effect(() => () => { this.fijiWorkflows.dispose(); this.nativeEngines.dispose(); this.store.close() }, 'zerowall-research: close research store')
  }

  @Remote('createExecutionContext') createExecutionContext(input: CreateExecutionContextInput): ExecutionContextRecord { return this.store.createExecutionContext(input) }
  @Remote('fijiWorkflow') async fijiWorkflow(input: FijiWorkflowRequest): Promise<FijiWorkflowResponse> {
    const project = this.projectForSession({ sessionId: input.sessionId })
    if (!project) throw new Error('An active registered project session is required.')
    return this.fijiWorkflows.execute(project,input)
  }
  @Remote('fijiExperiment') async fijiExperiment(input: FijiExperimentRequest): Promise<FijiExperimentResponse> {
    const project = this.projectForSession({ sessionId: input.sessionId })
    if (!project) throw new Error('An active registered project session is required.')
    return this.fijiExperiments.execute(project, input)
  }
  @Remote('scienceViewer') async scienceViewer(input: ScienceViewerRequest): Promise<ScienceViewerResponse> {
    const project = this.projectForSession({ sessionId: input.sessionId })
    if (!project) throw new Error('An active registered project session is required.')
    if (input.action === 'native_status') return { launches: this.nativeEngines.list(project.id) }
    if (input.action === 'launch_native') {
      if (!input.engine) throw new Error('A native engine is required.')
      return { launch: await this.nativeEngines.launch(project, input.sessionId, input.engine, input.assetId) }
    }
    if (input.action.startsWith('sanger_')) {
      const request: SangerRequest = { ...(input.sanger ?? {}), sessionId: input.sessionId, action: input.action.slice(7) as SangerRequest['action'] }
      if (input.assetId !== undefined) request.assetId = input.assetId
      if (input.viewerId !== undefined) request.viewerId = input.viewerId
      if (input.reverseViewerId !== undefined) request.reverseViewerId = input.reverseViewerId
      if (input.expectedVersion !== undefined) request.expectedVersion = input.expectedVersion
      if (input.threshold !== undefined) request.threshold = input.threshold
      if (input.window !== undefined) request.window = input.window
      if (input.reference !== undefined) request.reference = input.reference
      return { sanger: await this.sanger.execute(project, request) }
    }
    if (input.action.startsWith('flow_')) {
      const request: FlowRequest = { ...(input.flow ?? {}), sessionId: input.sessionId, action: input.action.slice(5) as FlowRequest['action'] }
      if (input.assetId !== undefined) request.assetId = input.assetId
      if (input.viewerId !== undefined) request.viewerId = input.viewerId
      if (input.expectedVersion !== undefined) request.expectedVersion = input.expectedVersion
      if (input.transform !== undefined) request.transform = input.transform
      if (input.cofactor !== undefined) request.cofactor = input.cofactor
      if (input.applyCompensation !== undefined) request.applyCompensation = input.applyCompensation
      if (input.gates !== undefined) request.gates = input.gates
      if (input.previewLimit !== undefined) request.previewLimit = input.previewLimit
      return { flow: await this.flow.execute(project, request) }
    }
    if (input.action.startsWith('he_')) {
      const request: HeRequest = { ...(input.he ?? {}), sessionId: input.sessionId, action: input.action.slice(3) as HeRequest['action'] }
      if (input.assetId !== undefined) request.assetId = input.assetId
      if (input.viewerId !== undefined) request.viewerId = input.viewerId
      if (input.expectedVersion !== undefined) request.expectedVersion = input.expectedVersion
      if (input.region !== undefined) request.region = input.region
      return { he: await this.he.execute(project, request) }
    }
    if (input.action.startsWith('canvas_')) {
      if (!input.canvas) throw new Error('A canvas specification is required.')
      const request: CanvasRequest = { ...input.canvas, sessionId: input.sessionId, action: input.action.slice(7) as CanvasRequest['action'] }
      return { canvas: await this.canvas.execute(project, request) }
    }
    if (input.action.startsWith('cell_')) {
      const request: CellViewerRequest = { ...(input.cell ?? {}), sessionId: input.sessionId, action: input.action.slice(5) as CellViewerRequest['action'] }
      if (input.assetId !== undefined) request.assetId = input.assetId
      if (input.viewerId !== undefined) request.viewerId = input.viewerId
      if (input.expectedVersion !== undefined) request.expectedVersion = input.expectedVersion
      if (input.embedding !== undefined) request.embedding = input.embedding
      if (input.embeddingLimit !== undefined) request.embeddingLimit = input.embeddingLimit
      if (input.gene !== undefined) request.gene = input.gene
      if (input.cellLimit !== undefined) request.cellLimit = input.cellLimit
      if (input.groupBy !== undefined) request.groupBy = input.groupBy
      if (input.cellSelection !== undefined) request.selection = input.cellSelection
      if (input.cellCamera !== undefined) request.camera = input.cellCamera
      return { cell: await this.cells.execute(project, request) }
    }
    if (input.action.startsWith('brain_')) {
      const request: BrainAtlasRequest = { ...(input.brain ?? {}), sessionId: input.sessionId, action: input.action.slice(6) as BrainAtlasRequest['action'] }
      if (input.assetId !== undefined) request.assetId = input.assetId
      if (input.viewerId !== undefined) request.viewerId = input.viewerId
      if (input.expectedVersion !== undefined) request.expectedVersion = input.expectedVersion
      if (input.brainAxis !== undefined) request.axis = input.brainAxis
      if (input.brainIndex !== undefined) request.index = input.brainIndex
      if (input.brainDownsample !== undefined) request.downsample = input.brainDownsample
      if (input.brainRegion !== undefined) request.region = input.brainRegion
      if (input.brainCoordinates !== undefined) request.coordinates = input.brainCoordinates
      if (input.brainCoordinateUnits !== undefined) request.coordinateUnits = input.brainCoordinateUnits
      if (input.brainVoxelSizes !== undefined) request.voxelSizes = input.brainVoxelSizes
      if (input.brainOrientation !== undefined) request.orientation = input.brainOrientation
      if (input.brainNFreeCpus !== undefined) request.nFreeCpus = input.brainNFreeCpus
      if (input.backgroundAssetId !== undefined) request.backgroundAssetId = input.backgroundAssetId
      if (input.brainStartPlane !== undefined) request.startPlane = input.brainStartPlane
      if (input.brainEndPlane !== undefined) request.endPlane = input.brainEndPlane
      if (input.brainSkipClassification !== undefined) request.skipClassification = input.brainSkipClassification
      if (input.brainRegions !== undefined) request.brainRegions = input.brainRegions
      if (input.brainTitle !== undefined) request.brainTitle = input.brainTitle
      if (input.brainPointRadius !== undefined) request.brainPointRadius = input.brainPointRadius
      if (input.maxCells !== undefined) request.maxCells = input.maxCells
      return { brain: await this.brain.execute(project, request) }
    }
    if (input.action.startsWith('image_') || input.action.startsWith('annotation_')) return this.imageViewer.execute(project, input)
    return this.viewer.execute(project, input)
  }
  @Remote('listExecutionContexts') listExecutionContexts(projectId: string): ExecutionContextRecord[] { return this.store.listExecutionContexts(projectId) }
  @Remote('createDataAsset') createDataAsset(input: CreateDataAssetInput): DataAssetRecord { return this.store.createDataAsset(input) }
  @Remote('listDataAssets') listDataAssets(projectId: string): DataAssetRecord[] { return this.store.listDataAssets(projectId) }
  @Remote('createRun') createRun(input: CreateRunInput): RunRecord { return this.store.createRun(input) }
  @Remote('updateRun') updateRun(input: { id: string; changes: UpdateRunChanges }): RunRecord { return this.store.updateRun(input.id, input.changes) }
  @Remote('listRuns') listRuns(projectId: string): RunRecord[] { return this.store.listRuns(projectId) }
  @Remote('createArtifact') createArtifact(input: CreateArtifactInput): ArtifactRecord { return this.store.createArtifact(input) }
  @Remote('listArtifacts') listArtifacts(projectId: string): ArtifactRecord[] { return this.store.listArtifacts(projectId) }
  @Remote('createPaper') createPaper(input: CreatePaperInput): PaperRecord { return this.store.createPaper(input) }
  @Remote('listPapers') listPapers(projectId: string): PaperRecord[] { return this.store.listPapers(projectId) }
  saveLiteraturePapers(projectId: string, articles: JsonObject[]): PaperRecord[] { return this.store.saveLiteraturePapers(projectId, articles) }
  getLiteratureGraph(projectId: string): LiteratureSnapshot { return this.store.getLiteratureGraph(projectId) }
  commitLiteratureGraph(projectId: string, graph: LiteratureGraph): { addedNodes: number; addedEdges: number } { return this.store.commitLiteratureGraph(projectId, graph) }
  resetLiteratureGraph(projectId: string): void { this.store.resetLiteratureGraph(projectId) }
  @Remote('createDecision') createDecision(input: CreateDecisionInput): DecisionRecord { return this.store.createDecision(input) }
  @Remote('listDecisions') listDecisions(projectId: string): DecisionRecord[] { return this.store.listDecisions(projectId) }
  @Remote('createResearchStudy') createResearchStudy(input: CreateResearchStudyInput): ResearchStudyRecord { return this.store.createResearchStudy(input) }
  @Remote('getResearchStudy') getResearchStudy(studyId: string): ResearchStudyRecord | undefined { return this.store.getResearchStudy(studyId) }
  @Remote('listResearchStudies') listResearchStudies(projectId: string): ResearchStudyRecord[] { return this.store.listResearchStudies(projectId) }
  @Remote('updateResearchStudy') updateResearchStudy(input: { id: string; changes: UpdateResearchStudyInput }): ResearchStudyRecord { return this.store.updateResearchStudy(input.id, input.changes) }
  @Remote('createResearchDocument') createResearchDocument(input: CreateResearchDocumentInput): ResearchDocumentRecord { return this.store.createResearchDocument(input) }
  @Remote('getResearchDocument') getResearchDocument(documentId: string): ResearchDocumentRecord | undefined { return this.store.getResearchDocument(documentId) }
  @Remote('listResearchDocuments') listResearchDocuments(input: { studyId: string; kind?: ResearchRecordKind }): ResearchDocumentRecord[] { return this.store.listResearchDocuments(input.studyId, input.kind) }
  @Remote('updateResearchDocument') updateResearchDocument(input: { id: string; changes: UpdateResearchDocumentInput }): ResearchDocumentRecord { return this.store.updateResearchDocument(input.id, input.changes) }
  @Remote('validateAnalysisPlan') validateAnalysisPlan(planId: string): ResearchDocumentRecord { return this.store.validateAnalysisPlan(planId) }
  @Remote('methodCheckEvaluate') methodCheckEvaluate(input: { studyId: string; method: string; assumptions?: JsonObject }): JsonObject {
    const study = this.store.getResearchStudy(input.studyId)
    if (!study) throw new Error('Research study was not found.')
    const method = input.method.trim()
    if (!method) throw new Error('Method is required.')
    const result = evaluateMethod({ method, testUsed: method, ...(input.assumptions ?? {}) })
    return { studyId: study.id, ...result, checkedAt: new Date().toISOString() }
  }
  @Remote('approveResearchGate') approveResearchGate(input: { studyId: string; gate: 1 | 2; status: 'approved' | 'rejected'; expectedVersion: number; rationale: string }): ResearchStudyRecord { return this.store.approveResearchGate(input.studyId, input.gate, input.status, input.expectedVersion, input.rationale) }
  @Remote('freezeResearchStudy') freezeResearchStudy(input: { studyId: string; expectedVersion: number }): StudyFreezeRecord { return this.store.freezeResearchStudy(input.studyId, input.expectedVersion) }
  @Remote('amendResearchStudy') amendResearchStudy(input: { studyId: string; reason: string; expectedVersion: number }): ResearchStudyRecord { return this.store.amendResearchStudy(input.studyId, input.reason, input.expectedVersion) }
  @Remote('listStudyFreezes') listStudyFreezes(studyId: string): StudyFreezeRecord[] { return this.store.listStudyFreezes(studyId) }
  @Remote('getResearchStudySnapshot') getResearchStudySnapshot(studyId: string): ResearchStudySnapshot { return this.store.getResearchStudySnapshot(studyId) }
  @Remote('registerResearchEvidence') registerResearchEvidence(input: { sessionId: string; projectId: string; studyId: string; payload: JsonObject }): ResearchDocumentRecord {
    const active = this.projectForSession({ sessionId: input.sessionId })
    const project = this.store.getResearchStudy(input.studyId)?.projectId
    if (!active || active.id !== input.projectId || project !== input.projectId) throw new Error('Evidence study is not in the active project.')
    return this.store.registerResearchEvidence(input)
  }
  @Remote('validateNhanesContract') validateNhanesContractRemote(input: { studyId: string; contract: JsonObject }): JsonObject {
    if (!this.store.getResearchStudy(input.studyId)) throw new Error('Research study was not found.')
    return { studyId: input.studyId, ...validateNhanesContract(input.contract), checkedAt: new Date().toISOString() }
  }
  @Remote('validateGeneticContract') validateGeneticContractRemote(input: { studyId: string; contract: JsonObject }): JsonObject {
    if (!this.store.getResearchStudy(input.studyId)) throw new Error('Research study was not found.')
    return { studyId: input.studyId, ...validateGeneticContract(input.contract), checkedAt: new Date().toISOString() }
  }
  @Remote('auditResearchClaim') auditResearchClaim(input: { sessionId: string; claimId: string; expectedVersion: number }): ResearchDocumentRecord {
    const document = this.store.getResearchDocument(input.claimId)
    if (!document) throw new Error('Research claim was not found.')
    const study = this.store.getResearchStudy(document.studyId)
    const active = this.projectForSession({ sessionId: input.sessionId })
    if (!study || study.projectId !== document.projectId || !active || active.id !== study.projectId) throw new Error('Research claim is not in the active project.')
    return this.store.auditResearchClaim(input.claimId, input.expectedVersion)
  }
  @Remote('createResearchTask') createResearchTask(input: CreateResearchTaskInput): ResearchTaskRecord { return this.store.createResearchTask(input) }
  @Remote('listResearchTasks') listResearchTasks(studyId: string): ResearchTaskRecord[] { return this.store.listResearchTasks(studyId) }
  @Remote('updateResearchTask') updateResearchTask(input: { id: string; changes: UpdateResearchTaskInput }): ResearchTaskRecord { return this.store.updateResearchTask(input.id, input.changes) }
  @Remote('refreshResearchTaskReadiness') refreshResearchTaskReadiness(studyId: string): ResearchTaskRecord[] { return this.store.refreshResearchTaskReadiness(studyId) }
  @Remote('getResearchTaskBudget') getResearchTaskBudget(studyId: string): ResearchTaskBudgetReport { return this.store.getResearchTaskBudget(studyId) }
  @Remote('reconcileResearchTaskRun') reconcileResearchTaskRun(input: { id: string; expectedVersion?: number }): ResearchTaskRecord { return this.store.reconcileResearchTaskRun(input.id, input.expectedVersion) }
  @Remote('createObesityAlopeciaPilot') createObesityAlopeciaPilot(projectId: string): ResearchStudySnapshot {
    const study = this.store.createResearchStudy({ projectId, title: '肥胖—脱发先导研究', phase: 'question', budget: { maxRemoteThreads: 8, maxMemoryGiB: 24 } })
    this.store.createResearchDocument({ projectId, studyId: study.id, kind: 'observation', payload: { status: 'unverified', text: '肥胖与脱发的关系待核验；不能预设阳性结果或核心基因。', source: 'user-case-template' } })
    const question = this.store.createResearchDocument({ projectId, studyId: study.id, kind: 'question', payload: { phenotypeCandidates: ['androgenetic-alopecia', 'alopecia-areata', 'unclassified-hair-loss'], exposureCandidates: ['BMI', 'waist', 'body-fat'], freezeAfterScout: true, estimand: 'association-or-causal-only-after-method-check' } })
    const current = this.store.getResearchStudy(study.id)!
    this.store.updateResearchStudy(study.id, { expectedVersion: current.version, currentQuestionId: question.id })
    return this.store.getResearchStudySnapshot(study.id)
  }
  /**
   * Run the bounded, read-only NHANES catalog reconnaissance used by the
   * obesity—alopecia pilot. It records observations and a pending data
   * contract, but never chooses a phenotype or starts a statistical model.
   */
  async runObesityAlopeciaRecon(studyId: string, exec: ToolRunContext): Promise<JsonObject> {
    const study = this.store.getResearchStudy(studyId)
    if (!study) throw new Error('Research study was not found.')
    const project = this.projectForSession({ sessionId: String(exec.agent?.session.id ?? '') })
    if (!project || project.id !== study.projectId) throw new Error('The research study is not in the active project.')
    const workflow = this.ctx.get('researchWorkflow')?.get()
    if (!workflow) throw new Error('The rdatalinux research workflow is unavailable; connect the rmcp server first.')
    const responses: Array<{ query: (typeof OBESITY_ALOPECIA_RECON_QUERIES)[number]; response?: unknown; error?: string; remote?: JsonObject }> = []
    for (const query of OBESITY_ALOPECIA_RECON_QUERIES) {
      try {
        const remote = await workflow.run('r.nhanes.search.variables', {
          operation: 'r.nhanes.search.variables',
          request_id: `obesity-alopecia-recon-${study.id}-${query.key}`,
          arguments: { q: query.query, limit: 100 },
        }, exec)
        responses.push({ query, response: remote.result ?? remote, remote })
      } catch (error) {
        responses.push({ query, error: String(error) })
      }
    }
    const findings = buildReconFindings(responses)
    const remoteRunRecords = summarizeReconRemoteRuns(responses)
    const record = buildReconRecord(findings, {
      studyId: study.id,
      source: 'rdatalinux-rmcp:r.nhanes.search.variables',
      executedAt: new Date().toISOString(),
      remoteRuns: remoteRunRecords,
      remoteRunCount: remoteRunRecords.filter(item => item.localRunId !== undefined || item.remoteId !== undefined).length,
      remoteManifestRefs: remoteRunRecords.flatMap(item => item.artifactNames).slice(0, 100),
    })
    const observation = this.store.createResearchDocument({
      projectId: project.id,
      studyId: study.id,
      kind: 'observation',
      payload: JSON.parse(JSON.stringify({ ...record, findings, observationType: 'catalog-reconnaissance', status: record.status })) as JsonObject,
    })
    const contract = this.store.createResearchDocument({
      projectId: project.id,
      studyId: study.id,
      kind: 'dataset-contract',
      payload: JSON.parse(JSON.stringify({
        source: 'NHANES',
        applicability: 'pending',
        sourceStatus: findings.some(item => item.status === 'unavailable' || item.status === 'invalid-response') ? 'access-limited' : 'catalog-only',
        phenotypeCandidates: findings.filter(item => item.kind === 'phenotype').map(item => item.key),
        exposureCandidates: findings.filter(item => item.kind === 'exposure').map(item => item.key),
        variableFindings: findings,
        requires: ['cycle', 'component', 'dataset', 'codebook', 'sample intersection', 'weight', 'strata', 'psu'],
        note: '目录检索未命中不能证明所有官方周期不存在该表型；必须在冻结前核验周期与代码本。',
      })) as JsonObject,
    })
    return JSON.parse(JSON.stringify({ version: '7.0.0-obesity-alopecia-recon.1', studyId: study.id, record, findings, observation, contract })) as JsonObject
  }
  @Remote('runObesityAlopeciaRecon') async runObesityAlopeciaReconRemote(input: { sessionId: string; studyId: string }): Promise<JsonObject> {
    const session = this.ctx.get('sessions')?.get(SessionId(input.sessionId))
    if (!session) throw new Error('An active session is required.')
    const exec = { agent: { session }, callId: `rpc:obesity-alopecia-recon:${input.studyId}`, rootCallId: `rpc:obesity-alopecia-recon:${input.studyId}`, signal: new AbortController().signal } as unknown as ToolRunContext
    return this.runObesityAlopeciaRecon(input.studyId, exec)
  }
  @Remote('generateResearchReport') async generateResearchReport(input: { sessionId: string; studyId: string; mode?: 'draft' | 'final' }): Promise<JsonObject> {
    const project = this.projectForSession({ sessionId: input.sessionId })
    if (!project) throw new Error('An active registered project session is required.')
    return await this.reports.generate(project, input.studyId, input.mode ?? 'draft') as unknown as JsonObject
  }
  @Remote('probeScientificEngines') async probeScientificEngines(): Promise<ScientificEngineStatus[]> {
    const fijiRoot = process.env.ZEROWALL_FIJI_PATH?.trim() || 'C:\\softworks\\fiji'
    const napariPython = engineExecutable('napari')
    const fijiExecutable = engineExecutable('fiji')
    return [
      await probeEngine('fiji', fijiRoot, fijiExecutable, ['--headless', '--version']),
      await probeEngine('napari', napariPython, napariPython, ['-c', 'import numpy as np; np.linalg.inv(np.eye(4)); import napari; print(napari.__version__)'], 15000),
      await probeBrainGlobe(),
    ]
  }
  @Remote('launchScientificEngine') async launchScientificEngine(input: { sessionId: string; engine: 'fiji' | 'napari'; assetId?: string }): Promise<ScientificEngineLaunchResult> {
    const project = this.projectForSession({ sessionId: input.sessionId })
    if (!project) throw new Error('An active registered project session is required.')
    return this.nativeEngines.launch(project, input.sessionId, input.engine, input.assetId)
  }
  @Remote('listScientificEngineLaunches') listScientificEngineLaunches(input: { sessionId: string }): ScientificEngineLaunchResult[] {
    const project = this.projectForSession(input)
    if (!project) throw new Error('An active registered project session is required.')
    return this.nativeEngines.list(project.id)
  }
  @Remote('createEdge') createEdge(input: CreateResearchEdgeInput): ResearchEdgeRecord { return this.store.createResearchEdge(input) }
  @Remote('listEdges') listEdges(projectId: string): ResearchEdgeRecord[] { return this.store.listResearchEdges(projectId) }
  @Remote('listAuditEvents') listAuditEvents(projectId: string): AuditEventRecord[] { return this.store.listAuditEvents(projectId) }
  @Remote('projectForSession') projectForSession(input: { sessionId: string }): ProjectRecord | undefined {
    const session = this.ctx.get('sessions')?.get(SessionId(input.sessionId))
    const cwd = session?.header.cwd
    return cwd === undefined ? undefined : this.store.listProjects().filter(item => isWithin(cwd, item.rootPath)).sort((a, b) => b.rootPath.length - a.rootPath.length)[0]
  }
  @Remote('getActiveResearchStudy') getActiveResearchStudy(input: { sessionId: string }): ResearchStudyRecord | undefined {
    const project = this.projectForSession(input)
    return project ? this.store.getSessionResearchStudy(project.id, input.sessionId) : undefined
  }
  @Remote('setActiveResearchStudy') setActiveResearchStudy(input: { sessionId: string; studyId: string | null }): ResearchStudyRecord | undefined {
    const project = this.projectForSession(input)
    if (!project) throw new Error('An active project session is required.')
    return this.store.setSessionResearchStudy(project.id, input.sessionId, input.studyId)
  }
  @Remote('getAuditReport') getAuditReport(projectId: string): AuditReport { return this.store.getAuditReport(projectId) }
  @Remote('exportAuditReport') exportAuditReport(input: { projectId: string; format: 'json' | 'markdown' }): string { return this.store.exportAuditReport(input.projectId, input.format) }
  @Remote('exportSnapshot') exportSnapshot(projectId: string): ResearchProjectSnapshot { return this.store.exportResearchSnapshot(projectId) }
  @Remote('importSnapshot') importSnapshot(snapshot: ResearchProjectSnapshot): ProjectRecord { return this.store.importResearchSnapshot(snapshot) }
  @Remote('preview') async preview(input: { projectId: string; uri: string; mediaType?: string }): Promise<ScientificPreviewPayload> {
    const project = this.store.listProjects().find(item => item.id === input.projectId)
    if (project === undefined) throw new Error(`Project was not found: ${input.projectId}`)
    const url = new URL(input.uri)
    if (url.protocol !== 'file:') throw new Error('Remote scientific files must be harvested or mounted before preview.')
    const path = resolve(fileURLToPath(url))
    const root = resolve(project.rootPath)
    const inside = relative(root, path)
    if (inside.startsWith('..') || resolve(root, inside) !== path) throw new Error('Preview path is outside the project workspace.')
    const info = await stat(path)
    if (!info.isFile() || info.size > 100 * 1024 * 1024) throw new Error('Preview file must be a regular file no larger than 100 MB.')
    return { uri: input.uri, mediaType: input.mediaType?.trim() || mediaTypeFromPath(path), byteSize: info.size, base64: (await readFile(path)).toString('base64') }
  }
}

function mediaTypeFromPath(path: string): string {
  const extension = path.toLowerCase().split('.').pop()
  return ({ pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', csv: 'text/csv', tsv: 'text/tab-separated-values', fasta: 'text/x-fasta', fa: 'text/x-fasta', fastq: 'text/x-fastq', pdb: 'chemical/x-pdb', sdf: 'chemical/x-mdl-sdfile', scf: 'application/octet-stream', ab1: 'application/octet-stream', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml' } as Record<string, string>)[extension ?? ''] ?? 'application/octet-stream'
}

function isWithin(path: string, root: string): boolean {
  const normalizedPath = resolve(path)
  const normalizedRoot = resolve(root)
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}${process.platform === 'win32' ? '\\' : '/'}`)
}

export function apply(ctx: Context): void {
  ctx.plugin(ZeroWallResearchService)
  ctx.inject(['zerowallResearch'], registerResearchTools)
}

function registerResearchTools(ctx: Context): void {
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'science_viewer',
    description: 'View registered AnnData H5AD (local h5py/NumPy required; first-N previews and whole-X descriptive QC), FASTA (<=16 MiB), SCF/AB1 Sanger traces, and PNG/JPEG/TIFF (<=128 MiB); analyze sequences and Sanger traces, save image ROIs with immutable conflict revisions, export/import traceable results. Launch local Fiji/napari and inspect process status (not GUI readiness). No study required. Sequence coordinates 1-based inclusive; image coordinates original pixel edges with 0-based page (not assumed Z/T). Sanger quality is stored-call confidence, not a Phred score; incomplete AB1 tags are rejected.',
      parameters: {
      action: { type: 'string', required: true, enum: ['list', 'open', 'read', 'save', 'analyze', 'export', 'launch_native', 'native_status', 'image_open', 'image_read', 'image_save', 'annotation_save', 'annotation_export', 'annotation_import', 'annotation_launch', 'annotation_collect', 'sanger_open', 'sanger_analyze', 'sanger_export', 'sanger_review', 'flow_open', 'flow_analyze', 'flow_export', 'he_open', 'he_analyze', 'he_export', 'canvas_render', 'canvas_export', 'cell_open', 'cell_read', 'cell_analyze', 'cell_export', 'cell_select', 'cell_export_selection', 'cell_view', 'brain_open', 'brain_read', 'brain_analyze', 'brain_export', 'brain_cells', 'brain_trajectory', 'brain_register', 'brain_cellfinder', 'brain_render'] },
      engine: { type: 'string', enum: ['fiji', 'napari'], description: 'Required for launch_native; optional asset_id must reference a local project TIFF/PNG/JPEG/BMP.' },
      asset_id: { type: 'string' }, viewer_id: { type: 'string' }, reverse_viewer_id: { type: 'string' }, expected_revision: { type: 'integer' },
      state: { type: 'json', description: 'recordIndex (0-based), start, count (<=10,000), selectionStart and selectionEnd (1-based inclusive).' },
      operation: { type: 'string', enum: ['reverse-complement', 'translate', 'restriction', 'crispr'] }, crispr_target: { type: 'string', description: 'Optional 20-base SpCas9 guide target.' }, crispr_max_mismatches: { type: 'integer', description: 'SpCas9 candidate mismatch bound, 0–3.' },
      threshold: { type: 'number', description: 'Sanger end-trimming stored-call probability threshold (0–1).' },
      window: { type: 'integer', description: 'Sanger quality window metadata (1–100); retained in the trace analysis manifest.' },
      reference: { type: 'string', description: 'Optional DNA reference for bounded global Needleman–Wunsch comparison (<=100,000 bases).' },
      transform: { type: 'string', enum: ['none', 'arcsinh'], description: 'Flow display/analysis transform; explicit, never inferred from channel metadata.' },
      cofactor: { type: 'number', description: 'Flow arcsinh cofactor, 0 < value <= 10,000.' },
      apply_compensation: { type: 'boolean', description: 'Apply the declared FCS spillover matrix before transformation and gating.' },
      gates: { type: 'json', description: 'Ordered rectangular gates: id, name, optional parentId, x/y channel bounds.' },
      preview_limit: { type: 'integer', description: 'Maximum event rows returned to the Agent (0–10,000); raw full events remain in the local service.' },
      region: { type: 'json', description: 'HE ROI in original pixels: x, y, width, height and optional page.' },
      source_asset_id: { type: 'string', description: 'Fiji image segmentation source asset; must be a local asset in the active project.' },
      image: { type: 'json', description: 'Image-backed Fiji analysis. kind matches experiment: bacterial-cfu {plateId,dilutionFactor,platedVolumeMl,threshold,minArea,maxArea,polarity,roi}; scratch-wound {sampleId,time,initialArea,threshold,polarity,roi}; colony-formation {wellId,threshold,minArea,maxArea,polarity,roi,stainUnit?}; tube-formation {sampleId,threshold,polarity,roi,unit,unitScale}.' },
      canvas_spec: { type: 'json', description: 'Canvas project: title, width, height, xLabel, yLabel, series[{id,name,color,points[{x,y,label?}]}], annotations and source references.' },
      image_state: { type: 'json', description: 'Image view: page (0-based; not assumed Z/T), zoom (0.1–20), panX, panY.' },
      annotation: { type: 'json', description: 'expectedRevisionId (string or null), payload: coordinates {convention: pixel-edge-top-left, width, height, pages, calibration: null or {x,y,unit: um/mm,source}}, rois [{id,name,page,kind: rectangle/point/polygon,...coordinates}]. Stale saves are preserved as conflict branches.' },
      annotation_revision_id: { type: 'string', description: 'Optional historical annotation revision to export.' },
      import_asset_id: { type: 'string', description: 'Registered local annotation exchange JSON asset for annotation_import.' },
      launch_id: { type: 'string', description: 'Native annotation launch to collect after the user saves the return in Fiji/napari. Repeated collection is idempotent.' },
      cell_camera: { type: 'json', description: '{zoom:1..100,panX:-200..200,panY:-200..200}; normalized clip-space camera. cell_view saves without reading H5AD. Existing-view actions may preserve the current camera; switching embedding resets it.' },
      cell_selection: { type: 'json', description: 'Cell polygon in stored embedding coordinates: {embedding, axes:[0,1], polygon:[[x,y],...]}. 3–128 vertices. Applies to ALL observations, not just preview. Null clears. Required saved geometry for cell_export_selection.' },
      brain_axis: { type: 'integer', description: 'Brain atlas slice axis 0, 1 or 2.' }, brain_index: { type: 'integer', description: 'Brain atlas slice index.' }, brain_downsample: { type: 'integer', description: 'Brain atlas slice downsample factor 1–64.' }, brain_region: { type: 'string', description: 'Brain atlas region name, acronym or numeric ID.' }, brain_regions: { type: 'json', description: 'Brainrender region acronyms/names, maximum 16.' }, brain_title: { type: 'string', description: 'Optional brainrender scene title.' }, brain_point_radius: { type: 'number', description: 'Brainrender point radius in microns, 1–200.' }, brain_coordinates: { type: 'json', description: 'Ordered brain coordinates [[x,y,z],...], voxel or micron units.' }, brain_coordinate_units: { type: 'string', enum: ['voxel', 'micron'] }, brain_voxel_sizes: { type: 'json', description: 'brainreg input voxel sizes in microns: [x,y,z].' }, brain_orientation: { type: 'string', description: 'brainreg three-letter sample orientation, for example asr.' }, brain_n_free_cpus: { type: 'integer', description: 'CPU cores left unused by brainreg/cellfinder, 0–64.' }, brain_start_plane: { type: 'integer', description: 'Optional first z plane for cellfinder, inclusive.' }, brain_end_plane: { type: 'integer', description: 'Optional last z plane for cellfinder, exclusive.' }, brain_skip_classification: { type: 'boolean', description: 'Cellfinder detection-only mode; classification is not run and results require review.' }, background_asset_id: { type: 'string', description: 'Optional project-local background volume for cellfinder.' }, max_cells: { type: 'integer', description: 'Maximum brain coordinate rows, up to 100000.' },
      embedding: { type: 'string', description: 'AnnData obsm embedding key, for example X_umap or X_pca.' },
      embedding_limit: { type: 'integer', description: 'Maximum embedding points returned to the viewer (1–200,000); Agent text includes only a sample.' },
      gene: { type: 'string', description: 'Gene/feature name from var index for bounded expression preview and QC.' },
      cell_limit: { type: 'integer', description: 'Maximum cell rows returned to the Agent/UI (1–10,000); the matrix remains on disk.' },
      group_by: { type: 'string', description: 'obs column for deterministic group counts and mean total counts.' },
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(args, exec: ToolRunContext) {
      const sessionId = exec.agent?.session.id
      if (!sessionId) throw new Error('An active project session is required.')
      const result = await ctx.zerowallResearch.scienceViewer({
        sessionId: String(sessionId), action: args.action as ScienceViewerRequest['action'],
        ...(args.engine === undefined ? {} : { engine: args.engine as 'fiji' | 'napari' }),
        ...(args.asset_id === undefined ? {} : { assetId: String(args.asset_id) }),
        ...(args.viewer_id === undefined ? {} : { viewerId: String(args.viewer_id) }),
        ...(args.expected_revision === undefined ? {} : { expectedVersion: Number(args.expected_revision) }),
        ...(args.state === undefined ? {} : { state: requireJsonObject(args.state) as unknown as NonNullable<ScienceViewerRequest['state']> }),
        ...(args.operation === undefined ? {} : { operation: args.operation as NonNullable<ScienceViewerRequest['operation']> }), ...(args.crispr_target === undefined ? {} : { crisprTarget: String(args.crispr_target) }), ...(args.crispr_max_mismatches === undefined ? {} : { crisprMaxMismatches: Number(args.crispr_max_mismatches) }),
        ...((args.threshold === undefined && args.window === undefined && args.reference === undefined && args.reverse_viewer_id === undefined) ? {} : { sanger: {
          sessionId: String(sessionId),
          action: String(args.action).slice(7) as NonNullable<ScienceViewerRequest['sanger']>['action'],
          ...(args.asset_id === undefined ? {} : { assetId: String(args.asset_id) }),
          ...(args.viewer_id === undefined ? {} : { viewerId: String(args.viewer_id) }),
          ...(args.reverse_viewer_id === undefined ? {} : { reverseViewerId: String(args.reverse_viewer_id) }),
          ...(args.expected_revision === undefined ? {} : { expectedVersion: Number(args.expected_revision) }),
          ...(args.threshold === undefined ? {} : { threshold: Number(args.threshold) }),
          ...(args.window === undefined ? {} : { window: Number(args.window) }),
        ...(args.reference === undefined ? {} : { reference: String(args.reference) }),
        } }),
        ...(args.region === undefined ? {} : { region: requireJsonObject(args.region) as unknown as NonNullable<ScienceViewerRequest['region']> }),
        ...(args.canvas_spec === undefined ? {} : { canvas: { sessionId: String(sessionId), action: String(args.action).slice(7) as 'render' | 'export', spec: requireJsonObject(args.canvas_spec) as unknown as NonNullable<ScienceViewerRequest['canvas']>['spec'] } }),
        ...((args.transform === undefined && args.cofactor === undefined && args.apply_compensation === undefined && args.gates === undefined && args.preview_limit === undefined) ? {} : { flow: {
          sessionId: String(sessionId),
          action: String(args.action).slice(5) as NonNullable<ScienceViewerRequest['flow']>['action'],
          ...(args.asset_id === undefined ? {} : { assetId: String(args.asset_id) }),
          ...(args.viewer_id === undefined ? {} : { viewerId: String(args.viewer_id) }),
          ...(args.expected_revision === undefined ? {} : { expectedVersion: Number(args.expected_revision) }),
          ...(args.transform === undefined ? {} : { transform: args.transform as 'none' | 'arcsinh' }),
          ...(args.cofactor === undefined ? {} : { cofactor: Number(args.cofactor) }),
          ...(args.apply_compensation === undefined ? {} : { applyCompensation: Boolean(args.apply_compensation) }),
          ...(args.gates === undefined ? {} : { gates: requireJsonArray(args.gates) as unknown as Exclude<NonNullable<ScienceViewerRequest['flow']>['gates'], undefined> }),
          ...(args.preview_limit === undefined ? {} : { previewLimit: Number(args.preview_limit) }),
        } }),
        ...(args.image_state === undefined ? {} : { imageState: requireJsonObject(args.image_state) as unknown as NonNullable<ScienceViewerRequest['imageState']> }),
        ...(args.annotation === undefined ? {} : { annotation: requireJsonObject(args.annotation) as unknown as NonNullable<ScienceViewerRequest['annotation']> }),
        ...(args.annotation_revision_id === undefined ? {} : { annotationRevisionId: String(args.annotation_revision_id) }),
        ...(args.import_asset_id === undefined ? {} : { importAssetId: String(args.import_asset_id) }),
        ...(args.launch_id === undefined ? {} : { launchId: String(args.launch_id) }),
        ...(args.embedding === undefined ? {} : { embedding: String(args.embedding) }),
        ...(args.embedding_limit === undefined ? {} : { embeddingLimit: Number(args.embedding_limit) }),
        ...(args.gene === undefined ? {} : { gene: String(args.gene) }),
        ...(args.cell_limit === undefined ? {} : { cellLimit: Number(args.cell_limit) }),
        ...(args.group_by === undefined ? {} : { groupBy: String(args.group_by) }),
        ...(args.cell_camera === undefined ? {} : { cellCamera: requireJsonObject(args.cell_camera) as unknown as NonNullable<ScienceViewerRequest['cellCamera']> }),
        ...(args.cell_selection === undefined ? {} : { cellSelection: args.cell_selection === null ? null : requireJsonObject(args.cell_selection) as unknown as NonNullable<ScienceViewerRequest['cellSelection']> }),
        ...(args.brain_axis === undefined ? {} : { brainAxis: Number(args.brain_axis) as 0 | 1 | 2 }), ...(args.brain_index === undefined ? {} : { brainIndex: Number(args.brain_index) }), ...(args.brain_downsample === undefined ? {} : { brainDownsample: Number(args.brain_downsample) }), ...(args.brain_region === undefined ? {} : { brainRegion: String(args.brain_region) }), ...(args.brain_regions === undefined ? {} : { brainRegions: requireJsonArray(args.brain_regions).map(String).slice(0, 16) }), ...(args.brain_title === undefined ? {} : { brainTitle: String(args.brain_title).slice(0, 200) }), ...(args.brain_point_radius === undefined ? {} : { brainPointRadius: Number(args.brain_point_radius) }), ...(args.brain_coordinates === undefined ? {} : { brainCoordinates: requireJsonArray(args.brain_coordinates).map(value => { const row = requireJsonArray(value); if (row.length !== 3) throw new Error('Brain coordinates must contain 3 values.'); return row.map(Number) as [number, number, number] }) }), ...(args.brain_coordinate_units === undefined ? {} : { brainCoordinateUnits: args.brain_coordinate_units as 'voxel' | 'micron' }), ...(args.brain_voxel_sizes === undefined ? {} : { brainVoxelSizes: requireJsonArray(args.brain_voxel_sizes).map(Number) as [number, number, number] }), ...(args.brain_orientation === undefined ? {} : { brainOrientation: String(args.brain_orientation) }), ...(args.brain_n_free_cpus === undefined ? {} : { brainNFreeCpus: Number(args.brain_n_free_cpus) }), ...(args.brain_start_plane === undefined ? {} : { brainStartPlane: Number(args.brain_start_plane) }), ...(args.brain_end_plane === undefined ? {} : { brainEndPlane: Number(args.brain_end_plane) }), ...(args.brain_skip_classification === undefined ? {} : { brainSkipClassification: Boolean(args.brain_skip_classification) }), ...(args.background_asset_id === undefined ? {} : { backgroundAssetId: String(args.background_asset_id) }), ...(args.max_cells === undefined ? {} : { maxCells: Number(args.max_cells) }),
      })
      // Preview pixels go to the viewer RPC only, not into an Agent's text context.
      if (result.image) {
        const { pngBase64: _pixels, ...imageMetadata } = result.image
        return { ...result, image: imageMetadata } as unknown as JsonObject
      }
      if (result.cell?.preview) {
        const preview = result.cell.preview
        return { ...result, cell: { ...result.cell, preview: { ...preview, cells: preview.cells.slice(0,100), ...(preview.embedding ? { embedding: { ...preview.embedding, returnedPointCount: preview.embedding.points.length, points: preview.embedding.points.slice(0,100) } } : {}), ...(preview.expression ? { expression: { ...preview.expression, values: preview.expression.values.slice(0,100) } } : {}), agentTextSampleOnly: true }, ...(result.cell.selection ? { selection: { ...result.cell.selection, previewIndices: result.cell.selection.previewIndices.slice(0,100) } } : {}) } } as unknown as JsonObject
      }
      return result as unknown as JsonObject
    },
  })), 'zerowall-research: register science_viewer tool')
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'research_study',
    description: 'Read and update structured research records. Human gate approval and plan freezing remain UI-only actions.',
    parameters: { action: { type: 'string', required: true, enum: ['list', 'get', 'documents', 'create_document', 'register_evidence', 'audit_claim', 'method_check_evaluate', 'validate_nhanes_contract', 'validate_genetic_contract', 'obesity_alopecia_recon', 'generate_report', 'tasks', 'create_task', 'update_task', 'refresh_tasks', 'task_budget', 'reconcile_task_run'] }, project_id: { type: 'string' }, study_id: { type: 'string' }, task_id: { type: 'string' }, claim_id: { type: 'string' }, task: { type: 'json' }, expected_version: { type: 'integer' }, kind: { type: 'string' }, payload: { type: 'json' }, method: { type: 'string' }, assumptions: { type: 'json' }, contract: { type: 'json' }, report_mode: { type: 'string', enum: ['draft', 'final'] } },
    output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(args, exec: ToolRunContext) {
      const service = ctx.zerowallResearch
      const cwd = exec.agent?.session.header.cwd
      if (!cwd) throw new Error('An active workspace is required.')
      const project = service.projectForSession({ sessionId: String(exec.agent?.session.id ?? '') })
      if (!project) throw new Error('The active workspace is not registered as a ZeroWall project.')
      const requestedProjectId = args.project_id === undefined ? project.id : String(args.project_id)
      if (requestedProjectId !== project.id) throw new Error('Research study access is limited to the active project workspace.')
      if (args.action === 'list') return { studies: service.listResearchStudies(requestedProjectId) as unknown as JsonObject }
      const study = args.study_id ? service.getResearchStudy(String(args.study_id)) : undefined
      if (!study || study.projectId !== project.id) throw new Error('Research study is not in the active project.')
      if (args.action === 'get') return { study: study as unknown as JsonObject }
      if (args.action === 'documents') return { documents: service.listResearchDocuments({ studyId: String(args.study_id) }) as unknown as JsonObject }
      if (args.action === 'obesity_alopecia_recon') return service.runObesityAlopeciaRecon(study.id, exec)
      if (args.action === 'generate_report') return await service.generateResearchReport({ sessionId: String(exec.agent?.session.id ?? ''), studyId: study.id, mode: args.report_mode === 'final' ? 'final' : 'draft' })
      if (args.action === 'tasks') return { tasks: service.listResearchTasks(String(args.study_id)) as unknown as JsonObject }
      if (['task_budget', 'refresh_tasks'].includes(String(args.action))) {
        if (args.action === 'task_budget') return { budget: service.getResearchTaskBudget(String(args.study_id)) as unknown as JsonObject }
        return { tasks: service.refreshResearchTaskReadiness(String(args.study_id)) as unknown as JsonObject }
      }
      if (args.action === 'create_task') {
        const task = requireJsonObject(args.task)
        return { task: service.createResearchTask({ projectId: project.id, studyId: study.id, name: String(task.name ?? ''), kind: String(task.kind ?? ''), ...(task.dependencies === undefined ? {} : { dependencies: requireJsonArray(task.dependencies).map(String) }), exploratory: task.exploratory === true, budget: task.budget === undefined ? {} : requireJsonObject(task.budget) }) as unknown as JsonObject }
      }
      if (args.action === 'update_task') {
        const taskId = String(args.task_id ?? '')
        const current = service.listResearchTasks(study.id).find(task => task.id === taskId)
        if (!current) throw new Error('Research task is not in the active study.')
        const changes = requireJsonObject(args.task)
        return { task: service.updateResearchTask({ id: taskId, changes: { expectedVersion: Number(args.expected_version ?? current.version), ...(changes.status === undefined ? {} : { status: String(changes.status) as ResearchTaskRecord['status'] }), ...(changes.runId === undefined ? {} : { runId: changes.runId === null ? null : String(changes.runId) }), ...(changes.error === undefined ? {} : { error: changes.error === null ? null : String(changes.error) }) } } as any) as unknown as JsonObject }
      }
      if (args.action === 'reconcile_task_run') {
        const taskId = String(args.task_id ?? '')
        if (!service.listResearchTasks(study.id).some(task => task.id === taskId)) throw new Error('Research task is not in the active study.')
        return { task: service.reconcileResearchTaskRun({ id: taskId, ...(args.expected_version === undefined ? {} : { expectedVersion: Number(args.expected_version) }) }) as unknown as JsonObject }
      }
      if (args.action === 'register_evidence') return { document: service.registerResearchEvidence({ sessionId: String(exec.agent?.session.id ?? ''), projectId: project.id, studyId: study.id, payload: requireJsonObject(args.payload) }) as unknown as JsonObject }
      if (args.action === 'audit_claim') return { document: service.auditResearchClaim({ sessionId: String(exec.agent?.session.id ?? ''), claimId: String(args.claim_id ?? ''), expectedVersion: Number(args.expected_version ?? 0) }) as unknown as JsonObject }
      if (args.action === 'create_document') {
        const kind = args.kind ?? 'observation'
        if (!['observation', 'question', 'dataset-contract', 'analysis-plan'].includes(kind)) throw new Error('Agents may propose observations, questions, contracts and plans; result ingestion and evidence approval require dedicated services.')
        return { document: service.createResearchDocument({ projectId: project.id, studyId: study.id, kind: kind as ResearchRecordKind, payload: requireJsonObject(args.payload) }) as unknown as JsonObject }
      }
      if (args.action === 'method_check_evaluate') return service.methodCheckEvaluate({ studyId: String(args.study_id), method: String(args.method ?? ''), ...(args.assumptions === undefined ? {} : { assumptions: requireJsonObject(args.assumptions) }) })
      if (args.action === 'validate_nhanes_contract') return service.validateNhanesContractRemote({ studyId: String(args.study_id), contract: requireJsonObject(args.contract) })
      if (args.action === 'validate_genetic_contract') return service.validateGeneticContractRemote({ studyId: String(args.study_id), contract: requireJsonObject(args.contract) })
      throw new Error('Unsupported research study action.')
    },
  })), 'zerowall-research: register research_study tool')
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'method_check_evaluate',
    description: 'Deterministic method-fit checks of reported analysis metadata; unknown methods remain unverified. Does not certify correctness or approve research gates.',
    parameters: { context: { type: 'json', required: true } },
    output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(args) { return evaluateMethod(requireJsonObject(args.context)) },
  })), 'zerowall-research: register method check tool')
}

function requireJsonObject(value: unknown): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('A JSON object is required.')
  return value as JsonObject
}

function requireJsonArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('A JSON array is required.')
  return value
}

export async function probeEngine(id: string, path: string, executable: string, args: string[], timeoutMs = 5000): Promise<ScientificEngineStatus> {
  try { await access(executable) } catch { return { id, name: id === 'fiji' ? 'Fiji / ImageJ' : 'napari', available: false, path, reason: `未找到可执行文件：${executable}` } }
  const env = id === 'napari' ? await engineEnvironment('napari', executable) : process.env
  return await new Promise(resolve => {
    const child = spawn(executable, args, { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    const append = (chunk: unknown): void => { output = `${output}${String(chunk)}`.slice(0, 8192) }
    child.stdout.on('data', append)
    child.stderr.on('data', () => { /* Drain diagnostics without mistaking them for a version. */ })
    let settled = false
    const finish = (result: ScientificEngineStatus): void => { if (settled) return; settled = true; resolve(result) }
    const timer = setTimeout(() => { child.kill(); finish({ id, name: id === 'fiji' ? 'Fiji / ImageJ' : 'napari', available: false, path, reason: '版本探测超时。' }) }, timeoutMs)
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      const version = output.trim().split(/\r?\n/u).find(Boolean)
      if (code !== 0) finish({ id, name: id === 'fiji' ? 'Fiji / ImageJ' : 'napari', available: false, path, ...(version === undefined ? {} : { version }), reason: `版本探测失败（退出码 ${String(code)}${signal ? `，信号 ${signal}` : ''}）。` })
      else if (version === undefined) finish({ id, name: id === 'fiji' ? 'Fiji / ImageJ' : 'napari', available: false, path, reason: '版本探测未返回版本信息；需要原生窗口验收。' })
      else finish({ id, name: id === 'fiji' ? 'Fiji / ImageJ' : 'napari', available: true, path, version, reason: '可执行文件与版本探测通过。' })
    })
    child.on('error', error => { clearTimeout(timer); finish({ id, name: id === 'fiji' ? 'Fiji / ImageJ' : 'napari', available: false, path, reason: error.message }) })
  })
}

/** Probe only a user-provided managed BrainGlobe Python; never installs into napari. */
export async function probeBrainGlobe(): Promise<ScientificEngineStatus> {
  const executable = process.env.ZEROWALL_BRAINGLOBE_PYTHON?.trim()
  if (!executable) return { id: 'brainglobe', name: 'BrainGlobe managed environment', available: false, reason: '未配置 ZEROWALL_BRAINGLOBE_PYTHON；不会修改现有 napari 环境。' }
  try { await access(executable) } catch { return { id: 'brainglobe', name: 'BrainGlobe managed environment', available: false, path: executable, reason: `未找到受管理 Python：${executable}` } }
  return await new Promise(resolve => {
    const child = spawn(executable, ['-c', 'import json, importlib.metadata as m\nnames=["brainglobe-atlasapi","brainreg","cellfinder","brainrender"]\ndef version(n):\n try: return m.version(n)\n except m.PackageNotFoundError: return None\nprint(json.dumps({"packages":{n:version(n) for n in names}}))'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''; let error = ''; let settled = false
    const finish = (result: ScientificEngineStatus): void => { if (settled) return; settled = true; resolve(result) }
    const timer = setTimeout(() => { child.kill(); finish({ id: 'brainglobe', name: 'BrainGlobe managed environment', available: false, path: executable, reason: 'BrainGlobe 环境探测超时。' }) }, 8000)
    child.stdout.on('data', chunk => { output += String(chunk) })
    child.stderr.on('data', chunk => { error += String(chunk).slice(-2000) })
    child.on('close', code => { clearTimeout(timer); if (code !== 0) { finish({ id: 'brainglobe', name: 'BrainGlobe managed environment', available: false, path: executable, reason: error.trim() || `BrainGlobe Python exited with code ${code}.` }); return } try { const parsed = JSON.parse(output.trim()) as { packages?: Record<string, string | null> }; const packages = parsed.packages ?? {}; const missing = Object.entries(packages).filter(([, version]) => version == null).map(([name]) => name); finish({ id: 'brainglobe', name: 'BrainGlobe managed environment', available: missing.length === 0, path: executable, version: Object.entries(packages).map(([name, version]) => `${name}=${version ?? 'missing'}`).join(', '), ...(missing.length ? { reason: `缺少 BrainGlobe 组件：${missing.join(', ')}` } : {}) }) } catch { finish({ id: 'brainglobe', name: 'BrainGlobe managed environment', available: false, path: executable, reason: 'BrainGlobe 环境版本输出不可解析。' }) } })
  })
}

export default { inject, apply }
