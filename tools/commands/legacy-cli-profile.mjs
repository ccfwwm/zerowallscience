import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { mkdir, readFile, realpath, symlink, lstat, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const validId = id => typeof id === 'string' && /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u.test(id) && !id.split('/').some(part => part === '.' || part === '..')
function disabledPatchFor(patches, id) {
  const visit = value => {
    if (!value || typeof value !== 'object') return false
    if (Array.isArray(value)) return value.some(visit)
    if (value.id === id && value.disabled === true) return true
    return Object.values(value).some(visit)
  }
  return visit(patches)
}
async function json(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error; return fallback }
}

/** Import only explicit, valid old CLI bundle selections, using DSH's lock,
 * compatibility admission and resolver. Existing modules stay where installed;
 * the normal profile resolver follows links and retains their private closure.
 * No account, model, environment, home patch or unrelated dependency is copied.
 */
export async function importLegacyCliPlugins(home, { installAnchor, legacyHome = join(homedir(), '.dsh') }) {
  if (resolve(home).toLowerCase() === resolve(legacyHome).toLowerCase()) return { imported: [] }
  const source = join(legacyHome, 'profiles/web')
  const old = await json(join(source, 'package.json'), undefined)
  if (!old) return { imported: [] }
  const require = createRequire(installAnchor)
  const boot = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-app-boot')).href)
  const { withFileLock, writeFileAtomic } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-atomic-write')).href)
  const target = join(home, 'profiles/web')
  const file = join(target, 'package.json')
  return withFileLock(file, async () => {
    const manifest = await json(file, undefined)
    if (!manifest) return { imported: [] }
    const receiptFile = join(target, '.zerowall-legacy-cli-import.json')
    const receipt = await json(receiptFile, { imported: [] })
    const originalManifest = structuredClone(manifest)
    const originalReceipt = structuredClone(receipt)
    const recorded = new Set(receipt.imported)
    const selection = await json(join(home, 'resources/plugins/selection.json'), {})
    const oldSelection = await json(join(legacyHome, 'resources/plugins/selection.json'), {})
    const excluded = new Set([...(selection.disabled ?? []), ...(selection.removed ?? []), ...Object.keys(selection.pinned ?? {}), ...(manifest.zerowall?.disabledPlugins ?? []), ...(oldSelection.disabled ?? []), ...(oldSelection.removed ?? []), ...(old.zerowall?.disabledPlugins ?? []), 'dsh-auto-review', 'dsh-progressive-tools', '@everclear077/dsh-progressive-tools'])
    const existing = new Set([...(manifest.dsh?.profile?.bundles ?? []), ...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.devDependencies ?? {}), ...Object.keys(manifest.optionalDependencies ?? {})])
    const sourceProfile = boot.loadProfileDirectory('dsh', source, installAnchor)
    const sourceHomePatch = await (async () => {
      const file = join(legacyHome, 'cordis.patch.yml')
      return existsSync(file) ? boot.loadOverlayPatches('dsh', file) : []
    })()
    const imported = []
    for (const layer of sourceProfile.layers) {
      const id = layer.packageName
      if (!validId(id) || recorded.has(id) || existing.has(id) || excluded.has(id) || !Object.hasOwn(old.dependencies ?? {}, id)) continue
      // A user-disabled row remains disabled by declining to activate its old
      // bundle; never import arbitrary user patch config into another profile.
      if (disabledPatchFor([layer.patches, sourceProfile.patches, sourceHomePatch], id)) continue
      const installed = await json(join(source, 'node_modules', id, 'package.json'), undefined)
      if (!installed || installed.name !== id) continue
      const issue = boot.evaluatePluginCompatibility(installed, boot.readProfileVersionExemptions(target))
      if (issue && !issue.exempted) continue
      const destination = join(target, 'node_modules', id)
      try {
        const destinationReal = await realpath(destination)
        const sourceReal = await realpath(join(source, 'node_modules', id))
        // A prior interruption can leave only the junction behind. Remove that
        // exact stale projection so the next invocation can finish the import.
        if (destinationReal === sourceReal && !existing.has(id)) await unlink(destination)
        else continue
      } catch (error) { if (error.code !== 'ENOENT') throw error }
      await mkdir(dirname(destination), { recursive: true })
      await symlink(await realpath(join(source, 'node_modules', id)), destination, process.platform === 'win32' ? 'junction' : 'dir')
      manifest.dependencies = { ...manifest.dependencies, [id]: old.dependencies[id] }
      manifest.dsh = { ...manifest.dsh, profile: { ...manifest.dsh?.profile, bundles: [...(manifest.dsh?.profile?.bundles ?? []), id] } }
      imported.push(id)
      recorded.add(id)
    }
    if (imported.length) {
      try {
        await writeFileAtomic(file, JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 })
        await writeFileAtomic(receiptFile, JSON.stringify({ imported: [...recorded] }, null, 2) + '\n', { mode: 0o600 })
      } catch (error) {
        await writeFileAtomic(file, JSON.stringify(originalManifest, null, 2) + '\n', { mode: 0o600 }).catch(() => {})
        await writeFileAtomic(receiptFile, JSON.stringify(originalReceipt, null, 2) + '\n', { mode: 0o600 }).catch(() => {})
        for (const id of imported) await unlink(join(target, 'node_modules', id)).catch(() => {})
        throw error
      }
    }
    return { imported }
  }, { waitMs: 120000 })
}
