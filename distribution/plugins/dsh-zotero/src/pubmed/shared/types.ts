export const SOURCES = ['pubmed', 'europepmc', 'openalex', 's2'] as const
export type LiteratureSource = typeof SOURCES[number]
export type ServiceId = LiteratureSource | 'pubtator'
export const KEY_NAMES = ['NCBI_API_KEY', 'S2_API_KEY', 'OPENALEX_API_KEY'] as const
export type KeyName = typeof KEY_NAMES[number]
export interface PubmedConfig {
  enabled: boolean
  defaultSources: LiteratureSource[]
  AUTO_GRAPH: boolean
  PUBTATOR: boolean
  EUROPEPMC_ENABLED: boolean
  S2_ENABLED: boolean
  OPENALEX_ENABLED: boolean
  PUBTATOR_EDGE_EVIDENCE: boolean
  PUBTATOR_RELATION_PROBE: number
  PUBTATOR_RELATION_PROBE_ARTICLES: number
  NCBI_ADMIN_EMAIL: string
  EUTILS_BASE_URL: string
  EPMC_BASE_URL: string
  PUBTATOR_BASE_URL: string
  S2_BASE_URL: string
  OPENALEX_BASE_URL: string
}
export interface KeyStatus { name: KeyName; configured: boolean; source: 'dedicated' | 'variable' | 'environment' | 'none' }
export interface PubmedStatus { config: PubmedConfig; keys: KeyStatus[] }
export interface ProbeResult { service: ServiceId; state: 'available' | 'anonymous' | 'authentication-failed' | 'rate-limited' | 'network-failed' | 'disabled'; message: string }
export const DEFAULTS: PubmedConfig = {
  enabled: true, defaultSources: ['pubmed', 'europepmc', 'openalex'], AUTO_GRAPH: true, PUBTATOR: true,
  EUROPEPMC_ENABLED: true, S2_ENABLED: true, OPENALEX_ENABLED: true, PUBTATOR_EDGE_EVIDENCE: true,
  PUBTATOR_RELATION_PROBE: 3, PUBTATOR_RELATION_PROBE_ARTICLES: 8, NCBI_ADMIN_EMAIL: '',
  EUTILS_BASE_URL: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils',
  EPMC_BASE_URL: 'https://www.ebi.ac.uk/europepmc/webservices/rest',
  PUBTATOR_BASE_URL: 'https://www.ncbi.nlm.nih.gov/research/pubtator3-api',
  S2_BASE_URL: 'https://api.semanticscholar.org', OPENALEX_BASE_URL: 'https://api.openalex.org',
}
export const SERVICES: { id: ServiceId; label: string; key?: KeyName; url: string }[] = [
  { id: 'pubmed', label: 'NCBI / PubMed', key: 'NCBI_API_KEY', url: 'https://www.ncbi.nlm.nih.gov/account/settings/' },
  { id: 's2', label: 'Semantic Scholar', key: 'S2_API_KEY', url: 'https://www.semanticscholar.org/product/api#api-key-form' },
  { id: 'openalex', label: 'OpenAlex', key: 'OPENALEX_API_KEY', url: 'https://openalex.org/settings/api' },
  { id: 'europepmc', label: 'Europe PMC', url: 'https://europepmc.org/RestfulWebService' },
  { id: 'pubtator', label: 'PubTator3', url: 'https://www.ncbi.nlm.nih.gov/research/pubtator3/' },
]
