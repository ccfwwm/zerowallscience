/** Original attachment bytes authorized to one or more sessions. */
export interface StoredAttachment {
  attachmentId: string
  name: string
  mediaType: string
  bytes: number
  sha256: string
  storageStatus: 'stored'
}

/** A separately materialized extraction. It never replaces the original attachment. */
export interface FileExtraction {
  kind: 'local' | 'mineru'
  state: 'queued' | 'running' | 'done' | 'failed' | 'needs_ocr' | 'needs_configuration' | 'partial'
  parser: string
  artifactPath?: string
  taskId?: string
  textChars?: number
  error?: string
  createdAt: string
  parserVersion?: string
  inputSha256?: string
  parametersSha256?: string
  artifactSha256?: string
  summaryPath?: string
  pageCount?: number
  sheetCount?: number
  cellCount?: number
  slideCount?: number
  warning?: string
  coverage?: 'full' | 'text-only' | 'partial' | 'none'
  needsOcr?: boolean
  resumeable?: boolean
}

/** Legacy prompt attachment fields remain readable for existing session logs. */
export interface FileAttachmentRef extends StoredAttachment {
  parser?: string
  status?: 'parsed' | 'needs_vision' | 'stored' | 'failed'
  parseStatus?: 'idle' | 'queued' | 'running' | 'done' | 'failed'
  parseProgress?: number
  parseError?: string
  textChars?: number
  pageCount?: number
  sheetCount?: number
  cellCount?: number
  slideCount?: number
  localExtraction?: FileExtraction
  mineruExtraction?: FileExtraction
  /** MinerU output is kept separately from the built-in/original preview. */
  parseResult?: {
    path: string
    name: string
    mediaType: string
    bytes: number
    sha256: string
  }
}

export interface PreparedFile extends FileAttachmentRef {
  preview?: string
  /** Bounded extracted preview; read_uploaded_file pages the complete artifact. */
  content?: string
  warning?: string
}

/** Cell facts stay local even when a layout enhancement is available. */
export function preferredExtractionKind(ref: Pick<FileAttachmentRef, 'name' | 'localExtraction' | 'mineruExtraction'>): 'local' | 'mineru' {
  return /\.(?:xlsx?|csv|tsv)$/iu.test(ref.name) && ref.localExtraction?.state === 'done'
    ? 'local' : ref.mineruExtraction?.state === 'done' ? 'mineru' : 'local'
}

export interface UploadedFileReadResult {
  attachmentId: string
  name: string
  offset: number
  nextOffset: number
  hasMore: boolean
  text: string
}

export interface MaterializedUploadedFile {
  attachmentId: string
  name: string
  path: string
  bytes: number
  sha256: string
}

export interface UploadedFileBytes {
  attachmentId: string
  name: string
  mediaType: string
  bytes: number
  sha256: string
  data: string
}
