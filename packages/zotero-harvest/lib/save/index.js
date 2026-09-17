import { sanitizeJson } from "../types.js";
import { LocalZoteroWriter } from "./local-api.js";
import { writeInbox } from "./inbox.js";
const locks = new Map();
export async function downloadPdf(p, timeout) {
    const url = p.primaryDownloadUrl ?? p.pdfUrl;
    if (!url)
        return undefined;
    if (!/^https?:\/\//i.test(url))
        throw new Error('PDF URL must use HTTP(S)');
    const response = await fetch(url, { signal: AbortSignal.timeout(timeout) });
    if (!response.ok || !response.body)
        throw new Error(`PDF HTTP ${response.status}`);
    const limit = 30 * 1024 * 1024;
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
        if (Number(response.headers.get('content-length')) > limit)
            throw new Error('PDF exceeds 30 MB');
        for (;;) {
            const { done, value } = await reader.read();
            if (done)
                break;
            size += value.length;
            if (size > limit)
                throw new Error('PDF exceeds 30 MB');
            chunks.push(value);
        }
    }
    finally {
        await reader.cancel().catch(() => { });
    }
    const bytes = Buffer.concat(chunks);
    if (!bytes.subarray(0, 1024).includes(Buffer.from('%PDF-')))
        throw new Error('Download is not a PDF');
    return bytes;
}
export async function savePapers(opts) {
    const prior = locks.get(opts.cfg.zoteroApiBase) ?? Promise.resolve();
    const run = prior.catch(() => { }).then(() => saveUnlocked(opts));
    locks.set(opts.cfg.zoteroApiBase, run);
    try {
        return await run;
    }
    finally {
        if (locks.get(opts.cfg.zoteroApiBase) === run)
            locks.delete(opts.cfg.zoteroApiBase);
    }
}
async function saveUnlocked({ papers, mode = 'auto', collection, cfg }) {
    if (!['auto', 'zotero-api', 'inbox'].includes(mode))
        throw new Error('Unsupported save mode; direct SQLite writes are disabled');
    if (!papers.length || papers.length > 50)
        throw new Error('Save between 1 and 50 papers per call');
    for (const p of papers)
        if (!p.title?.trim() || !Array.isArray(p.authors))
            throw new Error('Each paper requires a title and authors array');
    const writer = new LocalZoteroWriter(cfg);
    let resolvedMode = mode === 'inbox' ? 'inbox' : 'zotero-api';
    const warnings = [];
    const skipped = [];
    const pending = [];
    const zoteroItems = [];
    if (resolvedMode !== 'inbox') {
        try {
            await writer.connect();
        }
        catch (error) {
            if (mode !== 'auto')
                throw error;
            resolvedMode = 'inbox';
            warnings.push(`Zotero unavailable; manual import required: ${String(error)}`);
        }
    }
    const collectionKey = resolvedMode === 'zotero-api' ? await writer.collection(collection) : undefined;
    let saved = 0;
    for (const paper of papers) {
        if (resolvedMode === 'zotero-api') {
            const existing = await writer.find(paper);
            if (existing) {
                zoteroItems.push({ key: existing.key, ref: writer.ref(existing.key), title: paper.title, doi: paper.doi, duplicate: true });
                skipped.push(`${paper.title}: already in Zotero`);
                continue;
            }
            // Stop on failed/ambiguous writes. Never fall back and imply success.
            const row = await writer.add(paper, collectionKey);
            saved++;
            zoteroItems.push({ key: row.key, ref: writer.ref(row.key), title: paper.title, doi: paper.doi });
            try {
                const pdf = await downloadPdf(paper, cfg.httpTimeoutMs);
                if (pdf)
                    await writer.attach(row.key, pdf);
            }
            catch (error) {
                warnings.push(`${paper.title}: metadata saved, PDF not saved: ${String(error)}`);
            }
        }
        else {
            let pdf;
            try {
                pdf = await downloadPdf(paper, cfg.httpTimeoutMs);
            }
            catch (error) {
                warnings.push(`${paper.title}: ${String(error)}`);
            }
            pending.push(writeInbox(cfg.inboxDir, paper, pdf));
        }
    }
    return sanitizeJson({ saved, mode, resolvedMode, collection, inboxDir: resolvedMode === 'inbox' ? cfg.inboxDir : undefined,
        zoteroItems, skipped, warnings, pending, imported: saved, requiresImport: pending.length > 0 });
}
