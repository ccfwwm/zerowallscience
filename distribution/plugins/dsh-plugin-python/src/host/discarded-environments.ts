/** Isolate unpublished Python environments and reclaim them without delaying cancellation. */
import { lstat, mkdir, readdir, rename, rm, rmdir, unlink } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

const discardedName = /^\.discarded-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u

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
 * @param root - UUID directory owned by the failed environment transaction.
 * @param signal - Plugin lifetime; abort stops deletion after the current filesystem operation.
 * @returns Resolves once quarantine and any uncancelled deletion finish; rejects on storage failure.
 */
export async function discardEnvironment(root: string, signal: AbortSignal): Promise<void> {
  const target = join(dirname(root), '.discarded-' + basename(root))
  try { await rename(root, target) }
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
