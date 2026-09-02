export type ScTenifoldOrganism = 'human' | 'mouse' | 'auto'
export type ScTenifoldProvider = 'cellxgene' | 'geo' | 'ena' | 'sra'
export type ScTenifoldDownloadProduct = 'h5ad' | 'matrix' | 'supplementary' | 'fastq'
export type ScTenifoldStudyState = 'intake' | 'gene_candidates_ready' | 'datasets_discovered' | 'acquisition_planned' | 'acquiring' | 'acquired' | 'validating' | 'qc_running' | 'stratifying' | 'ready_for_knockout' | 'queued' | 'running' | 'collecting' | 'interpreting' | 'figures_generating' | 'reporting' | 'succeeded' | 'failed' | 'cancelled' | 'review_required' | 'reported'

export interface ScTenifoldIntakeRequest {
  targetGenes?: string[]
  referenceGenes?: string[]
  researchQuestion?: string
  organism?: ScTenifoldOrganism
  tissue?: string
  cellTypes?: string[]
  condition?: string
  maxCandidates?: number
  autoExecute?: boolean
  /** Optional project-relative count matrix for advanced users; ordinary
   * requests should omit it and use public-data discovery. */
  inputPath?: string
  metadataPath?: string
  /** Attachment reference produced by the Files Host for a dragged/uploaded file. */
  attachmentId?: string
}
export interface ScTenifoldGeneCandidate {
  symbol: string
  inputAliases: string[]
  score: number
  confidence: 'high' | 'medium' | 'low'
  evidence: Array<{ source: string; claim: string; url?: string }>
  expressionCoverage?: number
  rationale: string[]
}
export interface ScTenifoldDatasetCandidate {
  provider: ScTenifoldProvider
  accession: string
  title: string
  organism: string
  tissue?: string
  cellTypes: string[]
  condition?: string
  datasetCount: number
  donorCount?: number
  sampleCount?: number
  cellCount?: number
  hasRawCounts: boolean
  targetGeneCoverage?: Record<string, number>
  estimatedBytes?: number
  downloadProducts: ScTenifoldDownloadProduct[]
  score: number
  warnings: string[]
  provenance: { metadataUrl: string; sourceUrl?: string; censusVersion?: string }
}
export interface ScTenifoldAcquisitionPlan {
  planId: string
  studyId: string
  candidate: ScTenifoldDatasetCandidate
  outputDirectory: string
  manifestPath: string
  maxBytes: number
  resume: boolean
  overwrite: boolean
  approval: 'pending' | 'approved' | 'rejected'
  status: 'planned' | 'approved' | 'acquiring' | 'acquired' | 'failed' | 'cancelled'
  error?: string
  createdAt: string
  updatedAt: string
}
export interface ScTenifoldAcquisitionStatus extends ScTenifoldAcquisitionPlan {
  progress: number
  bytesDownloaded: number
  files: string[]
}
export interface ScTenifoldDataContract {
  state: 'raw_counts_verified' | 'raw_counts_unverified' | 'target_missing' | 'metadata_incomplete' | 'insufficient_replication' | 'dataset_not_suitable' | 'ready_for_qc'
  inputPath: string
  format: string
  genes?: number
  cells?: number
  targets: string[]
  missingTargets: string[]
  warnings: string[]
  errors: string[]
  checksum?: string
}

export interface ScTenifoldQcResult {
  studyId: string
  state: 'passed' | 'passed_with_warnings' | 'blocked' | 'running' | 'failed'
  inputPath: string
  cellsBefore?: number
  cellsAfter?: number
  samples?: number
  donors?: number
  metrics: Record<string, number | undefined>
  strata: ScTenifoldStratum[]
  excluded: Array<{ category: string; count: number; reason: string }>
  thresholds: Record<string, number | string | boolean>
  warnings: string[]
  errors: string[]
  artifactPaths: string[]
  checksum?: string
  createdAt: string
}

export interface ScTenifoldStratum {
  cellType: string
  condition?: string
  cells: number
  samples: number
  donors: number
  targetExpressionCoverage?: number
  eligible: boolean
  warnings: string[]
}

export interface ScTenifoldRunManifest {
  schema: 1
  studyId: string
  runId: string
  target: string
  cellType?: string
  condition?: string
  datasetAccession?: string
  inputPath: string
  inputChecksum?: string
  execution: 'r-mcp'
  remoteProjectId?: string
  remoteJobId?: string
  seeds: number[]
  parameters: Record<string, number | string | boolean | number[] | undefined>
  outputs: string[]
  createdAt: string
}

