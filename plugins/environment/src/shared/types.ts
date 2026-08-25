export interface EnvironmentVariableInfo {
  name: string
  configured: boolean
}

export interface ImageModelSelection {
  providerId: string
  groupId: string
  modelId: string
}

export interface EnvironmentSettingsValue {
  variables: { name: string }[]
  imageModel: ImageModelSelection
}
