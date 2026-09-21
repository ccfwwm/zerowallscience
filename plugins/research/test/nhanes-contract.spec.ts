import { describe, expect, it } from 'vitest'
import { validateNhanesContract } from '../src/host/nhanes-contract.js'

describe('NHANES DatasetContract applicability checks', () => {
  const valid = { datasets: [{ cycle: '2017-2018', component: 'Demographics', dataset: 'DEMO_J', weight: 'WTINT2YR' }], strata: 'SDMVSTRA', psu: 'SDMVPSU', weight: 'WTINT2YR', isolatedPsuHandling: 'survey-option-recorded' }
  it('accepts a fully declared single-cycle contract without certifying values', () => {
    expect(validateNhanesContract(valid)).toMatchObject({ status: 'usable', contract: '7.0.0-nhanes-contract.1' })
  })
  it('requires an explicit strategy for multiple cycles and rejects preview reuse', () => {
    const result = validateNhanesContract({ ...valid, datasets: [...valid.datasets, { cycle: '2019-2020', component: 'Demographics', dataset: 'DEMO_P', weight: 'WTINT2YR' }], previewRows: 100, analysisRows: 1000, previewTruncated: true })
    expect(result.status).toBe('not-applicable')
    expect(result.missing).toContain('cycleStrategy')
    expect((result.findings as any[]).map(item => item.code)).toEqual(expect.arrayContaining(['preview-truncated', 'preview-is-truncated']))
  })
  it('flags DXX_H age range and domain design errors', () => {
    const result = validateNhanesContract({ ...valid, datasets: [{ cycle: '2013-2014', component: 'DXX', dataset: 'DXX_H', weight: 'WTMEC2YR' }], weight: 'WTMEC2YR', dxxH: true, ageMin: 2, ageMax: 80, domainExpression: 'RIDAGEYR >= 18', domainDesign: 'pre-filtered-subset' })
    expect(result.status).toBe('not-applicable')
    expect((result.findings as any[]).map(item => item.code)).toEqual(expect.arrayContaining(['dxxH-age-range', 'domain-design-missing']))
  })
})
