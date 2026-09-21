import type { SequenceAnalysis, SequenceRecordInfo, SequenceWindow } from '../shared/types.js'

export interface NucleotideRecord { name: string; description: string; sequence: string }
export interface SequenceFeature { type: string; start: number; end: number; strand: 1 | -1 | 0; label?: string }
export interface GenBankRecord extends NucleotideRecord { features: SequenceFeature[]; circular: boolean }
export interface CrisprCandidate { strand: 1 | -1; protospacer: string; pam: string; start: number; end: number; mismatches: number; notes: string[] }
const alphabet = /^[ACGTURYSWKMBDHVN]+$/u
const complement: Record<string, string> = { A: 'T', T: 'A', U: 'A', G: 'C', C: 'G', R: 'Y', Y: 'R', S: 'S', W: 'W', K: 'M', M: 'K', B: 'V', V: 'B', D: 'H', H: 'D', N: 'N' }
const aminoAcids = 'FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG'
const enzymes = [{ name: 'EcoRI', motif: 'GAATTC', offset: 1 }, { name: 'BamHI', motif: 'GGATCC', offset: 1 }, { name: 'HindIII', motif: 'AAGCTT', offset: 1 }, { name: 'NotI', motif: 'GCGGCCGC', offset: 2 }, { name: 'XhoI', motif: 'CTCGAG', offset: 1 }]

export function parseFasta(text: string): NucleotideRecord[] {
  const records: NucleotideRecord[] = []
  let current: NucleotideRecord | undefined
  for (const line of text.replace(/^\uFEFF/u, '').split(/\r?\n/u)) {
    const value = line.trim()
    if (!value || value.startsWith(';')) continue
    if (value.startsWith('>')) {
      const description = value.slice(1).trim()
      if (!description) throw new Error('FASTA header is empty.')
      current = { name: description.split(/\s/u)[0]!, description, sequence: '' }
      records.push(current)
      if (records.length > 10000) throw new Error('FASTA preview supports at most 10,000 records.')
    } else {
      if (!current) throw new Error('Expected a FASTA header before sequence data.')
      const bases = value.replace(/\s/gu, '').toUpperCase()
      if (!alphabet.test(bases)) throw new Error(`Unsupported nucleotide symbol in ${current.name}; protein and gapped alignments need a different parser.`)
      current.sequence += bases
    }
  }
  if (!records.length || records.some(record => !record.sequence.length)) throw new Error('FASTA contains no sequence or an empty record.')
  return records
}

