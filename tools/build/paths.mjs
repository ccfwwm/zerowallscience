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

export function artifactPath(...parts) {
  return resolve(artifactRoot, ...parts)
}
