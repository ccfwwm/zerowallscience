import { join } from 'node:path'
import { storeAndLink } from './content-store.mjs'

/** Called only after adaptations and integrity checks, before cache publication.
 * Every file keeps its ordinary path, sharing verified bytes across snapshots. */
export async function shareImmutableFiles(directory, files, artifactRoot) {
  let next = 0
  const shared = new Map()
  const results = await Promise.allSettled(Array.from({ length: Math.min(8, files.length) }, async () => {
    while (next < files.length) {
      const file = files[next++]
      // Serialize equal hashes so two producers cannot race to publish one object.
      const prior = shared.get(file.sha256) ?? Promise.resolve()
      const operation = prior.then(async () => {
        const ref = await storeAndLink(join(directory, file.path), { root: artifactRoot })
        if (ref.digest !== file.sha256 || ref.size !== file.size) throw new Error(`Immutable cache file changed: ${file.path}`)
      })
      shared.set(file.sha256, operation)
      await operation
    }
  }))
  const failed = results.find(result => result.status === 'rejected')
  if (failed) throw failed.reason
}
