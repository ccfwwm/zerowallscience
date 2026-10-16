/**
 * lit-harvest — shared types.
 *
 * Everything the tools exchange is plain JSON (tool outputs must be
 * JSON-serializable and schema-valid). No LLM anywhere: sufficiency
 * judgment is deterministic (quota + subtopic coverage audit).
 */

export type LitSource = 'openalex' | 'arxiv' | 'crossref' | 'semantic-scholar' | 'europepmc' | 'unpaywall' | 'scholar'

export interface DownloadLink {
  /** Where the link came from (arxiv, openalex-oa, unpaywall-best, unpaywall-oa, s2-oa, europepmc). */
  source: string
  url: string
  /** e.g. 'pdf', 'landing' — best-effort hint. */
  kind?: string
}

export interface Paper {
  /** Source that produced this record (first source wins on merge). */
  source: LitSource
  /** Source-side identifier (e.g. arXiv id, OpenAlex work id). */
  id: string
  title: string
  authors: string[]
  year?: number
  venue?: string
  abstract?: string
  doi?: string
  url?: string
  /** Direct PDF link when the source exposes one (arXiv / OA). */
  pdfUrl?: string
  citationCount?: number
  keywords?: string[]
  /** Resolved open-access download options (Unpaywall etc.). */
  downloadLinks?: DownloadLink[]
  /** Best single PDF link for the user (primary download). */
  primaryDownloadUrl?: string
  /** openalex: is_oa / unpaywall: is_oa. */
  oaStatus?: boolean | string
  /** Source-reported relevance (OpenAlex relevance_score). */
  relevance?: number
}

export interface FetchOptions {
  query: string
  sources?: LitSource[]
  max?: number
  minYear?: number
  maxYear?: number
  /** Only keep records that are open access / have full text. */
  openAccessOnly?: boolean
  /** Resolve OA download links (Unpaywall etc.) for results. Default true. */
  resolveDownloads?: boolean
  /** Rank: citations (default), source relevance, or recency (year desc). */
  sortBy?: 'citations' | 'relevance' | 'year'
}

export interface FetchResult {
  query: string
  papers: Paper[]
  total: number
  bySource: Record<string, number>
  skipped: string[]
}

export interface SubtopicCoverage {
  subtopic: string
  covered: boolean
  matchedPaperTitles: string[]
}

export interface SufficiencyReport {
  sufficient: boolean
  coreCount: number
  totalCount: number
  minCore: number
  minTotal: number
  subtopicCoverage: SubtopicCoverage[]
  /** Subtopics with no matching paper — the explicit "gap" signal. */
  gaps: string[]
  /** Deterministically derived follow-up queries from gaps. */
  additionalQueries: string[]
  reason: string
}

export type SaveMode = 'auto' | 'zotero-api' | 'inbox'

export interface SaveResult {
  warnings?: string[]
  pending?: string[]
  imported?: number
  requiresImport?: boolean
  saved: number
  mode: SaveMode
  resolvedMode: string
  collection?: string
  inboxDir?: string
  zoteroItems?: { ref?: string; duplicate?: boolean; key?: string; itemID?: number; doi?: string; title: string }[]
  skipped: string[]
}

export interface PaperDetail {
  paper: Paper
  fullText?: string
  fullTextChars: number
  abstract?: string
  keywords: string[]
  sections: string[]
  methodType?: string
  evidenceCard: string
}

export interface ReviewRound {
  round: number
  queries: string[]
  fetched: number
  newPapers: number
  coreCount: number
  totalCount: number
  sufficient: boolean
}

export interface ReviewRunResult {
  topic: string
  subtopics: string[]
  rounds: ReviewRound[]
  collected: Paper[]
  report: string
  sufficiency: SufficiencyReport
  save?: SaveResult | null
  reindex?: { triggered: boolean; ok: boolean; message: string } | null
}

/** Minimal ctx surface used by the plugin (host injects more). */
export interface CtxLike {
  get?(name: string): any
  tools: { register(tool: unknown): void }
  subprocess?: {
    spawn(opts: {
      argv: string[]
      cwd?: string
      env?: Record<string, string>
      stdio?: {
        stdin?: { data: string }
        stdout?: { maxBytes?: number }
        stderr?: { maxBytes?: number }
      }
      graceMs?: number
    }): {
      done: Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>
      collected: { stdout: Uint8Array; stderr: Uint8Array }
    }
  }
  logger?: { info(msg: string): void; warn?(msg: string): void }
}

/**
 * Recursively drop `undefined` values so every tool output/arg is lossless
 * JSON (the host validates against this). `null` is kept.
 */
export function sanitizeJson<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => sanitizeJson(v)) as T
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue
      out[k] = sanitizeJson(v)
    }
    return out as T
  }
  return value
}
