export type ExecutionContextKind = 'local' | 'wsl' | 'ssh'
export type RunStatus = 'draft' | 'submitted' | 'running' | 'paused' | 'cancelling' | 'succeeded' | 'failed' | 'cancelled' | 'timed_out'
export type ResearchNodeKind = 'execution-context' | 'data-asset' | 'run' | 'artifact' | 'paper' | 'decision'
export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[]
export interface JsonObject { [key: string]: JsonValue }
export interface LocalScienceWorkflow {
  list(): JsonObject
  describe(operation?: string): JsonObject
  execute(sessionId: string, action: string, parameters: JsonObject, runId?: string): Promise<JsonObject>
}

export interface ExecutionContextRecord {
  id: string
  projectId: string
  name: string
  kind: ExecutionContextKind
  config: JsonObject
  version: number
  createdAt: string
  updatedAt: string
}

export interface DataAssetRecord {
  id: string
  projectId: string
  name: string
  uri: string
  location: 'local' | 'wsl' | 'ssh' | 'object-storage' | 'web'
  mediaType: string
  byteSize?: number
  checksumAlgorithm?: 'sha256' | 'sha512'
  checksum?: string
  provenance: JsonObject
  version: number
  createdAt: string
  updatedAt: string
}

export interface RunRecord {
  id: string
  projectId: string
  executionContextId?: string
  name: string
  status: RunStatus
  command: string
  workingDirectory: string
  progress: number
  pid?: number
  remotePid?: string
  leaseOwner?: string
  leaseExpiresAt?: string
  heartbeatAt?: string
  timeoutAt?: string
  logUri?: string
  inputs: Array<{ name: string; uri: string; mediaType?: string }>
  outputs: Array<{ name: string; uri: string; mediaType?: string }>
  error?: string
  version: number
  createdAt: string
  updatedAt: string
}

export interface ArtifactRecord {
  id: string
  projectId: string
  runId?: string
  name: string
  uri: string
  mediaType: string
  checksum?: string
  metadata: JsonObject
  version: number
  createdAt: string
  updatedAt: string
}

export interface PaperRecord {
  id: string
  projectId: string
  title: string
  doi?: string
  uri?: string
  citation: JsonObject
  notes: string
  version: number
  createdAt: string
  updatedAt: string
}

export interface DecisionRecord {
  id: string
  projectId: string
  title: string
  rationale: string
  status: 'proposed' | 'accepted' | 'rejected' | 'superseded'
  version: number
  createdAt: string
  updatedAt: string
}

export interface ResearchEdgeRecord {
  id: string
  projectId: string
  fromId: string
  toId: string
  relation: string
  metadata: JsonObject
  createdAt: string
}

export interface AuditEventRecord {
  id: string
  projectId: string
  entityId?: string
  action: string
  details: JsonObject
  createdAt: string
}

export interface AuditReport {
  projectId: string
  generatedAt: string
  eventCount: number
  chainHash: string
  chainValid: boolean
  events: Array<AuditEventRecord & { eventHash: string }>
  warnings: string[]
}

export interface PublicationRecord {
  id: string
  projectId: string
  title: string
  status: 'draft' | 'frozen' | 'validating' | 'ready' | 'failed'
  manifest: JsonObject
  frozenSnapshot?: ResearchProjectSnapshot
  validation: JsonObject
  reproductionRunId?: string
  reproducedAt?: string
  exportUri?: string
  version: number
  createdAt: string
  updatedAt: string
}

