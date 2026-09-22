import { describe, expect, it } from 'vitest'
import { validateGeneticContract } from '../src/host/genetic-contract.js'

describe('genetic analysis applicability checks', () => {
  const valid = { method: 'mr', exposureDefinition: 'BMI GWAS', outcomeDefinition: 'defined alopecia GWAS', ancestry: 'EUR', genomeBuild: 'GRCh37', effectUnit: 'SD', sampleOverlapChecked: true, harmonized: true, instrumentCount: 12, minimumFStatistic: 18 }
  it('accepts a complete multi-instrument MR contract', () => expect(validateGeneticContract(valid)).toMatchObject({ status: 'usable', contract: '7.0.0-genetic-contract.2' }))
  it('rejects a lead-SNP-only coloc request and refuses unsupported Egger', () => {
    const coloc = validateGeneticContract({ ...valid, method: 'coloc', leadSnpOnly: true })
    expect(coloc.status).toBe('not-applicable'); expect((coloc.findings as any[]).map(item => item.code)).toContain('lead-snp-only')
    const egger = validateGeneticContract({ ...valid, method: 'mr-egger', instrumentCount: 2 })
    expect(egger.status).toBe('not-applicable'); expect((egger.findings as any[]).map(item => item.code)).toContain('egger-insufficient-instruments')
  })
  it('requires matched LD and conditional strength for advanced methods', () => {
    const result = validateGeneticContract({ ...valid, method: 'susie-coloc', completeRegion: true, requiredFields: true })
    expect(result.status).toBe('pending'); expect(result.missing).toContain('matchedLd')
    const mvmr = validateGeneticContract({ ...valid, method: 'mvmr' }); expect(mvmr.missing).toContain('conditionalFStatistic')
  })
  it('does not treat single-tool IVW or malformed MVMR strength as usable', () => {
    expect(validateGeneticContract({ ...valid, method: 'ivw', instrumentCount: 1 }).status).toBe('not-applicable')
    expect(validateGeneticContract({ ...valid, method: 'mvmr', conditionalFStatistic: null }).status).toBe('pending')
    expect(validateGeneticContract({ ...valid, method: 'mvmr', conditionalFStatistic: 0 }).status).toBe('not-applicable')
  })
})
