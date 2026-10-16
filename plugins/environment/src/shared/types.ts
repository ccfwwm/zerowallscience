export interface EnvironmentVariableInfo {
  name: string
  configured: boolean
}

export interface ImageModelSelection {
  providerId: string
  groupId: string
  modelId: string
  profileId?: string
  resolution?: string
  aspectRatio?: string
}

export type ImageGenerationQuality = 'auto' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export interface EnvironmentSettingsValue {
  retiredVariablesRemoved?: boolean
  variables: { name: string }[]
  imageModel: ImageModelSelection
  imageQuality: ImageGenerationQuality
}
