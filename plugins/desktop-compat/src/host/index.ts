import { isAbsolute } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {
  DesktopCompatEnvironment,
  DesktopCompatService,
  DesktopPnpmHandle,
  DesktopPnpmLike,
  DesktopProfileSummary,
  DesktopProfilesLike,
} from '../shared/types.js'

export type {
  DesktopCompatEnvironment,
  DesktopCompatService,
  DesktopPnpmHandle,
  DesktopPnpmLike,
  DesktopProfileSummary,
  DesktopProfilesLike,
} from '../shared/types.js'

declare module '@deepseek-ai/cordis' {
  interface Context {
    zerowallDesktopCompat: DesktopCompatService
  }
}

const SERVICE_NAME = 'zerowallDesktopCompat'

function requiredPath(label: string, value: string): void {
  if (!isAbsolute(value) || value.includes('\0')) {
    throw new Error(`ZeroWall Desktop compatibility ${label} must be an absolute path without NUL`)
  }
}

function requiredSpecifier(specifier: string): void {
  if (specifier.length === 0 || specifier.includes('\0') || /[\r\n]/u.test(specifier)) {
    throw new Error('ZeroWall Desktop compatibility plugin specifier is invalid')
  }
}

/** Adapter over the two public DSH Desktop services; no Electron API is used. */
export class DesktopCompatController implements DesktopCompatService {
  readonly environment: DesktopCompatEnvironment
  get currentProfile(): DesktopProfilesLike['current'] | undefined {
    return this.profiles?.current
  }

  constructor(
    private readonly profiles: DesktopProfilesLike | undefined,
    private readonly pnpm: DesktopPnpmLike | undefined,
  ) {
    if ((profiles === undefined) !== (pnpm === undefined)) {
      throw new Error('ZeroWall Desktop compatibility requires desktopProfiles and desktopPnpm together')
    }
    this.environment = profiles === undefined ? 'dsh' : 'desktop'
  }

  listProfiles(): readonly DesktopProfileSummary[] {
    return this.profiles?.list() ?? []
  }

  selectProfile(name: string): Promise<void> {
    requiredSpecifier(name)
    if (this.profiles === undefined) {
      return Promise.reject(new Error('Profile selection is only available in DSH Desktop'))
    }
    return this.profiles.select(name)
  }

  install(specifier: string, invokingDir: string, signal?: AbortSignal): DesktopPnpmHandle {
    requiredSpecifier(specifier)
    return this.runPlugin(['add', specifier], invokingDir, signal)
  }

  update(invokingDir: string, signal?: AbortSignal): DesktopPnpmHandle {
    return this.runPlugin(['update'], invokingDir, signal)
  }

  remove(specifier: string, invokingDir: string, signal?: AbortSignal): DesktopPnpmHandle {
    requiredSpecifier(specifier)
    return this.runPlugin(['remove', specifier], invokingDir, signal)
  }

  repair(invokingDir: string, signal?: AbortSignal): DesktopPnpmHandle {
    return this.runPlugin(['install', '--no-frozen-lockfile'], invokingDir, signal)
  }

  private runPlugin(args: readonly string[], invokingDir: string, signal?: AbortSignal): DesktopPnpmHandle {
    requiredPath('plugin invoking directory', invokingDir)
    if (this.pnpm === undefined) {
      throw new Error('Plugin package operations are only available in DSH Desktop')
    }
    return this.pnpm.runPlugin(args, invokingDir, signal)
  }
}

export const name = 'zerowall-desktop-compat'
export const inject: readonly string[] = []

export function apply(ctx: Context): void {
  const profiles = ctx.get('desktopProfiles') as DesktopProfilesLike | undefined
  const pnpm = ctx.get('desktopPnpm') as DesktopPnpmLike | undefined
  const service = new DesktopCompatController(profiles, pnpm)
  ctx.provide(SERVICE_NAME, service)
}

export default { name, inject, apply }
