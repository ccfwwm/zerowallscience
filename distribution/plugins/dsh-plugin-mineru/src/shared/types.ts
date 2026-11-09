export type MineruMode = 'auto' | 'precision' | 'agent'
export type MineruApi = 'precision' | 'agent'
export type MineruModelVersion = 'pipeline' | 'vlm' | 'MinerU-HTML'
export type MineruExtraFormat = 'docx' | 'html' | 'latex'
export type MineruJsonValue = null | boolean | number | string | MineruJsonValue[] | MineruJsonObject
export type MineruJsonObject = { [key: string]: MineruJsonValue }

export type MineruConfig = {
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

export type MineruConfigStatus = MineruConfig & {
  api: MineruApi | 'local'
  tokenConfigured: boolean
  tokenManagementUrl: string
  available: boolean
  registeredTools: readonly string[]
}

export type MineruConnectionTestResult = {
  ok: true
  api: MineruApi | 'local'
  tokenConfigured: boolean
}

export type MineruArtifact = {
  name: string
  path: string
  mediaType: string
  bytes: number
  checksum: string
  kind: 'markdown' | 'json' | 'image' | 'export' | 'archive'
}

export type MineruParseResult = {
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

export type MineruBatchResult = { ok: true; api: 'precision'; results: MineruParseResult[]; succeeded: number; failed: number }
export type MineruTaskResult = { ok: true; api: MineruApi; taskId: string; state: 'waiting-file' | 'pending' | 'running' | 'converting' | 'done' | 'failed'; result?: MineruParseResult; error?: string }
