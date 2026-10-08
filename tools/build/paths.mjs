import { resolve } from 'node:path'
import paths from './paths.cjs'

export const root = resolve(import.meta.dirname, '../..')
export const contract = paths.buildPaths()
export const artifactRoot = contract.artifacts
export const applicationVersion = contract.version
export const buildId = contract.buildId
export const stageRoot = contract.stage
export const packageRoot = resolve(artifactRoot, 'packages', applicationVersion)
export const targetPackageRoot = contract.packages
export const verificationRoot = contract.verification
export const releaseRoot = contract.release
export const logRoot = contract.logs
export const cacheRoot = contract.cache
export const sourceRoot = contract.source
export const packageRoots = contract.packageRoots

/** Resolve a logical resource path while accepting the 8.0.6 physical layout. */
export function resourcePath(...parts) {
  const { preferred, legacy } = contract.resource(...parts)
  return { preferred, legacy }
}

export function artifactPath(...parts) {
  return resolve(artifactRoot, ...parts)
}
