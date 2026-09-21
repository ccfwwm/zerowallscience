import { describe, expect, it } from 'vitest'
import { evaluateMethod } from '../src/host/method-check.js'

describe('bounded method-fit evaluation', () => {
  it('never approves an unknown method or missing metadata', () => {
    expect(evaluateMethod({ testUsed: 'magic', weights: true, instruments: true })).toMatchObject({ status: 'insufficient_information' })
    expect(evaluateMethod({ testUsed: 'paired t-test' }).status).toBe('insufficient_information')
  })
  it('detects the attachment-style paired design mismatch and multiple testing', () => {
    const context = { design: 'repeated measures (pre/post)', outcomeType: 'continuous', groups: 2, testUsed: 'independent t-test', normality: 'unknown', nComparisons: 12, correctionApplied: false }
    const result = evaluateMethod(context)
    expect(result.status).toBe('flagged')
    expect(result.findings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'paired-design-independent-test' }), expect.objectContaining({ code: 'multiple-testing' })]))
    expect(result).toEqual(evaluateMethod(context))
  })
  it('refuses single SNP Egger and flags weak instruments', () => {
    const result = evaluateMethod({ testUsed: 'MR-Egger', instrumentCount: 1, minimumFStatistic: 4 })
    expect(result.findings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'egger-insufficient-instruments' }), expect.objectContaining({ code: 'weak-instrument-warning' })]))
  })
  it('requires regional data and donor-level observations', () => {
    expect(evaluateMethod({ testUsed: 'coloc SuSiE', leadSnpOnly: true }).findings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'lead-snp-only' })]))
    expect(evaluateMethod({ testUsed: 'pseudobulk', observationUnit: 'cell' }).findings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'cell-pseudoreplication' })]))
  })
  it('returns only a bounded no-listed-issue result for a specified paired test', () => {
    const result = evaluateMethod({ testUsed: 'paired t-test', design: 'paired', groups: 2, outcomeType: 'continuous', normality: 'tested_normal', nComparisons: 1 })
    expect(result.status).toBe('no_listed_issue')
    expect(result).not.toHaveProperty('applicable')
  })
})
