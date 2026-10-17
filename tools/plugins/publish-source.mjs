import { join } from 'node:path'

/** Runtime-only publication is an explicit per-adapter contract, never a
 * consequence of catalog visibility or the availability of a desktop stage. */
const reviewedRuntimePackages = new Set([
  '@dingyi222666/dsh-session-notification',
  // 0.2.1 was published from the reviewed offline projection: executable
  // JavaScript only. Source compilation also emits development declarations.
  '@dsh-external/zotero-harvest',
])

export function usesReviewedRuntime(integration) {
  return reviewedRuntimePackages.has(integration?.package)
}

export function integrationPublishSource(integration, { root, stageRoot }) {
  if (!integration?.package || !integration.source) return undefined
  if (usesReviewedRuntime(integration)) return join(stageRoot, 'offline-profile', 'modules', integration.package)
  return join(root, integration.source)
}
