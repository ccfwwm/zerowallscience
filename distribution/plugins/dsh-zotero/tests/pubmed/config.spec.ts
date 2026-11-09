import { describe, expect, it } from 'vitest'
import { DEFAULTS, type KeyName } from '../../src/pubmed/shared/types.js'
import { keyName, resolveKey, validateConfig } from '../../src/pubmed/config.js'

describe('PubMed configuration', () => {
  it('validates safe endpoint and probe settings', () => {
    expect(validateConfig({ ...DEFAULTS, defaultSources: ['pubmed', 'pubmed', 'openalex'] }).defaultSources).toEqual(['pubmed', 'openalex'])
    expect(() => validateConfig({ ...DEFAULTS, defaultSources: [] })).toThrow('sources')
    expect(() => validateConfig({ ...DEFAULTS, PUBTATOR_RELATION_PROBE: 7 })).toThrow('probe')
    expect(() => validateConfig({ ...DEFAULTS, EUTILS_BASE_URL: 'https://user:pass@example.test/api' })).toThrow('credentials')
    expect(() => validateConfig({ ...DEFAULTS, EUTILS_BASE_URL: 'http://example.test/api' })).toThrow('HTTPS')
    expect(validateConfig({ ...DEFAULTS, EUTILS_BASE_URL: 'http://127.0.0.1:8080/eutils' }).EUTILS_BASE_URL).toContain('127.0.0.1')
  })

  it('resolves dedicated, shared variable, and live environment sources in order', async () => {
    const values = new Map<string, string | undefined>([
      ['zerowall.environment.pubmed.ncbi_api_key', 'dedicated'],
      ['zerowall.environment.var.ncbi_api_key', 'variable'],
    ])
    const get = async (ref: string) => values.get(ref)
    await expect(resolveKey('NCBI_API_KEY', get, { NCBI_API_KEY: 'environment' })).resolves.toMatchObject({ value: 'dedicated', status: { source: 'dedicated' } })
    values.delete('zerowall.environment.pubmed.ncbi_api_key')
    await expect(resolveKey('NCBI_API_KEY', get, { NCBI_API_KEY: 'environment' })).resolves.toMatchObject({ value: 'variable', status: { source: 'variable' } })
    values.delete('zerowall.environment.var.ncbi_api_key')
    await expect(resolveKey('NCBI_API_KEY', get, { NCBI_API_KEY: 'environment' })).resolves.toMatchObject({ value: 'environment', status: { source: 'environment' } })
    await expect(resolveKey('NCBI_API_KEY', get, {})).resolves.toMatchObject({ value: '', status: { source: 'none', configured: false } })
    expect(() => keyName('NOT_A_KEY')).toThrow('Unknown')
    const key: KeyName = 'OPENALEX_API_KEY'
    expect(key).toBe('OPENALEX_API_KEY')
  })
})
