import type { SangerBase, SangerTrace } from './sanger.js'
export interface SangerEdit { position: number; from: SangerBase['base']; to: SangerBase['base']; reason: string }
export interface SangerEditBatch { sourceSha256: string; edits: SangerEdit[] }
export function applySangerEdits(trace: SangerTrace, batches: unknown): SangerTrace {
  if (batches === undefined) return trace
  if (!Array.isArray(batches) || batches.length > 1000) throw new Error('Invalid Sanger revision history.')
  const bases = trace.bases.map(base => ({ ...base }))
  let total = 0
  for (const batch of batches) {
    if (!batch || batch.sourceSha256 !== trace.sourceSha256 || !Array.isArray(batch.edits) || !batch.edits.length || batch.edits.length > 1000) throw new Error('Invalid Sanger edit batch or source checksum.')
    total += batch.edits.length; if (total > 10000) throw new Error('Sanger history exceeds 10,000 edits.')
    const positions = new Set<number>()
    for (const edit of batch.edits) {
      if (!edit || !Number.isInteger(edit.position) || edit.position < 1 || edit.position > bases.length || positions.has(edit.position) || typeof edit.to !== 'string' || !/^[ACGTNRYSWKMBDHV]$/u.test(edit.to) || typeof edit.reason !== 'string' || !edit.reason.trim() || edit.reason.length > 500) throw new Error('Sanger edits require unique in-range positions, IUPAC calls and a reason.')
      positions.add(edit.position)
      const base = bases[edit.position - 1]!
      if (base.base !== edit.from || edit.to === edit.from) throw new Error('Sanger edit conflicts with the current base call.')
      // Stored instrument quality belongs to the original call. Never assign it to a manual call.
      const { phred: _phred, ...rest } = base
      bases[edit.position - 1] = { ...rest, base: edit.to, quality: null }
    }
  }
  return { ...trace, bases, notes: [...trace.notes, 'Manual calls preserve original peak channels; edited bases have unknown quality. Revision reasons and original source checksum are retained.'] }
}
