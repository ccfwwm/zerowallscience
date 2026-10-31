import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { physicalFs } from './physical-fs.mjs'

// Electron virtualizes ASAR reads. Ownership checks and deletion must operate
// on the physical installer files, not virtual paths inside the carrier.
const { lstat, readdir, readlink, realpath, rm } = physicalFs.promises

const key = path => process.platform === 'win32' ? resolve(path).toLowerCase() : resolve(path)
const same = (left, right) => key(left) === key(right)
function inside(root, path) {
  const child = relative(key(root), key(path))
  return child === '' || child !== '..' && !child.startsWith('..' + sep) && !isAbsolute(child)
}
async function physical(path) {
  const info = await lstat(path)
  return info.isDirectory() && !info.isSymbolicLink() && same(await realpath(path), path)
}
async function referencesSupply(profile, source) {
  if (!await physical(profile)) return true
  const pending = [profile]
  while (pending.length) {
    const directory = pending.pop()
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isSymbolicLink()) {
        // Check both the declared destination and its final resolution. Never
        // traverse a user plugin or dependency link while deciding what to delete.
        if (inside(source, resolve(dirname(path), await readlink(path))) || inside(source, await realpath(path))) return true
      } else if (entry.isDirectory()) pending.push(path)
    }
  }
  return false
}

/** Best-effort, post-readiness cleanup of this user's standard installation.
 * Shared/custom installations retain their seed for other users. No user-data
 * directory, wildcard, parent directory, or unrelated installed app is removed.
 * The caller holds the profile mutation lock through verification and removal. */
export async function cleanupOfflineSupply({ packaged, platform = process.platform, localAppData, executable, resourcesPath, profile, ready, verifyProfile }) {
  try {
    if (!packaged || platform !== 'win32' || !localAppData || !isAbsolute(localAppData) || !ready) return { state: 'skipped', reason: 'installation-not-eligible' }
    const install = join(localAppData, 'Programs', 'ZeroWallScience')
    const source = join(install, 'resources', 'offline-profile')
    if (!same(dirname(executable), install) || !same(resourcesPath, join(install, 'resources'))) return { state: 'skipped', reason: 'shared-or-custom-installation' }
    for (const path of [install, resourcesPath]) if (!await physical(path)) return { state: 'skipped', reason: 'linked-installation' }
    const info = await lstat(source).catch(error => { if (error.code !== 'ENOENT') throw error })
    if (!info) return { state: 'absent' }
    if (!await physical(source)) return { state: 'skipped', reason: 'linked-supply' }
    // This check must use only the active profile, never the supply being
    // deleted. A failed verification retains the complete local repair source.
    if (!(await verifyProfile()).ready) return { state: 'skipped', reason: 'profile-not-independent' }
    if (await referencesSupply(profile, source)) return { state: 'skipped', reason: 'supply-still-referenced' }
    await rm(source, { recursive: true, force: true, maxRetries: 1, retryDelay: 100 })
    return { state: 'removed' }
  } catch (error) {
    // Permissions, antivirus locks and interrupted partial removals are all
    // non-fatal. The next healthy startup retries the same exact owned path.
    return { state: 'deferred', reason: error.code ?? 'cleanup-failed' }
  }
}
