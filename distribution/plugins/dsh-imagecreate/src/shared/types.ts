/** Persisted image defaults shared by generation, editing and presentation consumers. */
export interface ImageModelSelection {
  providerId: string
  groupId: string
  modelId: string
  profileId?: string
  resolution?: string
  aspectRatio?: string
  imageSize?: string
}
export type ImageGenerationQuality = 'auto' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
/** Public settings view; legacy migration backups are not sent to clients. */
export interface ImageSettingsView {
  selection?: ImageModelSelection
  quality: ImageGenerationQuality
  origin: 'automatic' | 'user'
  availability: 'signed-out' | 'pending' | 'ready' | 'missing' | 'ambiguous'
}
