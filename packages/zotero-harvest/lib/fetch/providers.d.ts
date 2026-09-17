/**
 * lit-harvest — source providers.
 *
 * Reachability verified on this box: OpenAlex, arXiv, Crossref work
 * directly without keys; Semantic Scholar rate-limits without S2_API_KEY
 * and is treated as an optional enhancement with exponential backoff.
 */
import type { LitSource } from '../types.ts';
export interface RawHit {
    source: LitSource;
    id: string;
    title: string;
    authors: string[];
    year?: number;
    venue?: string;
    abstract?: string;
    doi?: string;
    url?: string;
    pdfUrl?: string;
    citationCount?: number;
    keywords?: string[];
    /** openalex: is_oa flag. */
    oaStatus?: boolean;
    /** source-reported relevance score. */
    relevance?: number;
}
export declare function httpGetJson(url: string, headers?: Record<string, string>, timeoutMs?: number): Promise<unknown>;
export interface OpenalexOptions {
    minYear?: number;
    maxYear?: number;
    /** Filter to records that are open access (is_oa:true). */
    openAccessOnly?: boolean;
    /** Exact DOI lookup (filter=doi:…). */
    doi?: string;
}
export declare function openalexSearch(query: string, max: number, opts?: OpenalexOptions): Promise<RawHit[]>;
export declare function arxivSearch(query: string, max: number): Promise<RawHit[]>;
export declare function crossrefSearch(query: string, max: number): Promise<RawHit[]>;
export declare function semanticScholarSearch(query: string, max: number, apiKey: string): Promise<RawHit[]>;
export declare function europepmcSearch(query: string, max: number): Promise<RawHit[]>;
export interface UnpaywallResult {
    isOa: boolean;
    /** best OA location PDF link, if any. */
    bestPdfUrl?: string;
    /** every distinct PDF link across oa_locations. */
    pdfUrls: string[];
    /** every landing-page link across oa_locations. */
    landingUrls: string[];
}
export declare function unpaywallForDoi(doi: string, email: string): Promise<UnpaywallResult>;
/**
 * Google Scholar has NO official API (free or paid). This is an optional
 * HTML scrape of scholar.google.com through curl with an optional proxy
 * (LIT_SCHOLAR_PROXY). Hard constraints:
 *   - the box must reach google.com (proxy), and
 *   - the egress IP must be residential/clean — datacenter proxies get a
 *     "unusual traffic" CAPTCHA page. When blocked we throw a clear error
 *     instead of returning garbage results.
 */
export declare function scholarSearch(query: string, max: number, proxy: string): Promise<RawHit[]>;
export declare function fetchBySource(source: LitSource, query: string, max: number, opts: {
    minYear?: number;
    maxYear?: number;
    s2ApiKey?: string;
    openAccessOnly?: boolean;
    doi?: string;
    scholarProxy?: string;
}): Promise<RawHit[]>;
