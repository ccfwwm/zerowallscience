import type { Readable } from 'node:stream'

export interface DesktopProfileSummary {
  readonly name: string
  readonly dir: string
  readonly selectable?: boolean
}

export interface DesktopProfilesLike {
  readonly current: { readonly name: string; readonly dir: string }
  list(): readonly DesktopProfileSummary[]
  select(name: string): Promise<void>
}

export interface DesktopPnpmOutcome {
  readonly exitCode: number | null
  readonly signal: NodeJS.Signals | null
}

export interface DesktopPnpmHandle {
  readonly stdout: Readable
  readonly stderr: Readable
  readonly done: Promise<DesktopPnpmOutcome>
  cancel(): void
}

export interface DesktopPnpmLike {
  run(args: readonly string[], signal?: AbortSignal): DesktopPnpmHandle
  runPlugin(args: readonly string[], invokingDir: string, signal?: AbortSignal): DesktopPnpmHandle
}

export type DesktopCompatEnvironment = 'desktop' | 'dsh'

export interface DesktopCompatService {
  readonly environment: DesktopCompatEnvironment
  readonly currentProfile: DesktopProfilesLike['current'] | undefined
  listProfiles(): readonly DesktopProfileSummary[]
  selectProfile(name: string): Promise<void>
  install(specifier: string, invokingDir: string, signal?: AbortSignal): DesktopPnpmHandle
  update(invokingDir: string, signal?: AbortSignal): DesktopPnpmHandle
  remove(specifier: string, invokingDir: string, signal?: AbortSignal): DesktopPnpmHandle
  repair(invokingDir: string, signal?: AbortSignal): DesktopPnpmHandle
}