export interface PresentationRecord {
  id: string
  projectId: string
  title: string
  status: 'draft' | 'outlining' | 'designing' | 'generating' | 'paused' | 'ready' | 'failed' | 'cancelled'
  outline: Array<{ title: string; points: string[]; referenceUris?: string[] }>
  style: JsonObject
  assets: Array<{ uri: string; role: string; source?: string }>
  slides: Array<{
    id: string
    title: string
    body: string
    notes?: string
    assetUris: string[]
    visualUri?: string
    visualPrompt?: string
    referenceUris?: string[]
    visual?: PresentationSlideVisual
    visualStatus?: 'pending' | 'generating' | 'ready' | 'failed'
    visualError?: string
    visualAttempt?: number
    visualUpdatedAt?: string
    sourcePage?: PresentationSourceAttachment
    sceneMapUri?: string
    editableManifestUri?: string
    editableStatus?: 'pending' | 'processing' | 'ready' | 'partial' | 'failed'
    nativeObjectCount?: number
    rasterizedObjectCount?: number
    rebuildError?: string
  }>
  exportUris: Record<string, string>
  artifacts: PresentationArtifact[]
  quality?: PresentationQuality
  generation?: PresentationGeneration
  revisions?: PresentationRevision[]
  sourceMode?: 'generated' | 'image-rebuild' | 'pptx-rebuild' | 'zerowall-visual-rebuild'
  sourceAttachments?: PresentationSourceAttachment[]
  rebuildJob?: PresentationRebuildJob
  error?: string
  version: number
  createdAt: string
  updatedAt: string
}

export interface PresentationSourceAttachment {
  id: string
  kind: 'image' | 'pptx-page' | 'zerowall-visual'
  uri: string
  checksum: string
  page?: number
  name?: string
}

export interface PresentationRebuildJob {
  id: string
  generationId: string
  stage: 'queued' | 'source-prepared' | 'scene-mapped' | 'assets-prepared' | 'html-generated' | 'pptx-object-generated' | 'rendered' | 'reviewed' | 'ready' | 'partial' | 'failed' | 'cancelled'
  progress: number
  concurrency: number
  startedAt: string
  updatedAt: string
  finishedAt?: string
  error?: string
}

export interface PresentationGeneration {
  id: string
  revision: number
  stage: 'outlining' | 'designing' | 'visual' | 'html' | 'pptx' | 'rendering' | 'quality' | 'ready' | 'failed' | 'paused' | 'cancelled'
  progress: number
  startedAt: string
  updatedAt: string
  finishedAt?: string
  error?: string
  resumeStage?: PresentationGeneration['stage']
}

export interface PresentationSlideVisual {
  model: { providerId: string; groupId: string; modelId: string }
  promptStrategy: 'zerowall-full-slide-image'
  visualSource: 'generated' | 'reference-edit'
  referenceUris: string[]
  generatedUri: string
  checksum: string
  requestedQuality?: 'auto' | 'low' | 'medium' | 'high'
  actualQuality?: 'auto' | 'low' | 'medium' | 'high'
  attachment?: {
    attachmentId: string
    mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'
    bytes: number
    width: number
    height: number
    name?: string
  }
}
export interface PresentationRevision {
  id: string
  revision: number
  createdAt: string
  artifacts: PresentationArtifact[]
  quality?: PresentationQuality
}

export interface PresentationArtifact {
  kind: 'outline' | 'design-plan' | 'html' | 'pptx' | 'editable-pptx' | 'pdf' | 'preview' | 'scene-map' | 'editable-manifest' | 'rebuild-preview' | 'rebuild-contact-sheet' | 'rebuild-qa-report' | 'quality-report' | 'visual-review'
  uri: string
  mediaType: string
  checksum?: string
}

export interface PresentationQuality {
  structural: 'passed' | 'failed' | 'unverified'
  render: 'passed' | 'failed' | 'unverified'
  automaticVisual: 'passed' | 'failed' | 'unverified'
  modelVisual: 'passed' | 'failed' | 'unverified'
  overall: 'passed' | 'failed' | 'unverified'
  warnings: string[]
}

/** Structured research state used by the 7.0.0 workbench. JSON fields are
 * deliberately typed as JsonObject so the store remains forward compatible
 * with domain-specific runners while revision and freeze semantics stay in
 * one place. */
