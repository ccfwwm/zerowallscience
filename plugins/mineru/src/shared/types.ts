export type MineruMode = 'auto' | 'precision' | 'agent'
export type MineruApi = 'precision' | 'agent'
export type MineruModelVersion = 'pipeline' | 'vlm' | 'MinerU-HTML'
export type MineruExtraFormat = 'docx' | 'html' | 'latex'

export interface MineruConfig {
  apiBaseUrl: string
  tokenCredential: string
  mode: MineruMode
  modelVersion: MineruModelVersion
  language: string
  enableTable: boolean
  enableFormula: boolean
  isOcr: boolean
  extraFormats: MineruExtraFormat[]
  timeoutMs: number
  pollIntervalMs: number
  pollJitterMs: number
  submitRatePerMinute: number
  dailyLimit: number
  inlineMarkdownBytes: number
  artifactRootName: string
}

export interface MineruConfigStatus extends MineruConfig {
  api: MineruApi | 'local'
  tokenConfigured: boolean
  tokenManagementUrl: string
  available: boolean
  registeredTools: readonly string[]
}

export interface MineruConnectionTestResult {
  ok: true
  api: MineruApi | 'local'
  tokenConfigured: boolean
}

export interface MineruArtifact {
  name: string
  path: string
  mediaType: string
  bytes: number
  checksum: string
  kind: 'markdown' | 'json' | 'image' | 'export' | 'archive'
}

export interface MineruParseResult {
  ok: true
  api: MineruApi
  mode: MineruMode
  modelVersion: MineruModelVersion
  taskId?: string
  sourceName: string
  runDir: string
  durationMs: number
  preview: { markdown: string; truncated: boolean; bytes: number }
  artifacts: MineruArtifact[]
}

export interface MineruBatchResult { ok: true; api: 'precision'; results: MineruParseResult[]; succeeded: number; failed: number }
export interface MineruTaskResult { ok: true; api: MineruApi; taskId: string; state: 'pending' | 'done' | 'failed'; result?: MineruParseResult; error?: string }

export interface MineruRegistrationInput {
  sessionId: string
  projectId: string
  artifactPath: string
  name?: string
  mediaType?: string
  source?: string
  taskId?: string
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
  input: string
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
  ok: true
  projectPath: string
  planPath: string
  manifestPath: string
  validation: ScTenifoldValidationResult
  planSha256: string
  execution: ScTenifoldExecution
}

export interface ScTenifoldRunResult {
  ok: true
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
}

export interface ScTenifoldReviewResult {
  state: ScTenifoldReviewState
  gates: Record<string, { state: ScTenifoldReviewState; messages: string[] }>
  warnings: string[]
}
