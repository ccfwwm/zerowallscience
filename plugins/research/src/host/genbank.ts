import type { GenBankRecord, SequenceFeature, SequenceFeatureSegment } from './sequence.js'

/** Preserve joined exon coordinates and complement ordering. Unsupported remote,
 * between-base and order() locations remain explicit warnings, never false spans. */
function locationSegments(value: string, depth = 0): SequenceFeatureSegment[] {
  if (depth > 8 || value.length > 16000) throw new Error('location nesting/length exceeds interactive limits')
  const range = /^([<>]?)(\d+)(?:\.\.([<>]?)(\d+))?$/u.exec(value)
  if (range) {
    const start = Number(range[2]), end = Number(range[4] ?? range[2])
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start) throw new Error('invalid feature coordinates')
    return [{ start, end, strand: 1, partialStart: !!range[1], partialEnd: !!(range[3] ?? range[1]) }]
  }
  if (value.startsWith('complement(') && value.endsWith(')')) return locationSegments(value.slice(11, -1), depth + 1).reverse().map(segment => ({ ...segment, strand: segment.strand === 1 ? -1 : 1 }))
  if (value.startsWith('join(') && value.endsWith(')')) {
    const body = value.slice(5, -1), parts: string[] = []; let nesting = 0, offset = 0
    for (let i = 0; i < body.length; i++) {
      if (body[i] === '(') nesting++
      if (body[i] === ')') nesting--
      if (nesting < 0) throw new Error('unbalanced location')
      if (body[i] === ',' && nesting === 0) { parts.push(body.slice(offset, i)); offset = i + 1 }
    }
    if (nesting !== 0) throw new Error('unbalanced location')
    parts.push(body.slice(offset))
    if (parts.length < 2 || parts.length > 1000) throw new Error('join requires 2–1000 segments')
    return parts.flatMap(part => locationSegments(part, depth + 1))
  }
  throw new Error('unsupported location (remote accession, order, between-base or malformed expression)')
}

export function parseGenBank(text: string): GenBankRecord[] {
  const records: GenBankRecord[] = []
  let current: GenBankRecord | undefined, declaredLength = 0, origin = false, featureTable = false, definition = false
  let pending: { type: string; location: string; qualifiers: string[] } | undefined
  const flushFeature = (): void => {
    if (!pending || !current) return
    const item = pending; pending = undefined
    if (current.features.length + current.featureWarnings.length >= 20000) throw new Error('GenBank interactive limit: 20,000 features per record.')
    try {
      const segments = locationSegments(item.location.replace(/\s/gu, ''))
      if (segments.length > 1000) throw new Error('feature has more than 1000 segments')
      const strands = new Set(segments.map(segment => segment.strand))
      const qualifiers = item.qualifiers.join(' ')
      const label = /\/(?:label|gene|product)=(?:"([^"]*)"|([^\s]+))/u.exec(qualifiers)
      const feature: SequenceFeature = { type: item.type, location: item.location, segments, start: Math.min(...segments.map(s => s.start)), end: Math.max(...segments.map(s => s.end)), strand: strands.size === 1 ? segments[0]!.strand : 0 }
      if (label) feature.label = (label[1] ?? label[2] ?? '').replace(/\s+/gu, ' ').slice(0, 300)
      current.features.push(feature)
    } catch (error) { current.featureWarnings.push(`${item.type} ${item.location.slice(0, 300)}: ${error instanceof Error ? error.message : 'unmapped feature'}`) }
  }
  for (const raw of text.replace(/^\uFEFF/u, '').split(/\r?\n/u)) {
    if (/^LOCUS\s/u.test(raw)) {
      if (current) throw new Error('GenBank record missing // terminator.')
      const locus = /^LOCUS\s+(\S+)\s+(\d+)\s+bp\b/iu.exec(raw)
      if (!locus) throw new Error('GenBank LOCUS must declare a nucleotide length in bp.')
      declaredLength = Number(locus[2])
      if (!Number.isSafeInteger(declaredLength) || declaredLength < 1 || declaredLength > 16000000) throw new Error('GenBank length exceeds the bounded interactive limit.')
      current = { name: locus[1]!, description: locus[1]!, sequence: '', features: [], featureWarnings: [], circular: /\bcircular\b/iu.test(raw) }
      origin = false; featureTable = false; definition = false
      continue
    }
    if (!current) { if (raw.trim()) throw new Error('Expected GenBank LOCUS before record content.'); continue }
    if (/^\/\/\s*$/u.test(raw)) {
      flushFeature()
      if (!origin || current.sequence.length !== declaredLength) throw new Error('GenBank ORIGIN length does not match declared LOCUS length.')
      if (current.features.some(feature => feature.end > declaredLength)) throw new Error('GenBank feature lies outside the declared sequence.')
      records.push(current); current = undefined
      if (records.length > 10000) throw new Error('GenBank preview supports at most 10,000 records.')
      continue
    }
    if (origin) {
      if (!raw.trim()) continue
      const row = /^\s*(\d+)\s+[A-Za-z\s]+$/u.exec(raw)
      if (!row || Number(row[1]) !== current.sequence.length + 1) throw new Error('Malformed or out-of-order GenBank ORIGIN line.')
      const bases = raw.replace(/[\d\s]/gu, '').toUpperCase()
      if (!/^[ACGTURYSWKMBDHVN]+$/u.test(bases)) throw new Error('Unsupported nucleotide symbol in GenBank ORIGIN.')
      current.sequence += bases
      if (current.sequence.length > declaredLength) throw new Error('GenBank ORIGIN length exceeds declared LOCUS length.')
      continue
    }
    if (/^ORIGIN\b/u.test(raw)) { flushFeature(); origin = true; featureTable = false; continue }
    if (/^DEFINITION\s/u.test(raw)) { current.description = raw.slice(12).trim(); definition = true; continue }
    if (definition && /^\s{12}\S/u.test(raw)) { current.description += ` ${raw.trim()}`; continue }
    definition = false
    if (/^FEATURES\s/u.test(raw)) { featureTable = true; continue }
    if (!featureTable) continue
    const feature = /^ {5}(\S+)\s+(.+)$/u.exec(raw)
    if (feature) { flushFeature(); pending = { type: feature[1]!, location: feature[2]!.trim(), qualifiers: [] }; continue }
    if (/^ {21}\S/u.test(raw) && pending) {
      const value = raw.slice(21).trim()
      if (value.startsWith('/') || pending.qualifiers.length) pending.qualifiers.push(value)
      else pending.location += value
    }
  }
  if (current) throw new Error('GenBank record missing // terminator.')
  if (!records.length) throw new Error('GenBank contains no nucleotide records.')
  return records
}
