import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
// Commands ship the official pnpm distribution, including its semver parser.
let semver
try { semver = require('./pnpm/dist/node_modules/semver') }
catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error
  semver = require('../../deepseek-harness/apps/desktop/node_modules/pnpm/dist/node_modules/semver')
}
export const satisfiesPackageRange = (version, range) => semver.satisfies(version, range)
