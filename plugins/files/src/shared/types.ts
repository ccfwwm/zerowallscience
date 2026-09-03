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
  state: 'running' | 'done' | 'failed'
  parser: string
  artifactPath?: string
  taskId?: string
  textChars?: number
  error?: string
  createdAt: string
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
  /** Complete extracted Markdown/text sent to the model as untrusted data. */
  content?: string
  warning?: string
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
