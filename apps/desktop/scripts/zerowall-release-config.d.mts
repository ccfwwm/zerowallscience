import type { DesktopUploadConfig } from './desktop-auto-update-environment.mjs'
/** Resolve the isolated public newui release feed. @param env - Release settings. @param platform - Target platform. @param arch - Target architecture. @returns Validated Qiniu distribution configuration. */
export function resolveZeroWallReleaseConfig(env: NodeJS.ProcessEnv, platform: NodeJS.Platform, arch: string): DesktopUploadConfig & { readonly provider: 'qiniu' }
