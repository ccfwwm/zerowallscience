/**
 * lit-harvest — paper detail extraction (deterministic, no LLM).
 *
 * Downloads the PDF (arXiv / OA), extracts text with pdftotext, and builds
 * an evidence card from: metadata abstract, keyword lines, section headings,
 * and a method-type heuristic (mirrors zotero-wave-rag's method taxonomy).
 */
import { downloadPdf } from "../save/index.js";
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
export function extractPdfText(pdfPath, timeoutMs = 60_000) {
    return new Promise((resolve, reject) => {
        const child = spawn('pdftotext', ['-layout', pdfPath, '-']);
        const out = [];
        const err = [];
        child.stdout.on('data', (d) => out.push(d));
        child.stderr.on('data', (d) => err.push(d));
        const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
        child.on('error', error => { clearTimeout(timer); reject(error); });
        child.on('close', (code) => {
            clearTimeout(timer);
            if (code === 0) {
                resolve(Buffer.concat(out).toString('utf8'));
            }
            else {
                reject(new Error(`pdftotext exited ${code}: ${Buffer.concat(err).slice(0, 200).toString()}`));
            }
        });
    });
}
const SECTION_HEADING = /^\s*(1\.?|2\.?|3\.?|4\.?|5\.?|6\.?|7\.?|8\.?|9\.?|10\.?)\s+[A-Z][A-Za-z .\-]{3,40}\s*$/m;
function extractKeywords(text) {
    const m = /(?:Keywords|Index Terms|KEYWORDS|INDEX TERMS)\s*[:\-–]?\s*(.+)$/m.exec(text);
    if (!m)
        return [];
    return m[1]
        .split(/[;,]/)
        .map((s) => s.replace(/^[:\-–\s]+|[:\-–\s]+$/g, '').trim())
        .filter((s) => s.length > 1 && s.length < 80)
        .slice(0, 12);
}
function extractSections(text) {
    const out = [];
    const re = /^\s*(?:[0-9]+\.?)?\s*([A-Z][A-Za-z .\-/]{3,40})\s*$/gm;
    let m;
    const seen = new Set();
    while ((m = re.exec(text)) !== null) {
        const s = m[1].trim();
        if (s.length < 4 || s.length > 40)
            continue;
        if (/^[A-Z]{1,3}$/.test(s))
            continue;
        if (!/^[A-Z]/.test(s))
            continue;
        const key = s.toLowerCase();
        if (seen.has(key))
            continue;
        seen.add(key);
        out.push(s);
    }
    return out.slice(0, 20);
}
function extractAbstract(text) {
    const m = /(?:Abstract|ABSTRACT)\s*[:\-–]?\s*([\s\S]{80,1200}?)(?=\n\s*(?:1\.?\s+[A-Z]|Introduction|INTRODUCTION|Keywords|KEYWORDS|\d+\s*$))/.exec(text);
    return m?.[1]?.replace(/\s+/g, ' ').trim();
}
const METHOD_HINTS = [
    ['experimental', ['experiment', 'we evaluate', 'we train', 'empirical', 'benchmark', 'dataset', 'ablation'], 2],
    ['numerical', ['simulation', 'numerical', 'solver', 'finite element', 'computational'], 2],
    ['analytical', ['we prove', 'theorem', 'derivation', 'closed-form', 'bound'], 2],
    ['review', ['survey', 'review', 'overview', 'taxonomy', 'state of the art'], 2],
];
export function classifyMethod(text, keywords) {
    const corpus = `${text.slice(0, 8000)} ${keywords.join(' ')}`.toLowerCase();
    const scores = [];
    for (const [kind, hints, threshold] of METHOD_HINTS) {
        const hits = hints.filter((h) => corpus.includes(h)).length;
        if (hits >= threshold)
            scores.push([kind, hits]);
    }
    if (scores.length === 0)
        return undefined;
    scores.sort((a, b) => b[1] - a[1]);
    return scores[0][0];
}
export async function buildPaperDetail(p, opts = {}) {
    const timeoutMs = opts.timeoutMs ?? 60_000;
    let fullText;
    if (p.pdfUrl) {
        try {
            const bytes = await downloadPdf(p, timeoutMs);
            if (bytes) {
                const dir = mkdtempSync(join(tmpdir(), 'lit-harvest-'));
                const pdfPath = join(dir, 'paper.pdf');
                writeFileSync(pdfPath, bytes);
                try {
                    fullText = await extractPdfText(pdfPath, timeoutMs);
                }
                finally {
                    rmSync(dir, { recursive: true, force: true });
                }
            }
        }
        catch {
            // full text is optional
        }
    }
    const corpus = fullText ?? `${p.title}. ${p.abstract ?? ''}`;
    const keywords = extractKeywords(corpus);
    const sections = fullText ? extractSections(fullText) : [];
    const abstract = p.abstract ?? (fullText ? extractAbstract(fullText) : undefined);
    const methodType = classifyMethod(corpus, keywords);
    const evidenceCard = [
        `# ${p.title}`,
        `- Authors: ${p.authors.join('; ') || '—'}`,
        `- Year: ${p.year ?? '—'} | Venue: ${p.venue ?? '—'} | DOI: ${p.doi ?? '—'}`,
        `- Method: ${methodType ?? 'unclassified'} | Citations: ${p.citationCount ?? '—'}`,
        keywords.length > 0 ? `- Keywords: ${keywords.join(', ')}` : '',
        abstract ? `\n**Abstract:** ${abstract.slice(0, 800)}` : '',
        sections.length > 0 ? `\n**Sections:** ${sections.join(' | ')}` : '',
    ]
        .filter((l) => l !== '')
        .join('\n');
    return {
        paper: p,
        fullText: fullText ? fullText.slice(0, 200_000) : undefined,
        fullTextChars: fullText?.length ?? 0,
        abstract,
        keywords,
        sections,
        methodType,
        evidenceCard,
    };
}
