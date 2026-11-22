import { readFileSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

/** The fixed environment can be swapped while its lease directory stays in place. */
export function runtimeLockDirectory(root: string): string {
  return basename(root) === 'env' ? join(dirname(root), '.zerowall-env') : join(root, '.zerowall')
}

/** A leftover file is not an active writer. Read-only consumers never remove it. */
export function runtimeWriterActive(root: string): boolean {
  const path = join(runtimeLockDirectory(root), 'write-lock.json')
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
