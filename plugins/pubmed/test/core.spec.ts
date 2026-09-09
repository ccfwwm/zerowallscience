import { describe, expect, it } from 'vitest'
import { registerPubmedTools } from '../src/host/core.js'

const MEDLINE = `PMID- 12345678
TI  - Author affiliation parsing.
FAU - Alpha, Alice B
AU  - Alpha AB
AD  - Department of Molecular Biology, Example University,
      Example City, USA.
AD  - Institute for Genome Research, Example University, USA.
AUID- 0000-0002-1825-0097 [orcid]
FAU - Beta, Bob C
AU  - Beta BC
AD  - Department of Chemistry, Another University, Canada.
FAU - Example Study Group
AU  - Example Study Group
AD  - International Coordinating Centre, United Kingdom.
DP  - 2024 Jan
JT  - Example Journal
TA  - Ex J
VI  - 12
IP  - 3
PG  - 10-20
AID - 10.1000/example [doi]
`

function fetchTool(body: string) {
  const definitions = new Map<string, any>()
  registerPubmedTools({}, {
    defineTool: (definition: any) => definition,
    register: (definition: any) => definitions.set(definition.name, definition),
    httpGet: async () => ({ status: 200, body }),
    sleep: async () => {},
    managedNetwork: true,
    autoGraph: false,
  })
  return definitions.get('pubmed_fetch_articles')
}

describe('pubmed_fetch_articles MEDLINE parsing', () => {
  it('keeps article-level affiliations and attaches each AD block to its author', async () => {
    const result = await fetchTool(MEDLINE).execute(
      { pmids: ['12345678'] },
      { signal: new AbortController().signal },
    )

    expect(result.articles).toHaveLength(1)
    const article = result.articles[0]
    expect(article.affiliations).toEqual([
      'Department of Molecular Biology, Example University, Example City, USA.',
      'Institute for Genome Research, Example University, USA.',
      'Department of Chemistry, Another University, Canada.',
      'International Coordinating Centre, United Kingdom.',
    ])
    expect(article.authors).toEqual([
      {
        fullName: 'Alpha, Alice B',
        affiliations: [
          'Department of Molecular Biology, Example University, Example City, USA.',
          'Institute for Genome Research, Example University, USA.',
        ],
        identifiers: { orcid: '0000-0002-1825-0097' },
        lastName: 'Alpha',
        firstName: 'Alice B',
        initials: 'AB',
      },
      {
        fullName: 'Beta, Bob C',
        affiliations: ['Department of Chemistry, Another University, Canada.'],
        identifiers: {},
        lastName: 'Beta',
        firstName: 'Bob C',
        initials: 'BC',
      },
      {
        fullName: 'Example Study Group',
        affiliations: ['International Coordinating Centre, United Kingdom.'],
        identifiers: {},
        collectiveName: 'Example Study Group',
        lastName: 'Example Study Group',
      },
    ])
  })

  it('does not attach an article-level affiliation that precedes all authors', async () => {
    const body = `PMID- 2
AD  - General article correspondence address.
FAU - Gamma, Grace
AU  - Gamma G
AD  - Gamma Laboratory, Australia.
`
    const result = await fetchTool(body).execute(
      { pmids: ['2'] },
      { signal: new AbortController().signal },
    )

    expect(result.articles[0].affiliations).toEqual([
      'General article correspondence address.',
      'Gamma Laboratory, Australia.',
    ])
    expect(result.articles[0].authors[0].affiliations).toEqual([
      'Gamma Laboratory, Australia.',
    ])
  })
})
