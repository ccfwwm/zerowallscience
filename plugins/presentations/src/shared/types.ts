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
  /** Source classification used by the rebuild QA gates. */
  sourceCategory?: 'panel' | 'text_item' | 'visual_core' | 'evidence_tile' | 'plot' | 'native_symbol' | 'inset' | 'caption'
  parentRegion?: string
  editability?: 'native' | 'atomic-raster'
  sourceRectPx?: [number, number, number, number]
  assetRole?: string
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
  fidelityProfile?: 'reference_lock' | 'balanced' | 'draft'
  mode?: 'native' | 'hybrid'
  sceneMapUri?: string
  drawLogUri?: string
  qaReportUri?: string
}

export interface RebuildSceneMap {
  version: 1
  slideId: string
  source: { path: string; width_px: number; height_px: number; checksum: string }
  fidelity_profile: 'reference_lock' | 'balanced' | 'draft'
  mode: 'native' | 'hybrid'
  canvas: { width_pt: number; height_pt: number }
  reference_inventory: {
    complete: boolean
    regions: string[]
    counts: Record<string, number>
    required_ids: string[]
    unresolved_ambiguities: string[]
    authorized_omissions: string[]
  }
  objects: Array<Record<string, unknown>>
  links: Array<Record<string, unknown>>
}
