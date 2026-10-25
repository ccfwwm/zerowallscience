export interface BuildPaths {
  root: string
  version: string
  buildId: string
  target: string
  artifacts: string
  active: string
  source: string
  stage: string
  dev: string
  packages: string
  verification: string
  release: string
  pluginStore: string
  pluginSnapshotStore: string
  cache: string
  logs: string
  resource(...parts: string[]): { logical: string; preferred: string; legacy: string }
  packageRoots: { dsh: string; support: string; bundles: string; legacy: string }
}
export const root: string
export const contract: BuildPaths
export const artifactRoot: string
export const applicationVersion: string
export const buildId: string
export const stageRoot: string
export const packageRoot: string
export const targetPackageRoot: string
export const verificationRoot: string
export const releaseRoot: string
export const pluginStoreRoot: string
export const pluginSnapshotStoreRoot: string
export const logRoot: string
export const cacheRoot: string
export function artifactPath(...parts: string[]): string
export function resourcePath(...parts: string[]): { preferred: string; legacy: string }
