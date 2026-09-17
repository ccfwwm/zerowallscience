/**
 * lit-harvest — the `lit_review_run` loop driver.
 *
 * A deterministic, budget-bounded literature-collection loop:
 *   round n: for each uncovered subtopic (or the topic itself):
 *     fetch → dedupe → accept new papers into the core set
 *     → re-audit sufficiency → stop when sufficient or budget exhausted.
 *
 * Gaps from the previous audit become the next round's queries (STORM's
 * "explicit gap" idea, mechanically). After the loop, papers are saved
 * (auto mode) and the RAG index is re-triggered if configured.
 */
import type { ReviewRunResult } from '../types.ts';
import type { LitConfig } from '../config.ts';
export interface ReviewRunOptions {
    topic: string;
    subtopics?: string[];
    sources?: string[];
    maxRounds?: number;
    perRound?: number;
    minCore?: number;
    minTotal?: number;
    saveMode?: 'auto' | 'zotero-api' | 'inbox';
    collection?: string;
    runReindex?: boolean;
    cfg: LitConfig;
}
export declare function runReview(opts: ReviewRunOptions): Promise<ReviewRunResult>;
