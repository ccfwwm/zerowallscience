/**
 * lit-harvest — inbox writer (Zotero desktop unavailable).
 *
 * Drops each paper into `inbox/<slug>/` as:
 *   - paper.json  (machine-readable metadata)
 *   - citation.ris  (importable into Zotero via File → Import)
 *   - citation.bib  (BibTeX)
 *   - paper.pdf   (when the PDF was downloaded)
 */
import type { Paper } from '../types.ts';
export declare function slug(title: string): string;
export declare function writeInbox(inboxDir: string, p: Paper, pdfBytes?: Uint8Array): string;