export interface ScTenifoldConclusion {
  category: 'observed' | 'mechanism_evidence' | 'hypothesis' | 'limitation'
  title: string
  statement: string
  evidence: string[]
  confidence: 'high' | 'medium' | 'low'
  requiresValidation: boolean
}

export interface ScTenifoldInterpretation {
  studyId: string
  runId: string
  state: 'completed' | 'completed_with_warnings' | 'blocked' | 'failed'
  observedChanges: Array<{ gene: string; direction: 'up' | 'down' | 'mixed'; effectSize?: number; adjustedP?: number; evidencePath?: string }>
  pathwayEvidence: Array<{ source: string; term: string; genes: string[]; url?: string; evidence: string }>
  conclusions: ScTenifoldConclusion[]
  limitations: string[]
  artifactPaths: string[]
  createdAt: string
}

export interface ScTenifoldFigureManifest {
  studyId: string
  runIds: string[]
  state: 'completed' | 'completed_with_warnings' | 'failed'
  figures: Array<{ path: string; kind: string; format: 'pdf' | 'png' | 'svg'; sourceRunIds: string[]; title: string }>
  processDiagramPath?: string
  artifactPaths: string[]
  createdAt: string
}

export interface ScTenifoldHostToolInstruction {
  runId: string
  state: 'requires_host_tool'
  message: string
}

export type ScTenifoldExecution = 'r-mcp' | 'local-r' | 'remote-run' | 'auto'
export type ScTenifoldReviewState = 'pass' | 'pass_with_warnings' | 'blocked' | 'requires_human_review'
export type ScTenifoldRunState = 'planned' | 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'

export interface ScTenifoldProjectConfig {
  projectPath: string
  species?: string
  tissue?: string
  sampleType?: string
  researchQuestion?: string
  targets: string[]
  strata?: string[]
  input?: string
  metadata?: string
  execution?: ScTenifoldExecution
  executionContextId?: string
  remoteInput?: string
  remoteOutput?: string
  seed?: number
  seeds?: number[]
  nc_nNet?: number
  nc_nCells?: number
  fdr?: number
  cellTypes?: string[]
  condition?: string
  negativeControl?: string
  subsamples?: number
  qc?: Record<string, number | string | boolean>
}

export interface ScTenifoldValidationResult {
  ok: boolean
  input: string
  inputType: string
  genes?: number
  cells?: number
  targets: string[]
  missingTargets: string[]
  rawCounts: 'verified' | 'not_verified' | 'invalid'
  biologicalReplicates?: number
  warnings: string[]
  errors: string[]
  review: ScTenifoldReviewState
}

export interface ScTenifoldPlanResult {
  ok: boolean
  projectPath: string
  planPath: string
  manifestPath: string
  validation: ScTenifoldValidationResult
  planSha256: string
  execution: ScTenifoldExecution
}

export interface ScTenifoldRunResult {
  ok: boolean
  runId: string
  projectPath: string
  runPath: string
  state: ScTenifoldRunState
  execution: ScTenifoldExecution
  target: string
  startedAt: string
  finishedAt?: string
  progress: number
  error?: string
  researchRunId?: string
  remoteProjectId?: string
  remoteJobId?: string
  studyId?: string
  datasetAccession?: string
  cellType?: string
  condition?: string
  inputChecksum?: string
  stage?: ScTenifoldStudyState
}

export interface ScTenifoldReviewResult {
  state: ScTenifoldReviewState
  gates: Record<string, { state: ScTenifoldReviewState; messages: string[] }>
  warnings: string[]
}
export interface ScTenifoldProvenance {
  studyId: string
  source: string
  accession?: string
  checksum?: string
  adapter: string
  createdAt: string
}
export interface ScTenifoldIntakeResult {
  studyId: string
  state: ScTenifoldStudyState
  projectPath: string
  targetGenes: string[]
  candidates: ScTenifoldGeneCandidate[]
  datasets: ScTenifoldDatasetCandidate[]
  nextAction: string
  selectedTargets?: string[]
  acquisitionPlanId?: string
  warnings?: string[]
  inputValidation?: ScTenifoldValidationResult
  /** Project-relative path for a supplied matrix/attachment copy. */
  inputPath?: string
}

export interface ScTenifoldAcquisitionSourceRecord {
  provider: ScTenifoldProvider
  accession: string
  metadataUrl: string
  sourceUrl?: string
  retrievedAt: string
}

export interface ScTenifoldStudyStatus {
  studyId: string
  state: ScTenifoldStudyState
  updatedAt: string
  currentTarget?: string
  currentDataset?: string
  progress?: number
  error?: string
}
