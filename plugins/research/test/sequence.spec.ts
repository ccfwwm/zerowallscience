import { describe, expect, it } from 'vitest'
import { analyzeSequence, findSpCas9Candidates, parseFasta, parseGenBank, sequenceWindow } from '../src/host/sequence.js'

describe('bounded nucleotide FASTA analysis', () => {
  const records = parseFasta('>reference\nATGGAATTCTAA\n>ambiguous\nNNNRYS\n')
  it('translates the standard genetic code and preserves stop codons', () => {
    expect(analyzeSequence(records, 'translate', 0, 1, 12).sequence).toBe('MEF*')
    expect(analyzeSequence(parseFasta('>x\nATGNNNAA'), 'translate', 0, 1, 8)).toMatchObject({ sequence: 'MX', notes: expect.arrayContaining([expect.stringContaining('2 个碱基')]) })
  })
  it('reports recognition and top-strand cut coordinates in the original record', () => {
    expect(analyzeSequence(records, 'restriction', 0, 3, 11).sites).toEqual([{ enzyme: 'EcoRI', recognitionStart: 4, cutAfter: 4 }])
    expect(analyzeSequence(records, 'restriction', 0, 5, 12).sites).toEqual([])
  })
  it('reverse-complements IUPAC ambiguity and RNA without losing bases', () => {
    expect(analyzeSequence(records, 'reverse-complement', 1, 1, 6).sequence).toBe('SRYNNN')
    expect(analyzeSequence(parseFasta('>rna\nAUGC'), 'reverse-complement', 0, 1, 4).sequence).toBe('GCAU')
    expect(() => analyzeSequence(parseFasta('>rna\nAUGC'), 'restriction', 0, 1, 4)).toThrow('requires DNA')
  })
  it('bounds windows and leaves GC undefined for all-ambiguous records', () => {
    expect(sequenceWindow(records, 0, 10, 10)).toMatchObject({ start: 10, end: 12, sequence: 'TAA' })
    expect(sequenceWindow(parseFasta('>x\nNNNN')).records[0]?.gcPercent).toBeNull()
    expect(() => sequenceWindow(records, 0, 0)).toThrow('1-based')
    expect(() => analyzeSequence(records, 'translate', 0, 1, 13)).toThrow('Invalid selection')
  })
  it('rejects malformed, empty and protein input', () => {
    for (const text of ['ATGC', '>x\n', '>x\nMELK', '>\nATGC', '>x\nATGC\n>y\n']) expect(() => parseFasta(text)).toThrow()
  })
})

it('parses bounded GenBank origin and feature coordinates', () => {
  const records = parseGenBank('LOCUS       demo       20 bp    DNA     circular\nDEFINITION  demo record\nFEATURES             Location/Qualifiers\n     gene            1..20\nORIGIN\n        1 atgcatgcatgcatgcatgc\n//\n')
  expect(records[0]).toMatchObject({ name: 'demo', circular: true, sequence: 'ATGCATGCATGCATGCATGC' })
  expect(records[0]?.features[0]).toMatchObject({ type: 'gene', start: 1, end: 20, strand: 1 })
})

describe('GenBank annotation integrity and bounded feature maps', () => {
  const record = (location: string, sequence = 'ATGCA'.repeat(4), extra = '') => `LOCUS       plasmid 20 bp DNA circular\nDEFINITION  Example\nFEATURES             Location/Qualifiers\n     CDS             ${location}\n                     /gene="example"\n${extra}ORIGIN\n        1 ${sequence}\n//\n`
  it('retains complement(join) segment order, labels, origin wraps and partial bounds', () => {
    const records = parseGenBank(record('complement(join(<18..20,\n                     1..>6))'))
    expect(records[0]?.features[0]).toMatchObject({ label: 'example', strand: -1, start: 1, end: 20, segments: [
      { start: 1, end: 6, strand: -1, partialStart: false, partialEnd: true },
      { start: 18, end: 20, strand: -1, partialStart: true, partialEnd: false },
    ] })
    expect(sequenceWindow(records)).toMatchObject({ topology: 'circular', featureCount: 1, features: [{ label: 'example' }] })
  })
  it('keeps unsupported location evidence visible instead of inventing contiguous annotations', () => {
    const data = parseGenBank(record('order(1..3,7..9)', undefined, '     misc_feature    X123.1:1..5\n'))
    expect(data[0]?.features).toEqual([])
    expect(data[0]?.featureWarnings).toHaveLength(2)
    expect(sequenceWindow(data).featureWarnings?.[0]).toContain('order')
  })
  it('rejects mismatched length, invalid alphabet, coordinates and missing record termination', () => {
    expect(() => parseGenBank(record('1..20').replace('20 bp', '21 bp'))).toThrow('length')
    expect(() => parseGenBank(record('1..20', 'ATGCA'.repeat(3) + 'ATGCE'))).toThrow('symbol')
    expect(() => parseGenBank(record('1..21'))).toThrow('outside')
    expect(() => parseGenBank(record('1..20').replace('//', ''))).toThrow('terminator')
    expect(() => parseGenBank(record('1..20').replace('        1 ', '        2 '))).toThrow('out-of-order')
    expect(() => parseGenBank(record('1..20').replace('20 bp', '20 aa'))).toThrow('nucleotide')
  })
  it('reports CRISPR coordinates in the source record and never treats unknown bases as known guides', () => {
    const sequence = 'TTTTT' + 'A'.repeat(20) + 'AGG'
    expect(analyzeSequence(parseFasta(`>x\n${sequence}`), 'crispr', 0, 6, 28).candidates?.[0]).toMatchObject({ start: 6, end: 28, strand: 1 })
    expect(findSpCas9Candidates('N' + 'A'.repeat(19) + 'AGG')).toEqual([])
    expect(() => findSpCas9Candidates(sequence, 'N'.repeat(20))).toThrow('unambiguous')
  })
})

it('finds SpCas9 NGG candidates with an explicit mismatch bound', () => {
  const sequence = `${'A'.repeat(20)}AGG${'C'.repeat(20)}TGG`
  const candidates = findSpCas9Candidates(sequence, 'AAAAAAAAAAAAAAAAAAAA', 0)
  expect(candidates[0]).toMatchObject({ strand: 1, protospacer: 'A'.repeat(20), pam: 'AGG', mismatches: 0 })
  expect(() => findSpCas9Candidates(sequence, 'AAAAAAAAAAAAAAAAAAAT', 4)).toThrow('0–3')
})
