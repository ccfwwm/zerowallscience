import type { JsonObject } from '@zerowallscience/research-store/types'

export const OBESITY_ALOPECIA_RECON_VERSION = '7.0.0-obesity-alopecia-recon.1'

export const OBESITY_ALOPECIA_RECON_QUERIES = [
  { kind: 'phenotype', key: 'androgenetic-alopecia', query: 'alopecia' },
  { kind: 'phenotype', key: 'alopecia-areata', query: 'alopecia areata' },
  { kind: 'phenotype', key: 'unclassified-hair-loss', query: 'hair loss' },
  { kind: 'phenotype', key: 'baldness', query: 'baldness' },
  { kind: 'exposure', key: 'BMI', query: 'body mass index' },
  { kind: 'exposure', key: 'waist', query: 'waist circumference' },
  { kind: 'exposure', key: 'body-fat', query: 'body fat' },
] as const

export type ReconQuery = (typeof OBESITY_ALOPECIA_RECON_QUERIES)[number]
export type ReconEntry = { name?: string; label?: string; description?: string; cycle?: string; domain?: string; path?: string; [key: string]: unknown }
export type ReconFinding = ReconQuery & {
  status: 'matched' | 'no-match' | 'unavailable' | 'invalid-response'
  matches: ReconEntry[]
  error?: string
}

export type ReconRemoteRun = {
  queryKey: ReconQuery['key']
  localRunId?: string
  remoteId?: string
  status: string
  artifactCount: number
  artifactNames: string[]
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function entries(value: unknown): ReconEntry[] {
  if (!Array.isArray(value)) return []
  return value.filter(item => item !== null && typeof item === 'object' && !Array.isArray(item)).slice(0, 100) as ReconEntry[]
}

/** Extracts bounded catalog rows without treating arbitrary text as a match. */
export function catalogEntries(value: unknown): ReconEntry[] {
  const root = object(value)
  for (const key of ['variables', 'results', 'items', 'rows', 'matches', 'data']) {
    const found = entries(root[key])
    if (found.length > 0) return found
  }
  const nested = object(root.result ?? root.payload ?? root.catalog)
  for (const key of ['variables', 'results', 'items', 'rows', 'matches', 'data']) {
    const found = entries(nested[key])
    if (found.length > 0) return found
  }
  return []
}

export function buildReconFindings(results: Array<{ query: ReconQuery; response?: unknown; error?: string }>): ReconFinding[] {
  return results.map(({ query, response, error }) => {
    if (error) return { ...query, status: 'unavailable', matches: [], error: error.slice(0, 500) }
    if (response === undefined || response === null || typeof response !== 'object') return { ...query, status: 'invalid-response', matches: [], error: 'NHANES catalog returned no structured response.' }
    const matches = catalogEntries(response)
    return { ...query, status: matches.length > 0 ? 'matched' : 'no-match', matches }
  })
}

export function buildReconRecord(findings: ReconFinding[], metadata: JsonObject = {}): JsonObject {
  const phenotypes = findings.filter(item => item.kind === 'phenotype')
  const exposures = findings.filter(item => item.kind === 'exposure')
  const matchedPhenotypes = phenotypes.filter(item => item.status === 'matched').map(item => item.key)
  const matchedExposures = exposures.filter(item => item.status === 'matched').map(item => item.key)
  const unavailable = findings.filter(item => item.status === 'unavailable' || item.status === 'invalid-response').map(item => item.key)
  return {
    reconVersion: OBESITY_ALOPECIA_RECON_VERSION,
    status: unavailable.length > 0 ? 'partially-unavailable' : matchedPhenotypes.length > 0 ? 'candidates-found' : 'no-phenotype-match',
    phenotypeCandidates: phenotypes.map(item => ({ key: item.key, status: item.status, matchCount: item.matches.length })),
    exposureCandidates: exposures.map(item => ({ key: item.key, status: item.status, matchCount: item.matches.length })),
    matchedPhenotypes,
    matchedExposures,
    unavailable,
    freezeRequired: true,
    resultScope: '目录侦察只报告变量元数据命中；不证明数据可下载、样本可用、表型定义一致或存在统计关联。',
    ...metadata,
  }
}

/** Keep remote submission and Manifest provenance bounded and query-addressable. */
export function summarizeReconRemoteRuns(results: Array<{ query: ReconQuery; remote?: JsonObject }>): ReconRemoteRun[] {
  return results.map(({ query, remote }) => {
    const root = object(remote)
    const result = object(root.result)
    const artifacts = root.artifacts ?? result.artifacts ?? root.manifest ?? result.manifest
    const rows = Array.isArray(artifacts) ? artifacts : object(artifacts).files
    const files = (Array.isArray(rows) ? rows : []).filter(item => item !== null && typeof item === 'object' && !Array.isArray(item)).slice(0, 20) as Array<Record<string, unknown>>
    const artifactNames = files.map(item => item.name ?? item.path ?? item.uri).filter((item): item is string => typeof item === 'string').slice(0, 20)
    const status = [root.status, result.status, root.run_status, result.run_status].find(value => typeof value === 'string')
    return {
      queryKey: query.key,
      ...(typeof root.run_id === 'string' ? { localRunId: root.run_id } : {}),
      ...(typeof root.remote_id === 'string' ? { remoteId: root.remote_id } : typeof root.job_id === 'string' ? { remoteId: root.job_id } : {}),
      status: status ?? 'unknown',
      artifactCount: files.length,
      artifactNames,
    }
  })
}
