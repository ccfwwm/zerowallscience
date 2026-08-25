export interface FileAttachmentRef {
  attachmentId: string
  name: string
  mediaType: string
  bytes: number
  sha256: string
  parser: string
  status: 'parsed' | 'needs_vision' | 'stored'
  textChars: number
  pageCount?: number
  sheetCount?: number
}

export interface PreparedFile extends FileAttachmentRef {
  preview: string
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
