export interface EnvironmentVariableInfo {
  name: string
  configured: boolean
  source?: 'official' | 'user' | 'environment'
}

export interface ImageModelSelection {
  providerId: string
  groupId: string
  modelId: string
  profileId?: string
  resolution?: string
  aspectRatio?: string
  /** Gemini imageConfig.imageSize (512, 1K, 2K or 4K). */
  imageSize?: string
}

export type ImageGenerationQuality = 'auto' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export interface EnvironmentSettingsValue {
  retiredVariablesRemoved?: boolean
  variables: { name: string }[]
  imageModel: ImageModelSelection
  imageQuality: ImageGenerationQuality
  contextBudgetTokens: number
}
