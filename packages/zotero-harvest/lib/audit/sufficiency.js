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
const STOPWORDS = new Set([
    'the', 'a', 'an', 'of', 'and', 'or', 'in', 'on', 'for', 'to', 'with', 'by',
    'from', 'at', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'this', 'that',
    'these', 'those', 'using', 'use', 'based', 'via', 'towards', 'toward',
    'between', 'among', 'over', 'under', 'their', 'its', 'it', 'our', 'we',
    'study', 'studies', 'paper', 'papers', 'research', 'results', 'result',
    'method', 'methods', 'approach', 'analysis', 'data', 'model', 'models',
    'new', 'novel', 'proposed', 'show', 'shows', 'demonstrate', 'introduce',
]);
function keywordsOf(text) {
    const out = new Set();
    if (!text)
        return out;
    for (const raw of text.toLowerCase().split(/[^a-z0-9\u4e00-\u9fff]+/)) {
        const w = raw.trim();
        if (w.length < 2)
            continue;
        if (/^[a-z]+$/.test(w) && STOPWORDS.has(w))
            continue;
        out.add(w);
    }
    return out;
}
function subtopicMatchesPaper(subtopic, p) {
    const terms = keywordsOf(subtopic);
    if (terms.size === 0)
        return false;
    const haystack = keywordsOf(`${p.title} ${p.abstract ?? ''} ${(p.keywords ?? []).join(' ')}`);
    if (haystack.size === 0)
        return false;
    let hits = 0;
    for (const t of terms)
        if (haystack.has(t))
            hits++;
    // require the majority of the subtopic's significant terms to appear
    return hits / terms.size >= 0.6;
}
export function computeCoverage(subtopics, collected) {
    return subtopics.map((st) => {
        const matched = collected
            .filter((p) => subtopicMatchesPaper(st, p))
            .map((p) => p.title);
        return { subtopic: st, covered: matched.length > 0, matchedPaperTitles: matched.slice(0, 5) };
    });
}
export function checkSufficiency(input) {
    const subtopics = input.subtopics && input.subtopics.length > 0 ? input.subtopics : [input.topic];
    const minCore = input.minCore ?? 5;
    const minTotal = input.minTotal ?? 10;
    const coverage = computeCoverage(subtopics, input.collected);
    const gaps = coverage.filter((c) => !c.covered).map((c) => c.subtopic);
    const coreCount = input.core.length;
    const totalCount = input.collected.length;
    const reasons = [];
    if (coreCount < minCore)
        reasons.push(`core papers ${coreCount}/${minCore}`);
    if (totalCount < minTotal)
        reasons.push(`total papers ${totalCount}/${minTotal}`);
    if (gaps.length > 0)
        reasons.push(`uncovered subtopics: ${gaps.join('; ')}`);
    const sufficient = reasons.length === 0;
    return {
        sufficient,
        coreCount,
        totalCount,
        minCore,
        minTotal,
        subtopicCoverage: coverage,
        gaps,
        additionalQueries: gaps.map((g) => `${g} ${input.topic}`.trim()),
        reason: sufficient
            ? 'Quota and subtopic coverage satisfied.'
            : `Insufficient — ${reasons.join('; ')}.`,
    };
}
/** Split a user topic string into subtopics (deterministic, no LLM). */
export function decomposeSubtopics(topic, explicit) {
    if (explicit && explicit.length > 0)
        return explicit.map((s) => s.trim()).filter(Boolean);
    // allow '；' ';' ',' ',' delimited lists; otherwise a single topic
    const parts = topic
        .split(/[；;，,]/)
        .map((s) => s.trim())
        .filter(Boolean);
    return parts.length > 0 ? parts : [topic];
}
