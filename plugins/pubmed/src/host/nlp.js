// lib/nlp.js — optional pure-JS NLP keyword extraction (compromise).
// Provided to the shared core via deps.extractKeywords; the core falls back to
// its built-in token+MeSH extractor when this is absent. Lazy-loaded below so
// a missing/broken compromise NEVER explodes plugin load (bundle mode): the
// module still imports, `nlpAvailable` is false, and lib/index.js withholds
// the extractors — the core then uses its portable fallback. Zero-config in
// both bundle and dynamic modes.
// P4-一.2/一.3: word lists come from lib/constants.js (single source of truth,
// also injected into the core's fallback extractor via deps).
import { RELATION_VERB_STEMS, STOPWORDS } from './constants.js'
let nlp = null
try {
  nlp = (await import('compromise')).default
} catch (e) {
  nlp = null
}
export const nlpAvailable = nlp != null
export { RELATION_VERB_STEMS, STOPWORDS }

function normalizePhrase(p) {
  return String(p).toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/-{2,}/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^-+|-+$/g, '')
}

/**
 * NLP keyword extractor: MeSH terms (weighted) + compromise-extracted noun
 * phrases from the title and abstract. Multi-word concepts become single
 * keyword nodes (e.g. "bile acid metabolism") instead of raw tokens.
 */
export function nlpExtractKeywords(article) {
  const freq = new Map()
  const bump = (w, n) => freq.set(w, (freq.get(w) || 0) + n)

  for (const m of (article.meshTerms || [])) {
    const d = String(m.descriptorName || '').replace(/^\*/, '').toLowerCase().trim()
    if (d) bump(d, 3)
  }

  const text = [article.title, article.abstractText].filter(Boolean).join('. ')
  if (text.trim()) {
    const doc = nlp(text)
    for (const phrase of doc.match('#Noun+').out('array')) {
      // Skip phrases contaminated by an abbreviation token (e.g. "X (ILA)")
      // — they fragment into noise ("acid ila").
      if (/\b[A-Z]{2,6}\b/.test(phrase)) continue
      const norm = normalizePhrase(phrase)
      const words = norm.split(' ').filter(Boolean)
      if (!words.length || words.length > 4) continue
      if (words.every((w) => STOPWORDS.has(w))) continue
      bump(norm, 1)
    }
  }

  return [...freq.entries()].sort((x, y) => y[1] - x[1]).map(([word, count]) => ({ word, count }))
}

// Causal/regulatory verbs matched by STEM so every form works (regulate,
// regulates, regulated, regulating…). Covers the causal verbs that dominate
// biomedical abstracts; relation direction = subject -> verb -> object.

/**
 * Directed-relation extractor (Step B): finds "X <verb> Y" triples in the title
 * + abstract. Stem-based verb matching (handles past/present/progressive) over
 * bounded 1–3 word spans so endpoints stay clean and align with keyword nodes.
 * Returns normalized `{ source, relation, target }`.
 */
export function nlpExtractRelations(article) {
  const text = [article.title, article.abstractText].filter(Boolean).join('. ')
  const out = []
  if (!text.trim()) return out
  // P4-一.2: verb stems from lib/constants.js (single source of truth)
  const re = new RegExp('\\b([a-z][a-z0-9-]+(?:\\s+[a-z][a-z0-9-]+){0,2})\\s+((?:' + RELATION_VERB_STEMS.join('|') + ')\\w*)\\s+([a-z][a-z0-9-]+(?:\\s+[a-z][a-z0-9-]+){0,2})[\\s.,;]', 'gi')
  let m
  while ((m = re.exec(text))) {
    let source = m[1].toLowerCase().replace(/\s+/g, ' ').trim()
    const relation = m[2].toLowerCase()
    let target = m[3].toLowerCase().replace(/\s+/g, ' ').trim()
    // drop trailing adverbs from the subject ("erythritol markedly" → "erythritol")
    source = source.replace(/\b(markedly|significantly|strongly|directly|indirectly|substantially|dramatically|greatly|potently|partially|largely|primarily|mainly)\s*$/, '').trim()
    if (source && target && source !== target && source !== relation && target !== relation) {
      out.push({ source, relation, target })
    }
  }
  return out
}
