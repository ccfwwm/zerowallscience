import { randomUUID } from 'node:crypto'
import { lstat, rename } from 'node:fs/promises'

/** Publish a verified candidate on the cache's volume, preserving damaged
 * bytes for diagnostics and restoring the old directory if publication fails. */
export async function commitCache(candidate, cached) {
  let damaged
  const info = await lstat(cached).catch(error => error.code === 'ENOENT' ? undefined : Promise.reject(error))
  if (info?.isSymbolicLink()) throw new Error('Cache destination must be a physical directory')
  if (info) {
    damaged = cached + '.damaged-' + randomUUID()
    await rename(cached, damaged)
  }
  try { await rename(candidate, cached) }
  catch (error) {
    if (damaged) {
      try { await rename(damaged, cached) }
      catch (restore) { throw new AggregateError([error, restore], 'Cache publication and restoration failed; candidate and damaged bytes remain for diagnosis') }
    }
    throw error
  }
}
