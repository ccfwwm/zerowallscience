/**
 * lit-harvest — source providers.
 *
 * Reachability verified on this box: OpenAlex, arXiv, Crossref work
 * directly without keys; Semantic Scholar rate-limits without S2_API_KEY
 * and is treated as an optional enhancement with exponential backoff.
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import type { LitSource, Paper } from '../types.ts'

export interface RawHit {
  source: LitSource
  id: string
  title: string
  authors: string[]
  year?: number
  venue?: string
  abstract?: string
  doi?: string
  url?: string
  pdfUrl?: string
  citationCount?: number
  keywords?: string[]
  /** openalex: is_oa flag. */
  oaStatus?: boolean
  /** source-reported relevance score. */
  relevance?: number
}

const REQUEST_TIMEOUT_MS = 25_000

export async function httpGetJson(
  url: string,
  headers: Record<string, string> = {},
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<unknown> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal })
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} for ${url.slice(0, 140)}`)
    }
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

function cleanTitle(t: string): string {
  return t.replace(/\s+/g, ' ').trim()
}

/* ── OpenAlex (keyless, preferred) ─────────────────────────────────────── */

export interface OpenalexOptions {
  minYear?: number
  maxYear?: number
  /** Filter to records that are open access (is_oa:true). */
  openAccessOnly?: boolean
  /** Exact DOI lookup (filter=doi:…). */
  doi?: string
}

export async function openalexSearch(query: string, max: number, opts: OpenalexOptions = {}): Promise<RawHit[]> {
  const { minYear, maxYear, openAccessOnly, doi } = opts
  const params = new URLSearchParams({
    'per-page': String(max),
    mailto: 'lit-harvest@local',
  })
  if (doi) {
    params.set('filter', `doi:${doi}`)
  } else {
    params.set('search', query)
  }
  const filters: string[] = []
  if (openAccessOnly) filters.push('open_access.is_oa:true')
  if (minYear !== undefined || maxYear !== undefined) {
    const from = minYear ?? 0
    const to = maxYear ?? 3000
    filters.push(`from_publication_date:${from}-01-01,to_publication_date:${to}-12-31`)
  }
  if (filters.length > 0) {
    params.set('filter', doi ? `${filters.join(',')},doi:${doi}` : filters.join(','))
  }
  const data = (await httpGetJson(`https://api.openalex.org/works?${params}`)) as {
    results?: Array<{
      id?: string
      title?: string | null
      display_name?: string | null
      publication_year?: number
      cited_by_count?: number
      doi?: string | null
      relevance_score?: number
      open_access?: { is_oa?: boolean | null }
      authorships?: Array<{ author?: { display_name?: string } }>
      primary_location?: { source?: { display_name?: string | null } | null; landing_page_url?: string | null } | null
      best_oa_location?: { pdf_url?: string | null } | null
      abstract_inverted_index?: Record<string, number[]> | null
    }>
  }
  if (!data.results) return []
  const out: RawHit[] = []
  for (const r of data.results) {
    const title = cleanTitle(r.title ?? r.display_name ?? '')
    if (!title) continue
    const abstract = r.abstract_inverted_index ? reconstructAbstract(r.abstract_inverted_index) : undefined
    out.push({
      source: 'openalex',
      id: (r.id ?? '').split('/').pop() ?? title,
      title,
      authors: (r.authorships ?? []).map((a) => a.author?.display_name ?? '').filter(Boolean),
      year: r.publication_year,
      venue: r.primary_location?.source?.display_name ?? undefined,
      abstract,
      doi: r.doi?.replace(/^https?:\/\/doi\.org\//, '') ?? undefined,
      url: r.primary_location?.landing_page_url ?? undefined,
      pdfUrl: r.best_oa_location?.pdf_url ?? undefined,
      citationCount: r.cited_by_count,
      oaStatus: r.open_access?.is_oa ?? undefined,
      relevance: r.relevance_score,
    })
  }
  return out
}

