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

export interface EditableObject {
  objectId: string
  kind: 'text' | 'shape' | 'line' | 'connector' | 'table' | 'chart' | 'image' | 'svg'
  x: number
  y: number
  w: number
  h: number
  z?: number
  text?: string
  fontFace?: string
  fontSize?: number
  color?: string
  fill?: string
  line?: string
  lineWidth?: number
  imageUri?: string
  rasterReason?: string
  visible?: boolean
}

export interface EditableSlideManifest {
  version: 1
  slideId: string
  source: { kind: 'image' | 'pptx-page' | 'zerowall-visual'; uri: string; checksum: string; widthPx: number; heightPx: number; page?: number }
  canvas: { widthPt: number; heightPt: number }
  objects: EditableObject[]
  requiredIds: string[]
  unresolvedAmbiguities: string[]
  authorizedOmissions: string[]
  nativeObjectCount: number
  rasterizedObjectCount: number
}
