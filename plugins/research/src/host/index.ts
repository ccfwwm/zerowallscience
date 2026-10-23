import type { Context } from '@deepseek-ai/cordis'
import { registerResearchAssets } from './research-assets.js'
import { SessionId, type Session, type SessionEvent } from '@deepseek-ai/dsh-session'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { defineTool, type ToolRunContext } from '@deepseek-ai/dsh-tools'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import {
  type ArtifactRecord, type AuditEventRecord, type CreateArtifactInput, type CreateDataAssetInput,
  type CreateDecisionInput, type CreateExecutionContextInput, type CreatePaperInput, type CreateResearchEdgeInput,
  type CreateRunInput, type DataAssetRecord, type DecisionRecord, type ExecutionContextRecord, type PaperRecord,
  type ProjectRecord, type ResearchEdgeRecord, type ResearchProjectSnapshot, type RunRecord, type UpdateRunChanges, type AuditReport,
  type LiteratureGraph, type LiteratureSnapshot,
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
import { installResearchRuntimeProvenance } from './runtime-provenance.js'
import { evaluateMethod } from './method-check.js'
import { validateNhanesContract } from './nhanes-contract.js'
import { NhanesSurveyService } from './nhanes-runner.js'
import { GeneticAnalysisService, type GeneticWorkflow } from './genetic-runner.js'
import type {
  NhanesSurveyRequest, GeneticAnalysisRequest, GeneticRefreshRequest, ResearchExecutionContextInput, ResearchExecutionContextRecord, ResearchJsonObject as ResearchRemoteJsonObject,
  ResearchDataAssetRecord as ResearchRemoteDataAssetRecord, ResearchViewerSessionRecord as ResearchRemoteViewerSessionRecord,
  ResearchRunRecord as ResearchRemoteRunRecord, ResearchArtifactRecord as ResearchRemoteArtifactRecord,
  ResearchPaperRecord as ResearchRemotePaperRecord, ResearchDecisionRecord as ResearchRemoteDecisionRecord,
  ResearchEdgeRecord as ResearchRemoteEdgeRecord, ResearchAuditEventRecord as ResearchRemoteAuditEventRecord,
  ResearchAuditReport as ResearchRemoteAuditReport, ResearchStudyRecord as ResearchRemoteStudyRecord,
  ResearchDocumentRecord as ResearchRemoteDocumentRecord, ResearchFreezeRecord as ResearchRemoteFreezeRecord,
  ResearchTaskRecord as ResearchRemoteTaskRecord, ResearchTaskBudgetReport as ResearchRemoteTaskBudgetReport,
  ResearchProjectRecord as ResearchRemoteProjectRecord, ResearchStudySnapshot as ResearchRemoteStudySnapshot,
  ResearchProjectSnapshot as ResearchRemoteProjectSnapshot, ResearchCreateDataAssetInput as ResearchRemoteCreateDataAssetInput,
  ResearchCreateRunInput as ResearchRemoteCreateRunInput, ResearchUpdateRunChanges as ResearchRemoteUpdateRunChanges,
  ResearchCreateArtifactInput as ResearchRemoteCreateArtifactInput, ResearchCreatePaperInput as ResearchRemoteCreatePaperInput,
  ResearchCreateDecisionInput as ResearchRemoteCreateDecisionInput, ResearchCreateEdgeInput as ResearchRemoteCreateEdgeInput,
  ResearchCreateStudyInput as ResearchRemoteCreateStudyInput, ResearchUpdateStudyInput as ResearchRemoteUpdateStudyInput,
  ResearchCreateDocumentInput as ResearchRemoteCreateDocumentInput, ResearchUpdateDocumentInput as ResearchRemoteUpdateDocumentInput,
  ResearchCreateTaskInput as ResearchRemoteCreateTaskInput, ResearchUpdateTaskInput as ResearchRemoteUpdateTaskInput,
} from '../shared/types.js'
import { validateGeneticContract } from './genetic-contract.js'
import { ScienceViewerService } from './science-viewer.js'
import { ImageViewerService } from './image-viewer.js'
import { FijiWorkflowService } from './fiji-workflow.js'
import { FijiExperimentService } from './fiji-experiments.js'
import { SangerService } from './sanger.js'
import { FlowService } from './flow.js'
import { HeService } from './he.js'
import { MoleculeService } from './molecule.js'
import { MoleculeDockingService } from './molecule-docking.js'
import type { MoleculeDockingRequest } from '../shared/molecule-docking.js'
import type { MoleculeRequest } from '../shared/types.js'
import { CanvasService } from './canvas.js'
import { ReportService } from './report.js'
import { importLocalAsset as importLocalScienceAsset, registerLocalAsset } from './local-assets.js'
import { CellViewerService } from './cell-viewer.js'
import { BrainTransformService } from './brain-transform.js'
import type { BrainTransformRequest } from '../shared/brain-transform.js'
import { BrainAtlasService, probeBrainGlobe } from './brain-atlas.js'
import type { CanvasRequest, FijiExperimentRequest, FijiExperimentResponse, FlowRequest, HeRequest, SangerRequest } from '../shared/types.js'
import type { FijiWorkflowRequest, FijiWorkflowResponse } from '../shared/types.js'
import { engineEnvironment, NativeEngineService } from './native-engines.js'
import { readFile, stat, access, mkdir } from 'node:fs/promises'
import { mkdirSync, statSync } from 'node:fs'
import { spawnWithRuntimeLease as spawn } from '../../../python/src/shared/runtime-process.js'
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ScientificPreviewPayload, ScientificEngineConfig, ScientificEngineId, ScientificEngineLaunchResult, ScientificEngineStatus, ScienceViewerRequest, ScienceViewerResponse, CellViewerRequest, BrainAtlasRequest } from '../shared/types.js'
import type { ScienceWorkbenchRequest, ScienceWorkbenchEventsResponse, ScienceWorkbenchEvent, ScienceToolId } from '../shared/types.js'
import { ScienceWorkbenchEventStore } from './workbench-events.js'
import { scienceViewerAction, scienceSkillForTool, scienceToolForAction, workbenchContext, workbenchTabTitle } from './workbench-router.js'

export type { ScientificPreviewPayload } from '../shared/types.js'
export const inject = ['tools'] as const

declare module '@deepseek-ai/cordis' {
  interface Context { zerowallResearch: ZeroWallResearchService }
  interface Context { localScienceWorkflow: LocalScienceWorkflow }
  interface Context { researchWorkflow?: { get(): GeneticWorkflow } }
}

export class ZeroWallResearchService extends TypertRemoteService {
  private readonly store: ResearchStore
  private readonly defaultProjectRoot: string
  private readonly viewer: ScienceViewerService
  private readonly nativeEngines: NativeEngineService
  private readonly imageViewer: ImageViewerService
  private readonly fijiWorkflows: FijiWorkflowService
  private readonly fijiExperiments: FijiExperimentService
  private readonly sanger: SangerService
  private readonly flow: FlowService
  private readonly he: HeService
  private readonly molecule: MoleculeService
  private readonly docking: MoleculeDockingService
  private readonly canvas: CanvasService
  private readonly reports: ReportService
  private readonly cells: CellViewerService
  private readonly brainTransforms: BrainTransformService
  private readonly brain: BrainAtlasService
  private readonly nhanes: NhanesSurveyService
  private readonly genetics: GeneticAnalysisService
  private readonly workbenchEventStore: ScienceWorkbenchEventStore

