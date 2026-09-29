import { randomUUID } from 'node:crypto'
import { mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

function writableDirectory(path: string): string {
  const selected = resolve(path)
  mkdirSync(selected, { recursive: true })
  const probe = join(selected, `.zerowall-write-${randomUUID()}.tmp`)
  try {
    writeFileSync(probe, '', { flag: 'wx' })
  } finally {
    rmSync(probe, { force: true })
  }
  return selected
}

/** Electron requires a real userData directory before setPath. A missing or
 * restricted Roaming profile must not prevent the desktop from opening. */
export function resolveDesktopUserDataPath(options: {
  override?: string
  appDataPath?: string
  localAppDataPath: string
  directoryName: string
}): { path: string; usedLocalFallback: boolean } {
  if (options.override?.trim()) return { path: writableDirectory(options.override), usedLocalFallback: false }
  if (options.appDataPath) {
    try {
      const existing = join(options.appDataPath, options.directoryName)
      // Keep an existing profile in place, but never create a new Roaming
      // profile solely to initialize Python or the desktop. New installations
      // use LocalAppData even when Windows exposes a Roaming base directory.
      if (statSync(existing).isDirectory()) return { path: writableDirectory(existing), usedLocalFallback: false }
    } catch { /* A missing or policy-restricted Roaming profile is optional. */ }
  }
  return { path: writableDirectory(join(options.localAppDataPath, options.directoryName)), usedLocalFallback: true }
}
