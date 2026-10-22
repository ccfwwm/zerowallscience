import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
// Commands ship the official pnpm distribution, including its semver parser.
let semver
try { semver = require('./pnpm/dist/node_modules/semver') }
catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error
  semver = require('../../deepseek-harness/apps/desktop/node_modules/pnpm/dist/node_modules/semver')
}
export const satisfiesPackageRange = (version, range, options) => semver.satisfies(version, range, options)

// Physical workspace packages retain workspace ranges. Shorthand ranges must
// use the dependency version from the consumer's original generation, before
// a rollback changes it; anchoring to the candidate would accept any version.
export function satisfiesInstalledPackageRange(version, range, referenceVersion) {
  if (typeof range !== 'string' || !range.startsWith('workspace:')) return satisfiesPackageRange(version, range)
  const workspaceRange = range.slice('workspace:'.length)
  if (workspaceRange === '*') return Boolean(semver.valid(version))
  if (workspaceRange === '^' || workspaceRange === '~') {
    if (!semver.valid(referenceVersion)) return false
    return satisfiesPackageRange(version, workspaceRange + referenceVersion)
  }
  return satisfiesPackageRange(version, workspaceRange)
}
