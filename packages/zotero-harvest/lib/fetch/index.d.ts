/**
 * lit-harvest — multi-source fetch, normalization, dedupe, ranking, and OA
 * download-link resolution.
 *
 * The `lit_fetch` tool body. Pipeline:
 *   1. exact-identifier resolution (query is a DOI or arXiv id → direct hit)
 *   2. multi-source keyword search (OpenAlex / arXiv / Crossref / Europe PMC / S2)
 *   3. normalize + dedupe (DOI first, then normalized title)
 *   4. rank (citations desc or source relevance)
 *   5. resolve open-access download links (Unpaywall for DOIs, plus any
 *      pdfUrl the sources already reported) — every returned paper carries
 *      `downloadLinks` + `primaryDownloadUrl` for the user.
 *
 * Mirrors paper-qa's client design (OpenAlex + Crossref + Unpaywall) and
 * Anaxa's multi-source normalize/dedupe stage.
 */
import type { FetchOptions, FetchResult, Paper } from '../types.ts';
import { type RawHit } from './providers.ts';
export declare function dedupeHits(hits: RawHit[]): {
    papers: Paper[];
    skipped: string[];
};
/**
 * Resolve OA download links for one paper:
 *   - arXiv / Europe PMC / OpenAlex / S2 pdfUrl → direct link
 *   - DOI without pdf → Unpaywall (best OA location + all pdf urls)
 */
export declare function resolveDownloadLinks(paper: Paper, opts?: {
    unpaywallEmail?: string;
    timeoutMs?: number;
}): Promise<Paper>;
/** Resolve an exact identifier (DOI or arXiv id) into a single hit. */
export declare function resolveExactIdentifier(query: string, opts: {
    openAccessOnly?: boolean;
}): Promise<RawHit[]>;
export declare function fetchPapers(opts: FetchOptions): Promise<FetchResult>;
