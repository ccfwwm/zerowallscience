import { randomUUID } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
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

/** Profiles live in LocalAppData; selecting a root never scans or copies legacy data. */
export function resolveDesktopUserDataPath(options: {
  override?: string
  appDataPath?: string
  localAppDataPath: string
  directoryName: string
}): { path: string; usedLocalFallback: boolean } {
  if (options.override?.trim()) return { path: writableDirectory(options.override), usedLocalFallback: false }
  return { path: writableDirectory(join(options.localAppDataPath, options.directoryName)), usedLocalFallback: true }
}
