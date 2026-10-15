import { rename, lstat } from 'node:fs/promises'

/** Windows scanners can retain handles briefly after a profile is copied or
 * its Host exits. Retry only an untouched, existing source into a vacant
 * destination; never merge, overwrite or delete a profile. */
export async function renameProfile(source, destination, {
  move = rename, exists = path => lstat(path).then(() => true, error => {
    if (error.code === 'ENOENT') return false
    throw error
  }), wait = ms => new Promise(resolve => setTimeout(resolve, ms)), attempts = 25,
} = {}) {
  for (let attempt = 0; ; attempt++) {
    try { await move(source, destination); return }
    catch (error) {
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(error.code) || attempt + 1 >= attempts
        || !await exists(source) || await exists(destination)) throw error
      await wait(Math.min(100 * (attempt + 1), 500))
    }
  }
}
