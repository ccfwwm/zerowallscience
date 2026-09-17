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

import type { Paper, ReviewRound, ReviewRunResult } from '../types.ts'
import type { LitConfig } from '../config.ts'
import { fetchPapers } from '../fetch/index.ts'
import { checkSufficiency, decomposeSubtopics } from '../audit/sufficiency.ts'
import { savePapers } from '../save/index.ts'


export interface ReviewRunOptions {
  topic: string
  subtopics?: string[]
  sources?: string[]
  maxRounds?: number
  perRound?: number
  minCore?: number
  minTotal?: number
  saveMode?: 'auto' | 'zotero-api' | 'inbox'
  collection?: string
  runReindex?: boolean
  cfg: LitConfig
}

function markdownReport(topic: string, subtopics: string[], rounds: ReviewRound[], collected: Paper[]): string {
  const lines: string[] = []
  lines.push(`# Literature review: ${topic}`)
  lines.push('')
  lines.push(`Subtopics: ${subtopics.join('; ')}`)
  lines.push('')
  lines.push('## Rounds')
  for (const r of rounds) {
    lines.push(
      `- Round ${r.round}: queries=${r.queries.join(' | ') || '—'} fetched=${r.fetched} new=${r.newPapers} core=${r.coreCount} total=${r.totalCount} sufficient=${r.sufficient}`,
    )
  }
  lines.push('')
  lines.push('## Collected papers')
  collected.forEach((p, i) => {
    lines.push(
      `${i + 1}. **${p.title}** (${p.year ?? '—'}) — ${p.authors.slice(0, 3).join(', ') || '—'} [${p.source}:${p.id}]${p.doi ? ` DOI:${p.doi}` : ''}`,
    )
  })
  return lines.join('\n')
}

export async function runReview(opts: ReviewRunOptions): Promise<ReviewRunResult> {
  const cfg = opts.cfg
  const subtopics = decomposeSubtopics(opts.topic, opts.subtopics)
  const maxRounds = Math.min(5, Math.max(1, opts.maxRounds ?? cfg.maxRounds))
  const perRound = Math.min(50, Math.max(1, opts.perRound ?? cfg.perRoundFetch))
  const minCore = opts.minCore ?? cfg.minCorePapers
  const minTotal = opts.minTotal ?? cfg.minTotalPapers

  const collected: Paper[] = []
  const rounds: ReviewRound[] = []
  let core: Paper[] = []
  let sufficient = false

  for (let round = 1; round <= maxRounds; round++) {
    const audit = checkSufficiency({ topic: opts.topic, subtopics, collected, core, minCore, minTotal })
    const queries = round === 1 ? [opts.topic] : audit.gaps.length > 0 ? audit.additionalQueries : []
    if (queries.length === 0) {
      sufficient = audit.sufficient
      break
    }
    let newPapers = 0
    for (const q of queries.slice(0, 10)) {
      const res = await fetchPapers({
        query: q,
        sources: opts.sources as never,
        max: perRound,
      })
      const fresh = res.papers.filter((p) => !collected.some((c) => c.title.toLowerCase() === p.title.toLowerCase()))
      for (const p of fresh) { if (collected.length < 50) collected.push(p) }
      newPapers += fresh.length
    }
    // core set: top papers by citation count, capped at the target
    core = [...collected]
      .sort((a, b) => (b.citationCount ?? -1) - (a.citationCount ?? -1))
      .slice(0, Math.max(minCore, minTotal))
    const after = checkSufficiency({ topic: opts.topic, subtopics, collected, core, minCore, minTotal })
    sufficient = after.sufficient
    rounds.push({
      round,
      queries,
      fetched: queries.length,
      newPapers,
      coreCount: core.length,
      totalCount: collected.length,
      sufficient,
    })
    if (sufficient) break
  }

  const finalAudit = checkSufficiency({ topic: opts.topic, subtopics, collected, core, minCore, minTotal })

  // Save + reindex
  let save: ReviewRunResult['save'] = null
  let reindex: ReviewRunResult['reindex'] = null
  if (collected.length > 0) {
    save = await savePapers({
      papers: collected,
      mode: opts.saveMode,
      collection: opts.collection,
      cfg,
    })
    reindex = { triggered: false, ok: save.resolvedMode !== 'inbox', message: save.resolvedMode === 'inbox' ? 'Manual Zotero import required' : 'Bundled Zotero reads the live library; no external reindex needed' }

  }

  return {
    topic: opts.topic,
    subtopics,
    rounds,
    collected,
    report: markdownReport(opts.topic, subtopics, rounds, collected),
    sufficiency: finalAudit,
    ...(save ? { save } : {}),
    ...(reindex ? { reindex } : {}),
  }
}
