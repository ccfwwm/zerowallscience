import type { AiCloudMediaModel } from '@zerowallscience/plugin-account/types'

export interface MediaSelection { groupId: string; modelId: string; profileId: string; operation: string }
export interface MediaReference { mediaType: string; base64: string; name?: string; role?: string }
export interface MediaRequest extends MediaSelection {
  requestId: string
  prompt: string
  parameters?: { size?: string; quality?: string; duration?: number; resolution?: string; aspect_ratio?: string; n?: number; seed?: number }
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
  parametersHash: string; status: string; artifacts: MediaArtifact[]; createdAt: string; updatedAt: string
}
export interface MediaCatalog { models: AiCloudMediaModel[]; status: string; error?: string }

export interface ZeroWallMedia {
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
  references: Array<{ name: string; mediaType: string; bytes: number; sha256: string; mask?: boolean }>
  estimate?: { currency: string; maximumCharge?: string; total?: string }
  state: string; error?: string; requestId: string; taskId?: string; assets: MediaAsset[]
  createdAt: string; updatedAt: string
}
export interface MediaReview { id: string; revision: number; authorization: string }
export interface ZeroWallMediaJobs {
  /** Explicit conversation generation request; estimate and idempotency remain Host-owned. */
  submitRequested(scope: Pick<MediaScope, 'sessionId' | 'cwd'>, id: string, revision: number): Promise<MediaJob>
  prepare(scope: MediaScope, draft: MediaDraft, id?: string): Promise<MediaJob>
  list(scope: Pick<MediaScope, 'sessionId' | 'cwd'>): Promise<MediaJob[]>
  refresh(scope: MediaScope, id: string): Promise<MediaJob>
  authorize(scope: Pick<MediaScope, 'sessionId' | 'cwd'>, id: string, revision: number): Promise<string>
  submitReviewed(scope: Pick<MediaScope, 'sessionId' | 'cwd'>, reviews: MediaReview[]): Promise<MediaJob[]>
}
