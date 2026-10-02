export interface BuildPaths {
  root: string
  version: string
  buildId: string
  target: string
  artifacts: string
  active: string
  stage: string
  dev: string
  packages: string
  verification: string
  release: string
  cache: string
  logs: string
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
export const logRoot: string
export const cacheRoot: string
export function artifactPath(...parts: string[]): string
