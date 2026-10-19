import { randomUUID } from 'node:crypto'
import { lstat, rename } from 'node:fs/promises'
import { setTimeout } from 'node:timers/promises'

/** Publish a verified candidate on the cache's volume, preserving damaged
 * bytes for diagnostics and restoring the old directory if publication fails. */
export async function commitCache(candidate, cached, { renameDirectory = rename, wait = setTimeout } = {}) {
  // Defender/indexer handles can briefly deny a directory rename after the
  // completed file sweep. Keep the verified candidate and bound the retry.
  async function publish(from, to) {
    for (let attempt = 0; ; attempt++) {
      try { return await renameDirectory(from, to) }
      catch (error) {
        if (process.platform !== 'win32' || !['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt >= 20) throw error
        await wait(500)
      }
    }
  }
  let damaged
  const info = await lstat(cached).catch(error => error.code === 'ENOENT' ? undefined : Promise.reject(error))
  if (info?.isSymbolicLink()) throw new Error('Cache destination must be a physical directory')
  if (info) {
    damaged = cached + '.damaged-' + randomUUID()
    await publish(cached, damaged)
  }
  try { await publish(candidate, cached) }
  catch (error) {
    if (damaged) {
      try { await publish(damaged, cached) }
      catch (restore) { throw new AggregateError([error, restore], 'Cache publication and restoration failed; candidate and damaged bytes remain for diagnosis') }
    }
    throw error
  }
}