export type ResearchStudyPhase = 'question' | 'data' | 'planning' | 'frozen' | 'analysis' | 'evidence' | 'report' | 'completed'
export type ResearchStudyStatus = 'draft' | 'active' | 'blocked' | 'completed' | 'archived'
export type ResearchGateStatus = 'pending' | 'approved' | 'rejected'
export type ResearchRecordKind = 'observation' | 'question' | 'dataset-contract' | 'analysis-plan' | 'evidence' | 'claim' | 'viewer-session' | 'annotation-revision' | 'benchmark-task' | 'evaluation'

export interface ResearchStudyRecord {
  id: string
  projectId: string
  title: string
  phase: ResearchStudyPhase
  status: ResearchStudyStatus
  currentQuestionId?: string
  currentPlanId?: string
  currentFreezeId?: string
  budget: JsonObject
  gate1: ResearchGateStatus
  gate2: ResearchGateStatus
  version: number
  createdAt: string
  updatedAt: string
}

export interface ResearchDocumentRecord {
  id: string
  projectId: string
  studyId: string
  kind: ResearchRecordKind
  payload: JsonObject
  version: number
  createdAt: string
  updatedAt: string
}

export interface StudyFreezeRecord {
  id: string
  projectId: string
  studyId: string
  version: number
  snapshot: JsonObject
  createdAt: string
}

export type ResearchTaskStatus = 'pending' | 'ready' | 'running' | 'succeeded' | 'failed' | 'blocked' | 'cancelled'
export interface ResearchTaskRecord {
  id: string; projectId: string; studyId: string; name: string; kind: string; status: ResearchTaskStatus
  dependencies: string[]; exploratory: boolean; budget: JsonObject; runId?: string; attempt: number
  error?: string; version: number; createdAt: string; updatedAt: string
}
export interface CreateResearchTaskInput { projectId: string; studyId: string; name: string; kind: string; dependencies?: string[]; exploratory?: boolean; budget?: JsonObject }
export interface UpdateResearchTaskInput { status?: ResearchTaskStatus; runId?: string | null; error?: string | null; expectedVersion: number }
export interface ResearchTaskBudgetReport {
  studyId: string
  accounting: 'estimated-per-attempt'
  modes: Record<string, 'concurrent' | 'cumulative'>
  limits: JsonObject
  usage: JsonObject
  available: JsonObject
  reservations: Array<{ taskId: string; status: ResearchTaskStatus; attempt: number; budget: JsonObject }>
  exceeded: string[]
}

export interface CreateResearchStudyInput { projectId: string; title: string; phase?: ResearchStudyPhase; budget?: JsonObject }
export interface UpdateResearchStudyInput {
  title?: string
  phase?: ResearchStudyPhase
  status?: ResearchStudyStatus
  currentQuestionId?: string | null
  currentPlanId?: string | null
  budget?: JsonObject
  gate1?: ResearchGateStatus
  gate2?: ResearchGateStatus
  expectedVersion: number
}
export interface CreateResearchDocumentInput { projectId: string; studyId: string; kind: ResearchRecordKind; payload: JsonObject }
export interface UpdateResearchDocumentInput { payload: JsonObject; expectedVersion: number }
export interface RegisterResearchEvidenceInput { projectId: string; studyId: string; payload: JsonObject }

export interface ResearchStudySnapshot {
  study: ResearchStudyRecord
  documents: ResearchDocumentRecord[]
  freezes: StudyFreezeRecord[]
  tasks?: ResearchTaskRecord[]
}

export interface ViewerSessionRecord {
  id: string
  projectId: string
  assetId: string
  tool: 'sequence' | 'image' | 'flow' | 'cells' | 'brain' | 'molecule'
  state: JsonObject
  version: number
  createdAt: string
  updatedAt: string
}

export interface CreateViewerSessionInput { projectId: string; assetId: string; tool: ViewerSessionRecord['tool']; state?: JsonObject }
export interface UpdateViewerSessionInput { expectedVersion: number; state: JsonObject; invalidateOutputs?: boolean }

