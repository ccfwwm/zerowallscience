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
  it('requires matched LD and prepared exposure metadata for advanced methods', () => {
    const result = validateGeneticContract({ ...valid, method: 'susie-coloc', completeRegion: true, requiredFields: true })
    expect(result.status).toBe('pending'); expect(result.missing).toContain('matchedLd')
    const mvmr = validateGeneticContract({ ...valid, method: 'mvmr' }); expect(mvmr.missing).toContain('exposureCount'); expect(mvmr.missing).toContain('exposureDefinitions')
    expect(validateGeneticContract({ ...valid, method: 'mvmr', exposureCount: 2, exposureDefinitions: [{ id: 'x1', trait: 'BMI', unit: 'SD', source: 'GWAS' }, { id: 'x2', trait: 'HDL', unit: 'SD', source: 'GWAS' }], instrumentCount: 12 })).toMatchObject({ status: 'usable', missing: [] })
  })
  it('does not treat single-tool IVW or underidentified MVMR as usable', () => {
    expect(validateGeneticContract({ ...valid, method: 'ivw', instrumentCount: 1 }).status).toBe('not-applicable')
    const definitions = [{ id: 'x1', trait: 'BMI', unit: 'SD', source: 'GWAS' }, { id: 'x2', trait: 'HDL', unit: 'SD', source: 'GWAS' }]
    expect(validateGeneticContract({ ...valid, method: 'mvmr', exposureCount: 2, exposureDefinitions: definitions, instrumentCount: 2 }).status).toBe('not-applicable')
    expect(validateGeneticContract({ ...valid, method: 'mvmr', exposureCount: 2, exposureDefinitions: definitions, instrumentCount: 12, conditionalFStatistic: null }).status).toBe('pending')
    expect(validateGeneticContract({ ...valid, method: 'mvmr', exposureCount: 2, exposureDefinitions: definitions, instrumentCount: 12, conditionalFStatistic: 0 }).status).toBe('not-applicable')
  })
})
