import { isAbsolute } from 'node:path'
import { PassThrough } from 'node:stream'
import type { Context } from '@deepseek-ai/cordis'
import type {
  DesktopCompatEnvironment,
  DesktopCompatService,
  DesktopPnpmOutcome,
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
  const existingProfiles = ctx.get('desktopProfiles') as DesktopProfilesLike | undefined
  const existingPnpm = ctx.get('desktopPnpm') as DesktopPnpmLike | undefined
  const bridge = existingProfiles === undefined && typeof process.send === 'function' ? createProcessBridge() : undefined
  const profiles = existingProfiles ?? bridge?.profiles
  const pnpm = existingPnpm ?? bridge?.pnpm
  if (existingProfiles === undefined && profiles !== undefined) ctx.provide('desktopProfiles', profiles)
  if (existingPnpm === undefined && pnpm !== undefined) ctx.provide('desktopPnpm', pnpm)
  const service = new DesktopCompatController(profiles, pnpm)
  ctx.provide(SERVICE_NAME, service)
}

interface BridgeResult { ok: boolean; result?: unknown; error?: string }

function createProcessBridge(): { profiles: DesktopProfilesLike; pnpm: DesktopPnpmLike } {
  const requests = new Map<string, { stdout: PassThrough; stderr: PassThrough; resolve: (value: DesktopPnpmOutcome) => void; reject: (error: Error) => void }>()
  process.on('message', (message: unknown) => {
    if (!message || typeof message !== 'object') return
    const value = message as { type?: string; requestId?: string; stream?: 'stdout' | 'stderr'; chunk?: string; result?: BridgeResult }
    if (value.type !== 'zerowall:desktop:result' || value.requestId === undefined) return
    const pending = requests.get(value.requestId)
    if (pending === undefined) return
    if (value.stream !== undefined) { pending[value.stream].write(value.chunk ?? ''); return }
    requests.delete(value.requestId)
    pending.stdout.end(); pending.stderr.end()
    if (value.result?.ok === true) pending.resolve(value.result.result as DesktopPnpmOutcome)
    else pending.reject(new Error(value.result?.error ?? 'Desktop plugin operation failed.'))
  })
  const profiles: DesktopProfilesLike = {
    current: { name: 'stable', dir: process.env.DSH_HOME ?? process.cwd() },
    list: () => [{ name: 'stable', dir: process.env.DSH_HOME ?? process.cwd(), selectable: true }, { name: 'preview', dir: process.env.DSH_HOME ?? process.cwd(), selectable: true }, { name: 'development', dir: process.env.DSH_HOME ?? process.cwd(), selectable: true }],
    select: async (_name) => undefined,
  }
  const pnpm: DesktopPnpmLike = {
    run: (args, signal) => run('run', args, process.cwd(), signal),
    runPlugin: (args, invokingDir, signal) => run('runPlugin', args, invokingDir, signal),
  }
  function run(op: string, args: readonly string[], invokingDir: string, signal?: AbortSignal): DesktopPnpmHandle {
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const stdout = new PassThrough(); const stderr = new PassThrough()
    let resolve!: (value: DesktopPnpmOutcome) => void; let reject!: (error: Error) => void
    const done = new Promise<DesktopPnpmOutcome>((res, rej) => { resolve = res; reject = rej })
    requests.set(requestId, { stdout, stderr, resolve, reject })
    ;(process.send as (message: unknown) => void)({ type: 'zerowall:desktop', requestId, op, args, invokingDir })
    const cancel = () => { ;(process.send as (message: unknown) => void)({ type: 'zerowall:desktop:cancel', requestId }) }
    signal?.addEventListener('abort', cancel, { once: true })
    return { stdout, stderr, done, cancel }
  }
  return { profiles, pnpm }
}

export default { name, inject, apply }
