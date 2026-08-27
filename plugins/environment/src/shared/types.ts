export interface EnvironmentVariableInfo {
  name: string
  configured: boolean
}

export interface ImageModelSelection {
  providerId: string
  groupId: string
  modelId: string
}

export type ImageGenerationQuality = 'auto' | 'low' | 'medium' | 'high'

export interface EnvironmentSettingsValue {
  variables: { name: string }[]
  imageModel: ImageModelSelection
  imageQuality: ImageGenerationQuality
}