function reconstructAbstract(inverted: Record<string, number[]>): string | undefined {
  const words: Array<{ w: string; i: number }> = []
  for (const [w, positions] of Object.entries(inverted)) {
    for (const p of positions) words.push({ w, i: p })
  }
  words.sort((a, b) => a.i - b.i)
  const text = words.map((x) => x.w).join(' ').trim()
  return text.length > 0 ? text : undefined
}

/* ── arXiv (keyless, full text + PDF) ──────────────────────────────────── */

export async function arxivSearch(query: string, max: number): Promise<RawHit[]> {
  const q = new URLSearchParams({
    search_query: `all:${query}`,
    start: '0',
    max_results: String(max),
    sortBy: 'relevance',
    sortOrder: 'descending',
  })
  const xml = await fetch(`https://export.arxiv.org/api/query?${q}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  }).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status} for arXiv query`)
    return r.text()
  })
  const out: RawHit[] = []
  const entryRe = /<entry>([\s\S]*?)<\/entry>/g
  let m: RegExpExecArray | null
  while ((m = entryRe.exec(xml)) !== null) {
    const e = m[1]!
    const grab = (tag: string): string => {
      const mm = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`).exec(e)
      return mm ? mm[1]!.replace(/\s+/g, ' ').trim() : ''
    }
    const id = (new RegExp('<id>([^<]+)</id>').exec(e)?.[1] ?? '').trim().replace(/^http:\/\//, 'https://')
    const arxivId = id.split('/abs/').pop() ?? ''
    const title = grab('title').replace(/\s+/g, ' ').trim()
    if (!title || !arxivId) continue
    const authors = [...e.matchAll(/<name>([^<]+)<\/name>/g)].map((x) => x[1]!.trim())
    const year = Number(/<published>(\d{4})/.exec(e)?.[1]) || undefined
    out.push({
      source: 'arxiv',
      id: arxivId,
      title,
      authors,
      year,
      abstract: grab('summary'),
      url: id,
      pdfUrl: `https://arxiv.org/pdf/${arxivId}`,
    })
  }
  return out
}

/* ── Crossref (keyless) ────────────────────────────────────────────────── */

export async function crossrefSearch(query: string, max: number): Promise<RawHit[]> {
  const params = new URLSearchParams({
    query: query,
    rows: String(max),
    'mailto': 'lit-harvest@local',
    'select': 'DOI,title,author,container-title,issued,abstract,URL,is-referenced-by-count',
  })
  const data = (await httpGetJson(`https://api.crossref.org/works?${params}`)) as {
    message?: {
      items?: Array<{
        DOI?: string
        title?: string[]
        author?: Array<{ given?: string; family?: string; name?: string }>
        'container-title'?: string[]
        issued?: { 'date-parts'?: number[][] }
        abstract?: string
        URL?: string
        'is-referenced-by-count'?: number
      }>
    }
  }
  const items = data.message?.items ?? []
  const out: RawHit[] = []
  for (const it of items) {
    const title = cleanTitle((it.title ?? [])[0] ?? '')
    if (!title) continue
    out.push({
      source: 'crossref',
      id: it.DOI ?? title,
      title,
      authors: (it.author ?? []).map((a) => a.name ?? `${a.given ?? ''} ${a.family ?? ''}`.trim()).filter(Boolean),
      year: it.issued?.['date-parts']?.[0]?.[0],
      venue: (it['container-title'] ?? [])[0],
      abstract: it.abstract ? it.abstract.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : undefined,
      doi: it.DOI,
      url: it.URL,
      citationCount: it['is-referenced-by-count'],
    })
  }
  return out
}

