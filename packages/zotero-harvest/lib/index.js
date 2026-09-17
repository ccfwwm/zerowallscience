/** Six literature tools adapted to the pinned DSH runtime and native Zotero writes. */
import { defineTool } from '@deepseek-ai/dsh-tools';
import { resolveConfig, withConfig } from "./config.js";
import { sanitizeJson } from "./types.js";
import { fetchPapers, resolveDownloadLinks } from "./fetch/index.js";
import { checkSufficiency, decomposeSubtopics } from "./audit/sufficiency.js";
import { savePapers } from "./save/index.js";
import { buildPaperDetail } from "./pipeline/detail.js";
import { runReview } from "./pipeline/review.js";
import { LocalZoteroWriter } from "./save/local-api.js";
/** Settings and tool calls share the same Host credential provider; never return secrets. */
export async function localAuthorization(ctx, action) {
    return withConfig({ zoteroApiBase: ctx.get?.('zotero')?.config?.baseUrl ?? 'http://127.0.0.1:23119', credentials: ctx.get?.('credentials') }, async () => {
        const writer = new LocalZoteroWriter(resolveConfig());
        await writer.connect();
        return action === 'status' ? writer.authorizationStatus() : writer.requestAuthorization(action === 'renew');
    });
}
export const name = 'zotero-harvest';
export const inject = ['tools'];
const renderJson = (_args, value) => [
    { type: 'text', text: JSON.stringify(value, null, 2) },
];
/** Loose paper-object schema (results may carry source-specific extras). */
const paperSchema = {
    type: 'object',
    additionalProperties: true,
    properties: {
        source: { type: 'string', required: true },
        id: { type: 'string', required: true },
        title: { type: 'string', required: true },
        authors: { type: 'array', items: { type: 'string' }, required: true },
        year: { type: 'integer' },
        venue: { type: 'string' },
        abstract: { type: 'string' },
        doi: { type: 'string' },
        url: { type: 'string' },
        pdfUrl: { type: 'string' },
        citationCount: { type: 'integer' },
        keywords: { type: 'array', items: { type: 'string' } },
        downloadLinks: {
            type: 'array',
            items: {
                type: 'object',
                additionalProperties: true,
                properties: {
                    source: { type: 'string', required: true },
                    url: { type: 'string', required: true },
                    kind: { type: 'string' },
                },
            },
        },
        primaryDownloadUrl: { type: 'string' },
        oaStatus: { type: 'string' },
        relevance: { type: 'number' },
    },
};
export function apply(ctx) {
    const currentConfig = () => ({ zoteroApiBase: ctx.get?.('zotero')?.config?.baseUrl ?? 'http://127.0.0.1:23119', credentials: ctx.get?.('credentials') });
    /* ── lit_fetch ─────────────────────────────────────────────────────── */
    ctx.tools.register(defineTool({
        name: 'lit_fetch',
        description: 'Fetch academic papers for a query from multiple sources (OpenAlex, arXiv, Crossref, Europe PMC, optional Semantic Scholar), normalize, dedupe by DOI/title, rank, and resolve open-access download links (Unpaywall) when an open-access PDF is available. A DOI or arXiv id as the query returns that exact paper.',
        parameters: {
            query: { type: 'string', required: true, description: 'Search query (keywords or phrase); a DOI or arXiv id returns that exact paper.' },
            sources: {
                type: 'array',
                items: { type: 'string', enum: ['openalex', 'arxiv', 'crossref', 'semantic-scholar', 'europepmc', 'scholar'] },
                description: 'Sources to query; defaults to openalex+arxiv+crossref.',
            },
            max: { type: 'integer', description: 'Max papers to return (default 10).' },
            min_year: { type: 'integer', description: 'Earliest publication year.' },
            max_year: { type: 'integer', description: 'Latest publication year.' },
            open_access_only: { type: 'boolean', description: 'Only keep open-access / full-text records.' },
            resolve_downloads: { type: 'boolean', description: 'Resolve OA download links via Unpaywall etc. (default true).' },
            sort_by: { type: 'string', enum: ['citations', 'relevance', 'year'], description: 'Ranking: citations (default), source relevance, or year (newest first).' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: true,
                properties: {
                    query: { type: 'string', required: true },
                    papers: { type: 'array', items: paperSchema, required: true },
                    total: { type: 'integer', required: true },
                    bySource: { type: 'object', additionalProperties: true, required: true },
                    skipped: { type: 'array', items: { type: 'string' }, required: true },
                },
            },
            render: renderJson,
        },
        timeoutMs: 180_000,
        execute: async (args) => withConfig(currentConfig(), async () => {
            const cfg = resolveConfig();
            const sources = Array.isArray(args.sources)
                ? args.sources.filter((s) => ['openalex', 'arxiv', 'crossref', 'semantic-scholar', 'europepmc', 'scholar'].includes(s))
                : undefined;
            return fetchPapers({
                query: String(args.query),
                sources: sources,
                max: typeof args.max === 'number' ? args.max : undefined,
                minYear: typeof args.min_year === 'number' ? args.min_year : undefined,
                maxYear: typeof args.max_year === 'number' ? args.max_year : undefined,
                openAccessOnly: typeof args.open_access_only === 'boolean' ? args.open_access_only : undefined,
                resolveDownloads: typeof args.resolve_downloads === 'boolean' ? args.resolve_downloads : undefined,
                sortBy: args.sort_by === 'relevance' ? 'relevance' : args.sort_by === 'year' ? 'year' : 'citations',
            });
        }),
        presentCall: () => ({ card: 'generic', title: 'lit_fetch', kind: 'other', rawInput: null }),
    }));
    /* ── lit_paper_detail ──────────────────────────────────────────────── */
    ctx.tools.register(defineTool({
        name: 'lit_paper_detail',
        description: 'Build an evidence card for one paper: download the PDF (arXiv/OA), extract full text with pdftotext, and deterministically pull out abstract, keywords, section headings, and a method-type classification. No LLM involved.',
        parameters: {
            source: { type: 'string', description: 'Source (openalex/arxiv/crossref/semantic-scholar).' },
            id: { type: 'string', description: 'Source-side id (e.g. arXiv id).' },
            title: { type: 'string', required: true, description: 'Paper title.' },
            doi: { type: 'string' },
            url: { type: 'string' },
            pdf_url: { type: 'string', description: 'Direct PDF link, if known.' },
            authors: { type: 'array', items: { type: 'string' } },
            abstract: { type: 'string' },
            year: { type: 'integer' },
            venue: { type: 'string' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: true,
                properties: {
                    paper: paperSchema,
                    fullTextChars: { type: 'integer', required: true },
                    abstract: { type: 'string' },
                    keywords: { type: 'array', items: { type: 'string' }, required: true },
                    sections: { type: 'array', items: { type: 'string' }, required: true },
                    methodType: { type: 'string' },
                    evidenceCard: { type: 'string', required: true },
                },
            },
            render: renderJson,
        },
        timeoutMs: 150_000,
        execute: async (args) => withConfig(currentConfig(), async () => {
            const paper = {
                source: args.source ?? 'openalex',
                id: String(args.id ?? args.doi ?? args.title),
                title: String(args.title),
                authors: Array.isArray(args.authors) ? args.authors : [],
                year: typeof args.year === 'number' ? args.year : undefined,
                venue: typeof args.venue === 'string' ? args.venue : undefined,
                abstract: typeof args.abstract === 'string' ? args.abstract : undefined,
                doi: typeof args.doi === 'string' ? args.doi : undefined,
                url: typeof args.url === 'string' ? args.url : undefined,
                pdfUrl: typeof args.pdf_url === 'string' ? args.pdf_url : undefined,
            };
            return buildPaperDetail(paper);
        }),
        presentCall: () => ({ card: 'generic', title: 'lit_paper_detail', kind: 'other', rawInput: null }),
    }));
    /* ── lit_save ──────────────────────────────────────────────────────── */
    ctx.tools.register(defineTool({
        name: 'lit_save',
        description: 'Save papers into the local Zotero library. Mode auto: uses the Zotero local API when the desktop is running, otherwise prepares manual-import RIS/BibTeX + PDFs into the inbox directory. Deduplicates by DOI/title against the library.',
        parameters: {
            papers: {
                type: 'array',
                items: paperSchema,
                required: true,
                description: 'Papers to save (from lit_fetch output).',
            },
            mode: {
                type: 'string',
                enum: ['auto', 'zotero-api', 'inbox'],
                description: 'Save mode; default auto.',
            },
            collection: { type: 'string', description: 'Zotero collection name to place items in (created if missing).' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: true,
                properties: {
                    saved: { type: 'integer', required: true },
                    mode: { type: 'string', required: true },
                    resolvedMode: { type: 'string', required: true },
                    collection: { type: 'string' },
                    inboxDir: { type: 'string' },
                    zoteroItems: {
                        type: 'array',
                        items: {
                            type: 'object',
                            additionalProperties: true,
                            properties: {
                                key: { type: 'string' },
                                itemID: { type: 'integer' },
                                doi: { type: 'string' },
                                title: { type: 'string', required: true },
                            },
                        },
                    },
                    skipped: { type: 'array', items: { type: 'string' }, required: true },
                },
            },
            render: renderJson,
        },
        timeoutMs: 300_000,
        execute: async (args) => withConfig(currentConfig(), async () => {
            const cfg = resolveConfig();
            const papers = Array.isArray(args.papers)
                ? args.papers.map(normalizePaperArg)
                : [];
            return savePapers({
                papers,
                mode: args.mode,
                collection: typeof args.collection === 'string' ? args.collection : undefined,
                cfg,
            });
        }),
        presentCall: () => ({ card: 'generic', title: 'lit_save', kind: 'other', rawInput: null }),
    }));
    /* ── lit_sufficiency_check ─────────────────────────────────────────── */
    ctx.tools.register(defineTool({
        name: 'lit_sufficiency_check',
        description: 'Deterministically judge whether the collected literature is enough: quota (core papers, total papers) plus subtopic coverage audit. Returns explicit GAPS (uncovered subtopics) and follow-up queries — call lit_fetch with those when insufficient. No LLM.',
        parameters: {
            topic: { type: 'string', required: true, description: 'Research topic.' },
            subtopics: {
                type: 'array',
                items: { type: 'string' },
                description: 'Subtopics to cover; defaults to a single-topic split of `topic`.',
            },
            collected: {
                type: 'array',
                items: paperSchema,
                required: true,
                description: 'Papers gathered so far (from lit_fetch / lit_review_run).',
            },
            core: {
                type: 'array',
                items: paperSchema,
                description: 'Papers accepted into the core review set (defaults to `collected`).',
            },
            min_core: { type: 'integer', description: 'Core-paper quota (default 5).' },
            min_total: { type: 'integer', description: 'Total-paper quota (default 10).' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    sufficient: { type: 'boolean', required: true },
                    coreCount: { type: 'integer', required: true },
                    totalCount: { type: 'integer', required: true },
                    minCore: { type: 'integer', required: true },
                    minTotal: { type: 'integer', required: true },
                    subtopicCoverage: {
                        type: 'array',
                        required: true,
                        items: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                subtopic: { type: 'string', required: true },
                                covered: { type: 'boolean', required: true },
                                matchedPaperTitles: { type: 'array', items: { type: 'string' }, required: true },
                            },
                        },
                    },
                    gaps: { type: 'array', items: { type: 'string' }, required: true },
                    additionalQueries: { type: 'array', items: { type: 'string' }, required: true },
                    reason: { type: 'string', required: true },
                },
            },
            render: renderJson,
        },
        timeoutMs: 30_000,
        execute: async (args) => withConfig(currentConfig(), async () => {
            const collected = Array.isArray(args.collected) ? args.collected.map(normalizePaperArg) : [];
            const core = Array.isArray(args.core)
                ? args.core.map(normalizePaperArg)
                : collected;
            const cfg = resolveConfig();
            const subtopics = Array.isArray(args.subtopics)
                ? args.subtopics
                : decomposeSubtopics(String(args.topic));
            return checkSufficiency({
                topic: String(args.topic),
                subtopics,
                collected,
                core,
                minCore: typeof args.min_core === 'number' ? args.min_core : cfg.minCorePapers,
                minTotal: typeof args.min_total === 'number' ? args.min_total : cfg.minTotalPapers,
            });
        }),
        presentCall: () => ({ card: 'generic', title: 'lit_sufficiency_check', kind: 'other', rawInput: null }),
    }));
    /* ── lit_download_links ─────────────────────────────────────────────── */
    ctx.tools.register(defineTool({
        name: 'lit_download_links',
        description: 'Resolve open-access download links for a list of papers: uses each paper\'s existing PDF link (arXiv/Europe PMC/OpenAlex) and looks up Unpaywall by DOI to collect every available PDF/landing URL. Returns per-paper downloadLinks + primaryDownloadUrl for the user to download the paper itself.',
        parameters: {
            papers: {
                type: 'array',
                items: paperSchema,
                required: true,
                description: 'Papers to resolve (from lit_fetch output or hand-built with title/doi/pdf_url).',
            },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: true,
                properties: {
                    papers: {
                        type: 'array',
                        required: true,
                        items: {
                            type: 'object',
                            additionalProperties: true,
                            properties: {
                                title: { type: 'string', required: true },
                                doi: { type: 'string' },
                                pdfUrl: { type: 'string' },
                                primaryDownloadUrl: { type: 'string' },
                                oaStatus: { type: 'string' },
                                downloadLinks: {
                                    type: 'array',
                                    items: {
                                        type: 'object',
                                        additionalProperties: true,
                                        properties: {
                                            source: { type: 'string', required: true },
                                            url: { type: 'string', required: true },
                                            kind: { type: 'string' },
                                        },
                                    },
                                    required: true,
                                },
                            },
                        },
                    },
                    resolved: { type: 'integer', required: true },
                    noLink: { type: 'array', items: { type: 'string' }, required: true },
                },
            },
            render: renderJson,
        },
        timeoutMs: 120_000,
        execute: async (args) => withConfig(currentConfig(), async () => {
            const cfg = resolveConfig();
            const papers = Array.isArray(args.papers) ? args.papers.map(normalizePaperArg) : [];
            const out = [];
            const noLink = [];
            for (const p of papers) {
                const resolved = await resolveDownloadLinks(p, { unpaywallEmail: cfg.unpaywallEmail });
                out.push(sanitizeJson({
                    title: resolved.title,
                    doi: resolved.doi,
                    pdfUrl: resolved.pdfUrl,
                    primaryDownloadUrl: resolved.primaryDownloadUrl,
                    oaStatus: resolved.oaStatus === undefined ? undefined : String(resolved.oaStatus),
                    downloadLinks: resolved.downloadLinks ?? [],
                }));
                if (!resolved.primaryDownloadUrl)
                    noLink.push(resolved.title);
            }
            return sanitizeJson({ papers: out, resolved: out.length, noLink });
        }),
        presentCall: () => ({ card: 'generic', title: 'lit_download_links', kind: 'other', rawInput: null }),
    }));
    /* ── lit_review_run ────────────────────────────────────────────────── */
    ctx.tools.register(defineTool({
        name: 'lit_review_run',
        description: 'Run the full budgeted literature-collection loop for a topic: fetch per subtopic, dedupe, re-audit sufficiency, and stop when quotas+coverage are met or the round budget is exhausted. Saves collected papers (auto mode) and makes confirmed items available to the bundled live Zotero search. Returns the review report, sufficiency audit, save result, and reindex status.',
        parameters: {
            topic: { type: 'string', required: true, description: 'Research topic.' },
            subtopics: {
                type: 'array',
                items: { type: 'string' },
                description: 'Subtopics to cover; defaults to a comma/semicolon split of `topic`.',
            },
            sources: {
                type: 'array',
                items: { type: 'string', enum: ['openalex', 'arxiv', 'crossref', 'semantic-scholar', 'europepmc', 'scholar'] },
            },
            max_rounds: { type: 'integer', description: 'Loop budget (default 3).' },
            per_round: { type: 'integer', description: 'Papers fetched per query (default 10).' },
            min_core: { type: 'integer' },
            min_total: { type: 'integer' },
            save_mode: {
                type: 'string',
                enum: ['auto', 'zotero-api', 'inbox'],
                description: 'Save mode for collected papers (default auto).',
            },
            collection: { type: 'string' },
            run_reindex: { type: 'boolean', description: 'Compatibility option; bundled Zotero reads the live library.' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: true,
                properties: {
                    topic: { type: 'string', required: true },
                    subtopics: { type: 'array', items: { type: 'string' }, required: true },
                    rounds: {
                        type: 'array',
                        required: true,
                        items: {
                            type: 'object',
                            additionalProperties: true,
                            properties: {
                                round: { type: 'integer', required: true },
                                queries: { type: 'array', items: { type: 'string' }, required: true },
                                fetched: { type: 'integer', required: true },
                                newPapers: { type: 'integer', required: true },
                                coreCount: { type: 'integer', required: true },
                                totalCount: { type: 'integer', required: true },
                                sufficient: { type: 'boolean', required: true },
                            },
                        },
                    },
                    collected: { type: 'array', items: paperSchema, required: true },
                    report: { type: 'string', required: true },
                    sufficiency: {
                        type: 'object',
                        additionalProperties: true,
                        required: true,
                    },
                    save: { type: 'object', additionalProperties: true },
                    reindex: { type: 'object', additionalProperties: true },
                },
            },
            render: renderJson,
        },
        timeoutMs: 600_000,
        execute: async (args) => withConfig(currentConfig(), async () => {
            const cfg = resolveConfig();
            const sources = Array.isArray(args.sources) ? args.sources : undefined;
            return runReview({
                topic: String(args.topic),
                subtopics: Array.isArray(args.subtopics) ? args.subtopics : undefined,
                sources,
                maxRounds: typeof args.max_rounds === 'number' ? args.max_rounds : undefined,
                perRound: typeof args.per_round === 'number' ? args.per_round : undefined,
                minCore: typeof args.min_core === 'number' ? args.min_core : undefined,
                minTotal: typeof args.min_total === 'number' ? args.min_total : undefined,
                saveMode: args.save_mode,
                collection: typeof args.collection === 'string' ? args.collection : undefined,
                runReindex: typeof args.run_reindex === 'boolean' ? args.run_reindex : undefined,
                cfg,
            });
        }),
        presentCall: () => ({ card: 'generic', title: 'lit_review_run', kind: 'other', rawInput: null }),
    }));
    ctx.logger?.info('zotero-harvest: six tools mounted; Zotero connections are request-driven');
}
/** Coerce a JSON object from tool args into a Paper (tolerant of key case). */
function normalizePaperArg(v) {
    const r = (v ?? {});
    const pick = (...keys) => {
        for (const k of keys) {
            const x = r[k];
            if (typeof x === 'string' && x !== '')
                return x;
        }
        return undefined;
    };
    const arr = (...keys) => {
        for (const k of keys) {
            const x = r[k];
            if (Array.isArray(x))
                return x.filter((i) => typeof i === 'string');
        }
        return [];
    };
    return sanitizeJson({
        source: pick('source') ?? 'openalex',
        id: pick('id', 'paperId', 'arxivId', 'doi') ?? pick('title') ?? '',
        title: pick('title') ?? '',
        authors: arr('authors', 'author'),
        year: typeof r.year === 'number' ? r.year : typeof r.publication_year === 'number' ? r.publication_year : undefined,
        venue: pick('venue', 'container_title', 'publicationTitle', 'journal'),
        abstract: pick('abstract', 'abstractNote', 'summary'),
        doi: pick('doi', 'DOI'),
        url: pick('url', 'URL', 'link'),
        pdfUrl: pick('pdfUrl', 'pdf_url', 'openAccessPdf'),
        citationCount: typeof r.citationCount === 'number' ? r.citationCount : typeof r.cited_by_count === 'number' ? r.cited_by_count : undefined,
        keywords: arr('keywords', 'keyword', 'tags'),
        primaryDownloadUrl: pick('primaryDownloadUrl', 'primary_download_url'),
        oaStatus: typeof r.oaStatus === 'boolean' ? r.oaStatus : typeof r.oaStatus === 'string' ? r.oaStatus : undefined,
        relevance: typeof r.relevance === 'number' ? r.relevance : typeof r.relevance_score === 'number' ? r.relevance_score : undefined,
        downloadLinks: Array.isArray(r.downloadLinks) && r.downloadLinks.length > 0
            ? r.downloadLinks.map((l) => {
                const o = (l ?? {});
                return typeof o.url === 'string' ? { source: typeof o.source === 'string' ? o.source : 'user', url: o.url } : null;
            }).filter((x) => x !== null)
            : undefined,
    });
}
