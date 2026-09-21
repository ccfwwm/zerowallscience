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
  const records = parseGenBank('LOCUS       demo       30 bp    DNA     circular\nDEFINITION  demo record\nFEATURES             Location/Qualifiers\n     gene            1..20\nORIGIN\n        1 atgcatgcatgcatgcatgca\n//\n')
  expect(records[0]).toMatchObject({ name: 'demo', circular: true, sequence: 'ATGCATGCATGCATGCATGCA' })
  expect(records[0]?.features[0]).toMatchObject({ type: 'gene', start: 1, end: 20, strand: 1 })
})

it('finds SpCas9 NGG candidates with an explicit mismatch bound', () => {
  const sequence = `${'A'.repeat(20)}AGG${'C'.repeat(20)}TGG`
  const candidates = findSpCas9Candidates(sequence, 'AAAAAAAAAAAAAAAAAAAA', 0)
  expect(candidates[0]).toMatchObject({ strand: 1, protospacer: 'A'.repeat(20), pam: 'AGG', mismatches: 0 })
  expect(() => findSpCas9Candidates(sequence, 'AAAAAAAAAAAAAAAAAAAT', 4)).toThrow('0–3')
})