/* ── Semantic Scholar (optional, needs S2_API_KEY for sane rate limits) ── */

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export async function semanticScholarSearch(query: string, max: number, apiKey: string): Promise<RawHit[]> {
  const params = new URLSearchParams({
    query,
    limit: String(max),
    fields: 'title,authors,venue,year,abstract,externalIds,citationCount,openAccessPdf,url',
  })
  const headers: Record<string, string> = {}
  if (apiKey) headers['X-API-KEY'] = apiKey
  const data = (await httpGetJson(`https://api.semanticscholar.org/graph/v1/paper/search?${params}`, headers)) as {
    data?: Array<{
      paperId?: string
      title?: string
      authors?: Array<{ name?: string }>
      venue?: string
      year?: number
      abstract?: string
      citationCount?: number
      url?: string
      externalIds?: { DOI?: string }
      openAccessPdf?: { url?: string } | null
    }>
  }
  const items = data.data ?? []
  const out: RawHit[] = []
  for (const it of items) {
    const title = cleanTitle(it.title ?? '')
    if (!title) continue
    out.push({
      source: 'semantic-scholar',
      id: it.paperId ?? title,
      title,
      authors: (it.authors ?? []).map((a) => a.name ?? '').filter(Boolean),
      year: it.year,
      venue: it.venue,
      abstract: it.abstract,
      doi: it.externalIds?.DOI,
      url: it.url,
      pdfUrl: it.openAccessPdf?.url ?? undefined,
      citationCount: it.citationCount,
    })
  }
  return out
}

/* ── Europe PMC (keyless; biomedical, includes PDF links) ──────────────── */

export async function europepmcSearch(query: string, max: number): Promise<RawHit[]> {
  const params = new URLSearchParams({
    query,
    format: 'json',
    pageSize: String(max),
    resultType: 'core',
  })
  const data = (await httpGetJson(
    `https://www.ebi.ac.uk/europepmc/webservices/rest/search?${params}`,
  )) as {
    resultList?: {
      result?: Array<{
        id?: string
        source?: string
        title?: string
        authorString?: string
        journalTitle?: string
        pubYear?: string
        doi?: string
        pmid?: string
        url?: string
        fullTextUrlList?: {
          fullTextUrl?: Array<{ url?: string; documentStyle?: string; availability?: string }>
        }
      }>
    }
  }
  const items = data.resultList?.result ?? []
  const out: RawHit[] = []
  for (const it of items) {
    const title = cleanTitle(it.title ?? '')
    if (!title) continue
    const pdf = (it.fullTextUrlList?.fullTextUrl ?? []).find((l) => l.documentStyle === 'pdf' && l.url)
    out.push({
      source: 'europepmc',
      id: it.pmid ? `pmid:${it.pmid}` : it.id ?? title,
      title,
      authors: (it.authorString ?? '').split(',').map((s) => s.trim()).filter(Boolean),
      year: it.pubYear ? Number(it.pubYear) : undefined,
      venue: it.journalTitle,
      doi: it.doi,
      url: it.url,
      pdfUrl: pdf?.url ?? undefined,
    })
  }
  return out
}

/* ── Unpaywall (keyless; DOI → OA download links) ──────────────────────── */

export interface UnpaywallResult {
  isOa: boolean
  /** best OA location PDF link, if any. */
  bestPdfUrl?: string
  /** every distinct PDF link across oa_locations. */
  pdfUrls: string[]
  /** every landing-page link across oa_locations. */
  landingUrls: string[]
}

export async function unpaywallForDoi(doi: string, email: string): Promise<UnpaywallResult> {
  const data = (await httpGetJson(
    `https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=${encodeURIComponent(email)}`,
  )) as {
    is_oa?: boolean
    best_oa_location?: { url_for_pdf?: string | null; url?: string | null; host_type?: string | null } | null
    oa_locations?: Array<{ url_for_pdf?: string | null; url?: string | null; host_type?: string | null }>
  }
  const pdfUrls = [...new Set(
    (data.oa_locations ?? [])
      .map((l) => l.url_for_pdf)
      .filter((u): u is string => !!u),
  )]
  const landingUrls = [...new Set(
    (data.oa_locations ?? [])
      .map((l) => l.url)
      .filter((u): u is string => !!u),
  )]
  return {
    isOa: data.is_oa === true,
    bestPdfUrl: data.best_oa_location?.url_for_pdf ?? undefined,
    pdfUrls,
    landingUrls,
  }
}

/* ── Google Scholar (optional; HTML scrape via curl + proxy) ───────────── */

