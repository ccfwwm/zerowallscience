import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { compareVersions } from './resource-catalog.mjs'
import { RETIRED_PLUGIN_IDS, removeRetiredResolutionRules } from './retired-plugins.mjs'
import { legacyMediaId, mediaId, managedLegacyMedia } from './media-identity.mjs'

// Profile architecture migrations are deliberately additive.  A desktop
// upgrade must be able to introduce a new bundled management surface without
// rebuilding or replacing the user's selected plugin set.
const PROFILE_ARCHITECTURE = 7
const PROFILE_MIGRATIONS = [
  { from: 1, to: 2, add: ['@zerowallscience/plugin-extension-center'] },
  { from: 4, to: 5, remove: ['dsh-auto-review'] },
  { from: 5, to: 6 },
]

/** Inspect the packages that will actually shadow the bundled defaults. */
export async function inspectProfile(home, bundled, target) {
  const directory = join(home, 'profiles/web')
  const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'))
  const records = new Map(bundled.map(item => [item.id, item]))
  const plugins = []
  for (const id of [...new Set(manifest.dsh?.profile?.bundles ?? [])]) {
    if (!/^(?:@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._-]+$/u.test(id) || id.split('/').some(part => part === '.' || part === '..')) throw new Error('Invalid profile bundle identity')
    let installed
    try { installed = JSON.parse(await readFile(join(directory, 'node_modules', id, 'package.json'), 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
    const available = records.get(id)
    if (!installed && !available) { plugins.push({ id, source: 'runtime', version: null, compatibility: 'unchecked' }); continue }
    const version = installed?.version ?? available.version
    const desktop = installed?.zerowall?.desktop ?? available?.desktop
    const dsh = installed?.zerowall?.dsh ?? available?.dsh
    const within = (range, actual) => !range || ((!range.min || compareVersions(actual, range.min) >= 0) && (!range.max || compareVersions(actual, range.max) <= 0))
    plugins.push({ id, version, source: installed ? 'profile' : 'bundled', declaredDependency: manifest.dependencies?.[id] ?? null,
      bundledVersion: available?.version ?? null, updateAvailable: Boolean(installed && available && compareVersions(available.version, version) > 0),
      compatibility: within(desktop, target.desktopVersion) && within(dsh, target.dshVersion) ? 'compatible' : 'incompatible' })
  }
  return { desktopVersion: target.desktopVersion, dshVersion: target.dshVersion, plugins, updates: plugins.filter(item => item.updateAvailable).map(item => item.id) }
}
export async function initializeProfile(home, defaults, bundled = []) {
  const directory = join(home, 'profiles/web')
  const file = join(directory, 'package.json')
  await mkdir(directory, { recursive: true })
  let manifest
  let existingManifest = false
  try { manifest = JSON.parse(await readFile(file, 'utf8')); existingManifest = true } catch (error) { if (error.code !== 'ENOENT') throw error }
  manifest ??= { private: true, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } } }
  const patchFile = join(directory, 'cordis.patch.yml')
  const patch = await readFile(patchFile, 'utf8').catch(error => { if (error.code !== 'ENOENT') throw error; return undefined })
  if (patch === undefined || !patch.trim()) await writeFile(patchFile, '[]\n', { mode: 0o600 })
  const existing = manifest.dsh?.profile?.bundles ?? []
  // 7.5.x profiles predate the architecture marker. Treat an existing
  // profile without it as architecture 1 so additive migrations remain
  // additive instead of restoring the complete default list.
  const marker = manifest.zerowall?.pluginArchitecture
  const architecture = Number(marker ?? (existingManifest ? 1 : 0))
  const selectionFile = join(home, 'resources/plugins/selection.json')
  let selection = {}
  try { selection = JSON.parse(await readFile(selectionFile, 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
  const removed = new Set(Array.isArray(selection.removed) ? selection.removed : [])
  const disabled = new Set([
    ...(Array.isArray(selection.disabled) ? selection.disabled : []),
    ...(Array.isArray(manifest.zerowall?.disabledPlugins) ? manifest.zerowall.disabledPlugins : []),
  ])
  // Rename only the managed adaptation; exact pins and custom installs retain
  // their identity and suppress the new default to avoid loading two copies.
  const oldMedia = legacyMediaId, newMedia = mediaId
  const oldSpec = manifest.dependencies?.[oldMedia]
  let oldInstalled
  try { oldInstalled = JSON.parse(await readFile(join(directory,'node_modules',oldMedia,'package.json'),'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
  const managedMedia = managedLegacyMedia(oldInstalled, oldSpec)
  const customMedia = Boolean((oldSpec || oldInstalled) && !managedMedia)
  // Before 8.0 the desktop overlay activated the ZeroWall domains, so their
  // absence from a 7.5 profile is not an uninstall choice. Also repair the
  // first 8.0.2 migration which added only extension-center and lost those
  // overlay services. Modern modular profiles retain their selected set.
  const domainBundles = existing.filter(id => id.startsWith('@zerowallscience/plugin-') && id !== '@zerowallscience/plugin-extension-center')
  const legacyOverlay = existingManifest && (marker === undefined || (architecture === 2 && domainBundles.length === 0))
  let bundles = existing
  let dependencies = manifest.dependencies ?? {}
  let selectionChanged = false
  if (architecture === 0) {
    bundles = [...new Set([...existing, ...defaults])]
  } else if (architecture < PROFILE_ARCHITECTURE) {
    if (legacyOverlay) bundles = [...new Set([...bundles, ...defaults.filter(id => (id.startsWith('@zerowallscience/plugin-') || ['dsh-wechat', '@dingyi222666/dsh-session-notification'].includes(id)) && !removed.has(id) && !disabled.has(id))])]
    for (const migration of PROFILE_MIGRATIONS.filter(item => architecture < item.to)) {
      bundles = [...new Set([...bundles, ...(migration.add ?? []).filter(id => defaults.includes(id) && !removed.has(id) && !disabled.has(id))])]
      for (const id of migration.remove ?? []) {
        bundles = bundles.filter(value => value !== id)
        if (Object.prototype.hasOwnProperty.call(dependencies, id)) {
          dependencies = { ...dependencies }
          delete dependencies[id]
        }
        const removedSelection = removed.delete(id)
        const disabledSelection = disabled.delete(id)
        if (removedSelection || disabledSelection) selectionChanged = true
      }
    }
  }
  // Early 8.0 profiles also listed packages already inserted by the desktop
  // core overlay. Removing only those duplicate bundle declarations keeps
  // package pins, custom patches and the managed plugin selection intact.
  if (architecture < PROFILE_ARCHITECTURE) {
    const overlay = new Set(bundled.filter(item => item.managed === false && !item.core).map(item => item.id))
    bundles = bundles.filter(id => !overlay.has(id))
  }
  // Progressive Tools was retired in 8.2.1. This cleanup must also run for
  // architecture-7 profiles created by the offline carrier, otherwise an old
  // profile can continue loading the dispatch wrapper after an app upgrade.
  const retiredBundles = bundles.filter(id => !RETIRED_PLUGIN_IDS.has(id))
  if (retiredBundles.length !== bundles.length) {
    bundles = retiredBundles
    selectionChanged = true
  }
  for (const id of RETIRED_PLUGIN_IDS) {
    if (Object.prototype.hasOwnProperty.call(dependencies, id)) {
      dependencies = { ...dependencies }
      delete dependencies[id]
      selectionChanged = true
    }
    for (const field of ['devDependencies', 'optionalDependencies']) {
      if (Object.prototype.hasOwnProperty.call(manifest[field] ?? {}, id)) {
        manifest[field] = { ...manifest[field] }
        delete manifest[field][id]
        selectionChanged = true
      }
    }
    const wasDisabled = disabled.delete(id)
    const wasRemoved = removed.delete(id)
    if (wasDisabled || wasRemoved) selectionChanged = true
    if (Object.prototype.hasOwnProperty.call(selection.pinned ?? {}, id)) {
      selection.pinned = { ...selection.pinned }
      delete selection.pinned[id]
      selectionChanged = true
    }
  }
  if (defaults.includes(newMedia)) {
    if (customMedia) {
      // An explicit new selection wins; retain the custom package without double loading.
      bundles = bundles.filter(id => id !== (existing.includes(newMedia) ? oldMedia : newMedia))
      if (!existing.includes(newMedia) && !removed.has(oldMedia) && !disabled.has(oldMedia) && existing.includes(oldMedia)) bundles = [...new Set([...bundles, oldMedia])]
    } else {
      if (!existing.includes(newMedia) && removed.has(oldMedia)) { removed.add(newMedia); selectionChanged = true }
      if (!existing.includes(newMedia) && disabled.has(oldMedia)) { disabled.add(newMedia); selectionChanged = true }
      if (managedMedia && Object.prototype.hasOwnProperty.call(selection.pinned ?? {}, oldMedia) && selection.renamed?.[oldMedia] !== newMedia) {
        selection.renamed = { ...selection.renamed, [oldMedia]: newMedia }; selectionChanged = true
      }
      const hadOld = bundles.includes(oldMedia)
      bundles = bundles.filter(id => id !== oldMedia && !(id === newMedia && (removed.has(newMedia) || disabled.has(newMedia))))
      if (hadOld && !removed.has(newMedia) && !disabled.has(newMedia)) bundles = [...new Set([...bundles, newMedia])]
      if (Object.prototype.hasOwnProperty.call(dependencies,oldMedia)) { dependencies = {...dependencies}; delete dependencies[oldMedia]; selectionChanged = true }
    }
  }
  const resolutionChanged = removeRetiredResolutionRules(manifest)
  const profileChanged = resolutionChanged || selectionChanged || JSON.stringify(existing) !== JSON.stringify(bundles) || JSON.stringify(manifest.dependencies ?? {}) !== JSON.stringify(dependencies)
  if (architecture >= PROFILE_ARCHITECTURE && !profileChanged) return
  manifest.dependencies = dependencies
  manifest.dsh = { ...manifest.dsh, profile: { ...manifest.dsh?.profile, bundles } }
  manifest.zerowall = { ...manifest.zerowall, pluginArchitecture: Math.max(architecture, PROFILE_ARCHITECTURE), disabledPlugins: [...disabled].sort() }
  if (legacyOverlay) manifest.zerowall.legacyOverlayMigrated = true
  if (selectionChanged) {
    await mkdir(join(home, 'resources/plugins'), { recursive: true })
    const selectionTemporary = selectionFile + '.' + randomUUID() + '.tmp'
    await writeFile(selectionTemporary, JSON.stringify({ ...selection, removed: [...removed].sort(), disabled: [...disabled].sort() }, null, 2), { mode: 0o600 })
    await rename(selectionTemporary, selectionFile)
  }
  const temporary = file + '.' + randomUUID() + '.tmp'
  await writeFile(temporary, JSON.stringify(manifest, null, 2), { mode: 0o600 })
  await rename(temporary, file)
}
