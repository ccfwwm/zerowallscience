import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** A leftover file is not an active writer. Read-only consumers never remove it. */
export function runtimeWriterActive(root: string): boolean {
  const path = join(root, '.zerowall', 'write-lock.json')
  try {
    const value = JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/u, ''))
    if (!Number.isInteger(value.pid) || value.pid <= 0) return Date.now() - statSync(path).mtimeMs < 10_000
    try { process.kill(value.pid, 0); return true }
    catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM' }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    try { return Date.now() - statSync(path).mtimeMs < 10_000 } catch { return false }
  }
}