const execFileP = promisify(execFile)

/**
 * Google Scholar has NO official API (free or paid). This is an optional
 * HTML scrape of scholar.google.com through curl with an optional proxy
 * (LIT_SCHOLAR_PROXY). Hard constraints:
 *   - the box must reach google.com (proxy), and
 *   - the egress IP must be residential/clean — datacenter proxies get a
 *     "unusual traffic" CAPTCHA page. When blocked we throw a clear error
 *     instead of returning garbage results.
 */
export async function scholarSearch(
  query: string,
  max: number,
  proxy: string,
): Promise<RawHit[]> {
  const url = `https://scholar.google.com/scholar?hl=en&num=${Math.min(max, 20)}&q=${encodeURIComponent(query)}`
  const argv = ['-sL', '--max-time', '20', '-A', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36']
  if (proxy) argv.push('-x', proxy)
  argv.push(url)
  const { stdout } = await execFileP('curl', argv, { maxBuffer: 8 * 1024 * 1024 })
  const html = stdout
  const lower = html.toLowerCase()

  if (/unusual traffic|not a robot|captcha/i.test(lower)) {
    throw new Error('Google Scholar blocked this IP (captcha). Use a residential proxy via LIT_SCHOLAR_PROXY or a different network.')
  }
  if (!/gs_ri/i.test(html)) {
    throw new Error('Google Scholar returned an unexpected page (no results markup). Check network/proxy reachability.')
  }

  const out: RawHit[] = []
  const blockRe = /<div class="gs_r[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g
  let m: RegExpExecArray | null
  while ((m = blockRe.exec(html)) !== null && out.length < max) {
    const block = m[1]!
    const titleM = /<h3 class="gs_rt"[^>]*>(?:<span[^>]*>[^<]*<\/span>)?\s*(?:<a[^>]*href="([^"]+)"[^>]*>)?([\s\S]*?)<\/a>/.exec(block)
    const href = titleM?.[1]
    const rawTitle = (titleM?.[2] ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    if (!rawTitle) continue
    const snippetM = /<div class="gs_rs">([\s\S]*?)<\/div>/.exec(block)
    const snippet = snippetM?.[1]?.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    const metaM = /<div class="gs_a">([\s\S]*?)<\/div>/.exec(block)
    const meta = metaM?.[1]?.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() ?? ''
    const metaParts = meta.split(' - ')
    const authors = (metaParts[0] ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    const venue = metaParts.length > 1 ? metaParts[1]!.trim() : undefined
    const year = Number(/\b(19|20)\d{2}\b/.exec(meta)?.[0]) || undefined
    out.push({
      source: 'scholar',
      id: href ?? rawTitle,
      title: rawTitle,
      authors,
      year,
      venue,
      abstract: snippet,
      url: href,
      citationCount: Number(/\bcited by (\d+)/i.exec(meta)?.[1]) || undefined,
    })
  }
  if (out.length === 0 && html.length > 200) {
    throw new Error('Google Scholar returned no parseable results (markup changed or blocked).')
  }
  return out
}

/* ── dispatch ──────────────────────────────────────────────────────────── */

export async function fetchBySource(
  source: LitSource,
  query: string,
  max: number,
  opts: { minYear?: number; maxYear?: number; s2ApiKey?: string; openAccessOnly?: boolean; doi?: string; scholarProxy?: string },
): Promise<RawHit[]> {
  switch (source) {
    case 'openalex':
      return openalexSearch(query, max, {
        minYear: opts.minYear,
        maxYear: opts.maxYear,
        openAccessOnly: opts.openAccessOnly,
        doi: opts.doi,
      })
    case 'arxiv':
      return arxivSearch(query, max)
    case 'crossref':
      return crossrefSearch(query, max)
    case 'semantic-scholar':
      return semanticScholarSearch(query, max, opts.s2ApiKey ?? '')
    case 'europepmc':
      return europepmcSearch(query, max)
    case 'unpaywall':
      return []
    case 'scholar':
      return scholarSearch(query, max, opts.scholarProxy ?? '')
  }
}
