import type { MediaProject as BaseProject, MediaAsset } from '@zerowallscience/plugin-ai-cloud/types'
export type { MediaShot } from '@zerowallscience/plugin-ai-cloud/types'
export type MediaProject = BaseProject & { editRevision?: number }
export interface CompositionJob {
  id: string; projectId: string; sessionId: string; title: string
  state: 'running' | 'completed' | 'failed' | 'unknown'
  editRevision: number; createdAt: string; updatedAt: string; assets: MediaAsset[]; error?: string
}
export const PROJECT_ID = /^[A-Za-z0-9_-]{1,80}$/
