/** Isolate unpublished Python environments and reclaim them without delaying cancellation. */
import { lstat, mkdir, readdir, rename, rm, rmdir, unlink } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'

const discardedName = /^\.discarded-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u

/** Move an owned environment, allowing Windows file scanners to release transient handles. */
export async function renameEnvironment(source: string, destination: string): Promise<void> {
  for (let attempt = 0;; attempt++) {
    try { await rename(source, destination); return }
    catch (error) {
      if (process.platform !== 'win32' || attempt >= 8 || !['EPERM', 'EACCES', 'EBUSY'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error
    }
    await delay(Math.min(40 * 2 ** attempt, 400))
  }
}

async function removeDiscarded(path: string, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted()
  const entry = await lstat(path)
  if (entry.isSymbolicLink()) { signal.throwIfAborted(); await unlink(path); return }
  if (!entry.isDirectory()) { signal.throwIfAborted(); await rm(path, { force: true }); return }
  for (const child of await readdir(path)) await removeDiscarded(join(path, child), signal)
  signal.throwIfAborted()
  await rmdir(path)
}

/**
 * Quarantine an unpublished generation; cancellation retains its remaining files for the next writer.
 * @param root - Directory owned by the environment transaction.
 * @param signal - Plugin lifetime; abort stops deletion after the current filesystem operation.
 * @returns Resolves once quarantine and any uncancelled deletion finish; rejects on storage failure.
 */
export async function discardEnvironment(root: string, signal: AbortSignal): Promise<void> {
  const name = basename(root)
  const target = join(dirname(root), '.discarded-' + (discardedName.test('.discarded-' + name) ? name : randomUUID()))
  try { await renameEnvironment(root, target) }
  catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return; throw error }
  if (signal.aborted) return
  try { await removeDiscarded(target, signal) }
  catch (error) { if (!signal.aborted) throw error }
}

/**
 * Reclaim only quarantined generations while holding the environment writer lock.
 * @param directory - Environment directory containing UUID generations and quarantined siblings.
 * @param signal - Plugin lifetime; abort leaves the remaining quarantine for a later writer.
 * @returns Resolves after reclamation; rejects on cancellation or storage failure.
 */
export async function clearDiscardedEnvironments(directory: string, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted()
  await mkdir(directory, { recursive: true })
  for (const entry of await readdir(directory)) {
    if (discardedName.test(entry)) await removeDiscarded(join(directory, entry), signal)
  }
}
