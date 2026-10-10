import type { ResourceKind, ResourceUpdateStatus } from '../../../plugins/base/src/client/desktop-api.js'

export interface CatalogCheck {
  kind: ResourceKind
  catalogStatus?: string
  domainAvailable?: boolean
  error?: string
  resources?: Array<{ updateAvailable?: boolean }>
}

export function resourceUpdateSummary(previous: ResourceUpdateStatus, results: CatalogCheck[], failures: string[] = []): ResourceUpdateStatus {
  const kinds = { ...previous.kinds }
  const errors = [...failures]
  for (const result of results) {
    if (result.error || result.catalogStatus === 'unavailable' || result.domainAvailable === false) {
      errors.push(result.error ?? `${result.kind}: ${result.domainAvailable === false ? 'Local resource service unavailable' : 'Catalog unavailable'}`)
      continue
    }
    kinds[result.kind] = result.resources?.filter(item => item.updateAvailable === true).length ?? 0
  }
  const updateCount = Object.values(kinds).reduce((total, count) => total + (count ?? 0), 0)
  return { phase: updateCount > 0 ? 'available' : errors.length ? 'error' : 'upToDate', checkedAt: new Date().toISOString(), updateCount, kinds, ...(errors.length ? { error: errors.join('; ').slice(0, 500) } : {}) }
}
