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
import { sanitizeJson } from "../types.js";
import { fetchBySource, unpaywallForDoi } from "./providers.js";
import { resolveConfig } from "../config.js";
const ARXIV_ID_RE = /^\d{4}\.\d{4,5}(v\d+)?$/i;
const DOI_RE = /^10\.\d{4,9}\/\S+$/i;
function titleKey(title) {
    return title
        .toLowerCase()
        .normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, '')
        .slice(0, 120);
}
export function dedupeHits(hits) {
    const seenDoi = new Set();
    const seenTitle = new Set();
    const papers = [];
    const skipped = [];
    for (const h of hits) {
        const doiKey = h.doi ? `doi:${h.doi.toLowerCase()}` : '';
        const tKey = `t:${titleKey(h.title)}`;
        if (doiKey && seenDoi.has(doiKey)) {
            skipped.push(`${h.source}:${h.id} (doi dup)`);
            continue;
        }
        if (seenTitle.has(tKey)) {
            skipped.push(`${h.source}:${h.id} (title dup)`);
            continue;
        }
        if (doiKey)
            seenDoi.add(doiKey);
        seenTitle.add(tKey);
        papers.push(toPaper(h));
    }
    return { papers, skipped };
}
function toPaper(h) {
    return sanitizeJson({
        source: h.source,
        id: h.id,
        title: h.title,
        authors: h.authors,
        year: h.year,
        venue: h.venue,
        abstract: h.abstract,
        doi: h.doi,
        url: h.url,
        pdfUrl: h.pdfUrl,
        citationCount: h.citationCount,
        keywords: h.keywords,
        oaStatus: h.oaStatus === undefined ? undefined : String(h.oaStatus),
        relevance: h.relevance,
    });
}
function rank(papers, by) {
    return [...papers].sort((a, b) => {
        if (by === 'year') {
            const ya = a.year ?? 0;
            const yb = b.year ?? 0;
            if (ya !== yb)
                return yb - ya;
        }
        if (by === 'relevance') {
            const ra = a.relevance ?? 0;
            const rb = b.relevance ?? 0;
            if (ra !== rb)
                return rb - ra;
        }
        const ca = a.citationCount ?? -1;
        const cb = b.citationCount ?? -1;
        if (ca !== cb)
            return cb - ca;
        return (b.year ?? 0) - (a.year ?? 0);
    });
}
/** Strip trailing '.' from a DOI (common copy-paste artifact). */
function cleanDoi(raw) {
    return raw.replace(/[.。]+$/, '').trim();
}
/**
 * Resolve OA download links for one paper:
 *   - arXiv / Europe PMC / OpenAlex / S2 pdfUrl → direct link
 *   - DOI without pdf → Unpaywall (best OA location + all pdf urls)
 */
