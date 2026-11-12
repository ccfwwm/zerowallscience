/** Skill management wire data; instruction content is returned only by explicit detail reads. */
export interface ManagedSkill {
  id: string
  name: string
  description: string
  source: string
  provider: string
  kind: 'standalone' | 'plugin-instructions'
  ownerPackage?: string
  topic: string
  enabled: boolean
  /** Optional bundled instructions available for activation when the task needs them. */
  onDemand?: boolean
  effective: boolean
  removable: boolean
  path?: string
  license?: string
  requirements: string[]
}
/** One curated instruction bundle and its optional local dependency capability. */
export interface CatalogSkill {
  name: string
  path: string
  description: string
  topic: string
  core: boolean
  license: string
  capabilityId: string
  requirements: string[]
  /** Source snapshot identity for reproducible bundled skill audits. */
  source?: string
  /** SHA-256 of the filtered upstream source tree. */
  sourceHash?: string
  /** SHA-256 of this skill's source instruction file. */
  sha256?: string
  /** Explicit preflight facts for optional GPU, Docker, network, and credential use. */
  runtime?: { gpu: boolean; docker: boolean; network: boolean; credentials: boolean }
}

import type { JsonValue } from '@deepseek-ai/dsh-util-values'

/** Conversational research-integrity profile persisted with a run request. */
export interface ResearchIntegrityRequest {
  [key: string]: JsonValue
  profile: 'basic' | 'standard' | 'deep'
  modules: ('literature' | 'text' | 'images' | 'figures' | 'data' | 'statistics' | 'provenance')[]
  onlineSources: 'public' | 'public-semantic-scholar' | 'offline'
  inputRefs: string[]
  inputTypes: ('pdf' | 'word' | 'image' | 'data' | 'reference')[]
  privacyMode: 'local-only' | 'redact-identifiers'
  outputFormat: 'json' | 'markdown' | 'html'
}

/** A bounded finding; similarity and missing evidence remain review states. */
export interface ResearchIntegrityFinding {
  [key: string]: JsonValue
  status: 'verified' | 'issue' | 'review_required' | 'unverifiable'
  severity: 'critical' | 'high' | 'medium' | 'info'
  module: string
  evidence: string
  source: string
  metric: string
  limitation: string
  suggested_action: string
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** User-selected research-integrity scope; log-only and never a transcript message. */
    'research-integrity/requested': ResearchIntegrityRequest & { requestId: string }
    /** Completed integrity report metadata and bounded findings. */
    'research-integrity/completed': { requestId: string; profile: ResearchIntegrityRequest; findings: ResearchIntegrityFinding[]; reportFormat: ResearchIntegrityRequest['outputFormat'] }
  }
}
/** Result from a read-only import preview. */
export interface ImportPreview {
  id: string
  source: string
  commit?: string
  skills: { name: string; description: string; relativePath: string; conflict: boolean }[]
}
/** Management operations accept an optional current workspace, never an installation path. */
export interface SkillsRequest {
  action: 'list' | 'detail' | 'set-enabled' | 'set-topic' | 'preview' | 'install' | 'remove' | 'activate'
  cwd?: string
  id?: string
  name?: string
  enabled?: boolean
  topic?: string
  source?: string
  scope?: 'workspace' | 'global'
  replace?: boolean
}
/** JSON response used by the management Remote. */
export interface SkillsResponse {
  entries?: ManagedSkill[]
  complete?: boolean
  content?: string
  preview?: ImportPreview
  installed?: string[]
  status?: string
}