export interface ResearchProjectSnapshotV1 {
  format: 'zerowall-science-research-project'
  version: 1
  exportedAt: string
  project: import('./index.ts').ProjectRecord
  executionContexts: ExecutionContextRecord[]
  dataAssets: DataAssetRecord[]
  runs: RunRecord[]
  artifacts: ArtifactRecord[]
  papers: PaperRecord[]
  decisions: DecisionRecord[]
  edges: ResearchEdgeRecord[]
  auditEvents: AuditEventRecord[]
}

export interface ResearchProjectSnapshotV2 extends Omit<ResearchProjectSnapshotV1, 'version'> {
  version: 2
  literature: import('./literature.ts').LiteratureSnapshot
}
export interface ResearchProjectSnapshotV3 extends Omit<ResearchProjectSnapshotV2, 'version'> {
  version: 3
  researchStudies: ResearchStudyRecord[]
  researchDocuments: ResearchDocumentRecord[]
  studyFreezes: StudyFreezeRecord[]
  viewerSessions?: ViewerSessionRecord[]
  annotationRevisions?: import('./annotations.ts').AnnotationRevisionRecord[]
  researchTasks?: ResearchTaskRecord[]
}
export type ResearchProjectSnapshot = ResearchProjectSnapshotV1 | ResearchProjectSnapshotV2 | ResearchProjectSnapshotV3

export interface CreateExecutionContextInput { projectId: string; name: string; kind: ExecutionContextKind; config?: JsonObject }
export interface UpdateExecutionContextInput { name?: string; kind?: ExecutionContextKind; config?: JsonObject }
export interface CreateDataAssetInput extends Omit<DataAssetRecord, 'id' | 'version' | 'createdAt' | 'updatedAt' | 'provenance'> { provenance?: JsonObject }
export interface CreateRunInput extends Omit<RunRecord, 'id' | 'status' | 'progress' | 'version' | 'createdAt' | 'updatedAt' | 'inputs' | 'outputs'> { status?: RunStatus; progress?: number; inputs?: RunRecord['inputs']; outputs?: RunRecord['outputs'] }
export interface CreateArtifactInput extends Omit<ArtifactRecord, 'id' | 'version' | 'createdAt' | 'updatedAt' | 'metadata'> { metadata?: JsonObject }
export interface CreatePaperInput extends Omit<PaperRecord, 'id' | 'version' | 'createdAt' | 'updatedAt' | 'citation' | 'notes'> { citation?: JsonObject; notes?: string }
export interface CreateDecisionInput extends Omit<DecisionRecord, 'id' | 'version' | 'createdAt' | 'updatedAt'> {}
export interface CreateResearchEdgeInput extends Omit<ResearchEdgeRecord, 'id' | 'createdAt' | 'metadata'> { metadata?: JsonObject }
export interface CreatePublicationInput { projectId: string; title: string; manifest?: JsonObject }
export interface CreatePresentationInput { projectId: string; title: string; outline?: PresentationRecord['outline']; style?: JsonObject; assets?: PresentationRecord['assets'] }

export interface UpdateRunChanges {
  status?: RunStatus
  progress?: number
  pid?: number
  remotePid?: string
  leaseOwner?: string
  leaseExpiresAt?: string
  heartbeatAt?: string
  timeoutAt?: string
  logUri?: string
  inputs?: RunRecord['inputs']
  outputs?: RunRecord['outputs']
  error?: string
}

export interface UpdatePresentationChanges {
  title?: string
  status?: PresentationRecord['status']
  outline?: PresentationRecord['outline']
  style?: JsonObject
  assets?: PresentationRecord['assets']
  slides?: PresentationRecord['slides']
  exportUris?: Record<string, string>
  artifacts?: PresentationArtifact[]
  quality?: PresentationQuality | null
  error?: string
  generation?: PresentationGeneration
  revisions?: PresentationRevision[]
  sourceMode?: PresentationRecord['sourceMode']
  sourceAttachments?: PresentationSourceAttachment[]
  rebuildJob?: PresentationRebuildJob
}