export async function resolveDownloadLinks(paper, opts = {}) {
    const links = [];
    const push = (source, url, kind = 'pdf') => {
        if (url && !links.some((l) => l.url === url))
            links.push({ source, url, kind });
    };
    push(paper.source === 'arxiv' ? 'arxiv' : paper.source, paper.pdfUrl);
    const doi = paper.doi ? cleanDoi(paper.doi) : undefined;
    if (doi && !paper.pdfUrl) {
        try {
            const cfg = resolveConfig();
            const upw = await unpaywallForDoi(doi, opts.unpaywallEmail ?? cfg.unpaywallEmail);
            push('unpaywall-best', upw.bestPdfUrl);
            for (const u of upw.pdfUrls)
                push('unpaywall-oa', u);
            if (upw.bestPdfUrl) {
                return sanitizeJson({
                    ...paper,
                    downloadLinks: links,
                    primaryDownloadUrl: links[0]?.url ?? upw.bestPdfUrl,
                    oaStatus: String(upw.isOa || paper.oaStatus || false),
                });
            }
        }
        catch {
            // unpaywall failure is non-fatal
        }
    }
    const primary = links[0]?.url;
    return sanitizeJson({
        ...paper,
        downloadLinks: links,
        primaryDownloadUrl: primary,
        oaStatus: paper.oaStatus ?? String(primary ? true : false),
    });
}
/** Resolve an exact identifier (DOI or arXiv id) into a single hit. */
export async function resolveExactIdentifier(query, opts) {
    const q = query.trim();
    if (DOI_RE.test(q)) {
        const doi = cleanDoi(q);
        const hits = await openalexByDoi(doi, opts.openAccessOnly);
        if (hits.length > 0)
            return hits;
        const cr = await crossrefByDoi(doi);
        if (cr)
            return [cr];
    }
    if (ARXIV_ID_RE.test(q)) {
        const hits = await arxivById(q);
        if (hits.length > 0)
            return hits;
    }
    return [];
}
async function openalexByDoi(doi, openAccessOnly) {
    try {
        return await fetchBySource('openalex', '', 3, { doi, openAccessOnly });
    }
    catch {
        return [];
    }
}
async function crossrefByDoi(doi) {
    try {
        const data = await (await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`)).json();
        const m = data.message;
        if (!m?.title?.[0])
            return undefined;
        return {
            source: 'crossref',
            id: m.DOI ?? doi,
            title: m.title[0],
            authors: (m.author ?? []).map((a) => a.name ?? `${a.given ?? ''} ${a.family ?? ''}`.trim()).filter(Boolean),
            year: m.issued?.['date-parts']?.[0]?.[0],
            venue: (m['container-title'] ?? [])[0],
            abstract: m.abstract ? m.abstract.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : undefined,
            doi: m.DOI,
            url: m.URL,
        };
    }
    catch {
        return undefined;
    }
}
async function arxivById(arxivId) {
    try {
        return await fetchBySource('arxiv', arxivId, 1, {});
    }
    catch {
        return [];
    }
}
export async function fetchPapers(opts) {
    const cfg = resolveConfig();
    const sources = opts.sources && opts.sources.length > 0 ? opts.sources : cfg.sources;
    const max = Math.min(50, Math.max(1, Math.floor(opts.max ?? 10)));
    const perSource = Math.max(1, Math.ceil(max / sources.length));
    const s2Key = cfg.s2ApiKey;
    const resolveDownloads = opts.resolveDownloads ?? cfg.resolveDownloads;
    const bySource = {};
    const allHits = [];
    const errors = [];
    // 1. exact identifier?
    const exact = await resolveExactIdentifier(opts.query, { openAccessOnly: opts.openAccessOnly });
    if (exact.length > 0) {
        allHits.push(...exact);
        bySource['exact'] = exact.length;
    }
    // 2. keyword search across sources (skip when an exact DOI/arXiv hit landed
    //    and the caller just wanted the paper itself)
    if (!(opts.query.trim().match(DOI_RE) || opts.query.trim().match(ARXIV_ID_RE))) {
        for (const source of sources) {
            try {
                const hits = await fetchBySource(source, opts.query, perSource, {
                    minYear: opts.minYear,
                    maxYear: opts.maxYear,
                    s2ApiKey: s2Key,
                    openAccessOnly: opts.openAccessOnly,
                    scholarProxy: cfg.scholarProxy,
                });
                bySource[source] = hits.length;
                allHits.push(...hits);
            }
            catch (err) {
                bySource[source] = 0;
                errors.push(`${source}: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
    }
    const { papers, skipped } = dedupeHits(allHits);
    const ranked = rank(papers, opts.sortBy ?? 'citations').slice(0, max);
    // 3. resolve OA download links (parallel, bounded)
    let resolved = ranked;
    if (resolveDownloads) {
        const concurrency = 4;
        resolved = [];
        for (let i = 0; i < ranked.length; i += concurrency) {
            const batch = ranked.slice(i, i + concurrency);
            const done = await Promise.all(batch.map((p) => resolveDownloadLinks(p, { unpaywallEmail: cfg.unpaywallEmail })));
            resolved.push(...done);
        }
    }
    return {
        query: opts.query,
        papers: resolved,
        total: resolved.length,
        bySource,
        skipped: [...skipped, ...errors],
    };
}
