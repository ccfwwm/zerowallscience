/** Public image generation values; credentials and upstream diagnostics stay on the Host. */
export interface CloudImageModel {
  groupId: string
  groupName: string
  profileId: string
  modelId: string
  operation: 'image' | 'gemini_image'
  sizes: string[]
  qualities: string[]
}

export interface CloudImageRequest {
  requestId: string
  groupId: string
  profileId: string
  modelId: string
  operation: 'image' | 'gemini_image'
  prompt: string
  size?: string
  quality?: string
}

export interface CloudImageTask {
  requestId: string
  status: string
  error?: string
  artifacts: Array<{ key: string; mediaType: string; sha256?: string }>
}

export interface CloudImageData { base64: string; mediaType: string; sha256: string }