/** Parse the sequence-bearing subset of GenBank while retaining feature coordinates. */
export function parseGenBank(text: string): GenBankRecord[] {
  const records: GenBankRecord[] = []; let current: GenBankRecord | undefined; let inOrigin = false
  for (const raw of text.replace(/^\uFEFF/u, '').split(/\r?\n/u)) {
    if (raw.startsWith('LOCUS')) { const parts = raw.trim().split(/\s+/u); current = { name: parts[1] ?? `record-${records.length + 1}`, description: raw.trim(), sequence: '', features: [], circular: /circular/iu.test(raw) }; records.push(current); inOrigin = false; continue }
    if (!current) continue
    if (raw.startsWith('DEFINITION')) { current.description = raw.slice(12).trim(); continue }
    if (raw.startsWith('ORIGIN')) { inOrigin = true; continue }
    if (raw.startsWith('//')) { inOrigin = false; continue }
    if (inOrigin) { current.sequence += raw.replace(/[^A-Za-z]/gu, '').toUpperCase(); continue }
    const feature = /^\s{5}(\S+)\s+(?:complement\()?<?(\d+)\.\.<?(\d+)/u.exec(raw)
    if (feature) { const strand: 1 | -1 = /complement\(/u.test(raw) ? -1 : 1; current.features.push({ type: feature[1]!, start: Number(feature[2]), end: Number(feature[3]), strand }) }
  }
  if (!records.length || records.some(record => !record.sequence || record.sequence.length > 100000000)) throw new Error('GenBank contains no bounded nucleotide sequence.')
  return records
}

const revComp = (sequence: string): string => Array.from(sequence).reverse().map(base => complement[base] ?? 'N').join('')
export function findSpCas9Candidates(sequence: string, target?: string, maxMismatches = 3): CrisprCandidate[] {
  const normalized = sequence.toUpperCase().replace(/\s/gu, '').replaceAll('U', 'T'); if (!/^[ACGTN]+$/u.test(normalized) || normalized.length > 1000000) throw new Error('CRISPR reference must be bounded DNA.')
  if (!Number.isInteger(maxMismatches) || maxMismatches < 0 || maxMismatches > 3) throw new Error('SpCas9 search supports 0–3 mismatches.')
  const query = target?.toUpperCase().replace(/\s/gu, ''); if (query !== undefined && (!/^[ACGTN]{20}$/u.test(query))) throw new Error('CRISPR target must be exactly 20 bases.')
  const candidates: CrisprCandidate[] = []; const add = (protospacer: string, pam: string, strand: 1 | -1, start: number, end: number): void => { const mismatches: number = query ? Array.from({ length: 20 }, (_, i): number => query[i] === 'N' || query[i] === protospacer[i] ? 0 : 1).reduce((a: number, b: number) => a + b, 0) : 0; if (mismatches <= maxMismatches) candidates.push({ strand, protospacer, pam, start, end, mismatches, notes: ['SpCas9 NGG PAM only.', 'Search is limited to the supplied reference and at most three guide mismatches; off-target scoring and genome-wide indexing are not performed.'] }) }
  for (let i = 0; i + 23 <= normalized.length; i++) { const protospacer = normalized.slice(i, i + 20); const pam = normalized.slice(i + 20, i + 23); if (/^[ACGTN]GG$/u.test(pam)) add(protospacer, pam, 1, i + 1, i + 23); const opposite = revComp(normalized.slice(i, i + 23)); const reversePam = opposite.slice(20); if (/^[ACGTN]GG$/u.test(reversePam)) add(opposite.slice(0, 20), reversePam, -1, i + 1, i + 23) }
  return candidates
}

export function sequenceWindow(records: NucleotideRecord[], recordIndex = 0, start = 1, count = 2400): SequenceWindow {
  const record = records[recordIndex]
  if (!Number.isInteger(recordIndex) || !record) throw new Error('Invalid sequence record index.')
  if (!Number.isInteger(start) || start < 1 || start > record.sequence.length || !Number.isInteger(count) || count < 1 || count > 10000) throw new Error('Invalid window; use 1-based positions and at most 10,000 bases.')
  const end = Math.min(record.sequence.length, start + count - 1)
  const summaries: SequenceRecordInfo[] = records.map((record, index) => {
    const unambiguous = record.sequence.match(/[ACGTU]/gu)?.length ?? 0
    const gc = record.sequence.match(/[GC]/gu)?.length ?? 0
    return { index, name: record.name, description: record.description, length: record.sequence.length, gcPercent: unambiguous ? 100 * gc / unambiguous : null, ambiguousBases: record.sequence.length - unambiguous }
  })
  return { records: summaries, recordIndex, start, end, sequence: record.sequence.slice(start - 1, end), coordinateSystem: '1-based-inclusive' }
}

export function analyzeSequence(records: NucleotideRecord[], operation: SequenceAnalysis['operation'], recordIndex: number, start: number, end: number, crisprTarget?: string, crisprMaxMismatches = 3): SequenceAnalysis {
  const record = records[recordIndex]
  if (!Number.isInteger(recordIndex) || !record || !Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > record.sequence.length) throw new Error('Invalid selection; coordinates are 1-based inclusive.')
  if (end - start + 1 > 100000) throw new Error('Interactive analysis supports selections of at most 100,000 bases.')
  const sequence = record.sequence.slice(start - 1, end)
  const result: SequenceAnalysis = { operation, recordIndex, start, end, notes: [] }
  if (operation === 'reverse-complement') {
    const rna = sequence.includes('U') && !sequence.includes('T')
    result.sequence = Array.from(sequence).reverse().map(base => rna && base === 'A' ? 'U' : complement[base]).join('')
  } else if (operation === 'translate') {
    const dna = sequence.replaceAll('U', 'T')
    let protein = ''
    for (let i = 0; i + 2 < dna.length; i += 3) {
      const indices = [dna[i]!, dna[i + 1]!, dna[i + 2]!].map(base => 'TCAG'.indexOf(base))
      protein += indices.some(index => index < 0) ? 'X' : aminoAcids[indices[0]! * 16 + indices[1]! * 4 + indices[2]!]!
    }
    result.sequence = protein
    result.notes = ['标准遗传密码表；从选择区域首碱基开始，不进行 ORF 或起始密码子推断；* 表示终止，X 表示不确定密码子。', `末尾未成完整密码子的 ${dna.length % 3} 个碱基未翻译。`]
  } else if (operation === 'restriction') {
    if (sequence.includes('U')) throw new Error('Restriction-site analysis requires DNA; RNA containing U is not supported.')
    result.sites = []
    for (const enzyme of enzymes) for (let i = 0; i <= sequence.length - enzyme.motif.length; i++) {
      if (sequence.slice(i, i + enzyme.motif.length) === enzyme.motif) result.sites.push({ enzyme: enzyme.name, recognitionStart: start + i, cutAfter: start + i + enzyme.offset - 1 })
    }
    result.sites.sort((a, b) => a.recognitionStart - b.recognitionStart)
    result.notes = ['限定 EcoRI/BamHI/HindIII/NotI/XhoI 的精确双链 DNA 识别位点；线性选择区域，不跨越环状接头，不建模甲基化或酶切效率。']
  } else if (operation === 'crispr') {
    result.candidates = findSpCas9Candidates(sequence, crisprTarget, crisprMaxMismatches)
    result.notes = ['SpCas9/NGG 候选仅在当前选区搜索；默认最多 3 个错配。', '这不是全基因组脱靶评估，不代表编辑效率或安全性。']
  } else throw new Error('Unsupported sequence operation.')
  return result
}