  constructor(ctx: Context) {
    super(ctx, 'zerowallResearch')
    const path = process.env.ZEROWALL_RESEARCH_DB?.trim()
    if (!path) throw new Error('ZEROWALL_RESEARCH_DB is required.')
    this.defaultProjectRoot = resolve(dirname(path), 'workspace')
    this.store = new ResearchStore(path)
    this.workbenchEventStore = new ScienceWorkbenchEventStore(this.store)
    this.viewer = new ScienceViewerService(this.store)
    this.nativeEngines = new NativeEngineService(this.store)
    this.imageViewer = new ImageViewerService(this.store, this.nativeEngines)
    this.fijiWorkflows = new FijiWorkflowService(this.store)
    this.fijiExperiments = new FijiExperimentService(this.store)
    this.sanger = new SangerService(this.store)
    this.flow = new FlowService(this.store)
    this.he = new HeService(this.store)
    this.molecule = new MoleculeService(this.store)
    this.docking = new MoleculeDockingService(this.store, () => this.ctx.get('researchWorkflow')?.get(), async (input, exec) => {
      const result = await this.ctx.tools.execute({ name: 'r_files', arguments: { action: input.action, project_id: input.projectId, remote_path: input.remotePath, local_path: input.localPath, ...(input.action === 'upload_workspace' ? { confirm: true } : {}) }, callId: ToolCallId(`docking-files-${Date.now()}`), signal: exec.signal, parent: exec.token, ...(exec.agent ? { agent: exec.agent } : {}) })
      if (result.isError) throw new Error(result.content.map(item => item.type === 'text' ? item.text : '').filter(Boolean).join('\n') || 'Docking file transfer failed.')
      return result.value as ResearchRemoteJsonObject
    })
    this.canvas = new CanvasService(this.store)
    this.reports = new ReportService(this.store)
    this.cells = new CellViewerService(this.store)
    this.brainTransforms = new BrainTransformService(this.store)
    this.brain = new BrainAtlasService(this.store)
    this.nhanes = new NhanesSurveyService(this.store, () => this.ctx.get('researchWorkflow')?.get())
    this.genetics = new GeneticAnalysisService(this.store, () => this.ctx.get('researchWorkflow')?.get(), async (input, exec) => {
      const result = await this.ctx.tools.execute({ name: 'r_files', arguments: { action: 'download_workspace', project_id: input.projectId, remote_path: input.remotePath, local_path: input.localPath }, callId: ToolCallId(`genetics-files-${Date.now()}`), signal: exec.signal, parent: exec.token, ...(exec.agent ? { agent: exec.agent } : {}) })
      if (result.isError) throw new Error(result.content.map(item => item.type === 'text' ? item.text : '').filter(Boolean).join('\n') || 'Genetics artifact download failed.')
      return result.value as ResearchRemoteJsonObject
    })
    installResearchRuntimeProvenance(ctx, this.store, sessionId => this.getActiveResearchStudy({ sessionId }))
    ctx.provide('localScienceWorkflow', {
      list: () => ({ workflow_id: 'fiji', skill: 'zerowall-fiji', operation_count: 5, location: 'local' }),
      describe: operation => {
        const id = operation ?? 'fiji.western-blot'
        if(!['fiji.western-blot','fiji.scratch-wound','fiji.colony-formation','fiji.bacterial-cfu','fiji.tube-formation'].includes(id)) throw new Error('UNKNOWN_LOCAL_OPERATION')
        return id === 'fiji.western-blot' ? { workflow_id: 'fiji', id, skill: 'zerowall-fiji-western-blot', location: 'local', runner_version: 1, summary: 'ImageJ raw grayscale blot quantification with ROI/background/saturation/loading/control audit', parameters: { request_id: 'Stable idempotency key', operation: id, arguments: { viewerId: 'Image viewer ID', expectedVersion: 'Current viewer integer revision', annotationRevisionId: 'Current accepted ROI revision ID', plan: { polarity: 'dark|bright', saturation: { lower: 'number', upper: 'number', source: 'acquisition specification' }, normalization: 'none|housekeeping|total-protein', controlGroup: 'group name or null', lanes: [{ sampleId: 'unique lane ID', biologicalReplicate: 'actual biological replicate', group: 'group name', bandRoiId: 'ROI ID', backgroundRoiId: 'ROI ID', loadingRoiId: 'required when normalized', loadingBackgroundRoiId: 'required when normalized' }] } } } } : { workflow_id: 'fiji', id, skill: 'zerowall-fiji', location: 'local', runner_version: 3, summary: id === 'fiji.bacterial-cfu' ? 'Deterministic CFU metrics plus optional project-local grayscale ROI colony segmentation' : 'Deterministic traceable Fiji experiment metric runner; image segmentation remains linked through the calling run.', parameters: { request_id: 'Stable idempotency key', operation: id, arguments: { measurements: 'Array of experiment-specific measurements with explicit sample/time/well/plate identifiers and units.', sourceAssetId: 'Required for image mode.', image: 'Original 8-bit image, ROI and threshold. Optional review references current accepted AnnotationRevision with foregroundRoiIds/excludedRoiIds/reason. Scratch timeline: fieldId,timeHours,baselineRunId,expectedHours,pixelSpacing. CFU missing dilution/volume produces counts only; colony seededCells is optional.' } } }
      },
      execute: async (sessionId,action,parameters,runId) => {
        if(action === 'run' && typeof parameters.operation === 'string' && parameters.operation !== 'fiji.western-blot') {
          const experiment = String(parameters.operation).slice('fiji.'.length) as 'scratch-wound'|'colony-formation'|'bacterial-cfu'|'tube-formation'
          const project = this.projectForSession({ sessionId }); if (!project) throw new Error('An active registered project session is required.')
          const args = requireResearchRemoteJsonObject(parameters.arguments)
          const result = await this.fijiExperiments.execute(project, { sessionId, action: 'analyze', experiment, requestId: String(parameters.request_id ?? ''), ...(args.measurements === undefined ? {} : { measurements: requireJsonArray(args.measurements).map(requireResearchRemoteJsonObject) }), ...(args.sourceAssetId === undefined ? {} : { sourceAssetId: String(args.sourceAssetId) }), ...(args.image === undefined ? {} : { image: requireResearchRemoteJsonObject(args.image) as any }) })
          return JSON.parse(JSON.stringify({ workflow_id: 'fiji', run_id: result.run?.id, status: result.run?.status, ...result })) as ResearchRemoteJsonObject
        }
        if (runId && action !== 'run' && this.store.getRun(runId)?.leaseOwner === 'fiji-experiment') {
          const project = this.projectForSession({ sessionId }); if (!project) throw new Error('An active registered project session is required.')
          const result = action === 'cancel' ? await this.fijiExperiments.cancel(project, runId) : await this.fijiExperiments.status(project, runId)
          return JSON.parse(JSON.stringify({ workflow_id: 'fiji', run_id: result.run?.id, status: result.run?.status, ...result })) as ResearchRemoteJsonObject
        }
        const args = action === 'run' ? requireResearchRemoteJsonObject(parameters.arguments) : {}
        const input: FijiWorkflowRequest = action === 'run' ? { sessionId, action: 'submit', requestId: String(parameters.request_id??''), ...(parameters.research_task_id === undefined ? {} : { researchTaskId: String(parameters.research_task_id) }), viewerId: String(args.viewerId??''), expectedVersion: Number(args.expectedVersion), annotationRevisionId: String(args.annotationRevisionId??''), plan: args.plan as unknown as NonNullable<FijiWorkflowRequest['plan']> } : { sessionId, action: action as 'status'|'cancel', ...(runId?{runId}:{}) }
        const result = await this.fijiWorkflow(input)
        return JSON.parse(JSON.stringify({ workflow_id:'fiji', run_id: result.run?.id, status: result.run?.status, ...result })) as ResearchRemoteJsonObject
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
    ctx.effect(() => async () => { this.he.dispose(); this.fijiExperiments.dispose(); this.fijiWorkflows.dispose(); this.nativeEngines.dispose(); await Promise.all([this.flow.dispose(), this.brain.dispose(), this.brainTransforms.dispose()]); this.store.close() }, 'zerowall-research: close research store')
  }

  @Remote('createExecutionContext') createExecutionContext(input: ResearchExecutionContextInput): ResearchExecutionContextRecord { return this.store.createExecutionContext(input as CreateExecutionContextInput) as ResearchExecutionContextRecord }
  @Remote('fijiWorkflow') async fijiWorkflow(input: FijiWorkflowRequest): Promise<FijiWorkflowResponse> {
    const project = this.projectForSession({ sessionId: input.sessionId })
    if (!project) throw new Error('An active registered project session is required.')
    const tool: ScienceToolId = 'imagej'
    this.workbenchEventStore.append({ sessionId: input.sessionId, projectId: project.id, type: input.action === 'submit' ? 'run.accepted' : 'tab.focus', tool, ...(input.runId ? { runId: input.runId } : {}), ...(input.viewerId ? { viewerId: input.viewerId } : {}), payload: { operation: input.action, requestId: input.requestId ?? null } })
    try {
      const result = await this.fijiWorkflows.execute(project,input)
      const run = result.run
      this.workbenchEventStore.append({ sessionId: input.sessionId, projectId: project.id, type: run?.status === 'failed' ? 'run.failed' : run?.status === 'succeeded' ? 'run.completed' : 'run.progress', tool, ...(run?.id ? { runId: run.id } : {}), payload: { operation: input.action, status: run?.status ?? null, artifactCount: result.artifacts?.length ?? 0 } })
      for (const artifact of result.artifacts ?? []) this.workbenchEventStore.append({ sessionId: input.sessionId, projectId: project.id, type: 'artifact.created', tool, ...(run?.id ? { runId: run.id } : {}), artifactId: artifact.id, payload: { operation: input.action, name: artifact.name } })
      return result
    } catch (error) {
      this.workbenchEventStore.append({ sessionId: input.sessionId, projectId: project.id, type: 'run.failed', tool, ...(input.runId ? { runId: input.runId } : {}), payload: { operation: input.action, error: error instanceof Error ? error.message : String(error) } })
      throw error
    }
  }
  @Remote('fijiExperiment') async fijiExperiment(input: FijiExperimentRequest): Promise<FijiExperimentResponse> {
    const project = this.projectForSession({ sessionId: input.sessionId })
    if (!project) throw new Error('An active registered project session is required.')
    this.workbenchEventStore.append({ sessionId: input.sessionId, projectId: project.id, type: input.action === 'analyze' ? 'run.accepted' : 'tab.focus', tool: 'imagej', ...(input.runId ? { runId: input.runId } : {}), ...(input.sourceAssetId ? { assetId: input.sourceAssetId } : {}), payload: { operation: `fiji.${input.experiment ?? input.action}`, requestId: input.requestId ?? null } })
    try {
      const result = await this.fijiExperiments.execute(project, input)
      const run = result.run
      this.workbenchEventStore.append({ sessionId: input.sessionId, projectId: project.id, type: run?.status === 'failed' ? 'run.failed' : run?.status === 'succeeded' ? 'run.completed' : 'run.progress', tool: 'imagej', ...(run?.id ? { runId: run.id } : {}), ...(input.sourceAssetId ? { assetId: input.sourceAssetId } : {}), payload: { operation: `fiji.${input.experiment ?? input.action}`, status: run?.status ?? null, artifactCount: result.artifacts?.length ?? 0 } })
      for (const artifact of result.artifacts ?? []) this.workbenchEventStore.append({ sessionId: input.sessionId, projectId: project.id, type: 'artifact.created', tool: 'imagej', ...(run?.id ? { runId: run.id } : {}), artifactId: artifact.id, ...(input.sourceAssetId ? { assetId: input.sourceAssetId } : {}), payload: { operation: `fiji.${input.experiment ?? input.action}`, name: artifact.name } })
      return result
    } catch (error) {
      this.workbenchEventStore.append({ sessionId: input.sessionId, projectId: project.id, type: 'run.failed', tool: 'imagej', ...(input.runId ? { runId: input.runId } : {}), payload: { operation: `fiji.${input.experiment ?? input.action}`, error: error instanceof Error ? error.message : String(error) } })
      throw error
    }
  }
  async executeMoleculeDocking(input: MoleculeDockingRequest, exec: ToolRunContext): Promise<ResearchRemoteJsonObject> {
    const sessionId = String(exec.agent?.session.id ?? '')
    if (sessionId !== input.sessionId) throw new Error('Docking request session does not match the execution context.')
    const project = this.projectForSession({ sessionId })
    if (!project) throw new Error('An active registered project session is required.')
    return this.docking.execute(project, input, exec)
  }
  @Remote('moleculeDocking') async moleculeDocking(input: MoleculeDockingRequest): Promise<ResearchRemoteJsonObject> {
    const session = this.ctx.get('sessions')?.get(SessionId(input.sessionId))
    if (!session) throw new Error('An active session is required.')
    return this.executeMoleculeDocking(input, { agent: { session }, callId: `rpc:docking:${input.requestId ?? input.runId ?? 'list'}`, signal: new AbortController().signal } as unknown as ToolRunContext)
  }
  @Remote('brainTransform') async brainTransform(input: BrainTransformRequest): Promise<ResearchRemoteJsonObject> {
    const project = this.projectForSession({ sessionId: input.sessionId })
    if (!project) throw new Error('An active registered project session is required.')
    return this.brainTransforms.execute(project, input)
  }
  /** Direct science_viewer calls are also reflected in the durable workbench event stream. */
  @Remote('scienceViewer') async scienceViewer(input: ScienceViewerRequest): Promise<ScienceViewerResponse> {
    const project = this.projectForSession({ sessionId: input.sessionId })
    const tool = scienceToolForAction(input.action)
    if (project && input.requestId) {
      const prior = this.workbenchEventStore.latestRequest(project.id, input.sessionId, input.requestId)
      if (prior) {
        if (prior.tool && tool && prior.tool !== tool) throw new Error('IDEMPOTENCY_CONFLICT: requestId was already used by another science tool.')
        if (prior.payload.operation !== input.action) throw new Error('IDEMPOTENCY_CONFLICT: requestId was already used with another science operation.')
        if (prior.payload.result && typeof prior.payload.result === 'object' && !Array.isArray(prior.payload.result)) return prior.payload.result as unknown as ScienceViewerResponse
        return {} as ScienceViewerResponse
      }
    }
    const emit = (type: Parameters<ScienceWorkbenchEventStore['append']>[0]['type'], payload: ResearchRemoteJsonObject = {}): void => {
      if (!project || !tool) return
      this.workbenchEventStore.append({ sessionId: input.sessionId, projectId: project.id, type, tool, ...(input.assetId ? { assetId: input.assetId } : {}), ...(input.viewerId ? { viewerId: input.viewerId } : {}), ...(input.runId ? { runId: input.runId } : {}), payload: { operation: input.action, ...(input.requestId ? { requestId: input.requestId } : {}), ...payload } })
    }
    const active = /(?:_analyze|_submit|_segment|_register|_cellfinder|_render|_transform|_revise|_measure|_save|_cancel)$/u.test(input.action)
    emit(active ? 'run.accepted' : 'tab.focus')
    try {
      const result = await this.scienceViewerImpl(input)
      const resultObject = result as unknown as ResearchRemoteJsonObject
      const nestedRuns = Object.values(resultObject).flatMap(value => value && typeof value === 'object' && !Array.isArray(value) && 'run' in value && value.run && typeof value.run === 'object' && !Array.isArray(value.run) ? [value.run as ResearchRemoteJsonObject] : [])
      const run = resultObject.run && typeof resultObject.run === 'object' && !Array.isArray(resultObject.run) ? resultObject.run as ResearchRemoteJsonObject : nestedRuns[0]
      const runId = typeof run?.id === 'string' ? run.id : input.runId
      const status = typeof run?.status === 'string' ? run.status : undefined
      const eventType: Parameters<ScienceWorkbenchEventStore['append']>[0]['type'] = status === 'succeeded' ? 'run.completed' : status === 'failed' || status === 'timed_out' ? 'run.failed' : status === 'cancelled' ? 'run.cancelled' : active ? 'run.progress' : 'tab.focus'
      emit(eventType, { ...(runId ? { runId } : {}), status: status ?? null, result: resultObject })
      const artifacts: ResearchRemoteJsonObject[] = []
      if (resultObject.artifact && typeof resultObject.artifact === 'object' && !Array.isArray(resultObject.artifact)) artifacts.push(resultObject.artifact as ResearchRemoteJsonObject)
      for (const value of Object.values(resultObject)) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) continue
        const list = 'artifacts' in value && Array.isArray(value.artifacts) ? value.artifacts : []
        for (const artifact of list) if (artifact && typeof artifact === 'object' && !Array.isArray(artifact)) artifacts.push(artifact as ResearchRemoteJsonObject)
      }
      for (const artifact of artifacts) if (typeof artifact.id === 'string') emit('artifact.created', { ...(runId ? { runId } : {}), artifactId: artifact.id, name: typeof artifact.name === 'string' ? artifact.name : null })
      return result
    } catch (error) {
      emit('run.failed', { error: error instanceof Error ? error.message : String(error) })
      throw error
    }
  }

  private async scienceViewerImpl(input: ScienceViewerRequest): Promise<ScienceViewerResponse> {
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
      if (input.expectedReverseVersion !== undefined) request.expectedReverseVersion = input.expectedReverseVersion
      if (input.reverseViewerId !== undefined) request.reverseViewerId = input.reverseViewerId
      if (input.expectedVersion !== undefined) request.expectedVersion = input.expectedVersion
      if (input.threshold !== undefined) request.threshold = input.threshold
      if (input.window !== undefined) request.window = input.window
      if (input.reference !== undefined) request.reference = input.reference
      return { sanger: await this.sanger.execute(project, request) }
    }
    if (input.action.startsWith('flow_')) {
      const request: FlowRequest = { ...(input.flow ?? {}), sessionId: input.sessionId, action: input.action.slice(5) as FlowRequest['action'] }
      if (input.importAssetId !== undefined) request.importAssetId = input.importAssetId
      if (input.assetId !== undefined) request.assetId = input.assetId
      if (input.viewerId !== undefined) request.viewerId = input.viewerId
      if (input.expectedVersion !== undefined) request.expectedVersion = input.expectedVersion
      if (input.transform !== undefined) request.transform = input.transform
      if (input.cofactor !== undefined) request.cofactor = input.cofactor
      if (input.applyCompensation !== undefined) request.applyCompensation = input.applyCompensation
      if (input.gates !== undefined) request.gates = input.gates
      if (input.previewLimit !== undefined) request.previewLimit = input.previewLimit
      if (input.assetIds !== undefined) request.assetIds = input.assetIds
      if (input.requestId !== undefined) request.requestId = input.requestId
      if (input.runId !== undefined) request.runId = input.runId
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
    if (input.action.startsWith('molecule_')) {
      const request: MoleculeRequest = { ...(input.molecule ?? {}), sessionId: input.sessionId, action: input.action.slice(9) as MoleculeRequest['action'] }
      if (input.assetId !== undefined) request.assetId = input.assetId
      if (input.viewerId !== undefined) request.viewerId = input.viewerId
      if (input.expectedVersion !== undefined) request.expectedVersion = input.expectedVersion
      return { molecule: await this.molecule.execute(project, request) }
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
    if (input.action === 'brain_transform') {
      if (!input.brainTransform) throw new Error('Brain transform request is required.')
      return { brainTransform: await this.brainTransforms.execute(project, { ...input.brainTransform, sessionId: input.sessionId }) }
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
  /** Durable workbench cursor API used by the desktop and conversation bridge. */
  @Remote('scienceWorkbenchEvents') scienceWorkbenchEvents(input: { sessionId: string; afterSequence?: number; limit?: number }): ScienceWorkbenchEventsResponse {
    const project = this.projectForSession({ sessionId: input.sessionId })
    // A tab may poll while its ordinary session is still being registered.
    // Reading an empty cursor is safe; writes and asset access remain scoped.
    if (!project) return { protocol: 'science-workbench/1', sessionId: input.sessionId, events: [], lastSequence: Math.max(0, input.afterSequence ?? 0), hasMore: false }
    return this.workbenchEventStore.read(project.id, input.sessionId, input.afterSequence, input.limit)
  }

  @Remote('scienceWorkbench') async scienceWorkbench(input: ScienceWorkbenchRequest): Promise<ResearchRemoteJsonObject> {
    const sessionId = String(input.sessionId ?? '').trim()
    const requestId = String(input.requestId ?? '').trim()
    if (!sessionId || requestId === '') throw new Error('sessionId and requestId are required.')
    if (!/^[A-Za-z0-9_.:-]{1,128}$/u.test(requestId)) throw new Error('requestId must contain 1-128 letters, numbers, dots, underscores, colons or hyphens.')
    if (input.expectedRevision !== undefined && (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 0)) throw new Error('expectedRevision must be a non-negative integer.')
    const project = this.projectForSession({ sessionId })
    if (!project) throw new Error('An active registered project session is required.')
    if (input.projectId !== undefined && input.projectId !== project.id) throw new Error('Workbench access is limited to the active project workspace.')
    const tool = input.tool
    if (input.action === 'analyze') {
      if (!tool) throw new Error('tool is required for workbench analyze.')
      const action = scienceViewerAction(tool, input.operation)
      if (input.skillId !== scienceSkillForTool[tool] || input.actionId !== action) throw new Error(`Workbench analysis requires skillId=${scienceSkillForTool[tool]} and actionId=${action}.`)
      if (!input.assetId && !input.viewerId) throw new Error('Workbench analysis requires a registered assetId or viewerId.')
    }
    const context = workbenchContext(input)
    const prior = this.workbenchEventStore.latestRequest(project.id, sessionId, requestId)
    if (prior) {
      const priorTool = prior.tool
      const priorOperation = typeof prior.payload.operation === 'string' ? prior.payload.operation : undefined
      const priorAction = typeof prior.payload.action === 'string' ? prior.payload.action : undefined
      if ((tool && priorTool && tool !== priorTool) || (priorAction && priorAction !== input.action) || (input.operation && priorOperation && input.operation !== priorOperation)) throw new Error('IDEMPOTENCY_CONFLICT: requestId was already used with different workbench inputs.')
      return { status: 'accepted', idempotent: true, action: input.action, tool: priorTool ?? tool, ...(prior.runId ? { runId: prior.runId } : {}), event: prior, ...(prior.payload.result && typeof prior.payload.result === 'object' && !Array.isArray(prior.payload.result) ? { result: prior.payload.result as ResearchRemoteJsonObject } : {}) } as unknown as ResearchRemoteJsonObject
    }
    const emit = (type: Parameters<ScienceWorkbenchEventStore['append']>[0]['type'], payload: ResearchRemoteJsonObject = {}): ScienceWorkbenchEvent => this.workbenchEventStore.append({ sessionId, projectId: project.id, type, ...(tool ? { tool } : {}), ...(input.studyId ? { studyId: input.studyId } : {}), ...(input.assetId ? { assetId: input.assetId } : {}), ...(input.artifactId ? { artifactId: input.artifactId } : {}), ...(input.viewerId ? { viewerId: input.viewerId } : {}), ...(input.runId ? { runId: input.runId } : {}), payload: { ...context, ...payload, action: input.action, requestId } })
    if (input.action === 'open' || input.action === 'focus') {
      if (!tool) throw new Error('tool is required for workbench open/focus.')
      const event = emit(input.action === 'open' ? 'tab.open' : 'tab.focus', { title: workbenchTabTitle(tool), requestId: input.requestId })
      if (input.assetId) emit('asset.selected', { requestId: input.requestId })
      return { status: 'accepted', action: input.action, tool, event } as unknown as ResearchRemoteJsonObject
    }
    if (input.action === 'engine') {
      const statuses = await this.probeScientificEngines({ sessionId: input.sessionId })
      const event = emit('engine.status', { statuses: statuses as unknown as ResearchRemoteJsonObject, requestId: input.requestId })
      return { status: 'succeeded', action: input.action, statuses: statuses as unknown as ResearchRemoteJsonObject, event } as unknown as ResearchRemoteJsonObject
    }
    if (input.action === 'status') {
      if (!input.runId) throw new Error('runId is required for workbench status.')
      const run = this.store.getRun(input.runId)
      if (!run || run.projectId !== project.id) throw new Error('Run is not in the active project.')
      if (!this.workbenchEventStore.ownsRun(project.id, sessionId, run.id)) throw new Error('Run is not owned by this workbench session.')
      return { status: run.status, run } as unknown as ResearchRemoteJsonObject
    }
    if (input.action === 'cancel') {
      if (!input.runId) throw new Error('runId is required for workbench cancel.')
      const run = this.store.getRun(input.runId)
      if (!run || run.projectId !== project.id) throw new Error('Run is not in the active project.')
      if (!this.workbenchEventStore.ownsRun(project.id, sessionId, run.id)) throw new Error('Run is not owned by this workbench session.')
      const cancellation = await this.cancelWorkbenchRun(project, sessionId, run)
      const candidate = cancellation.run
      const updated = candidate && typeof candidate === 'object' && !Array.isArray(candidate) && typeof candidate.status === 'string' && typeof candidate.id === 'string' ? candidate as unknown as RunRecord : run
      const event = emit(updated.status === 'cancelled' ? 'run.cancelled' : 'run.progress', { status: updated.status, runId: updated.id })
      return { status: updated.status, run: updated, event, ...(cancellation as unknown as ResearchRemoteJsonObject) } as unknown as ResearchRemoteJsonObject
    }
    if (input.action === 'export') {
      if (!input.artifactId) throw new Error('artifactId is required for workbench export.')
      const artifact = this.store.listArtifacts(project.id).find(item => item.id === input.artifactId)
      if (!artifact || artifact.projectId !== project.id) throw new Error('Artifact is not in the active project.')
      const event = emit('artifact.created', { requestId: input.requestId, exported: true })
      return { status: 'succeeded', artifact, event } as unknown as ResearchRemoteJsonObject
    }
    if (input.action !== 'analyze') throw new Error(`Unsupported workbench action: ${input.action}`)
    if (!tool) throw new Error('tool is required for workbench analyze.')
    const operation = scienceViewerAction(tool, input.operation)
    emit('run.accepted', { requestId: input.requestId, operation, skillId: input.skillId as string, actionId: input.actionId as string })
    try {
      const parameters = input.parameters ?? {}
      // Context fields are owned by the router; parameters cannot smuggle a
      // different session or action into the deterministic service.
      const { sessionId: _parameterSessionId, action: _parameterAction, ...safeParameters } = parameters as ResearchRemoteJsonObject & { sessionId?: unknown; action?: unknown }
      void _parameterSessionId; void _parameterAction
      const result = await this.scienceViewerImpl({ ...(safeParameters as unknown as Partial<ScienceViewerRequest>), sessionId, action: operation as ScienceViewerRequest['action'], ...(input.assetId ? { assetId: input.assetId } : {}), ...(input.viewerId ? { viewerId: input.viewerId } : {}), ...(input.expectedRevision === undefined ? {} : { expectedVersion: input.expectedRevision }), requestId })
      const resultObject = result as unknown as ResearchRemoteJsonObject
      const nestedRuns = Object.values(resultObject).flatMap(value => value && typeof value === 'object' && !Array.isArray(value) && 'run' in value && value.run && typeof value.run === 'object' && !Array.isArray(value.run) ? [value.run as ResearchRemoteJsonObject] : [])
      const run = (resultObject.run && typeof resultObject.run === 'object' && !Array.isArray(resultObject.run)) ? resultObject.run as ResearchRemoteJsonObject : nestedRuns[0]
      const runId = typeof run?.id === 'string' ? run.id : input.runId
      const runStatus = typeof run?.status === 'string' ? run.status : undefined
      const eventType: Parameters<ScienceWorkbenchEventStore['append']>[0]['type'] = runStatus === 'succeeded' ? 'run.completed' : runStatus === 'failed' || runStatus === 'timed_out' ? 'run.failed' : runStatus === 'cancelled' ? 'run.cancelled' : 'run.progress'
      const event = emit(eventType, { requestId: input.requestId, operation, ...(runId ? { runId } : {}), result: resultObject })
      return { status: 'succeeded', tool, operation, runId, result: resultObject, event } as unknown as ResearchRemoteJsonObject
    } catch (error) {
      const event = emit('run.failed', { requestId: input.requestId, operation, error: error instanceof Error ? error.message : String(error) })
      throw Object.assign(error instanceof Error ? error : new Error(String(error)), { workbenchEvent: event })
    }
  }

  private async cancelWorkbenchRun(project: ProjectRecord, sessionId: string, run: RunRecord): Promise<ResearchRemoteJsonObject> {
    const terminal = new Set(['succeeded', 'failed', 'cancelled', 'timed_out'])
    if (terminal.has(run.status)) return { run } as unknown as ResearchRemoteJsonObject
    if (run.leaseOwner === 'fiji-experiment') return await this.fijiExperiments.cancel(project, run.id) as unknown as ResearchRemoteJsonObject
    if (run.leaseOwner === 'fiji-workflow') return await this.fijiWorkflows.execute(project, { sessionId, action: 'cancel', runId: run.id }) as unknown as ResearchRemoteJsonObject
    if (run.leaseOwner === 'he-segmentation') return await this.he.execute(project, { sessionId, action: 'cancel', runId: run.id }) as unknown as ResearchRemoteJsonObject
    if (run.leaseOwner === 'flow-batch') return await this.flow.execute(project, { sessionId, action: 'batch_cancel', runId: run.id }) as unknown as ResearchRemoteJsonObject
    throw new Error(`Run owner ${run.leaseOwner ?? 'unknown'} does not expose a safe cancellation adapter.`)
  }

  @Remote('listExecutionContexts') listExecutionContexts(projectId: string): ResearchExecutionContextRecord[] { return this.store.listExecutionContexts(projectId) as ResearchExecutionContextRecord[] }
  @Remote('createDataAsset') createDataAsset(input: ResearchRemoteCreateDataAssetInput): ResearchRemoteDataAssetRecord { return this.store.createDataAsset(input as CreateDataAssetInput) as ResearchRemoteDataAssetRecord }
  @Remote('registerLocalAsset') async registerLocalAsset(input: { sessionId: string; path: string }): Promise<ResearchRemoteDataAssetRecord> {
    const project = this.projectForSession(input)
    if (!project) throw new Error('Register the current workspace before adding assets.')
    return await registerLocalAsset(this.store, project, input.path) as ResearchRemoteDataAssetRecord
  }
  @Remote('importLocalAsset') async importLocalAsset(input: { sessionId: string; sourcePath: string }): Promise<ResearchRemoteDataAssetRecord> {
    const project = this.projectForSession(input)
    if (!project) throw new Error('Register the current workspace before importing a science file.')
    return await importLocalScienceAsset(this.store, project, input.sourcePath) as ResearchRemoteDataAssetRecord
  }
  @Remote('listDataAssets') listDataAssets(projectId: string): ResearchRemoteDataAssetRecord[] { return this.store.listDataAssets(projectId) as ResearchRemoteDataAssetRecord[] }
  @Remote('createRun') createRun(input: ResearchRemoteCreateRunInput): ResearchRemoteRunRecord { return this.store.createRun(input as CreateRunInput) as ResearchRemoteRunRecord }
  @Remote('updateRun') updateRun(input: { id: string; changes: ResearchRemoteUpdateRunChanges }): ResearchRemoteRunRecord { return this.store.updateRun(input.id, input.changes as UpdateRunChanges) as ResearchRemoteRunRecord }
  @Remote('listRuns') listRuns(projectId: string): ResearchRemoteRunRecord[] { return this.store.listRuns(projectId) as ResearchRemoteRunRecord[] }
  @Remote('createArtifact') createArtifact(input: ResearchRemoteCreateArtifactInput): ResearchRemoteArtifactRecord { return this.store.createArtifact(input as CreateArtifactInput) as ResearchRemoteArtifactRecord }
  @Remote('listArtifacts') listArtifacts(projectId: string): ResearchRemoteArtifactRecord[] { return this.store.listArtifacts(projectId) as ResearchRemoteArtifactRecord[] }
  @Remote('createPaper') createPaper(input: ResearchRemoteCreatePaperInput): ResearchRemotePaperRecord { return this.store.createPaper(input as CreatePaperInput) as ResearchRemotePaperRecord }
  @Remote('listPapers') listPapers(projectId: string): ResearchRemotePaperRecord[] { return this.store.listPapers(projectId) as ResearchRemotePaperRecord[] }
  saveLiteraturePapers(projectId: string, articles: ResearchRemoteJsonObject[]): PaperRecord[] { return this.store.saveLiteraturePapers(projectId, articles) }
  getLiteratureGraph(projectId: string): LiteratureSnapshot { return this.store.getLiteratureGraph(projectId) }
  commitLiteratureGraph(projectId: string, graph: LiteratureGraph): { addedNodes: number; addedEdges: number } { return this.store.commitLiteratureGraph(projectId, graph) }
  resetLiteratureGraph(projectId: string): void { this.store.resetLiteratureGraph(projectId) }
  @Remote('createDecision') createDecision(input: CreateDecisionInput): DecisionRecord { return this.store.createDecision(input) }
  @Remote('listDecisions') listDecisions(projectId: string): DecisionRecord[] { return this.store.listDecisions(projectId) }
  @Remote('createResearchStudy') createResearchStudy(input: ResearchRemoteCreateStudyInput): ResearchRemoteStudyRecord { return this.store.createResearchStudy(input as CreateResearchStudyInput) as ResearchRemoteStudyRecord }
  @Remote('getResearchStudy') getResearchStudy(studyId: string): ResearchRemoteStudyRecord | undefined { return this.store.getResearchStudy(studyId) as ResearchRemoteStudyRecord | undefined }
  @Remote('listResearchStudies') listResearchStudies(projectId: string): ResearchRemoteStudyRecord[] { return this.store.listResearchStudies(projectId) as ResearchRemoteStudyRecord[] }
  @Remote('updateResearchStudy') updateResearchStudy(input: { id: string; changes: ResearchRemoteUpdateStudyInput }): ResearchRemoteStudyRecord {
    const study = this.store.updateResearchStudy(input.id, input.changes as UpdateResearchStudyInput) as ResearchRemoteStudyRecord
    if (input.changes.currentQuestionId !== undefined || input.changes.currentPlanId !== undefined) this.tryAutomaticGate1(study.id)
    return this.store.getResearchStudy(study.id) as ResearchRemoteStudyRecord
  }
  @Remote('createResearchDocument') createResearchDocument(input: ResearchRemoteCreateDocumentInput): ResearchRemoteDocumentRecord {
    return this.store.createResearchDocument(input as CreateResearchDocumentInput) as ResearchRemoteDocumentRecord
  }
  @Remote('getResearchDocument') getResearchDocument(documentId: string): ResearchRemoteDocumentRecord | undefined { return this.store.getResearchDocument(documentId) as ResearchRemoteDocumentRecord | undefined }
  @Remote('listResearchDocuments') listResearchDocuments(input: { studyId: string; kind?: ResearchRecordKind }): ResearchRemoteDocumentRecord[] { return this.store.listResearchDocuments(input.studyId, input.kind) as ResearchRemoteDocumentRecord[] }
  @Remote('updateResearchDocument') updateResearchDocument(input: { id: string; changes: ResearchRemoteUpdateDocumentInput }): ResearchRemoteDocumentRecord {
    const document = this.store.updateResearchDocument(input.id, input.changes as UpdateResearchDocumentInput) as ResearchRemoteDocumentRecord
    if (['question', 'dataset-contract', 'analysis-plan'].includes(document.kind)) this.tryAutomaticGate1(document.studyId)
    return document
  }
  @Remote('validateAnalysisPlan') validateAnalysisPlan(planId: string): ResearchRemoteDocumentRecord {
    const document = this.store.validateAnalysisPlan(planId) as ResearchRemoteDocumentRecord
    this.tryAutomaticGate1(document.studyId)
    return document
  }
  @Remote('methodCheckEvaluate') methodCheckEvaluate(input: { studyId: string; method: string; assumptions?: ResearchRemoteJsonObject }): ResearchRemoteJsonObject {
    const study = this.store.getResearchStudy(input.studyId)
    if (!study) throw new Error('Research study was not found.')
    const method = input.method.trim()
    if (!method) throw new Error('Method is required.')
    const result = evaluateMethod({ method, testUsed: method, ...(input.assumptions ?? {}) })
    return { studyId: study.id, ...result, checkedAt: new Date().toISOString() }
  }
  @Remote('approveResearchGate') approveResearchGate(input: { studyId: string; gate: 1 | 2; status: 'approved' | 'rejected'; expectedVersion: number; rationale: string }): ResearchRemoteStudyRecord { return this.store.approveResearchGate(input.studyId, input.gate, input.status, input.expectedVersion, input.rationale) as ResearchRemoteStudyRecord }
  @Remote('autoApproveResearchGate1') autoApproveResearchGate1(input: { sessionId: string; studyId: string; expectedVersion?: number }): ResearchRemoteJsonObject {
    const study = this.requireStudyInActiveProject(input.sessionId, input.studyId)
    this.verifyGate1Sources(study)
    const result = this.store.approveResearchGateAutomatically(study.id, input.expectedVersion ?? study.version)
    return result as unknown as ResearchRemoteJsonObject
  }
  @Remote('autoApproveResearchGate2') autoApproveResearchGate2(input: { sessionId: string; studyId: string; expectedVersion?: number }): ResearchRemoteJsonObject {
    const study = this.requireStudyInActiveProject(input.sessionId, input.studyId)
    const result = this.store.approveResearchGate2Automatically(study.id, input.expectedVersion ?? study.version)
    return result as unknown as ResearchRemoteJsonObject
  }
  private tryAutomaticGate1(studyId: string): void {
    const study = this.store.getResearchStudy(studyId)
    if (!study || study.currentFreezeId || study.gate1 === 'approved' || study.status === 'archived') return
    this.verifyGate1Sources(study)
    this.store.approveResearchGateAutomatically(studyId, study.version)
  }
  private verifyGate1Sources(study: ResearchStudyRecord): void {
    const plan = study.currentPlanId ? this.store.getResearchDocument(study.currentPlanId) : undefined
    if (plan?.studyId !== study.id || !Array.isArray(plan.payload.inputs)) return
    for (const id of plan.payload.inputs) {
      if (typeof id !== 'string') continue
      const contract = this.store.getResearchDocument(id)
      if (contract?.studyId === study.id && contract.kind === 'dataset-contract') this.store.verifyDatasetContractSource(id)
    }
  }
  private requireStudyInActiveProject(sessionId: string, studyId: string): ResearchStudyRecord {
    const project = this.ensureResearchContext({ sessionId }).project
    const study = this.store.getResearchStudy(studyId)
    if (!study || study.projectId !== project.id) throw new Error('Research study access is limited to the active project workspace.')
    return study
  }
  private gate1BeforeConfirmatoryRun(study: ResearchStudyRecord): ResearchRemoteJsonObject | undefined {
    this.verifyGate1Sources(study)
    const result = this.store.approveResearchGateAutomatically(study.id, study.version)
    if (result.status === 'approved') return undefined
    return { status: 'blocked', stage: 'gate1', studyId: study.id, label: '系统校验未通过', message: '系统校验发现缺项，已暂停确认性 Runner；检索和下载仍可继续。', blockers: result.blockers, recovery: '补齐列出的研究问题、数据契约和分析计划后，系统会自动重新校验。' } as unknown as ResearchRemoteJsonObject
  }
  @Remote('freezeResearchStudy') freezeResearchStudy(input: { studyId: string; expectedVersion: number }): ResearchRemoteFreezeRecord { return this.store.freezeResearchStudy(input.studyId, input.expectedVersion) as ResearchRemoteFreezeRecord }
  @Remote('amendResearchStudy') amendResearchStudy(input: { studyId: string; reason: string; expectedVersion: number }): ResearchRemoteStudyRecord { return this.store.amendResearchStudy(input.studyId, input.reason, input.expectedVersion) as ResearchRemoteStudyRecord }
  @Remote('listStudyFreezes') listStudyFreezes(studyId: string): ResearchRemoteFreezeRecord[] { return this.store.listStudyFreezes(studyId) as ResearchRemoteFreezeRecord[] }
  @Remote('getResearchStudySnapshot') getResearchStudySnapshot(studyId: string): ResearchRemoteStudySnapshot { return this.store.getResearchStudySnapshot(studyId) as ResearchRemoteStudySnapshot }
  @Remote('registerResearchEvidence') registerResearchEvidence(input: { sessionId: string; projectId: string; studyId: string; payload: ResearchRemoteJsonObject }): ResearchRemoteDocumentRecord {
    const active = this.projectForSession({ sessionId: input.sessionId })
    const project = this.store.getResearchStudy(input.studyId)?.projectId
    if (!active || active.id !== input.projectId || project !== input.projectId) throw new Error('Evidence study is not in the active project.')
    return this.store.registerResearchEvidence(input) as ResearchRemoteDocumentRecord
  }
  @Remote('validateNhanesContract') validateNhanesContractRemote(input: { studyId: string; contract: ResearchRemoteJsonObject }): ResearchRemoteJsonObject {
    if (!this.store.getResearchStudy(input.studyId)) throw new Error('Research study was not found.')
    return { studyId: input.studyId, ...validateNhanesContract(input.contract), checkedAt: new Date().toISOString() }
  }
  async runNhanesSurvey(input: NhanesSurveyRequest, exec: ToolRunContext): Promise<ResearchRemoteJsonObject> {
    const sessionId = String(exec.agent?.session.id ?? '')
    const { project, study } = this.ensureResearchContext({ sessionId })
    if (study.id !== input.studyId) throw new Error('NHANES run is outside the automatically bound research study.')
    // Exploratory work still passes the Runner's full contract/schema checks,
    // but it does not require a confirmatory plan freeze.
    const task = this.store.listResearchTasks(study.id).find(item => item.id === input.taskId)
    if (task?.exploratory !== true) {
      const blocked = this.gate1BeforeConfirmatoryRun(study)
      if (blocked) return blocked
    }
    return this.nhanes.execute(project, input, exec)
  }
  @Remote('runNhanesSurvey') async runNhanesSurveyRemote(input: NhanesSurveyRequest & { sessionId: string }): Promise<ResearchRemoteJsonObject> {
    const session = this.ctx.get('sessions')?.get(SessionId(input.sessionId))
    if (!session) throw new Error('An active session is required.')
    const exec = { agent: { session }, callId: `rpc:nhanes-survey:${input.requestId}`, rootCallId: `rpc:nhanes-survey:${input.requestId}`, signal: new AbortController().signal } as unknown as ToolRunContext
    return this.runNhanesSurvey(input, exec)
  }
  async runGeneticAnalysis(input: GeneticAnalysisRequest, exec: ToolRunContext): Promise<ResearchRemoteJsonObject> {
    const sessionId = String(exec.agent?.session.id ?? '')
    const { project, study } = this.ensureResearchContext({ sessionId })
    if (study.id !== input.studyId) throw new Error('Genetic analysis is outside the automatically bound research study.')
    // Exploratory work still passes the Runner's full contract/schema checks,
    // but it does not require a confirmatory plan freeze.
    const task = this.store.listResearchTasks(study.id).find(item => item.id === input.taskId)
    if (task?.exploratory !== true) {
      const blocked = this.gate1BeforeConfirmatoryRun(study)
      if (blocked) return blocked
    }
    return this.genetics.execute(project, input, exec)
  }
  async refreshGeneticAnalysis(input: GeneticRefreshRequest, exec: ToolRunContext): Promise<ResearchRemoteJsonObject> {
    const project = this.projectForSession({ sessionId: String(exec.agent?.session.id ?? '') })
    if (!project) throw new Error('An active registered project session is required.')
    return this.genetics.refresh(project, input, exec)
  }
  @Remote('runGeneticAnalysis') async runGeneticAnalysisRemote(input: GeneticAnalysisRequest & { sessionId: string }): Promise<ResearchRemoteJsonObject> {
    const session = this.ctx.get('sessions')?.get(SessionId(input.sessionId))
    if (!session) throw new Error('An active session is required.')
    return this.runGeneticAnalysis(input, { agent: { session }, callId: `rpc:genetics:${input.requestId}`, signal: new AbortController().signal } as unknown as ToolRunContext)
  }
  @Remote('refreshGeneticAnalysis') async refreshGeneticAnalysisRemote(input: GeneticRefreshRequest & { sessionId: string }): Promise<ResearchRemoteJsonObject> {
    const session = this.ctx.get('sessions')?.get(SessionId(input.sessionId))
    if (!session) throw new Error('An active session is required.')
    return this.refreshGeneticAnalysis(input, { agent: { session }, callId: `rpc:genetics-refresh:${input.runId}`, signal: new AbortController().signal } as unknown as ToolRunContext)
  }
  @Remote('validateGeneticContract') validateGeneticContractRemote(input: { studyId: string; contract: ResearchRemoteJsonObject }): ResearchRemoteJsonObject {
    if (!this.store.getResearchStudy(input.studyId)) throw new Error('Research study was not found.')
    return { studyId: input.studyId, ...validateGeneticContract(input.contract), checkedAt: new Date().toISOString() }
  }
  @Remote('auditResearchClaim') auditResearchClaim(input: { sessionId: string; claimId: string; expectedVersion: number }): ResearchRemoteDocumentRecord {
    const existingDocument = this.store.getResearchDocument(input.claimId)
    if (!existingDocument) throw new Error('Research claim was not found.')
    const study = this.store.getResearchStudy(existingDocument.studyId)
    const active = this.projectForSession({ sessionId: input.sessionId })
    if (!study || study.projectId !== existingDocument.projectId || !active || active.id !== study.projectId) throw new Error('Research claim is not in the active project.')
    const document = this.store.auditResearchClaim(input.claimId, input.expectedVersion) as ResearchRemoteDocumentRecord
    const latestStudy = this.store.getResearchStudy(document.studyId)
    if (latestStudy?.currentFreezeId && document.payload.auditStatus === 'passed') this.store.approveResearchGate2Automatically(latestStudy.id, latestStudy.version)
    return document
  }
  @Remote('createResearchTask') createResearchTask(input: ResearchRemoteCreateTaskInput): ResearchRemoteTaskRecord { return this.store.createResearchTask(input as CreateResearchTaskInput) as ResearchRemoteTaskRecord }
  @Remote('listResearchTasks') listResearchTasks(studyId: string): ResearchRemoteTaskRecord[] { return this.store.listResearchTasks(studyId) as ResearchRemoteTaskRecord[] }
  @Remote('updateResearchTask') updateResearchTask(input: { id: string; changes: ResearchRemoteUpdateTaskInput }): ResearchRemoteTaskRecord { return this.store.updateResearchTask(input.id, input.changes as UpdateResearchTaskInput) as ResearchRemoteTaskRecord }
  @Remote('refreshResearchTaskReadiness') refreshResearchTaskReadiness(studyId: string): ResearchRemoteTaskRecord[] { return this.store.refreshResearchTaskReadiness(studyId) as ResearchRemoteTaskRecord[] }
  @Remote('getResearchTaskBudget') getResearchTaskBudget(studyId: string): ResearchRemoteTaskBudgetReport { return this.store.getResearchTaskBudget(studyId) as ResearchRemoteTaskBudgetReport }
  @Remote('reconcileResearchTaskRun') reconcileResearchTaskRun(input: { id: string; expectedVersion?: number }): ResearchRemoteTaskRecord { return this.store.reconcileResearchTaskRun(input.id, input.expectedVersion) as ResearchRemoteTaskRecord }
  @Remote('generateResearchReport') async generateResearchReport(input: { sessionId: string; studyId: string; mode?: 'draft' | 'final' }): Promise<ResearchRemoteJsonObject> {
    const { project, study } = this.ensureResearchContext({ sessionId: input.sessionId })
    if (study.id !== input.studyId) throw new Error('Research report is outside the automatically bound research study.')
    const mode = input.mode ?? 'draft'
    if (mode === 'draft') return await this.reports.generate(project, study.id, mode) as unknown as ResearchRemoteJsonObject

    const blocked = this.gate1BeforeConfirmatoryRun(study)
    if (blocked) {
      const report = await this.reports.generate(project, study.id, 'draft')
      return { ...report, requestedMode: 'final', status: 'blocked', stage: 'gate1', label: '草稿报告；系统校验未通过', blockers: blocked.blockers, recovery: blocked.recovery } as unknown as ResearchRemoteJsonObject
    }

    const frozenStudy = this.store.getResearchStudy(study.id)!
    const gate2 = this.store.approveResearchGate2Automatically(frozenStudy.id, frozenStudy.version)
    if (gate2.status === 'blocked') {
      const report = await this.reports.generate(project, gate2.study.id, 'draft')
      return { ...report, requestedMode: 'final', status: 'blocked', stage: 'gate2', label: '草稿报告；系统校验未通过', blockers: gate2.blockers, recovery: '补充可核实的证据并完成所有结论的确定性审计后，系统会重新校验。' } as unknown as ResearchRemoteJsonObject
    }

    const report = await this.reports.generate(project, gate2.study.id, 'final')
    // ReportService can still downgrade a final request when its own
    // consistency checks find a blocker after Gate 2 (for example an
    // unreviewed evidence record). Do not claim success while returning a
    // draft artifact; expose the recoverable report blockers instead.
    if (report.mode !== 'final' || report.needsReview || report.blockers.length > 0) {
      return {
        ...report,
        requestedMode: 'final',
        status: 'blocked',
        stage: 'report',
        label: '草稿报告；报告校验未通过',
        recovery: '处理报告列出的阻断项后，系统会重新校验并生成正式报告。',
      } as unknown as ResearchRemoteJsonObject
    }
    return { ...report, status: 'succeeded', label: '系统校验通过' } as unknown as ResearchRemoteJsonObject
  }
  /**
   * Probe every engine the Host knows about. The previous implementation
   * returned a fixed three-element array, so he-python, he-stardist and
   * remote-r were never probed and their status was whatever the UI defaulted to.
   */
  @Remote('probeScientificEngines') async probeScientificEngines(input: { sessionId?: string }): Promise<ScientificEngineStatus[]> {
    const project = input?.sessionId ? this.projectForSession({ sessionId: input.sessionId }) : undefined
    const configs = await this.nativeEngines.configs(project?.id)
    return await Promise.all(configs.map(async config => {
      try { return await this.nativeEngines.probe(project?.id, config.id) }
      catch (error) { return { id: config.id, name: config.id, available: false, status: 'invalid' as const, source: config.source, reason: String(error) } }
    }))
  }
  /**
   * Download the managed atlas. Exposed as its own remote because the
   * science_viewer action union is protocol-owned and the installation is
   * environment setup, not a project analysis step, so it must work before a
   * project exists.
   */
  @Remote('installBrainAtlas') async installBrainAtlas(input: { sessionId?: string; atlasDirectory?: string }): Promise<ResearchRemoteJsonObject> {
    const result = await this.brain.installAtlas(input.atlasDirectory ? { atlasDirectory: input.atlasDirectory } : {})
    // Installing the managed atlas only prepares the engine.  It must not
    // create/select a project asset or open/read a viewer: those are explicit
    // user actions from the BrainGlobe page.  This prevents the atlas from
    // appearing as the current asset immediately after startup or installation.
    return result
  }
  @Remote('getScientificEngineConfigs') async getScientificEngineConfigs(input: { sessionId: string }): Promise<ScientificEngineConfig[]> {
    const project = this.projectForSession(input)
    return this.nativeEngines.configs(project?.id)
  }
  @Remote('setScientificEngineConfig') async setScientificEngineConfig(input: { sessionId: string; config: ScientificEngineConfig }): Promise<ScientificEngineConfig> {
    const project = this.projectForSession(input)
    return this.nativeEngines.setConfig(project?.id, input.config)
  }
  @Remote('probeScientificEngine') async probeScientificEngine(input: { sessionId: string; engine: ScientificEngineId }): Promise<ScientificEngineStatus> {
    const project = this.projectForSession(input)
    return await this.nativeEngines.probe(project?.id, input.engine)
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
  @Remote('createEdge') createEdge(input: ResearchRemoteCreateEdgeInput): ResearchRemoteEdgeRecord { return this.store.createResearchEdge(input as CreateResearchEdgeInput) as unknown as ResearchRemoteEdgeRecord }
  @Remote('listEdges') listEdges(projectId: string): ResearchRemoteEdgeRecord[] { return this.store.listResearchEdges(projectId) as unknown as ResearchRemoteEdgeRecord[] }
  @Remote('listAuditEvents') listAuditEvents(projectId: string): ResearchRemoteAuditEventRecord[] { return this.store.listAuditEvents(projectId) as unknown as ResearchRemoteAuditEventRecord[] }
  @Remote('projectForSession') projectForSession(input: { sessionId: string }): ResearchRemoteProjectRecord | undefined {
    const sessionId = String(input.sessionId ?? '').trim()
    if (!sessionId) return undefined
    const session = this.ctx.get('sessions')?.get(SessionId(sessionId))
    if (!session) return undefined
    return this.ensureResearchContext({ sessionId }).project as unknown as ResearchRemoteProjectRecord
  }
  /** One idempotent entry point shared by Research UI, MCP tools and Runners. */
  @Remote('ensureResearchContext') ensureResearchContext(input: { sessionId: string; target?: string }): { project: ResearchRemoteProjectRecord; study: ResearchRemoteStudyRecord; createdProject: boolean; createdStudy: boolean; targetFingerprint: string } {
    const sessionId = String(input.sessionId ?? '').trim()
    if (!sessionId) throw new Error('An active conversation session is required.')
    const session = this.ctx.get('sessions')?.get(SessionId(sessionId))
    if (!session) throw new Error('The active conversation session is not available; research context can be retried when it reconnects.')
    const cwd = session.header.cwd ? resolve(session.header.cwd) : this.defaultProjectRoot
    if (!isAbsolute(cwd)) throw new Error('The session workspace path must be absolute.')
    if (!session.header.cwd) mkdirSync(cwd, { recursive: true })
    let info
    try { info = statSync(cwd) } catch { throw new Error(`Research workspace is unavailable: ${cwd}; restore or select a valid workspace and retry.`) }
    if (!info.isDirectory()) throw new Error(`Research workspace is not a directory: ${cwd}; select a valid workspace and retry.`)
    // Use the same durable user-authored objective at every entry point. A
    // tool's abbreviated target must not establish a different binding from
    // the nested Runner, Gate or UI calls that read the conversation itself.
    // Explicit hints remain useful for headless sessions without user text.
    const target = researchTargetFromSession(session) || boundedResearchTarget(input.target)
    const rootPath = resolve(cwd)
    const result = this.store.ensureResearchContext({ sessionId, rootPath, projectName: session.header.cwd ? basename(rootPath) || rootPath : '科研工作台', ...(target ? { target } : {}) })
    return {
      project: result.project as ResearchRemoteProjectRecord,
      study: result.study as ResearchRemoteStudyRecord,
      createdProject: result.createdProject,
      createdStudy: result.createdStudy,
      targetFingerprint: result.targetFingerprint,
    }
  }
  @Remote('registerSessionProject') async registerSessionProject(input: { sessionId: string }): Promise<ResearchRemoteProjectRecord> {
    return this.ensureResearchContext(input).project as unknown as ResearchRemoteProjectRecord
  }
  @Remote('getActiveResearchStudy') getActiveResearchStudy(input: { sessionId: string }): ResearchRemoteStudyRecord | undefined {
    const project = this.projectForSession(input)
    return project ? this.store.getSessionResearchStudy(project.id, input.sessionId) as unknown as ResearchRemoteStudyRecord | undefined : undefined
  }
  @Remote('setActiveResearchStudy') setActiveResearchStudy(input: { sessionId: string; studyId: string | null }): ResearchRemoteStudyRecord | undefined {
    const ensured = this.ensureResearchContext(input)
    const project = ensured.project
    if (input.studyId) {
      const study = this.store.getResearchStudy(input.studyId)
      if (!study || study.projectId !== project.id) throw new Error('Research study access is limited to the active project workspace.')
    }
    return this.store.setSessionResearchStudy(project.id, input.sessionId, input.studyId, ensured.targetFingerprint) as unknown as ResearchRemoteStudyRecord | undefined
  }
  @Remote('getAuditReport') getAuditReport(projectId: string): ResearchRemoteAuditReport { return this.store.getAuditReport(projectId) as unknown as ResearchRemoteAuditReport }
  @Remote('exportAuditReport') exportAuditReport(input: { projectId: string; format: 'json' | 'markdown' }): string { return this.store.exportAuditReport(input.projectId, input.format) }
  @Remote('exportSnapshot') exportSnapshot(projectId: string): ResearchRemoteProjectSnapshot { return this.store.exportResearchSnapshot(projectId) as unknown as ResearchRemoteProjectSnapshot }
  @Remote('importSnapshot') importSnapshot(snapshot: ResearchRemoteProjectSnapshot): ResearchRemoteProjectRecord { return this.store.importResearchSnapshot(snapshot as unknown as ResearchProjectSnapshot) as unknown as ResearchRemoteProjectRecord }
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

function boundedResearchTarget(value: unknown): string {
  return typeof value === 'string' ? value.replaceAll('\0', '').trim().slice(0, 5000) : ''
}

/** Read only the user's own latest plain-text message; tool output, assistant text,
 * attachments and injected context never become research instructions. */
function researchTargetFromSession(session: Session): string {
  const events = session.snapshotEvents() as readonly unknown[]
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index]
    if (!event || typeof event !== 'object' || (event as { type?: unknown }).type !== 'user/message') continue
    const data = (event as { data?: unknown }).data
    if (!data || typeof data !== 'object') continue
    const message = data as { source?: { kind?: unknown }; content?: unknown }
    if (message.source?.kind !== undefined && message.source.kind !== 'user') continue
    if (!Array.isArray(message.content)) continue
    const text = message.content.filter((block): block is { type: 'text'; text: string } => !!block && typeof block === 'object' && (block as { type?: unknown }).type === 'text' && typeof (block as { text?: unknown }).text === 'string').map(block => block.text).join('\n')
    return boundedResearchTarget(text)
  }
  return ''
}

function isWithin(path: string, root: string): boolean {
  const normalizedPath = resolve(path)
  const normalizedRoot = resolve(root)
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}${process.platform === 'win32' ? '\\' : '/'}`)
}

export function apply(ctx: Context): void {
  ctx.inject(['webServer'], webCtx => registerResearchAssets(webCtx))
  ctx.plugin(ZeroWallResearchService)
  ctx.inject(['zerowallResearch'], registerResearchTools)
}

function registerResearchTools(ctx: Context): void {
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'science_workbench',
    description: 'Route conversation actions to the ZeroWall Science workbench. Opens/focuses a tool, starts an existing deterministic analysis, reads status, cancels or exports. This router never invents scientific numeric results.',
    parameters: {
      action: { type: 'string', required: true, enum: ['open', 'focus', 'analyze', 'status', 'cancel', 'export', 'engine'] },
      session_id: { type: 'string', description: 'Optional when called from the active conversation; Host uses the agent session id.' }, project_id: { type: 'string' }, study_id: { type: 'string' },
      tool: { type: 'string', enum: ['home', 'imagej', 'he', 'molecule', 'sanger', 'flow', 'canvas', 'cells', 'sequence', 'brainglobe'] },
      asset_id: { type: 'string' }, artifact_id: { type: 'string' }, viewer_id: { type: 'string' }, run_id: { type: 'string' },
      operation: { type: 'string' }, parameters: { type: 'json' }, request_id: { type: 'string', required: true }, expected_revision: { type: 'integer' },
      skill_id: { type: 'string', description: 'Required for analyze; must match the selected science tool.' }, action_id: { type: 'string', description: 'Required for analyze; must match the resolved Host action.' },
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(args, exec) {
      const sessionId = String(args.session_id ?? exec.agent?.session.id ?? '').trim()
      if (!sessionId) throw new Error('An active conversation session is required.')
      return ctx.zerowallResearch.scienceWorkbench({
        action: String(args.action) as ScienceWorkbenchRequest['action'], sessionId, requestId: String(args.request_id),
        ...(args.project_id === undefined ? {} : { projectId: String(args.project_id) }), ...(args.study_id === undefined ? {} : { studyId: String(args.study_id) }),
        ...(args.tool === undefined ? {} : { tool: String(args.tool) as ScienceToolId }), ...(args.asset_id === undefined ? {} : { assetId: String(args.asset_id) }),
        ...(args.artifact_id === undefined ? {} : { artifactId: String(args.artifact_id) }), ...(args.viewer_id === undefined ? {} : { viewerId: String(args.viewer_id) }),
        ...(args.run_id === undefined ? {} : { runId: String(args.run_id) }), ...(args.operation === undefined ? {} : { operation: String(args.operation) }),
        ...(args.skill_id === undefined ? {} : { skillId: String(args.skill_id) }), ...(args.action_id === undefined ? {} : { actionId: String(args.action_id) }),
        ...(args.parameters === undefined ? {} : { parameters: requireResearchRemoteJsonObject(args.parameters) }), ...(args.expected_revision === undefined ? {} : { expectedRevision: Number(args.expected_revision) }),
      })
    },
  })), 'zerowall-research: register science_workbench router')
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'science_viewer',
    description: 'View registered AnnData H5AD (local h5py/NumPy required; first-N previews and whole-X descriptive QC), FASTA (<=16 MiB), SCF/AB1 Sanger traces, and PNG/JPEG/TIFF (<=128 MiB); analyze sequences, Sanger traces, accepted image ROIs and single-channel integer label masks with bounded raw-pixel statistics, export/import traceable results. Launch local Fiji/napari and inspect process status (not GUI readiness). No study required. Sequence coordinates 1-based inclusive; image coordinates original pixel edges with 0-based page (not assumed Z/T). Image intensity and mask results are descriptive and remain pending scientific review. Sanger quality is stored-call confidence, not a Phred score; incomplete AB1 tags are rejected.',
      parameters: {
      he: { type: 'json', description: 'HE segmentation parameters: requestId/runId, viewerId, expectedVersion, region and segmentation {tileSize,halo,probabilityThreshold,nmsThreshold,threads}; operates within the active project.' },
      docking: { type: 'json', description: 'Docking request: receptorAssetId, ligandAssetId, expectedReceptorVersion, expectedLigandVersion, preparationSource, box {center:[x,y,z],size:[x,y,z]} in angstroms, threads 1–8, requestId or runId. Submit uploads the selected prepared receptor to the configured remote service.' },
      action: { type: 'string', required: true, enum: ['list', 'open', 'read', 'save', 'analyze', 'export', 'launch_native', 'native_status', 'image_open', 'image_read', 'image_save', 'image_analyze', 'image_mask_analyze', 'annotation_save', 'annotation_export', 'annotation_import', 'annotation_launch', 'annotation_collect', 'sanger_open', 'sanger_analyze', 'sanger_export', 'sanger_review', 'sanger_revise', 'flow_open', 'flow_analyze', 'flow_export', 'flow_import', 'flow_workspace_import', 'flow_batch_submit', 'flow_batch_status', 'flow_batch_cancel', 'flow_batch_list', 'he_open', 'he_read', 'he_analyze', 'he_export', 'he_segment', 'he_status', 'he_cancel', 'canvas_render', 'canvas_export', 'cell_open', 'cell_read', 'cell_analyze', 'cell_export', 'cell_select', 'cell_export_selection', 'cell_view', 'brain_open', 'brain_read', 'brain_analyze', 'brain_export', 'brain_cells', 'brain_trajectory', 'brain_register', 'brain_cellfinder', 'brain_render', 'brain_transform', 'dock_list', 'dock_submit', 'dock_status', 'dock_cancel', 'molecule_open', 'molecule_read', 'molecule_save', 'molecule_measure', 'molecule_export'] },
      molecule: { type: 'json', description: 'Molecule actions: state {chain:null|string,residueId:null|string,representation:ball-and-stick/cartoon/molecular-surface,camera:null|snapshot,atomA:null|index,atomB:null|index}; atomA/atomB are 0-based source-first-model atom indices. PDB/mmCIF <=16 MiB, first model <=100000 atoms. Distances are source Cartesian angstroms; exports retain original structure and provenance. No Vina/docking claim.' },
      engine: { type: 'string', enum: ['fiji', 'napari'], description: 'Required for launch_native; optional asset_id must reference a local project TIFF/PNG/JPEG/BMP.' },
      asset_id: { type: 'string' }, viewer_id: { type: 'string' }, reverse_viewer_id: { type: 'string' }, expected_revision: { type: 'integer' },
      state: { type: 'json', description: 'recordIndex (0-based), start, count (<=10,000), selectionStart and selectionEnd (1-based inclusive).' },
      reverse_expected_revision: { type: 'integer', description: 'Required reverse trace viewer revision for bidirectional Sanger review.' },
      sequence_options: { type: 'json', description: 'PCR primers/annealing lengths/topology or ordered assembly fragments/minimumOverlap/enzyme; validated by the deterministic sequence simulator.' },
      operation: { type: 'string', enum: ['reverse-complement', 'translate', 'restriction', 'crispr', 'pcr', 'gibson', 'golden-gate'] }, crispr_target: { type: 'string', description: 'Optional 20-base SpCas9 guide target.' }, crispr_max_mismatches: { type: 'integer', description: 'SpCas9 candidate mismatch bound, 0–3.' },
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
      canvas_spec: { type: 'json', description: 'Canvas project: title, width, height, xLabel, yLabel, series[{id,name,color,mode,points[{x,y,label?}]}], annotations, xRange/yRange, showLegend and source references. Optional panels are up to eight additional complete non-nested specs; columns 1–3.' },
      image_state: { type: 'json', description: 'Image view: page (0-based; not assumed Z/T), zoom (0.1–20), panX, panY.' },
      annotation: { type: 'json', description: 'expectedRevisionId (string or null), payload: coordinates {convention: pixel-edge-top-left, width, height, pages, calibration: null or {x,y,unit: um/mm,source}}, rois [{id,name,page,kind: rectangle/point/polygon,...coordinates}]. Stale saves are preserved as conflict branches.' },
      annotation_revision_id: { type: 'string', description: 'Optional accepted annotation revision to analyze or export; defaults to the current accepted head.' },
      mask_asset_id: { type: 'string', description: 'Registered local single-channel unsigned integer label mask for image_mask_analyze; geometry, pages and source hash are recorded separately.' },
      mask_labels: { type: 'json', description: 'Optional explicit non-negative integer label subset (1–256 values). If omitted, at most 256 labels are discovered per ROI.' },
      import_asset_id: { type: 'string', description: 'Registered local annotation exchange JSON asset for annotation_import.' },
      asset_ids: { type: 'json', description: 'For flow_batch_submit, 1–64 registered local FCS asset IDs. Each file is validated and reported independently.' },
      request_id: { type: 'string', description: 'Stable Flow batch submission id. Retries with identical inputs return the same Run; a reused id with changed inputs is refused.' },
      run_id: { type: 'string', description: 'Flow batch Run ID for flow_batch_status or flow_batch_cancel.' },
      launch_id: { type: 'string', description: 'Native annotation launch to collect after the user saves the return in Fiji/napari. Repeated collection is idempotent.' },
      cell_camera: { type: 'json', description: '{zoom:1..100,panX:-200..200,panY:-200..200}; normalized clip-space camera. cell_view saves without reading H5AD. Existing-view actions may preserve the current camera; switching embedding resets it.' },
      cell_selection: { type: 'json', description: 'Cell polygon in stored embedding coordinates: {embedding, axes:[0,1], polygon:[[x,y],...]}. 3–128 vertices. Applies to ALL observations, not just preview. Null clears. Required saved geometry for cell_export_selection.' },
      sanger_edits: { type: 'json', description: 'Manual Sanger substitutions [{position,from,to,reason}], one-based original call positions; edited quality remains unknown.' },
      brain_transform: { type: 'json', description: 'Brainreg transform request: action inspect|map, registrationArtifactId, coordinateSpace brainreg-downsampled-asr-voxel and coordinates. Original sample/cellfinder XYZ is not accepted.' },
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
      if (String(args.action).startsWith('dock_')) {
        return ctx.zerowallResearch.executeMoleculeDocking({ ...requireResearchRemoteJsonObject(args.docking ?? {}), sessionId: String(sessionId), action: String(args.action).slice(5) } as unknown as MoleculeDockingRequest, exec)
      }
      const result = await ctx.zerowallResearch.scienceViewer({
        sessionId: String(sessionId), action: args.action as ScienceViewerRequest['action'],
        ...(args.engine === undefined ? {} : { engine: args.engine as 'fiji' | 'napari' }),
        ...(args.asset_id === undefined ? {} : { assetId: String(args.asset_id) }),
        ...(args.viewer_id === undefined ? {} : { viewerId: String(args.viewer_id) }),
        ...(args.expected_revision === undefined ? {} : { expectedVersion: Number(args.expected_revision) }),
        ...(args.state === undefined ? {} : { state: requireResearchRemoteJsonObject(args.state) as unknown as NonNullable<ScienceViewerRequest['state']> }),
        ...(args.sequence_options === undefined ? {} : { sequenceOptions: requireResearchRemoteJsonObject(args.sequence_options) as NonNullable<ScienceViewerRequest['sequenceOptions']> }),
        ...(args.operation === undefined ? {} : { operation: args.operation as NonNullable<ScienceViewerRequest['operation']> }), ...(args.crispr_target === undefined ? {} : { crisprTarget: String(args.crispr_target) }), ...(args.crispr_max_mismatches === undefined ? {} : { crisprMaxMismatches: Number(args.crispr_max_mismatches) }),
        ...((args.threshold === undefined && args.window === undefined && args.reference === undefined && args.reverse_viewer_id === undefined) ? {} : { sanger: {
          sessionId: String(sessionId),
          action: String(args.action).slice(7) as NonNullable<ScienceViewerRequest['sanger']>['action'],
          ...(args.asset_id === undefined ? {} : { assetId: String(args.asset_id) }),
          ...(args.viewer_id === undefined ? {} : { viewerId: String(args.viewer_id) }),
          ...(args.reverse_expected_revision === undefined ? {} : { expectedReverseVersion: Number(args.reverse_expected_revision) }),
          ...(args.reverse_viewer_id === undefined ? {} : { reverseViewerId: String(args.reverse_viewer_id) }),
          ...(args.expected_revision === undefined ? {} : { expectedVersion: Number(args.expected_revision) }),
          ...(args.threshold === undefined ? {} : { threshold: Number(args.threshold) }),
          ...(args.window === undefined ? {} : { window: Number(args.window) }),
        ...(args.reference === undefined ? {} : { reference: String(args.reference) }),
        } }),
        ...(args.he === undefined ? {} : { he: { ...requireResearchRemoteJsonObject(args.he), sessionId: String(sessionId), action: String(args.action).slice(3) } as unknown as HeRequest }),
        ...(args.molecule === undefined ? {} : { molecule: { ...requireResearchRemoteJsonObject(args.molecule), sessionId: String(sessionId), action: String(args.action).slice(9) } as unknown as MoleculeRequest }),
        ...(args.region === undefined ? {} : { region: requireResearchRemoteJsonObject(args.region) as unknown as NonNullable<ScienceViewerRequest['region']> }),
        ...(args.canvas_spec === undefined ? {} : { canvas: { sessionId: String(sessionId), action: String(args.action).slice(7) as 'render' | 'export', spec: requireResearchRemoteJsonObject(args.canvas_spec) as unknown as NonNullable<ScienceViewerRequest['canvas']>['spec'] } }),
        ...((args.transform === undefined && args.cofactor === undefined && args.apply_compensation === undefined && args.gates === undefined && args.preview_limit === undefined && args.asset_ids === undefined && args.request_id === undefined && args.run_id === undefined) ? {} : { flow: {
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
          ...(args.asset_ids === undefined ? {} : { assetIds: requireJsonArray(args.asset_ids).map(String) }),
          ...(args.request_id === undefined ? {} : { requestId: String(args.request_id) }),
          ...(args.run_id === undefined ? {} : { runId: String(args.run_id) }),
        } }),
        ...(args.image_state === undefined ? {} : { imageState: requireResearchRemoteJsonObject(args.image_state) as unknown as NonNullable<ScienceViewerRequest['imageState']> }),
        ...(args.annotation === undefined ? {} : { annotation: requireResearchRemoteJsonObject(args.annotation) as unknown as NonNullable<ScienceViewerRequest['annotation']> }),
        ...(args.annotation_revision_id === undefined ? {} : { annotationRevisionId: String(args.annotation_revision_id) }),
        ...(args.mask_asset_id === undefined ? {} : { maskAssetId: String(args.mask_asset_id) }),
        ...(args.mask_labels === undefined ? {} : { maskLabels: requireJsonArray(args.mask_labels).map(Number) }),
        ...(args.import_asset_id === undefined ? {} : { importAssetId: String(args.import_asset_id) }),
        ...(args.launch_id === undefined ? {} : { launchId: String(args.launch_id) }),
        ...(args.embedding === undefined ? {} : { embedding: String(args.embedding) }),
        ...(args.embedding_limit === undefined ? {} : { embeddingLimit: Number(args.embedding_limit) }),
        ...(args.gene === undefined ? {} : { gene: String(args.gene) }),
        ...(args.cell_limit === undefined ? {} : { cellLimit: Number(args.cell_limit) }),
        ...(args.group_by === undefined ? {} : { groupBy: String(args.group_by) }),
        ...(args.cell_camera === undefined ? {} : { cellCamera: requireResearchRemoteJsonObject(args.cell_camera) as unknown as NonNullable<ScienceViewerRequest['cellCamera']> }),
        ...(args.cell_selection === undefined ? {} : { cellSelection: args.cell_selection === null ? null : requireResearchRemoteJsonObject(args.cell_selection) as unknown as NonNullable<ScienceViewerRequest['cellSelection']> }),
        ...(args.sanger_edits === undefined ? {} : { sanger: { sessionId: String(sessionId), action: 'revise' as const, edits: requireJsonArray(args.sanger_edits) as unknown as import('../shared/sanger-revision.js').SangerEdit[] } }),
        ...(args.brain_transform === undefined ? {} : { brainTransform: { ...requireResearchRemoteJsonObject(args.brain_transform), sessionId: String(exec.agent?.session.id ?? '') } as unknown as BrainTransformRequest }),
        ...(args.brain_axis === undefined ? {} : { brainAxis: Number(args.brain_axis) as 0 | 1 | 2 }), ...(args.brain_index === undefined ? {} : { brainIndex: Number(args.brain_index) }), ...(args.brain_downsample === undefined ? {} : { brainDownsample: Number(args.brain_downsample) }), ...(args.brain_region === undefined ? {} : { brainRegion: String(args.brain_region) }), ...(args.brain_regions === undefined ? {} : { brainRegions: requireJsonArray(args.brain_regions).map(String).slice(0, 16) }), ...(args.brain_title === undefined ? {} : { brainTitle: String(args.brain_title).slice(0, 200) }), ...(args.brain_point_radius === undefined ? {} : { brainPointRadius: Number(args.brain_point_radius) }), ...(args.brain_coordinates === undefined ? {} : { brainCoordinates: requireJsonArray(args.brain_coordinates).map(value => { const row = requireJsonArray(value); if (row.length !== 3) throw new Error('Brain coordinates must contain 3 values.'); return row.map(Number) as [number, number, number] }) }), ...(args.brain_coordinate_units === undefined ? {} : { brainCoordinateUnits: args.brain_coordinate_units as 'voxel' | 'micron' }), ...(args.brain_voxel_sizes === undefined ? {} : { brainVoxelSizes: requireJsonArray(args.brain_voxel_sizes).map(Number) as [number, number, number] }), ...(args.brain_orientation === undefined ? {} : { brainOrientation: String(args.brain_orientation) }), ...(args.brain_n_free_cpus === undefined ? {} : { brainNFreeCpus: Number(args.brain_n_free_cpus) }), ...(args.brain_start_plane === undefined ? {} : { brainStartPlane: Number(args.brain_start_plane) }), ...(args.brain_end_plane === undefined ? {} : { brainEndPlane: Number(args.brain_end_plane) }), ...(args.brain_skip_classification === undefined ? {} : { brainSkipClassification: Boolean(args.brain_skip_classification) }), ...(args.background_asset_id === undefined ? {} : { backgroundAssetId: String(args.background_asset_id) }), ...(args.max_cells === undefined ? {} : { maxCells: Number(args.max_cells) }),
      })
      // Preview pixels go to the viewer RPC only, not into an Agent's text context.
      if (result.image) {
        const { pngBase64: _pixels, ...imageMetadata } = result.image
        return { ...result, image: imageMetadata } as unknown as ResearchRemoteJsonObject
      }
      if (result.cell?.preview) {
        const preview = result.cell.preview
        return { ...result, cell: { ...result.cell, preview: { ...preview, cells: preview.cells.slice(0,100), ...(preview.embedding ? { embedding: { ...preview.embedding, returnedPointCount: preview.embedding.points.length, points: preview.embedding.points.slice(0,100) } } : {}), ...(preview.expression ? { expression: { ...preview.expression, values: preview.expression.values.slice(0,100) } } : {}), agentTextSampleOnly: true }, ...(result.cell.selection ? { selection: { ...result.cell.selection, previewIndices: result.cell.selection.previewIndices.slice(0,100) } } : {}) } } as unknown as ResearchRemoteJsonObject
      }
      if (result.canvas?.canvas) {
        const { svg, ...summary } = result.canvas.canvas
        return { ...result, canvas: { ...result.canvas, canvas: { ...summary, svgBytes: Buffer.byteLength(svg), svgOmittedFromAgentText: true } } } as unknown as ResearchRemoteJsonObject
      }
      return result as unknown as ResearchRemoteJsonObject
    },
  })), 'zerowall-research: register science_viewer tool')
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'research_study',
    description: 'Read and update structured research records. Research Project/Study context and draft records are prepared automatically. The system may approve Gate 1 and freeze a validated plan, or return recoverable blockers; data discovery and downloads can continue while blockers are resolved. Gate 2 passes only after deterministic evidence audits succeed.',
    parameters: { action: { type: 'string', required: true, enum: ['list', 'get', 'documents', 'create_document', 'register_evidence', 'audit_claim', 'auto_gate1', 'auto_gate2', 'method_check_evaluate', 'validate_nhanes_contract', 'run_nhanes_survey', 'run_genetic_analysis', 'refresh_genetic_analysis', 'validate_genetic_contract', 'generate_report', 'tasks', 'create_task', 'update_task', 'refresh_tasks', 'task_budget', 'reconcile_task_run'] }, project_id: { type: 'string' }, study_id: { type: 'string' }, target: { type: 'string', description: 'Fallback research objective for headless sessions without user text. The latest user-authored request is the canonical bounded draft when available.' }, task_id: { type: 'string' }, claim_id: { type: 'string' }, evaluation_id: { type: 'string' }, task: { type: 'json' }, expected_version: { type: 'integer' }, kind: { type: 'string' }, payload: { type: 'json' }, method: { type: 'string' }, assumptions: { type: 'json' }, contract: { type: 'json' }, run_id: { type: 'string' }, contract_id: { type: 'string' }, plan_id: { type: 'string' }, request_id: { type: 'string' }, expected_revision: { type: 'integer', description: 'Expected analysis plan version for run_nhanes_survey. The saved plan must contain nhanesSurvey and reference contract_id in inputs.' }, report_mode: { type: 'string', enum: ['draft', 'final'] } },
    output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(args, exec: ToolRunContext) {
      const service = ctx.zerowallResearch
      const sessionId = String(exec.agent?.session.id ?? '')
      if (!sessionId) throw new Error('An active conversation session is required.')
      const ensured = service.ensureResearchContext({ sessionId, ...(typeof args.target === 'string' ? { target: args.target } : {}) })
      const project = ensured.project
      const requestedProjectId = args.project_id === undefined ? project.id : String(args.project_id)
      if (requestedProjectId !== project.id) throw new Error('Research study access is limited to the active project workspace.')
      if (args.action === 'list') return { studies: service.listResearchStudies(requestedProjectId) as unknown as ResearchRemoteJsonObject }
      const studyId = args.study_id === undefined ? ensured.study.id : String(args.study_id)
      const study = service.getResearchStudy(studyId)
      if (!study || study.projectId !== project.id) throw new Error('Research study is not in the active project.')
      if (args.study_id !== undefined && study.id !== ensured.study.id) {
        const active = service.getActiveResearchStudy({ sessionId })
        if (active?.id !== study.id) throw new Error('The requested study is not the automatically bound study for this research objective. Select it in the research workspace first; frozen studies are never rebound to another objective.')
      }
      if (args.action === 'get') return { study: study as unknown as ResearchRemoteJsonObject }
      if (args.action === 'documents') return { documents: service.listResearchDocuments({ studyId: study.id }) as unknown as ResearchRemoteJsonObject }
      if (args.action === 'generate_report') return await service.generateResearchReport({ sessionId: String(exec.agent?.session.id ?? ''), studyId: study.id, mode: args.report_mode === 'final' ? 'final' : 'draft' })
      if (args.action === 'auto_gate1' || args.action === 'auto_gate2') {
        const result = args.action === 'auto_gate1'
          ? service.autoApproveResearchGate1({ sessionId, studyId: study.id, ...(args.expected_version === undefined ? {} : { expectedVersion: Number(args.expected_version) }) })
          : service.autoApproveResearchGate2({ sessionId, studyId: study.id, ...(args.expected_version === undefined ? {} : { expectedVersion: Number(args.expected_version) }) })
        return result.status === 'blocked' ? { ...result, stage: args.action === 'auto_gate1' ? 'gate1' : 'gate2', message: '系统校验发现阻断项，已暂停对应阶段；检索、下载和草稿整理仍可继续。', recovery: '补齐阻断项列出的材料并重试，系统会重新校验。' } as unknown as ResearchRemoteJsonObject : { ...result, label: '系统校验通过' } as unknown as ResearchRemoteJsonObject
      }
      if (args.action === 'tasks') return { tasks: service.listResearchTasks(study.id) as unknown as ResearchRemoteJsonObject }
      if (['task_budget', 'refresh_tasks'].includes(String(args.action))) {
        if (args.action === 'task_budget') return { budget: service.getResearchTaskBudget(study.id) as unknown as ResearchRemoteJsonObject }
        return { tasks: service.refreshResearchTaskReadiness(study.id) as unknown as ResearchRemoteJsonObject }
      }
      if (args.action === 'create_task') {
        const task = requireResearchRemoteJsonObject(args.task)
        return { task: service.createResearchTask({ projectId: project.id, studyId: study.id, name: String(task.name ?? ''), kind: String(task.kind ?? ''), ...(task.dependencies === undefined ? {} : { dependencies: requireJsonArray(task.dependencies).map(String) }), exploratory: task.exploratory === true, budget: task.budget === undefined ? {} : requireResearchRemoteJsonObject(task.budget) }) as unknown as ResearchRemoteJsonObject }
      }
      if (args.action === 'update_task') {
        const taskId = String(args.task_id ?? '')
        const current = service.listResearchTasks(study.id).find(task => task.id === taskId)
        if (!current) throw new Error('Research task is not in the active study.')
        const changes = requireResearchRemoteJsonObject(args.task)
        return { task: service.updateResearchTask({ id: taskId, changes: { expectedVersion: Number(args.expected_version ?? current.version), ...(changes.status === undefined ? {} : { status: String(changes.status) as ResearchTaskRecord['status'] }), ...(changes.runId === undefined ? {} : { runId: changes.runId === null ? null : String(changes.runId) }), ...(changes.error === undefined ? {} : { error: changes.error === null ? null : String(changes.error) }) } } as any) as unknown as ResearchRemoteJsonObject }
      }
      if (args.action === 'reconcile_task_run') {
        const taskId = String(args.task_id ?? '')
        if (!service.listResearchTasks(study.id).some(task => task.id === taskId)) throw new Error('Research task is not in the active study.')
        return { task: service.reconcileResearchTaskRun({ id: taskId, ...(args.expected_version === undefined ? {} : { expectedVersion: Number(args.expected_version) }) }) as unknown as ResearchRemoteJsonObject }
      }
      if (args.action === 'register_evidence') return { document: service.registerResearchEvidence({ sessionId: String(exec.agent?.session.id ?? ''), projectId: project.id, studyId: study.id, payload: { ...requireResearchRemoteJsonObject(args.payload), needsReview: true } }) as unknown as ResearchRemoteJsonObject }
      if (args.action === 'audit_claim') return { document: service.auditResearchClaim({ sessionId, claimId: String(args.claim_id ?? ''), expectedVersion: Number(args.expected_version ?? 0) }) as unknown as ResearchRemoteJsonObject }
      if (args.action === 'create_document') {
        const kind = args.kind ?? 'observation'
        if (!['observation', 'question', 'dataset-contract', 'analysis-plan'].includes(kind)) throw new Error('Agents may propose observations, questions, contracts and plans; result ingestion and evidence approval require dedicated services.')
        const document = service.createResearchDocument({ projectId: project.id, studyId: study.id, kind: kind as ResearchRecordKind, payload: requireResearchRemoteJsonObject(args.payload) })
        if (kind === 'question' || kind === 'analysis-plan') {
          const latest = service.getResearchStudy(study.id)!
          service.updateResearchStudy({ id: study.id, changes: { expectedVersion: latest.version, [kind === 'question' ? 'currentQuestionId' : 'currentPlanId']: document.id } as UpdateResearchStudyInput })
        } else if (kind === 'dataset-contract') service.autoApproveResearchGate1({ sessionId, studyId: study.id })
        return { document: document as unknown as ResearchRemoteJsonObject }
      }
      if (args.action === 'method_check_evaluate') return service.methodCheckEvaluate({ studyId: study.id, method: String(args.method ?? ''), ...(args.assumptions === undefined ? {} : { assumptions: requireResearchRemoteJsonObject(args.assumptions) }) })
      if (args.action === 'run_genetic_analysis') return service.runGeneticAnalysis({ studyId: study.id, contractId: String(args.contract_id ?? ''), planId: String(args.plan_id ?? study.currentPlanId ?? ''), taskId: String(args.task_id ?? ''), requestId: String(args.request_id ?? ''), expectedPlanVersion: Number(args.expected_revision ?? 0) }, exec)
      if (args.action === 'refresh_genetic_analysis') return service.refreshGeneticAnalysis({ studyId: study.id, runId: String(args.run_id ?? '') }, exec)
      if (args.action === 'run_nhanes_survey') return service.runNhanesSurvey({ studyId: study.id, contractId: String(args.contract_id ?? ''), planId: String(args.plan_id ?? study.currentPlanId ?? ''), taskId: String(args.task_id ?? ''), requestId: String(args.request_id ?? ''), expectedPlanVersion: Number(args.expected_revision ?? 0) }, exec)
      if (args.action === 'validate_nhanes_contract') return service.validateNhanesContractRemote({ studyId: study.id, contract: requireResearchRemoteJsonObject(args.contract) })
      if (args.action === 'validate_genetic_contract') return service.validateGeneticContractRemote({ studyId: study.id, contract: requireResearchRemoteJsonObject(args.contract) })
      throw new Error('Unsupported research study action.')
    },
  })), 'zerowall-research: register research_study tool')
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'method_check_evaluate',
    description: 'Deterministic method-fit checks of reported analysis metadata; unknown methods remain unverified. Does not certify correctness or approve research gates.',
    parameters: { context: { type: 'json', required: true } },
    output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(args) { return evaluateMethod(requireResearchRemoteJsonObject(args.context)) },
  })), 'zerowall-research: register method check tool')
}

function requireResearchRemoteJsonObject(value: unknown): ResearchRemoteJsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('A JSON object is required.')
  return value as ResearchRemoteJsonObject
}

function requireJsonArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('A JSON array is required.')
  return value
}

export async function probeEngine(id: string, path: string, executable: string, args: string[], timeoutMs = 5000): Promise<ScientificEngineStatus> {
  const name = id === 'fiji' ? 'Fiji / ImageJ' : id === 'napari' ? 'napari' : id
  try { await access(executable) } catch { return { id, name, available: false, path, status: 'invalid', reason: `未找到可执行文件：${executable}` } }
  const env = id === 'napari' ? await engineEnvironment('napari', executable) : process.env
  return await new Promise(resolve => {
    const child = spawn(executable, args, { env, windowsHide: true, shell: process.platform === 'win32' && /\.(?:bat|cmd)$/iu.test(executable), stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    const append = (chunk: unknown): void => { output = `${output}${String(chunk)}`.slice(0, 8192) }
    child.stdout.on('data', append)
    child.stderr.on('data', () => { /* Drain diagnostics without mistaking them for a version. */ })
    let settled = false
    const finish = (result: ScientificEngineStatus): void => { if (settled) return; settled = true; resolve(result) }
    const timer = setTimeout(() => { child.kill(); finish({ id, name, available: false, path, status: 'invalid', reason: '版本探测超时。' }) }, timeoutMs)
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      const version = output.trim().split(/\r?\n/u).find(Boolean)
      if (code !== 0) finish({ id, name, available: false, path, status: 'invalid', ...(version === undefined ? {} : { version }), reason: `版本探测失败（退出码 ${String(code)}${signal ? `，信号 ${signal}` : ''}）。` })
      else if (version === undefined) finish({ id, name, available: false, path, status: 'degraded', reason: '版本探测未返回版本信息；需要原生窗口验收。' })
      else finish({ id, name, available: true, path, status: 'available', version, reason: '可执行文件与版本探测通过。' })
    })
    child.on('error', error => { clearTimeout(timer); finish({ id, name, available: false, path, status: 'invalid', reason: error.message }) })
  })
}

/** Probe only a user-provided managed BrainGlobe Python; never installs into napari. */
export { probeBrainGlobe }

export default { inject, apply }
