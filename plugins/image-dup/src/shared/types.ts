export interface ImageDupOptions {
  threshold?: number
  recursive?: boolean
  copyMove?: boolean
  crossImage?: boolean
  limit?: number
}

export interface ImageDupPair {
  a: string
  b: string
  distance: number
  similarity: number
  transform: string
}

export interface ImageDupRegion { x: number; y: number; width: number; height: number }
export interface CopyMoveFinding { name: string; path?: string; regionCount: number; regions?: ImageDupRegion[] }
export interface CrossImageFinding { a: string; b: string; scale?: number; matches: number; confidence: number; regions?: ImageDupRegion[] }

export interface ImageDupReport {
  ok: true
  total: number
  threshold: number
  pairs: ImageDupPair[]
  crossPairs?: CrossImageFinding[]
  copyMove: CopyMoveFinding[]
  skipped: Array<{ path: string; reason: string }>
  files?: Array<{ name: string; path?: string; page?: number; width?: number; height?: number }>
  pages?: number
  onlyPainted?: boolean
  crossPageOnly?: boolean
  ghostExcluded?: number
  algorithm: string
  algorithmVersion: string
  generatedAt: string
}

export interface ImageDupJob {
  jobId: string
  sessionId: string
  status: 'queued' | 'running' | 'ready' | 'failed' | 'cancelled'
  source: 'workspace' | 'attachments' | 'pdf'
  projectId?: string
  inputChecksum: string
  algorithmVersion: string
  report?: ImageDupReport
  reportUri?: string
  artifact?: ArtifactRef
  /** The directory selected by the user, when the source is a local folder. */
  sourcePath?: string
  sourceFiles?: Record<string, string>
  error?: string
  createdAt: string
  updatedAt: string
}

export interface ArtifactRef { uri: string; mediaType: string; checksum?: string; bytes?: number }

export interface ReportArtifact extends ArtifactRef {
  name: string
  data: string
}

export interface PdfDupOptions extends ImageDupOptions { onlyPainted?: boolean; crossPageOnly?: boolean }
