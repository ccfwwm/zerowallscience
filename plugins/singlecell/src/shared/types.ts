export type ScTenifoldOrganism = 'human' | 'mouse' | 'auto'
export type ScTenifoldProvider = 'cellxgene' | 'geo' | 'ena' | 'sra'
export type ScTenifoldDownloadProduct = 'h5ad' | 'matrix' | 'supplementary' | 'fastq'
export type ScTenifoldStudyState = 'intake' | 'gene_candidates_ready' | 'datasets_discovered' | 'acquisition_planned' | 'acquiring' | 'acquired' | 'validating' | 'qc_running' | 'ready_for_knockout' | 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'review_required' | 'reported'

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
