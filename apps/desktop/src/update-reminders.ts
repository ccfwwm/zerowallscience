/** Version-bound snoozing; download authorization and readiness use separate persisted state. */
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { DesktopUpdateState } from './ipc.ts'

/** Owns available-version reminders across launches and ready reminders for the current process. */
export class DesktopUpdateReminders {
  private snooze: { version: string; until: number } | undefined
  private readyDismissed: string | undefined

  /** @param file - Application-owned snooze JSON. @param now - Wall-clock milliseconds. */
  constructor(private readonly file: string, private readonly now: () => number = Date.now) {}

  /** Load bounded reminder preferences; malformed preferences never authorize an update. */
  async load(): Promise<void> {
    let text: string
    try { text = await readFile(this.file, 'utf8') } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return
      throw error
    }
    const value: unknown = JSON.parse(text)
    if (typeof value === 'object' && value !== null && 'version' in value && typeof value.version === 'string'
      && 'until' in value && typeof value.until === 'number' && Number.isFinite(value.until)) this.snooze = { version: value.version, until: value.until }
  }

  /** @param state - Current main-owned candidate. @returns A reminder without changing focus or task admission. */
  prompt(state: DesktopUpdateState): 'available' | 'ready' | undefined {
    if (state.version === undefined) return undefined
    if (state.phase === 'ready') return this.readyDismissed === state.version ? undefined : 'ready'
    if (state.phase === 'available' && !(this.snooze?.version === state.version && this.snooze.until > this.now())) return 'available'
    return undefined
  }

  /**
   * @param state - Displayed version and phase; ready dismissal preserves next-launch installation.
   */
  async dismiss(state: DesktopUpdateState): Promise<void> {
    if (state.version === undefined) return
    if (state.phase === 'ready') { this.readyDismissed = state.version; return }
    if (state.phase !== 'available') return
    const snooze = { version: state.version, until: this.now() + 24 * 60 * 60_000 }
    await mkdir(dirname(this.file), { recursive: true })
    await writeFile(this.file + '.tmp', JSON.stringify(snooze) + '\n', { flush: true, mode: 0o600 })
    await rename(this.file + '.tmp', this.file)
    this.snooze = snooze
  }
}
