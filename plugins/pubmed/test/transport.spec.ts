import { describe, expect, it } from 'vitest'
import { DEFAULTS, type PubmedConfig } from '../src/shared/types.js'
import { LiteratureHttpError, LiteratureTransport } from '../src/host/transport.js'

const config = (overrides: Partial<PubmedConfig> = {}): PubmedConfig => ({ ...DEFAULTS, defaultSources: [...DEFAULTS.defaultSources], ...overrides })
const credentials = { NCBI_API_KEY: 'ncbi-test', S2_API_KEY: 's2-test', OPENALEX_API_KEY: 'oa-test' }
const ok = () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })

describe('LiteratureTransport', () => {
  it('injects each credential only into its matching provider request', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => { calls.push({ url: String(input), init: init! }); return ok() }
    const transport = new LiteratureTransport(fetcher as typeof fetch)
    await transport.get('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed', config(), credentials, new AbortController().signal)
    await transport.get('https://api.semanticscholar.org/graph/v1/paper/PMID:1', config(), credentials, new AbortController().signal)
    await transport.get('https://api.openalex.org/works?search=test', config(), credentials, new AbortController().signal)
    expect(new URL(calls[0]!.url).searchParams.get('api_key')).toBe('ncbi-test')
    expect((calls[0]!.init.headers as Record<string, string>)['x-api-key']).toBeUndefined()
    expect((calls[1]!.init.headers as Record<string, string>)['x-api-key']).toBe('s2-test')
    expect((calls[1]!.init.headers as Record<string, string>).authorization).toBeUndefined()
    expect((calls[2]!.init.headers as Record<string, string>).authorization).toBe('Bearer oa-test')
    await transport.close()
  })

  it('uses configured endpoint roots and manual redirects so credentials cannot follow redirects', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init: init! })
      return new Response('', { status: 302, headers: { location: 'https://attacker.example/collect' } })
    }
    const transport = new LiteratureTransport(fetcher as typeof fetch)
    await expect(transport.get('https://literature.test/api/works?search=x', config({ OPENALEX_BASE_URL: 'https://literature.test/api' }), credentials, new AbortController().signal)).rejects.toBeInstanceOf(LiteratureHttpError)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.init.redirect).toBe('manual')
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe('Bearer oa-test')
    await transport.close()
  })

  it('does not issue requests for disabled sources and retries 429 responses', async () => {
    let attempts = 0
    const fetcher = async () => {
      attempts++
      return attempts === 1 ? new Response('', { status: 429, headers: { 'retry-after': '0' } }) : ok()
    }
    const transport = new LiteratureTransport(fetcher as typeof fetch)
    await expect(transport.get(DEFAULTS.EPMC_BASE_URL + '/search?q=x', config({ EUROPEPMC_ENABLED: false }), credentials, new AbortController().signal)).rejects.toThrow('disabled')
    expect(attempts).toBe(0)
    await transport.get(DEFAULTS.EPMC_BASE_URL + '/search?q=x', config(), credentials, new AbortController().signal)
    expect(attempts).toBe(2)
    await transport.close()
  })
})
