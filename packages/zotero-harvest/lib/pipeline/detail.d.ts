/**
 * lit-harvest — paper detail extraction (deterministic, no LLM).
 *
 * Downloads the PDF (arXiv / OA), extracts text with pdftotext, and builds
 * an evidence card from: metadata abstract, keyword lines, section headings,
 * and a method-type heuristic (mirrors zotero-wave-rag's method taxonomy).
 */
import type { Paper, PaperDetail } from '../types.ts';
export declare function extractPdfText(pdfPath: string, timeoutMs?: number): Promise<string>;
export declare function classifyMethod(text: string, keywords: string[]): string | undefined;
export declare function buildPaperDetail(p: Paper, opts?: {
    timeoutMs?: number;
    cacheDir?: string;
}): Promise<PaperDetail>;
