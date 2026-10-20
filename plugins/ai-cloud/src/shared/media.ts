import type { AiCloudMediaModel } from '@zerowallscience/plugin-account/types'

export interface MediaSelection { groupId: string; modelId: string; profileId: string; operation: string }
export type MediaReference = { mediaType: string; name?: string; role?: string; duration?: number; properties?: Record<string, unknown> } & (
  { base64: string; url?: never } | { url: string; base64?: never }
)
export interface MediaRequest extends MediaSelection {
  requestId: string
  prompt: string
  parameters?: { size?: string; quality?: string; duration?: number; resolution?: string; aspect_ratio?: string; n?: number; seed?: number; [key: string]: unknown }
  references?: MediaReference[]
  mask?: MediaReference
  async?: boolean
}
export interface MediaArtifact {
  key: string; mediaType: string; bytes?: number; duration?: number; sha256?: string
  revisedPrompt?: string; quality?: string
}
export interface MediaTask {
  requestId: string; taskId?: string; account: string; gateway: string; selection: MediaSelection
  parametersHash: string; status: string; artifacts: MediaArtifact[]; artifactsPending?: boolean; createdAt: string; updatedAt: string
  diagnostics?: MediaDiagnostics
  error?: string
}
export interface MediaDiagnostics {
  stage: 'prepared' | 'attempted' | 'accepted'
  requestHash: string; request: Record<string, unknown>; response?: unknown
  references: Record<string, number>; upstream?: unknown
}
export interface MediaCatalog { models: AiCloudMediaModel[]; status: string; error?: string }

export interface ZeroWallMedia {
  preview?(input: MediaRequest): Promise<MediaDiagnostics>
  catalog(refresh?: boolean): Promise<MediaCatalog>
  estimate(input: MediaRequest): Promise<{ currency: string; maximumCharge?: string; total?: string }>
  submit(input: MediaRequest, signal?: AbortSignal): Promise<MediaTask>
  query(requestId: string, signal?: AbortSignal): Promise<MediaTask>
  wait(requestId: string, timeoutMs?: number, signal?: AbortSignal): Promise<MediaTask>
  list(): Promise<MediaTask[]>
  download(requestId: string, artifactKey: string, signal?: AbortSignal): Promise<{ bytes: Uint8Array; mediaType: string; sha256: string; duration?: number }>
}

export type MediaKind = 'image' | 'video' | 'music'
export interface MediaScope { sessionId: string; cwd: string; projectId: string }
export interface MediaDraft {
  kind: MediaKind; prompt: string; selection?: MediaSelection
  parameters?: MediaRequest['parameters']; references?: MediaReference[]; mask?: MediaReference | null
  clearReferences?: boolean
  replaceReferences?: boolean
}
export interface MediaAsset { id: string; path: string; mediaType: string; bytes: number; sha256: string; duration?: number; projectId?: string; sessionId?: string }
export interface MediaShot { id: string; asset: string; duration: number; trimStart?: number; motion?: 'none' | 'zoom-in' | 'zoom-out'; caption?: string }
export interface MediaProject {
  schemaVersion: 1; id: string; title: string; sessionId: string; revision: number; brief: string
  aspectRatio: '16:9' | '9:16' | '1:1'; fps: number; shots: MediaShot[]; assets: MediaAsset[]
  music?: { path: string; volume: number; fadeIn: number; fadeOut: number }
  voiceover?: { path: string; volume: number }; outputs: MediaAsset[]
}
export interface MediaJob {
  id: string; sessionId: string; projectId: string; revision: number; kind: MediaKind; prompt: string
  selection?: MediaSelection; parameters: NonNullable<MediaRequest['parameters']>
  references: Array<{ name: string; mediaType: string; bytes: number; sha256: string; role?: string; source?: 'base64' | 'url'; mask?: boolean }>
  /** A corrected submission has a new identity; the rejected job stays immutable. */
  correctedFrom?: string
  estimate?: { currency: string; maximumCharge?: string; total?: string }
  state: string; error?: string; requestId: string; taskId?: string; assets: MediaAsset[]
  diagnostics?: MediaDiagnostics
  /** Local result transfer is independent of the provider's generation status. */
  collection?: 'querying' | 'downloading' | 'waiting' | 'ready' | 'failed' | 'paused'
  /** Original-task continuation survives Host restarts and has no overall generation deadline. */
  collectionRetry?: { attempts: number; startedAt: number; nextAttemptAt: number; backoff?: number; reason?: 'provider-pending' | 'result-not-ready' | 'temporary-error'; /** Read-only compatibility with older journals; never enforced. */ deadlineAt?: number }
  createdAt: string; updatedAt: string
}
export interface MediaReview { id: string; revision: number; authorization: string }
export interface ZeroWallMediaJobs {
  /** Explicit conversation generation request; estimate and idempotency remain Host-owned. */
  submitRequested(scope: Pick<MediaScope, 'sessionId' | 'cwd'>, id: string, revision: number): Promise<MediaJob>
  prepare(scope: MediaScope, draft: MediaDraft, id?: string): Promise<MediaJob>
  list(scope: Pick<MediaScope, 'sessionId' | 'cwd'>): Promise<MediaJob[]>
  /** Host-only lookup for reusing original references; never return through tools. */
  references(scope: MediaScope, id: string): Promise<MediaReference[]>
  /** Adopt a trusted account history entry and collect the original paid task in the background. */
  recover(scope: MediaScope, requestId: string): Promise<MediaJob>
  refresh(scope: MediaScope, id: string, options?: { background?: boolean; signal?: AbortSignal; automatic?: boolean }): Promise<MediaJob>
  /** Stop only local query/download; never claim the paid provider task was cancelled. */
  pause(scope: MediaScope, id: string): Promise<MediaJob>
  authorize(scope: Pick<MediaScope, 'sessionId' | 'cwd'>, id: string, revision: number): Promise<string>
  submitReviewed(scope: Pick<MediaScope, 'sessionId' | 'cwd'>, reviews: MediaReview[]): Promise<MediaJob[]>
}
