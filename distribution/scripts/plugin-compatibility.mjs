/** Validate minimum versions in owned plugin compatibility declarations. */
import { valid } from 'semver'

/**
 * Require lower bounds without a maximum for plugin peers and shared runtime dependencies.
 * @param {object} manifest - Parsed package or plugin metadata.
 * @returns {void}
 */
export function assertMinimumCompatibility(manifest) {
  const label = manifest.name ?? 'Plugin'
  const lowerBound = (range, subject) => {
    if (typeof range !== 'string' || !range.startsWith('>=') || valid(range.slice(2)) === null) {
      throw new Error(`${label}: ${subject} must declare only a minimum version with >=`)
    }
  }
  for (const [name, range] of Object.entries(manifest.peerDependencies ?? {})) lowerBound(range, `peer ${name}`)
  for (const [name, range] of Object.entries(manifest.dependencies ?? {})) {
    if (name.startsWith('@deepseek-ai/') || name.startsWith('@cordisjs/')
      || ['cordis', 'react', 'react-dom', 'scheduler', 'electron'].includes(name)) lowerBound(range, `runtime ${name}`)
  }
  if (manifest.engines?.dsh !== undefined) lowerBound(manifest.engines.dsh, 'engines.dsh')
  for (const [name, requirement] of Object.entries({ dsh: manifest.zerowall?.dsh ?? manifest.dsh,
    desktop: manifest.zerowall?.desktop ?? manifest.desktop })) {
    if (requirement?.max !== undefined) throw new Error(`${label}: ${name}.max is not permitted`)
    if (requirement?.min !== undefined && valid(requirement.min) === null) throw new Error(`${label}: ${name}.min must be a version`)
  }
}
