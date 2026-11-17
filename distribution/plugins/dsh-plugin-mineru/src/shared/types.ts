/** MinerU configuration, remote status and retained parsing results. */
import type { Branded } from '@deepseek-ai/dsh-brand'

/** Local identity of a recoverable multi-chunk PDF operation. */
export type MineruRunId = Branded<'zerowall/MineruRunId'>

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
  pollRatePerMinute: number
  dailyLimit: number
  inlineMarkdownBytes: number
  artifactRootName: string
}

export type MineruConfigStatus = MineruConfig & {
  api: MineruApi
  tokenSource: 'plugin-settings' | 'environment-settings' | 'credentials' | 'environment' | null
  tokenConfigured: boolean
  tokenManagementUrl: string
  available: boolean
  registeredTools: readonly string[]
}

export type MineruConnectionTestResult = {
  ok: true
  api: MineruApi
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
  runId?: MineruRunId
  chunks?: { pages: number[]; taskId: string }[]
  anchor?: { path?: string; warnings: string[] }
  sourceName: string
  runDir: string
  durationMs: number
  preview: { markdown: string; truncated: boolean; bytes: number }
  artifacts: MineruArtifact[]
}

export type MineruBatchResult = { ok: true; api: 'precision'; results: MineruParseResult[]; succeeded: number; failed: number; failures: { source: string; code: string; message: string; taskId?: string }[] }
export type MineruTaskResult = { ok: true; api: MineruApi; taskId: string; runId?: MineruRunId; state: 'waiting-file' | 'uploading' | 'pending' | 'running' | 'converting' | 'done' | 'failed'; result?: MineruParseResult; error?: string }

/** Per-document extraction options; service configuration and secrets are never tool arguments. */
export type MineruParseOptions = Partial<Pick<MineruConfig, 'language' | 'modelVersion' | 'isOcr' | 'enableTable' | 'enableFormula' | 'extraFormats'>> & {
  pageRanges?: string
  pageRange?: string
  anchor?: boolean
}
