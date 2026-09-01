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
