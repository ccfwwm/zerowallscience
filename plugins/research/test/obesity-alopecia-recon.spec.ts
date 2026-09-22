import { describe, expect, it } from 'vitest'
import { buildReconFindings, buildReconRecord, catalogEntries, OBESITY_ALOPECIA_RECON_QUERIES } from '../src/host/obesity-alopecia-recon.js'

const query = OBESITY_ALOPECIA_RECON_QUERIES[0]
describe('NHANES reconnaissance response boundaries', () => {
  it.each([undefined, null, {}, [], { error: 'offline' }, { variables: null }, { variables: ['ALQ'] }, { variables: [{}] }, { variables: [null] }, { ok: false, variables: [] }, { result: { error: 'quota', variables: [] } }])('does not turn an invalid response into absent phenotype evidence: %j', response => {
    const findings = buildReconFindings([{ query, response }])
    expect(findings[0]?.status).toBe('invalid-response')
    expect(buildReconRecord(findings)).toMatchObject({ status: 'partially-unavailable', matchedPhenotypes: [] })
  })
  it('accepts a verified empty collection and bounded structured rows', () => {
    expect(buildReconFindings([{ query, response: { variables: [], truncated: false } }])[0]?.status).toBe('no-match')
    expect(buildReconFindings([{ query, response: { result: { variables: [{ name: 'X', label: 'candidate' }] } } }])[0]?.status).toBe('matched')
    expect(catalogEntries({ variables: Array.from({ length: 150 }, (_, index) => ({ name: `X${index}` })) })).toHaveLength(100)
  })
})
