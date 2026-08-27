export interface PresentationSlidePreview {
  uri: string
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'
  byteSize: number
  base64: string
}
