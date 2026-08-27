export type ExecutionContextKind = 'local' | 'wsl' | 'ssh'
export type RunStatus = 'draft' | 'submitted' | 'running' | 'paused' | 'cancelling' | 'succeeded' | 'failed' | 'cancelled' | 'timed_out'
export type ResearchNodeKind = 'execution-context' | 'data-asset' | 'run' | 'artifact' | 'paper' | 'decision'
export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[]
export interface JsonObject { [key: string]: JsonValue }

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
  frozenSnapshot?: ResearchProjectSnapshotV1
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
  }>
  exportUris: Record<string, string>
  artifacts: PresentationArtifact[]
  quality?: PresentationQuality
  generation?: PresentationGeneration
  revisions?: PresentationRevision[]
  error?: string
  version: number
  createdAt: string
  updatedAt: string
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
  kind: 'outline' | 'design-plan' | 'html' | 'pptx' | 'pdf' | 'preview' | 'quality-report' | 'visual-review'
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
}
