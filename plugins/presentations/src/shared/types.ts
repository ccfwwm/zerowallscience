export interface PresentationSlidePreview {
  presentationId: string
  slideId: string
  slideIndex: number
  name: string
  uri: string
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'
  byteSize: number
  base64: string
}

export interface PresentationSlidePatch {
  title?: string
  body?: string
  notes?: string
  visualPrompt?: string
}
