/**
 * Local Electron shell settings, loaded once per process independently of the Host.
 * Ownership: .agents/notes/implemented/architecture/2026-10-08-desktop-shell-configuration.md.
 */
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Resolved shell preferences; absent fields use the defaults without rewriting existing files. */
export interface DesktopSettings {
  readonly updates: {
    readonly allowTestAuthPopupWindow: boolean
  }
  readonly startup: {
    readonly launchAtLogin?: boolean
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Read shell settings, creating the default document exclusively when missing.
 * @param userData - Electron's userData directory, independent of DSH_HOME.
 * @returns Validated settings, or defaults when reading, creating or validating fails; changes require a restart.
 */
export function readDesktopSettings(userData: string): DesktopSettings {
  const directory = join(userData, 'desktop')
  const path = join(directory, 'settings.json')
  const defaults: DesktopSettings = { updates: { allowTestAuthPopupWindow: false }, startup: {} }
  try {
    let raw: string
    try { raw = readFileSync(path, 'utf8') } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      mkdirSync(directory, { recursive: true, mode: 0o700 })
      try { writeFileSync(path, `${JSON.stringify(defaults, null, 2)}\n`, { flag: 'wx', mode: 0o600 }) } catch (error) {
        // An existing document belongs to the user, including one created during initialization.
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      }
      raw = readFileSync(path, 'utf8')
    }
    const value: unknown = JSON.parse(raw)
    if (!record(value) || (value.updates !== undefined && !record(value.updates))
      || (value.startup !== undefined && !record(value.startup))) {
      throw new Error('expected a JSON object with optional updates and startup objects')
    }
    const allow = value.updates?.allowTestAuthPopupWindow
    if (allow !== undefined && typeof allow !== 'boolean') {
      throw new Error('updates.allowTestAuthPopupWindow must be true or false')
    }
    const launchAtLogin = value.startup?.launchAtLogin
    if (launchAtLogin !== undefined && typeof launchAtLogin !== 'boolean') {
      throw new Error('startup.launchAtLogin must be true or false')
    }
    return { updates: { allowTestAuthPopupWindow: allow ?? false },
      startup: launchAtLogin === undefined ? {} : { launchAtLogin } }
  } catch (error) {
    try {
      console.warn(`desktop settings: ${path}: using defaults because settings could not be loaded`, error)
    } catch (_logError) {
      // Diagnostic output is best effort; its failure must not make optional settings fatal.
      // TODO: Persist settings diagnostics when console output is unavailable, without blocking startup.
    }
    return defaults
  }
}

/** Persist the user's startup preference without replacing unrelated shell settings. */
export function writeDesktopLaunchAtLogin(userData: string, enabled: boolean): void {
  const directory = join(userData, 'desktop')
  const path = join(directory, 'settings.json')
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  let value: Record<string, unknown> = {}
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (!record(parsed) || (parsed.startup !== undefined && !record(parsed.startup))) {
      throw new Error('expected a JSON object with an optional startup object')
    }
    value = parsed
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const startup = record(value.startup) ? value.startup : {}
  const temporary = `${path}.${randomUUID()}.tmp`
  writeFileSync(temporary, `${JSON.stringify({ ...value, startup: { ...startup, launchAtLogin: enabled } }, null, 2)}\n`,
    { flag: 'wx', mode: 0o600 })
  try {
    renameSync(temporary, path)
  } catch (error) {
    try { unlinkSync(temporary) } catch (_cleanupError) { /* The original write error remains authoritative. */ }
    throw error
  }
}
