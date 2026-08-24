import type { DesktopUpdateStatus } from '../shared/contracts.js'

type Listener = (...args: any[]) => void

export interface DesktopUpdaterPort {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  on(event: string, listener: Listener): unknown
  checkForUpdates(): Promise<unknown>
  downloadUpdate(): Promise<unknown>
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void
}

interface UpdateInfo {
  version?: unknown
  releaseNotes?: unknown
}

/** Background checks are deliberately infrequent to avoid waking the app/feed unnecessarily. */
export const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1_000

/** A background check is attempted at most once per four-hour interval. */
export function isUpdateCheckDue(lastCheckedAt: number | undefined, now = Date.now()): boolean {
  return lastCheckedAt === undefined || !Number.isFinite(lastCheckedAt) || now - lastCheckedAt >= UPDATE_CHECK_INTERVAL_MS
}

/** @deprecated Keep the old helper name for consumers compiled against 4.2.1. */
export const isDailyUpdateCheckDue = isUpdateCheckDue

function releaseNotesOf(value: unknown): string[] | undefined {
  const lines = typeof value === 'string'
    ? value.split(/\r?\n/u)
    : Array.isArray(value)
      ? value.flatMap(item => item !== null && typeof item === 'object' && 'note' in item && typeof item.note === 'string' ? item.note.split(/\r?\n/u) : [])
      : []
  const notes = lines
    .map(line => line.replace(/^\s*(?:[-*+]\s+|#+\s*)/u, '').trim())
    .filter(line => line.length > 0 && !/^ZeroWall Science\s+\d/u.test(line))
    .slice(0, 12)
  return notes.length === 0 ? undefined : notes
}

export interface DesktopUpdaterOptions {
  updater: DesktopUpdaterPort
  enabled: boolean
  currentVersion: string
  publish(status: DesktopUpdateStatus): void
}

export class DesktopUpdateController {
  private status: DesktopUpdateStatus

  constructor(private readonly options: DesktopUpdaterOptions) {
    this.status = options.enabled
      ? { phase: 'idle', currentVersion: options.currentVersion }
      : { phase: 'unavailable', currentVersion: options.currentVersion, message: 'Online updates are available in packaged Stable builds.' }
    options.updater.autoDownload = false
    options.updater.autoInstallOnAppQuit = true
    options.updater.on('checking-for-update', () => this.set({ phase: 'checking', currentVersion: options.currentVersion }))
    options.updater.on('update-available', (info: UpdateInfo) => this.set({
      phase: 'available', currentVersion: options.currentVersion,
      ...(typeof info.version === 'string' ? { version: info.version } : {}),
      ...(releaseNotesOf(info.releaseNotes) === undefined ? {} : { notes: releaseNotesOf(info.releaseNotes) }),
    }))
    options.updater.on('update-not-available', (info: UpdateInfo) => this.set({
      phase: 'upToDate', currentVersion: options.currentVersion,
      ...(typeof info.version === 'string' ? { version: info.version } : {}),
    }))
    options.updater.on('download-progress', (progress: { percent?: unknown }) => this.set({
      ...this.status, phase: 'downloading', currentVersion: options.currentVersion,
      percent: typeof progress.percent === 'number' ? Math.max(0, Math.min(100, progress.percent)) : 0,
    }))
    options.updater.on('update-downloaded', (info: UpdateInfo) => this.set({
      phase: 'downloaded', currentVersion: options.currentVersion,
      ...(typeof info.version === 'string' ? { version: info.version } : this.status.version === undefined ? {} : { version: this.status.version }),
      ...(this.status.notes === undefined ? {} : { notes: this.status.notes }),
      percent: 100,
    }))
    options.updater.on('error', () => this.fail('检查或下载更新失败，请稍后重试。'))
  }

  current(): DesktopUpdateStatus { return { ...this.status } }

  async check(): Promise<DesktopUpdateStatus> {
    if (!this.options.enabled) return this.current()
    this.set({ phase: 'checking', currentVersion: this.options.currentVersion })
    try { await this.options.updater.checkForUpdates() } catch { this.fail('检查更新失败，请稍后重试。') }
    return this.current()
  }

  async download(): Promise<DesktopUpdateStatus> {
    if (!this.options.enabled || this.status.phase !== 'available') return this.current()
    this.set({ ...this.status, phase: 'downloading', percent: 0 })
    try { await this.options.updater.downloadUpdate() } catch { this.fail('无法下载更新，请检查网络后重试。') }
    return this.current()
  }

  install(): boolean {
    if (!this.options.enabled || this.status.phase !== 'downloaded') return false
    this.options.updater.quitAndInstall(false, true)
    return true
  }

  private fail(message: string): void { this.set({ phase: 'error', currentVersion: this.options.currentVersion, message }) }
  private set(status: DesktopUpdateStatus): void { this.status = status; this.options.publish(this.current()) }
}
