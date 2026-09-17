/**
 * lit-harvest — deterministic sufficiency audit.
 *
 * The "do we need more literature?" judgment, with no LLM:
 *   1. Quota: at least `minCore` papers must have been *accepted* into the
 *      review (core count) and `minTotal` fetched overall.
 *   2. Coverage: every declared subtopic must be covered by at least one
 *      collected paper (keyword overlap over title+abstract+keywords).
 *
 * Uncovered subtopics are the explicit GAPS; follow-up queries are derived
 * deterministically from them ("<subtopic> <topic>"). This is Anaxa's
 * coverage-audit idea + AgentLab's quota-driven stop, minus the LLM.
 */
import type { Paper, SubtopicCoverage, SufficiencyReport } from '../types.ts';
export declare function computeCoverage(subtopics: string[], collected: Paper[]): SubtopicCoverage[];
export interface SufficiencyInput {
    topic: string;
    subtopics?: string[];
    collected: Paper[];
    /** Papers explicitly accepted into the review (core set). */
    core: Paper[];
    minCore?: number;
    minTotal?: number;
}
export declare function checkSufficiency(input: SufficiencyInput): SufficiencyReport;
/** Split a user topic string into subtopics (deterministic, no LLM). */
export declare function decomposeSubtopics(topic: string, explicit?: string[]): string[];
