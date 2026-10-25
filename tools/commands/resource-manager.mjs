import { cp, lstat, mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { assertCompatible, compareVersions, downloadResource, verifyCatalog, verifySignedDocument } from './resource-catalog.mjs'
import { archiveProfileCandidate, discardProfileCandidate, migrateOfflineProfileLinks, pluginIdentity, prepareProfileCandidate, prepareOfflineCandidate, profileCarrier, readOfflineReceipt, verifiedGeneration, verifyProfileCarriers } from './offline-profile.mjs'
import { satisfiesInstalledPackageRange, satisfiesPackageRange } from './package-range.mjs'
import { renameProfile } from './profile-rename.mjs'
import { repairProfileLayout } from './profile-layout.mjs'
import { copyProfileTree } from './profile-copy.mjs'
import { RETIRED_PLUGIN_IDS, retiredPackageSelector, removeRetiredPlugins, removeRetiredPatch, removeRetiredResolutionRules } from './retired-plugins.mjs'
import { restorePackageClosure } from './profile-restore.mjs'
import { PROFILE_LAYOUT, materializationFile, physicalizeProfilePlugins, preparePhysicalRootsForPnpm, verifyMaterializedProfile } from './profile-materialization.mjs'
import { archiveHistoricalPluginProvenance, verifyHistoricalPluginImports } from './historical-plugin.mjs'
import { acquireProfileMutation } from './profile-mutation-lock.mjs'
import { pluginVerificationMode, verifyPluginDocument } from './plugin-verification.mjs'
import { commitPackagePaths, restorePackagePaths } from './profile-package-commit.mjs'
import { recoverPnpmTransactions } from './profile-pnpm-transaction.mjs'
import { enqueuePendingPlugin, readPendingPlugin, writePendingPlugin, listPendingPlugins, targetLocked } from './profile-pending.mjs'
import { pluginRuntimeEntries } from './plugin-entrypoints.mjs'

async function json(path) { return JSON.parse(await readFile(path, 'utf8')) }
async function atomic(path, value, { raw = false } = {}) {
  await mkdir(resolve(path, '..'), { recursive: true })
  const candidate = path + '.' + randomUUID() + '.tmp'
  await writeFile(candidate, raw ? value : JSON.stringify(value, null, 2), { mode: 0o600 })
  await rename(candidate, path)
}

/** Signed resource preparation and official DSH profile transactions. */
export function createResourceManager({ home, keys, target, runPlugin, stopHost: stopHostCallback, startHost: startHostCallback, callHost, readHealth, applyPython, runtimeModules, offlineSource, local = false, offlineStaging = false, onOfflinePhase = () => {}, feedBase = 'https://zerowall.chengxunkeji.cn/stable/catalogs', yaml = { parse: JSON.parse, stringify: JSON.stringify }, bundledPlugins = [], bundledSkillVersions = {}, defaultPlugins = [] }) {
  const root = join(home, 'resources')
  const profiles = join(home, 'profiles')
  const active = join(profiles, 'web')
  const journal = join(root, 'transaction.json')
  const pluginStateRoot = join(root, 'plugins')
  const selectionFile = join(pluginStateRoot, 'selection.json')
  let queue = Promise.resolve()
  let selectionBefore
  let hostNeedsRestart = false, pendingActivationBaseline
  const stopHost = async () => { await stopHostCallback(); hostNeedsRestart = true }
  const startHost = async options => { await startHostCallback(options); hostNeedsRestart = false }
  const exclusive = task => { const result = queue.then(async () => {
    const release = await acquireProfileMutation(active)
    try { return await task() } finally {
      // An unfinished candidate is diagnostic history, never another active
      // profile. Cleanup failure cannot veto the accepted profile or startup.
      try { await archiveProfileCandidate(home, join(profiles, 'zerowall'), 'unfinished-candidate') }
      catch (error) { await atomic(join(root, 'profile-cleanup.json'), { pending: true, error: error.message }).catch(() => {}) }
      await release()
    }
  }); queue = result.catch(() => {}); return result }
  const selectionTransaction = async task => {
    const previousText = await readFile(selectionFile, 'utf8').catch(error => { if (error.code !== 'ENOENT') throw error })
    const previous = previousText === undefined ? {} : JSON.parse(previousText)
    selectionBefore = previous
    try { return await task() }
    catch (error) {
      if (previousText === undefined) await unlink(selectionFile).catch(restoreError => { if (restoreError.code !== 'ENOENT') throw restoreError })
      else await atomic(selectionFile, previousText, { raw: true })
      throw error
    }
    finally { selectionBefore = undefined }
  }
  const exists = path => readFile(join(path, 'package.json')).then(() => true, error => {
    if (error.code === 'ENOENT') return false
    throw error
  })

  async function copyProfileSkeleton(source, destination, { pendingIds = [], ...options } = {}) {
    const filter = options.filter ?? (() => true)
    await copyProfileTree(source, destination, { ...options, filter: (path, entry) => !/^\.plugin-manager(?:\/|$)|(?:^|\/)package\.json\.lock(?:\/|$)/u.test(path) && filter(path, entry) })
    const layout = await repairProfileLayout(destination, { from: source, home,
      diagnoseMissingTargets: true, pendingRoots: pendingIds.map(id => packagePath(destination, id)) })
    if (layout.needsRelink) throw new Error('PROFILE_LAYOUT_RELINK_REQUIRED: use the plugin repair action with the bundled pnpm before activation')
  }

  async function prepareMutationCandidate(candidate, replacements, document, { signal } = {}) {
    const manifest = await json(join(active, 'package.json'))
    // Current profiles resolve only the selected packages in a private pnpm
    // namespace. An unrelated lost import/source is diagnosed independently.
    if (manifest.zerowall?.profileLayout >= 3) {
      await copyProfileSkeleton(active, candidate, { pendingIds: Object.keys(replacements) })
      return []
    }
    const missing = []
    for (const [id, spec] of Object.entries(manifest.dependencies ?? {})) {
      if (replacements[id] || !/^(file|link):/u.test(spec) || RETIRED_PLUGIN_IDS.has(id)) continue
      const source = resolve(active, spec.slice(5))
      const info = await stat(source).catch(error => { if (error.code !== 'ENOENT') throw error })
      if (info?.isFile()) continue
      if (!info || !await exists(source)) missing.push(id)
    }
    if (missing.length && offlineSource) {
      const { receipt } = await readOfflineReceipt(offlineSource, keys, target, { local })
      const selection = await readPluginSelection()
      const available = missing.every(id => receipt.plugins.some(entry => entry.id === id && !entry.core
        && (!selection.pinned[id] || selection.pinned[id] === entry.version)))
      if (available) {
        const prepared = await prepareOfflineCandidate({ home, source: offlineSource, keys, target, defaults: missing, bundledPlugins, yaml, runtimeModules,
          local, staging: offlineStaging, repairOnly: true, onPhase: onOfflinePhase })
        if (prepared.blocked.length) throw new Error('PLUGIN_REPAIR_BLOCKED: ' + JSON.stringify(prepared.blocked))
        if (prepared.candidate !== candidate) throw new Error('Unexpected plugin repair candidate')
        return missing
      }
    }
    const repaired = missing.length ? await repairMissingFileDependencies(active, document ?? await catalog(feedBase + '/plugin-latest.json', { signal }), replacements, { signal }) : []
    await copyProfileSkeleton(active, candidate, { pendingIds: Object.keys(replacements) })
    return repaired ?? []
  }

  async function preparePackageInstall(candidate, replacements = {}, { forPnpm = false } = {}) {
    const file = join(candidate, 'package.json')
    const manifest = await json(file)
    const managedIds = bundledPlugins.filter(item => !item.core && item.managed !== false).map(item => item.id)
    if (forPnpm && !(manifest.zerowall?.profileLayout >= 3)) await preparePhysicalRootsForPnpm({ profile: candidate, ids: managedIds, manifest })
    // Progressive Tools was retired in 8.2.1. Remove stale declarations from
    // copied profiles before pnpm sees them, including profiles created by an
    // older desktop build.
    removeRetiredPlugins(manifest)
    const workspaceFile = join(candidate, 'pnpm-workspace.yaml')
    const text = await readFile(workspaceFile, 'utf8').catch(error => { if (error.code !== 'ENOENT') throw error; return '' })
    const workspace = text.trim() ? yaml.parse(text) : {}
    workspace.overrides = { ...workspace.overrides, ...replacements }
    removeRetiredResolutionRules(workspace)
    // A peer lookup can resolve a catalog-only version through the registry
    // even with an override. Anchor the entire verified closure as direct
    // file dependencies, including packages absent from older profiles.
    // Only the requested entries are passed to DSH for bundle activation.
    manifest.dependencies = { ...manifest.dependencies, ...replacements }
    if (forPnpm && Object.keys(replacements).length) await atomic(join(candidate, '.zerowall/resolution-targets.json'), replacements)
    const refreshedIds = new Set([...RETIRED_PLUGIN_IDS, ...Object.keys(replacements)])
    // Installer-owned packages already have their complete runtime closure.
    // Re-resolving their source manifests exposes workspace: dependencies that
    // cannot exist in a user's profile. Link these unchanged generations; only
    // the selected signed closure participates in package resolution.
    for (const [id, spec] of Object.entries(manifest.dependencies ?? {})) {
      if (replacements[id]) { manifest.dependencies[id] = replacements[id]; continue }
      if (!spec.startsWith('file:') && !spec.startsWith('link:')) continue
      const path = resolve(candidate, spec.slice(5))
      if (/^node_modules\/\.zerowall-(?:carriers|restores)\//u.test(relative(candidate, path).replaceAll('\\', '/'))
        || /^\.zerowall\/install-sources\//u.test(relative(candidate, path).replaceAll('\\', '/'))
        || path === resolve(candidate, 'node_modules', id)) {
        workspace.overrides[id] = spec
        refreshedIds.add(id)
        continue
      }
      const child = relative(join(root, 'offline'), path)
      if (!child || child.startsWith('..') || isAbsolute(child)) continue
      const installed = await json(join(path, 'package.json'))
      if (installed.name !== id) throw new Error('Offline package identity mismatch: ' + id)
      manifest.dependencies[id] = 'link:' + path.replaceAll('\\', '/')
      // Historical tarball snapshots can still refer to this package by
      // semver. Anchor transitive lookups to the same verified generation.
      workspace.overrides[id] = manifest.dependencies[id]
      refreshedIds.add(id)
    }
    workspace.autoInstallPeers = false
    // ssh2 works without its optional native crypto/CPU accelerators. Explicit
    // denials avoid pnpm's undecided-build failure on machines without build
    // tools, while retaining a user's reviewed allow/deny policy.
    workspace.allowBuilds = { ssh2: false, 'cpu-features': false, ...workspace.allowBuilds, '@scarf/scarf': false }
    await atomic(file, manifest)
    await writeFile(workspaceFile, yaml.stringify(workspace))
    // A copied lock can still carry retired packages or resolver records for
    // deleted build-machine tarballs. Drop only the affected resolver entries
    // so pnpm resolves their verified replacements and preserves other locks.
    const lockFile = join(candidate, 'pnpm-lock.yaml')
    const lockText = await readFile(lockFile, 'utf8').catch(error => { if (error.code !== 'ENOENT') throw error; return undefined })
    if (lockText !== undefined) {
      const lock = yaml.parse(lockText)
      let changed = false
      for (const importer of Object.values(lock?.importers ?? {})) {
        for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
          for (const id of refreshedIds) if (Object.prototype.hasOwnProperty.call(importer[field] ?? {}, id)) { delete importer[field][id]; changed = true }
        }
      }
      for (const field of ['packages', 'snapshots']) {
        for (const key of Object.keys(lock?.[field] ?? {})) {
          if ([...refreshedIds].some(id => key === id || key.startsWith(id + '@'))) { delete lock[field][key]; changed = true }
        }
      }
      for (const selector of Object.keys(lock?.overrides ?? {})) {
        if (retiredPackageSelector(selector)) { delete lock.overrides[selector]; changed = true }
        else if (refreshedIds.has(selector) && lock.overrides[selector] !== workspace.overrides[selector]) {
          lock.overrides[selector] = workspace.overrides[selector]
          changed = true
        }
      }
      if (changed) await writeFile(lockFile, yaml.stringify(lock))
    }
  }

  async function repairMissingFileDependencies(profile, document, replacements, { signal } = {}) {
    if (!document?.resources) return
    const manifestFile = join(profile, 'package.json')
    const manifest = await json(manifestFile)
    removeRetiredPlugins(manifest)
    const choices = await readPluginSelection()
    const repaired = new Map()
    function visit(entry) {
      if (repaired.has(entry.id) || replacements[entry.id]) return
      assertCompatible(entry, target)
      if (choices.removed.has(entry.id)) throw new Error('Required plugin was explicitly removed: ' + entry.id)
      if (choices.pinned[entry.id] && choices.pinned[entry.id] !== entry.version) throw new Error('Plugin or dependency version is pinned: ' + entry.id)
      repaired.set(entry.id, entry)
      for (const [id, range] of Object.entries(entry.dependencies ?? {})) {
        const child = document.resources.find(item => item.id === id && ['plugin', 'support'].includes(item.kind))
        if (choices.removed.has(id)) throw new Error('Required plugin was explicitly removed: ' + id)
        if (child) {
          if (!satisfiesPackageRange(child.version, range)) throw new Error('Signed dependency version does not satisfy ' + entry.id + ': ' + id + '@' + range)
          visit(child)
        }
      }
    }
    for (const [id, spec] of Object.entries(manifest.dependencies ?? {})) {
      if (replacements[id] || typeof spec !== 'string' || !/^(file|link):/u.test(spec)) continue
      const source = resolve(profile, spec.slice(5))
      const available = await stat(source).catch(error => {
        if (error.code === 'ENOENT') return undefined
        throw error
      })
      if (available && (!available.isDirectory() || await json(join(source, 'package.json')).catch(error => {
        if (['ENOENT', 'ENOTDIR'].includes(error.code)) return undefined
        throw error
      }))) continue
      const entry = document.resources.find(item => item.id === id && ['plugin', 'support'].includes(item.kind))
      if (!entry) throw new Error(`Missing package source for ${id}; it is absent from the signed catalog`)
      const installed = await packageVersion(active, id)
      if (installed && compareVersions(entry.version, installed.version) < 0) throw new Error('Repair would downgrade an installed plugin: ' + id)
      visit(entry)
    }
    for (const entry of repaired.values()) {
      const installed = await packageVersion(active, entry.id)
      if (installed && compareVersions(entry.version, installed.version) < 0) throw new Error('Repair would downgrade an installed plugin: ' + entry.id)
      const cached = await downloadResource(entry, join(root, 'downloads'), { local, signal })
      const tarball = cached + '.tgz'
      await cp(cached, tarball)
      replacements[entry.id] = 'file:' + tarball.replaceAll('\\', '/')
    }
    return [...repaired.keys()]
  }

  async function readPluginSelection() {
    const value = await json(selectionFile).catch(error => {
      if (error.code === 'ENOENT') return {}
      throw error
    })
    if (value.pinned !== undefined && (!value.pinned || typeof value.pinned !== 'object' || Array.isArray(value.pinned))) throw new Error('Invalid pinned plugin selections')
    for (const [id, version] of Object.entries(value.pinned ?? {})) {
      pluginIdentity(id)
      if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?(?:\+[A-Za-z0-9.-]+)?$/u.test(version)) throw new Error('Invalid pinned plugin version')
    }
    return {
      ...value,
      disabled: new Set(Array.isArray(value.disabled) ? value.disabled : []),
      removed: new Set(Array.isArray(value.removed) ? value.removed : []),
      pinned: { ...(value.pinned ?? {}) },
    }
  }

  async function writePluginSelection(selection) {
    for (const id of RETIRED_PLUGIN_IDS) {
      selection.disabled.delete(id)
      selection.removed.delete(id)
      delete selection.pinned[id]
    }
    await atomic(selectionFile, {
      ...selection,
      disabled: [...selection.disabled].sort(),
      removed: [...selection.removed].sort(),
    })
  }

  function packagePath(profile, id) {
    pluginIdentity(id)
    return join(profile, 'node_modules', ...id.split('/'))
  }

  async function packageVersion(profile, id) {
    const installed = await json(join(packagePath(profile, id), 'package.json')).catch(error => { if (['ENOENT', 'ENOTDIR', 'ELOOP'].includes(error.code)) return undefined; throw error })
    if (installed) return installed
    if (runtimeModules) return json(join(runtimeModules, pluginIdentity(id), 'package.json')).catch(error => { if (error.code === 'ENOENT') return undefined; throw error })
    return undefined
  }
  const localSnapshots = new Map()
  async function hostRead(operation, args) {
    let timer
    try { return await Promise.race([callHost(operation, args), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Local resource service timed out')), 4500) })]) }
    finally { clearTimeout(timer) }
  }
  async function dependents(id) {
    pluginIdentity(id)
    const manifest = await json(join(active, 'package.json'))
    const selection = await readPluginSelection()
    const result = new Set()
    const bundles = (manifest.dsh?.profile?.bundles ?? []).filter(name => name !== id && !selection.disabled.has(name) && !selection.removed.has(name))
    const packages = await Promise.all(bundles.map(async name => ({ name, manifest: await packageVersion(active, name) })))
    let changed = true
    while (changed) {
      changed = false
      for (const entry of packages) if (!result.has(entry.name) && Object.keys(entry.manifest?.dependencies ?? {}).some(name => name === id || result.has(name))) { result.add(entry.name); changed = true }
    }
    return [...result].sort()
  }
  async function pinPlugin(id, pinned) {
    pluginIdentity(id)
    const installed = await packageVersion(active, id)
    const packaged = bundledPlugins.find(item => item.id === id)
    if (packaged?.core || packaged?.managed === false) throw new Error('Core runtime cannot be pinned independently')
    if (!installed?.version && pinned) throw new Error('Cannot pin a missing plugin')
    const selection = await readPluginSelection()
    if (pinned) selection.pinned[id] = installed.version
    else delete selection.pinned[id]
    await writePluginSelection(selection)
    return { id, pinnedVersion: selection.pinned[id] }
  }

  async function restorePluginGeneration(candidate, previousProfile, packageIds, id) {
    const currentFile = join(candidate, 'package.json')
    const previousFile = join(previousProfile, 'package.json')
    const current = await json(currentFile)
    const previous = await json(previousFile)
    const ids = [...new Set([id, ...(packageIds ?? [])])]
    const restoredSpecs = await restorePackageClosure({ candidate, previousProfile, packageIds: ids, home, keys, target, local, runtimeModules })
    // Restore the selected plugin's root manifest changes while retaining
    // unrelated plugin changes made after the snapshot was taken.
    const merged = { ...current }
    // Layout, carrier identity, disabled selections and unrelated plugin
    // metadata belong to the current profile, even for a legacy snapshot.
    for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
      const values = { ...(current[field] ?? {}) }
      for (const packageId of ids) {
        if (previous[field]?.[packageId] === undefined || !restoredSpecs.get(packageId)) delete values[packageId]
        else {
          // A previous generation may have recorded a link into its carrier
          // or into resources/offline. The restored package now lives as
          // independent bytes in this candidate, so anchor only the target
          // package to the candidate-local node_modules path.
          values[packageId] = restoredSpecs.get(packageId)
        }
      }
      merged[field] = values
    }
    merged.dsh = { ...(current.dsh ?? {}), profile: { ...(current.dsh?.profile ?? {}) } }
    const currentBundles = new Set(current.dsh?.profile?.bundles ?? [])
    const previousBundles = new Set(previous.dsh?.profile?.bundles ?? [])
    for (const packageId of ids) {
      if (previousBundles.has(packageId)) currentBundles.add(packageId)
      else currentBundles.delete(packageId)
    }
    merged.dsh.profile.bundles = [...currentBundles]
    await atomic(currentFile, merged)
    const replacements = Object.fromEntries([...restoredSpecs].filter(([, spec]) => spec))
    await preparePackageInstall(candidate, replacements)
  }

  async function recordPluginGeneration(metadata, backup) {
    if (metadata.plugins?.length > 1 && !metadata.rollback) { for (const item of metadata.plugins) await recordPluginGeneration({ ...metadata, plugins: undefined, packageId: item.id, version: item.version }, backup); return }
    if (!metadata.packageId || metadata.rollback) return
    const old = await packageVersion(backup, metadata.packageId)
    const previousVersion = old?.version ?? metadata.previousVersion ?? metadata.version
    if (!previousVersion) return
    const file = join(pluginStateRoot, encodeURIComponent(metadata.packageId), 'history.json')
    const history = await json(file).catch(error => {
      if (error.code === 'ENOENT') return { records: [] }
      throw error
    })
    const records = Array.isArray(history.records) ? history.records : []
    records.push({ id: metadata.packageId, version: previousVersion, profile: backup, packageIds: metadata.packageIds ?? [metadata.packageId], createdAt: new Date().toISOString() })
    await atomic(file, { records: records.slice(-12) })
  }

  function ownedBackup(path) {
    if (typeof path !== 'string') throw new Error('Invalid plugin recovery backup')
    const child = relative(join(root, 'history'), resolve(path))
    if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('Plugin recovery backup is outside managed history')
    return path
  }

  async function recover() {
    await recoverPnpmTransactions(active)
    const pending = await json(journal).catch(error => {
      if (error.code === 'ENOENT') return undefined
      throw error
    })
    if (!pending || pending.state !== 'activating') {
      // Local-only migration of pre-8.3.1 candidate paths; no downloads or pnpm
      // operations run during ordinary startup.
      const layout = await repairProfileLayout(active, { home, diagnoseMissingTargets: true })
      if (layout.changed) await atomic(join(root, 'profile-layout-migration.json'), { ...layout, at: new Date().toISOString() })
      return
    }
    const backup = ownedBackup(pending.backup)
    if (pending.packageTransaction) {
      const directory = join(backup, 'transaction')
      const state = await json(join(directory, 'journal.json'))
      if (state.state === 'committing') await restorePackagePaths(active, directory, state)
      if (pending.selectionBefore) await atomic(selectionFile, pending.selectionBefore)
      await atomic(journal, { ...pending, state: 'recovered' })
      return
    }
    // Before the first rename (or after recovery has restored the backup),
    // active still contains the complete old profile. Never quarantine it
    // unless there is a complete backup to restore.
    if (await exists(backup)) {
      if (await exists(active)) await archiveProfileCandidate(home, active, 'interrupted')
      await renameProfile(backup, active)
      await repairProfileLayout(active, { from: backup, home })
    } else if (!await exists(active)) {
      throw new Error('Plugin update recovery has no complete active or backup profile')
    } else await repairProfileLayout(active, { home })
    if (pending.selectionBefore) await atomic(selectionFile, pending.selectionBefore)
    await atomic(journal, { ...pending, state: 'recovered' })
  }

  // Decide whether the first Host may resolve the selected workbench plugins.
  // This is only a local readiness probe: no archive sweep, dependency graph,
  // mutation or plugin activation. The normal repair still authenticates and
  // verifies a candidate before it can become active.
  async function inspectStartupProfile(source = offlineSource) {
    const { receipt, digest } = await readOfflineReceipt(source, keys, target, { local })
    const manifest = await json(join(active, 'package.json'))
    const selection = await readPluginSelection()
    const reasons = new Set(), missingIds = new Set(), invalidIds = new Set()
    if (!(manifest.zerowall?.pluginArchitecture >= 7) || manifest.zerowall?.profileLayout !== PROFILE_LAYOUT) reasons.add('profile-layout')
    const marker = await json(join(active, materializationFile)).catch(error => { if (error.code !== 'ENOENT') throw error })
    if (marker?.schema !== 1 || marker.layout !== PROFILE_LAYOUT || marker.digest !== digest) reasons.add('offline-generation')
    const expected = defaultPlugins.filter(id => !RETIRED_PLUGIN_IDS.has(id) && !selection.removed.has(id) && !selection.disabled.has(id) && !manifest.zerowall?.disabledPlugins?.includes(id))
    const records = new Map(receipt.plugins.map(entry => [entry.id, entry]))
    const signed = new Set(receipt.files.map(entry => entry.path))
    const unavailable = error => { if (!['ENOENT', 'ENOTDIR', 'ELOOP'].includes(error.code)) throw error }
    if (expected.some(id => !records.get(id)?.core)) {
      const dependencies = await lstat(join(active, 'node_modules/.zerowall-dependencies/node_modules')).catch(unavailable)
      if (!dependencies?.isDirectory() || dependencies.isSymbolicLink()) reasons.add('missing-dependency-root')
    }
    for (const id of expected) {
      const seed = records.get(id), root = packagePath(active, id)
      const installed = await json(join(root, 'package.json')).catch(unavailable)
      if (seed?.core && !selection.pinned[id]) {
        if (installed?.version && bundledPlugins.some(item => item.id === id && item.managed !== false) && compareVersions(installed.version, seed.version) <= 0) {
          invalidIds.add(id); reasons.add('core-shadow')
        }
        continue
      }
      if (!installed && seed?.core && selection.pinned[id] === seed.version) continue
      if (!installed) { missingIds.add(id); reasons.add('missing-plugins'); continue }
      const info = await lstat(root).catch(unavailable)
      if (!info?.isDirectory() || info.isSymbolicLink() || installed.name !== id || selection.pinned[id] && installed.version !== selection.pinned[id]) {
        invalidIds.add(id); reasons.add('invalid-plugins'); continue
      }
      for (const entry of pluginRuntimeEntries(installed)) {
        // Some upstream exports advertise conditions omitted from their signed
        // package. Match the runtime verifier instead of inventing new files.
        if (installed.version === seed?.version && !signed.has('modules/' + id + '/' + entry)) continue
        const path = resolve(root, entry), child = relative(root, path)
        if (child === '..' || child.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')) || isAbsolute(child)) {
          invalidIds.add(id); reasons.add('invalid-entrypoints'); continue
        }
        let available = false
        for (const suffix of ['', '.js', '.json', '.node', '/index.js', '/index.json', '/index.node']) {
          if ((await stat(path + suffix).catch(unavailable))?.isFile()) { available = true; break }
        }
        if (!available) { invalidIds.add(id); reasons.add('missing-entrypoints') }
      }
    }
    return { ready: reasons.size === 0, reasons: [...reasons], missingIds: [...missingIds], invalidIds: [...invalidIds], generation: digest, buildId: receipt.buildId }
  }

  async function repairOffline(source, { startup = false } = {}) {
    const started = Date.now()
    const { receipt: document, digest: sourceDigest } = await readOfflineReceipt(source, keys, target, { local })
    const manifest = await json(join(active, 'package.json'))
    const selection = await readPluginSelection()
    const expected = defaultPlugins.filter(id => !RETIRED_PLUGIN_IDS.has(id) && !selection.removed.has(id) && !selection.disabled.has(id) && !manifest.zerowall?.disabledPlugins?.includes(id))
    const missing = []
    for (const id of expected) {
      const seed = document.plugins.find(entry => entry.id === id)
      // Shared-runtime fallback is not a profile shadow. Only a real profile
      // package can require core-shadow migration on the next launch.
      const installed = seed?.core && !selection.pinned[id]
        ? await json(join(active, 'node_modules', id, 'package.json')).catch(error => { if (!['ENOENT', 'ENOTDIR', 'ELOOP'].includes(error.code)) throw error })
        : await packageVersion(active, id)
      if (seed?.core && !selection.pinned[id]) {
        if (installed?.version && bundledPlugins.some(item => item.id === id && item.managed !== false)
          && compareVersions(installed.version, seed.version) <= 0) missing.push(id)
        continue
      }
      if (!installed && seed?.core && selection.pinned[id] === seed.version) continue
      if (!installed || (selection.pinned[id] && installed.version !== selection.pinned[id])) missing.push(id)
    }
    if (manifest.zerowall?.pluginArchitecture >= 7 && manifest.zerowall?.profileLayout === PROFILE_LAYOUT && !missing.length) {
      const generation = await verifyMaterializedProfile({ profile: active, keys, target, expected, digest: sourceDigest, local })
      let imported = false
      try { await verifyHistoricalPluginImports({ profile: active, keys, target, runtimeModules, local, full: false }); imported = true } catch { /* Repair only through an authenticated candidate. */ }
      if (generation && imported) {
        onOfflinePhase({ phase: 'offline-reuse', state: 'complete', durationMs: Date.now() - started })
        return { repaired: false, architecture: 7, generation: generation.digest }
      }
    }
    const result = await prepareOfflineCandidate({ home, source, keys, target, defaults: defaultPlugins, bundledPlugins, yaml, runtimeModules, local, staging: offlineStaging, onPhase: onOfflinePhase })
    const receiptPath = join(pluginStateRoot, 'repairs', result.digest + '.json')
    if (result.blocked.length) {
      await atomic(receiptPath, { state: 'blocked', architecture: 7, buildId: document.buildId, blocked: result.blocked, candidate: result.candidate })
      return { repaired: false, blocked: result.blocked }
    }
    const candidateManifest = await json(join(result.candidate, 'package.json'))
    candidateManifest.zerowall.offlineBuildId = document.buildId
    await atomic(join(result.candidate, 'package.json'), candidateManifest)
    await preparePackageInstall(result.candidate)
    try {
      const repairedIds = [...new Set([...document.plugins.filter(entry => !entry.core).map(entry => entry.id), ...(result.archivedIds ?? [])])]
      const repairedDependencyIds = [...new Set(document.files.map(entry => /^modules\/((?:@[^/]+\/)?[^/]+)\/package\.json$/u.exec(entry.path)?.[1]).filter(Boolean))]
      // Layout 3 profiles must use the same exact-path package transaction as
      // ordinary plugin operations.  Passing the repaired package roots makes
      // the offline generation replace only those roots plus its shared,
      // profile-owned dependency namespace; the profile directory itself is
      // never renamed while Host/renderer handles exist.
      const activation = await activate(result.candidate, {
        operation: 'offline-repair', buildId: document.buildId, offlineGeneration: result.digest,
        ...(startup ? { startup: true } : {}),
        repairedIds, repairedDependencyIds, packageIds: repairedIds,
        replaceInstallSources: result.replacedInstallSources,
        historyPaths: result.archivedHistoryPaths,
      })
      await atomic(receiptPath, { state: 'complete', architecture: 7, buildId: document.buildId, changed: result.changed, ...activation })
      return { repaired: true, architecture: 7, changed: result.changed }
    } catch (error) {
      await atomic(receiptPath, { state: 'failed', architecture: 7, buildId: document.buildId, reason: 'Candidate Host activation failed; previous profile restored' })
      throw error
    }
  }

  async function catalog(source, { signal, kind = 'plugin' } = {}) {
    let document
    if (/^https:\/\//.test(source)) {
      const response = await fetch(source, { cache: 'no-store', redirect: 'error', signal: signal ?? AbortSignal.timeout(10_000) })
      if (!response.ok) {
        const error = new Error(`Catalog request failed (HTTP ${response.status})`)
        error.status = response.status
        throw error
      }
      const chunks = []; let size = 0
      for await (const chunk of response.body) {
        size += chunk.length
        if (size > 4 * 1024 ** 2) throw new Error('Catalog exceeds size limit')
        chunks.push(chunk)
      }
      document = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    } else document = await json(resolve(source))
    if (document.kind === 'pointer') {
      if (kind === 'plugin') verifyPluginDocument(document, keys, target)
      else verifySignedDocument(document, keys)
      if (document.localOnly && !local) throw new Error('Development pointer cannot be activated by a release installation')
      const file = await downloadResource(document.catalog, join(root, 'catalogs'), { local, signal })
      document = await json(file)
    }
    verifyCatalog(document, keys, { local, signatureMode: kind === 'plugin' ? pluginVerificationMode(target, 'signature') : 'strict' })
    if (document.localOnly && !local) throw new Error('Development catalog cannot be activated by a release installation')
    return document
  }

  async function plugin(id, source) { return pluginBatch([id], source, undefined, { install: true }) }

  async function repairPlugin(id, source) {
    pluginIdentity(id)
    if (bundledPlugins.some(item => item.id === id && item.managed !== false && !item.core) || source && /^https?:\/\//u.test(source)) return plugin(id, source)
    const manifest = await json(join(active, 'package.json'))
    const spec = manifest.dependencies?.[id]
    if (typeof spec !== 'string') throw new Error('PLUGIN_REPAIR_SOURCE_REQUIRED: re-import this custom plugin from its original source')
    if (/^(?:file|link):/u.test(spec)) {
      const path = resolve(active, spec.slice(5))
      if (path === resolve(active, 'node_modules', id)) {
        if (!await packageVersion(active, id)) throw new Error('PLUGIN_REPAIR_SOURCE_REQUIRED: re-import this custom plugin from its original source')
        return mutate(['update', id])
      }
      return mutate(['add', spec.slice(0, 5) + path])
    }
    return mutate(['add', id + '@' + spec])
  }

  async function pluginBatch(ids, source, snapshot, { signal, report = () => {}, install = false } = {}) {
    if (!Array.isArray(ids) || !ids.length || ids.length > 200 || ids.some(id => typeof id !== 'string')) throw new Error('Invalid plugin batch')
    if (ids.some(id => RETIRED_PLUGIN_IDS.has(id))) throw new Error('Plugin has been retired')
    ids = [...new Set(ids)]
    const checkCancelled = () => { if (signal?.aborted) throw new Error('RESOURCE_BATCH_CANCELLED') }
    checkCancelled()
    const document = snapshot ?? await catalog(source ?? feedBase + '/plugin-latest.json', { signal })
    const choices = await readPluginSelection()
    const entries = ids.map(id => {
      pluginIdentity(id)
      if (!install && choices.removed.has(id)) throw new Error('Plugin was explicitly removed: ' + id)
      const entry = document.resources.find(item => item.id === id && ['plugin', 'support'].includes(item.kind))
      if (!entry) throw new Error('Plugin is absent from the signed catalog: ' + id)
      return entry
    })
    const closure = new Map()
    function visit(entry) {
      if (closure.has(entry.id)) return
      if (RETIRED_PLUGIN_IDS.has(entry.id)) throw new Error('Plugin has been retired: ' + entry.id)
      assertCompatible(entry, target)
      if (choices.pinned[entry.id] && choices.pinned[entry.id] !== entry.version) throw new Error('Plugin or dependency version is pinned: ' + entry.id)
      closure.set(entry.id, entry)
      for (const [id, range] of Object.entries(entry.dependencies ?? {})) {
        if (RETIRED_PLUGIN_IDS.has(id)) throw new Error('Plugin dependency has been retired: ' + id)
        const child = document.resources.find(item => item.id === id)
        if (choices.removed.has(id)) throw new Error('Required plugin was explicitly removed: ' + id)
        if (child) {
          if (!satisfiesPackageRange(child.version, range)) throw new Error('Signed dependency version does not satisfy ' + entry.id + ': ' + id + '@' + range)
          visit(child)
        }
      }
    }
    for (const entry of entries) {
      const installed = await packageVersion(active, entry.id)
      if (installed && compareVersions(entry.version, installed.version) < 0) throw new Error('Plugin downgrade requires an explicit rollback: ' + entry.id)
      visit(entry)
    }
    const generation = 'zerowall', candidate = await prepareProfileCandidate(home)
    const batchId = randomUUID(), metadata = { batchId, plugins: entries.map(entry => ({ id: entry.id, version: entry.version })), packageIds: [...closure.keys()] }
    await atomic(journal, { state: 'preparing', candidate, ...metadata })
    const overrides = {}, archives = new Map()
    let completed = 0
    try {
      for (const item of closure.values()) {
        checkCancelled()
        const file = await downloadResource(item, join(root, 'downloads'), { local, signal })
        const tarball = file + '.tgz'; await cp(file, tarball)
        overrides[item.id] = 'file:' + tarball.replaceAll('\\', '/')
        archives.set(item.id, tarball)
        await report({ phase: 'preparing', completed: ++completed, total: closure.size, currentPlugin: item.id })
        await atomic(journal, { state: 'preparing', candidate, completed, ...metadata })
      }
      // Discover and authenticate missing sources before relocating internal
      // links. Strict relocation cannot succeed until these exact roots exist.
      metadata.repairedIds = await prepareMutationCandidate(candidate, overrides, document, { signal })
      for (const item of closure.values()) await archiveHistoricalPluginProvenance({ profile: candidate, id: item.id })
      metadata.packageIds = [...new Set([...metadata.packageIds, ...Object.keys(overrides)])]
      await preparePackageInstall(candidate, overrides, { forPnpm: true })
      checkCancelled()
      await runPlugin(['add', ...entries.map(entry => archives.get(entry.id))], generation, { signal })
      checkCancelled()
      if (install) { const selection = await readPluginSelection(); for (const id of ids) selection.removed.delete(id); await writePluginSelection(selection) }
      await normalizeComposition(candidate)
      await requireProfileLayout(candidate, active)
      checkCancelled()
      await report({ phase: 'activating', completed, total: closure.size })
      const result = await activate(candidate, { ...metadata, ...(ids.length === 1 ? { id: ids[0], packageId: ids[0], version: entries[0].version } : {}) })
      return { ...result, updated: entries.length }
    } catch (error) {
      const state = await json(journal).catch(() => undefined)
      if (state?.batchId === batchId && state.state === 'preparing') {
        const archived = await archiveProfileCandidate(home, candidate, 'preparation-failed')
        await atomic(journal, { ...state, candidate: archived ?? candidate, state: signal?.aborted ? 'cancelled' : 'preparation-failed', error: String(error) })
      }
      throw error
    }
  }

  async function normalizeComposition(candidate, removed) {
    const file = join(candidate, 'package.json')
    const manifest = await json(file)
    const physicalIds = []
    for (const id of Object.keys(manifest.dependencies ?? {})) {
      if (await json(join(candidate, 'node_modules', id, 'package.json')).catch(error => { if (!['ENOENT', 'ENOTDIR', 'ELOOP'].includes(error.code)) throw error })) physicalIds.push(id)
    }
    if (manifest.zerowall?.profileLayout >= 3) await physicalizeProfilePlugins({ profile: candidate, ids: physicalIds })
    else await physicalizeProfilePlugins({ profile: candidate, ids: physicalIds.filter(id => bundledPlugins.some(item => item.id === id && !item.core && item.managed !== false)) })
    for (const entry of bundledPlugins.filter(item => !item.core && item.managed !== false)) {
      const installed = await json(join(candidate, 'node_modules', entry.id, 'package.json')).catch(error => { if (!['ENOENT', 'ENOTDIR', 'ELOOP'].includes(error.code)) throw error })
      if (installed && manifest.dependencies?.[entry.id]?.startsWith('link:')) manifest.dependencies[entry.id] = 'link:./node_modules/' + entry.id
    }
    removeRetiredPlugins(manifest)
    const selection = await readPluginSelection()
    const disabled = new Set([...selection.disabled, ...(Array.isArray(manifest.zerowall?.disabledPlugins) ? manifest.zerowall.disabledPlugins : [])])
    const bundles = []
    for (const id of manifest.dsh.profile.bundles) {
      const packageManifest = await json(join(candidate, 'node_modules', id, 'package.json')).catch(() => undefined)
      bundles.push(...(packageManifest?.zerowall?.composition ?? [id]))
    }
    manifest.dsh.profile.bundles = [...new Set(bundles)].filter(id => id !== removed && !RETIRED_PLUGIN_IDS.has(id) && !disabled.has(id) && !selection.removed.has(id))
    manifest.zerowall = { ...manifest.zerowall, disabledPlugins: [...disabled].filter(id => !RETIRED_PLUGIN_IDS.has(id)).sort() }
    await atomic(file, manifest)
    const patchPath = join(candidate, 'cordis.patch.yml')
    const patch = await readFile(patchPath, 'utf8').catch(error => { if (error.code !== 'ENOENT') throw error })
    if (patch !== undefined) {
      const parsed = yaml.parse(patch), cleaned = removeRetiredPatch(parsed)
      if (JSON.stringify(cleaned) !== JSON.stringify(parsed)) await writeFile(patchPath, yaml.stringify(cleaned))
    }
  }

  async function setPluginEnabled(id, enabled, acknowledgedDependents = []) {
    if (RETIRED_PLUGIN_IDS.has(id)) throw new Error('Plugin has been retired')
    if (typeof id !== 'string' || !/^(?:@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._-]+$/u.test(id) || id.split('/').some(part => part === '.' || part === '..')) throw new Error('Invalid plugin identity')
    const candidate = await prepareProfileCandidate(home)
    await mkdir(candidate, { recursive: true })
    await copyProfileSkeleton(active, candidate)
    await preparePackageInstall(candidate)
    const file = join(candidate, 'package.json')
    const manifest = await json(file)
    const selection = await readPluginSelection()
    const disabled = new Set([...selection.disabled, ...(Array.isArray(manifest.zerowall?.disabledPlugins) ? manifest.zerowall.disabledPlugins : [])])
    if (!enabled) {
      const required = await dependents(id)
      if (required.some(name => !acknowledgedDependents.includes(name))) throw new Error('Plugin has active dependents; review them before disabling')
      for (const name of required) disabled.add(name)
    }
    if (enabled) {
      disabled.delete(id)
      selection.removed.delete(id)
      if (!manifest.dsh?.profile?.bundles?.includes(id)) manifest.dsh = { ...manifest.dsh, profile: { ...manifest.dsh?.profile, bundles: [...(manifest.dsh?.profile?.bundles ?? []), id] } }
    } else { disabled.add(id); selection.removed.delete(id) }
    selection.disabled = disabled
    await writePluginSelection(selection)
    manifest.zerowall = { ...manifest.zerowall, disabledPlugins: [...disabled].sort() }
    await atomic(file, manifest)
    await requireProfileLayout(candidate, active)
    await normalizeComposition(candidate)
    return activate(candidate, { operation: enabled ? 'enable' : 'disable', packageId: id, enabled })
  }

  async function activate(candidate, metadata, completionState = 'complete') {
    const current = await json(join(active, 'package.json'))
    if (current.zerowall?.profileLayout >= 3) return activatePackages(candidate, metadata, completionState)
    // Normalize relative external links before the deeper history move. The
    // signed offline generation itself is never traversed or modified.
    if (metadata.operation !== 'offline-repair') await requireProfileLayout(active, active, metadata.repairedIds, metadata.repairedDependencyIds)
    await requireProfileLayout(candidate, candidate)
    const backup = join(root, 'history', 'zerowall-' + randomUUID())
    await mkdir(resolve(backup, '..'), { recursive: true })
    // Persist the recovery instruction before stopping the Host. If that
    // write fails, the running profile is still available without a restart.
    await atomic(journal, { state: 'activating', backup, candidate, ...metadata, ...(selectionBefore ? { selectionBefore } : {}) })
    let backedUp = false
    try {
      await stopHost()
      await renameProfile(active, backup)
      backedUp = true
      try {
        const layout = await requireProfileLayout(backup, active, metadata.repairedIds, metadata.repairedDependencyIds)
        if (layout.pendingTargets?.length) await atomic(join(backup, 'profile-archive-diagnostic.json'), {
          reason: 'The pre-repair snapshot contained missing authenticated package roots',
          missingTargets: layout.pendingTargets,
        })
      }
      catch (error) {
        // A repair may replace an already broken managed dependency tree.
        // Retain that original snapshot for diagnosis without allowing its
        // missing link to invalidate the fully checked replacement candidate.
        if (metadata.operation !== 'offline-repair' || !['ENOENT', 'ELOOP'].includes(error.code)) throw error
        await atomic(join(backup, 'profile-archive-diagnostic.json'), { code: error.code, reason: 'The pre-repair snapshot already contained a missing dependency target' })
      }
      await renameProfile(candidate, active)
      await requireProfileLayout(active, candidate)
      await startHost()
      await atomic(journal, { state: completionState, backup, ...metadata })
      await recordPluginGeneration(metadata, backup)
      return { ...metadata, restarted: true, rollbackSupported: true }
    } catch (error) {
      const recoveryErrors = []
      let restored = !backedUp
      try {
        if (backedUp) {
          await stopHost()
          if (await exists(active)) await archiveProfileCandidate(home, active, 'failed')
          await renameProfile(backup, active)
          restored = true
          try { await requireProfileLayout(active, backup) }
          catch (layoutError) {
            // The original may already be broken. Restoring its evidence must
            // not replace the candidate health failure with a second ELOOP.
            if (metadata.operation !== 'offline-repair' || !['ENOENT', 'ELOOP'].includes(layoutError.code)) throw layoutError
            recoveryErrors.push({ phase: 'original-layout', code: layoutError.code, message: layoutError.message })
          }
        }
      } catch (rollbackError) { recoveryErrors.push({ phase: 'rollback', message: rollbackError.message }) }
      if (restored) try { await startHost() }
      catch (restartError) { recoveryErrors.push({ phase: 'original-host', message: restartError.message }) }
      await atomic(journal, { state: restored ? 'rolled-back' : 'rollback-failed', backup, ...metadata, error: error.message, recoveryErrors })
      throw error
    }
  }

  async function activatePackages(candidate, metadata, completionState) {
    await requireProfileLayout(candidate, candidate)
    const before = await json(join(active, 'package.json')), after = await json(join(candidate, 'package.json'))
    const ids = new Set(metadata.packageIds ?? [])
    if (!['enable', 'disable'].includes(metadata.operation)) {
      for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) for (const id of new Set([...Object.keys(before[field] ?? {}), ...Object.keys(after[field] ?? {})])) {
        if (before[field]?.[id] !== after[field]?.[id] || (await packageVersion(active, id))?.version !== (await packageVersion(candidate, id))?.version) ids.add(id)
      }
      for (const id of metadata.packages ?? []) if (/^(?:@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._-]+$/u.test(id)) ids.add(id)
    }
    const backup = join(root, 'history', 'zerowall-' + randomUUID())
    // Capture old entries while their physical paths exist, before journaling
    // activation. History may omit packages supplied by the shared runtime.
    const affectedIds = [...new Set([...ids, ...(metadata.packageId ? [metadata.packageId] : [])])]
    const previousEntries = await affectedPluginEntries(affectedIds, [active])
    // A snapshot supplies per-plugin rollback without moving the live profile.
    await copyProfileSkeleton(active, backup)
    const directory = join(backup, 'transaction')
    await mkdir(directory, { recursive: true })
    const state = { state: 'preparing', schema: 2, items: [], created: Date.now(), pid: process.pid }
    await atomic(join(directory, 'journal.json'), state)
    const record = { state: 'activating', backup, candidate, packageTransaction: true, ...metadata, ...(selectionBefore ? { selectionBefore } : {}) }
    await atomic(journal, record)
    const baseline = pendingActivationBaseline ?? await readHealth?.().catch(() => undefined)
    let committed = false
    try {
      await stopHost()
      await commitPackagePaths({ profile: active, candidate, directory, state, ids: [...ids], includeDependencyRoot: metadata.operation === 'offline-repair', replaceInstallSources: metadata.replaceInstallSources, historyPaths: metadata.historyPaths })
      committed = true
      // Initial desktop migration admits the core Host first. Optional bundles
      // activate in the background; explicit repair/update operations retain
      // their affected-plugin health gate and transaction rollback.
      await startHost(metadata.operation === 'offline-repair' && metadata.startup === true
        ? undefined : { baseline, ids: affectedIds, affectedEntries: [...previousEntries, ...await affectedPluginEntries(affectedIds, [active])] })
      // The global journal is the commit decision. Until it is durable recovery
      // restores exact paths, even if the process dies after health succeeds.
      await atomic(journal, { ...record, state: completionState })
      await atomic(join(directory, 'journal.json'), { ...state, state: 'complete' }).catch(() => {})
      let historyPending = false
      await recordPluginGeneration({ ...metadata, packageIds: [...ids] }, backup).catch(() => { historyPending = true })
      await discardProfileCandidate(home, candidate).catch(async error => {
        await atomic(join(root, 'profile-cleanup.json'), { pending: true, error: error.message }).catch(() => {})
      })
      return { ...metadata, restarted: true, rollbackSupported: !historyPending, ...(historyPending ? { historyPending } : {}) }
    } catch (error) {
      const recoveryErrors = []
      try {
        if (committed) await stopHost()
        if (state.state === 'committing') await restorePackagePaths(active, directory, state)
      } catch (failure) { recoveryErrors.push({ phase: 'rollback', message: failure.message }) }
      try { await startHost() } catch (failure) { recoveryErrors.push({ phase: 'original-host', message: failure.message }) }
      await atomic(journal, { ...record, state: recoveryErrors.some(item => item.phase === 'rollback') ? 'rollback-failed' : 'rolled-back', error: error.message, recoveryErrors })
      throw error
    }
  }

  async function affectedPluginEntries(ids, directories) {
    const entries = []
    const seen = new WeakSet()
    const collect = value => {
      if (!value || typeof value !== 'object' || seen.has(value)) return
      seen.add(value)
      if (typeof value.name === 'string') entries.push({ name: value.name, ...(typeof value.id === 'string' ? { id: value.id } : {}) })
      for (const child of Object.values(value)) if (child && typeof child === 'object') collect(child)
    }
    for (const directory of directories) for (const id of ids) {
      // The manifest and its patch must come from the same physical package.
      // A missing history entry may be supplied by the shared runtime; using
      // packageVersion's fallback with the history root produced ENOENT during
      // otherwise healthy batch commits.
      let root = join(directory, 'node_modules', id)
      let info = await json(join(root, 'package.json')).catch(error => { if (!['ENOENT', 'ENOTDIR', 'ELOOP'].includes(error.code)) throw error })
      if (!info && runtimeModules) {
        root = join(runtimeModules, pluginIdentity(id))
        info = await json(join(root, 'package.json')).catch(error => { if (error.code !== 'ENOENT') throw error })
      }
      const patches = info?.dsh?.bundle?.patch
      for (const file of typeof patches === 'string' ? [patches] : Array.isArray(patches) ? patches : []) {
        if (typeof file !== 'string' || relative(root, resolve(root, file)).startsWith('..') || isAbsolute(file)) throw new Error('Invalid plugin bundle patch path')
        collect(yaml.parse(await readFile(resolve(root, file), 'utf8')))
      }
    }
    return entries
  }

  async function requireProfileLayout(directory, from, pendingIds = [], pendingDependencyIds = []) {
    const result = await repairProfileLayout(directory, { from, home, diagnoseMissingTargets: true, pendingRoots: [
      ...pendingIds.map(id => packagePath(directory, id)),
      ...pendingDependencyIds.map(id => join(directory, 'node_modules/.zerowall-dependencies/node_modules', id)),
    ] })
    if (result.needsRelink) throw new Error('PROFILE_LAYOUT_RELINK_REQUIRED: use the plugin repair action with the bundled pnpm before activation')
    return result
  }

  async function mutate(args, acknowledgedDependents = []) {
    if (!Array.isArray(args) || !args.every(item => typeof item === 'string') || !['add', 'remove', 'update', 'install'].includes(args[0])) throw new Error('Invalid plugin mutation')
    if (args.slice(1).some(retiredPackageSelector)) throw new Error('Plugin has been retired')
    if (args[0] === 'remove' && (args.length !== 2 || !/^(?:@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._-]+$/u.test(args[1]))) throw new Error('Remove one plugin identity at a time')
    const generation = 'zerowall'
    const candidate = await prepareProfileCandidate(home)
    await mkdir(candidate, { recursive: true })
    const replacements = {}
    const repairedIds = await prepareMutationCandidate(candidate, replacements)
    if (['add', 'update', 'install'].includes(args[0])) for (const selector of args.slice(1)) {
      const selected = /^((?:@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._-]+)(?:@[^\s]+)?$/u.exec(selector)?.[1]
      if (selected) await archiveHistoricalPluginProvenance({ profile: candidate, id: selected })
    }
    await preparePackageInstall(candidate, replacements, { forPnpm: true })
    const manifest = await json(join(candidate, 'package.json'))
    if (args[0] === 'remove' && args[1]) {
      await archiveHistoricalPluginProvenance({ profile: candidate, id: args[1] })
      const selection = await readPluginSelection()
      const required = await dependents(args[1])
      if (required.some(name => !acknowledgedDependents.includes(name))) throw new Error('Plugin has active dependents; review them before removing')
      for (const name of required) selection.disabled.add(name)
      selection.removed.add(args[1])
      selection.disabled.delete(args[1])
      await writePluginSelection(selection)
    }
    if (args[0] === 'remove' && args.length === 2 && !manifest.dependencies?.[args[1]]) {
      manifest.dsh.profile.bundles = manifest.dsh.profile.bundles.filter(name => name !== args[1])
      const selection = await readPluginSelection()
      selection.removed.add(args[1])
      selection.disabled.delete(args[1])
      await writePluginSelection(selection)
      await atomic(join(candidate, 'package.json'), manifest)
      // Removing a selection with no dependency needs no resolver run.
    } else await runPlugin(args, generation)
    await normalizeComposition(candidate, args[0] === 'remove' ? args[1] : undefined)
    await requireProfileLayout(candidate, active)
    return activate(candidate, { operation: args[0], packages: args.slice(1), repairedIds })
  }

  async function rollback() {
    const previous = await json(journal)
    if (previous.state !== 'complete' || !await exists(previous.backup)) throw new Error('No previous plugin generation is available')
    const backup = ownedBackup(previous.backup), current = await json(join(active, 'package.json'))
    const selection = await readPluginSelection(), candidate = await prepareProfileCandidate(home)
    // Historical snapshots are retained verbatim. Re-admit a separate candidate
    // under today's retirement, signature and user-selection rules.
    await copyProfileSkeleton(backup, candidate, { filter: path => ![...selection.removed].some(id => path === 'node_modules/' + id) })
    const file = join(candidate, 'package.json'), manifest = await json(file)
    removeRetiredPlugins(manifest)
    for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
      for (const id of selection.removed) if (manifest[field]) delete manifest[field][id]
    }
    manifest.zerowall = { ...manifest.zerowall, pluginArchitecture: Math.max(7, manifest.zerowall?.pluginArchitecture ?? 0), profileLayout: PROFILE_LAYOUT, disabledPlugins: current.zerowall?.disabledPlugins ?? [] }
    await migrateOfflineProfileLinks(candidate, home, manifest, keys, target, local, runtimeModules)
    await verifyHistoricalPluginImports({ profile: candidate, keys, target, runtimeModules, local })
    if (await exists(join(candidate, materializationFile))) {
      const expected = defaultPlugins.filter(id => !selection.removed.has(id) && !selection.disabled.has(id) && manifest.dsh?.profile?.bundles?.includes(id))
      if (!await verifyMaterializedProfile({ profile: candidate, keys, target, expected, local, full: true })) throw new Error('PLUGIN_ROLLBACK_SIGNED_PROFILE_MISMATCH')
    }
    await atomic(file, manifest)
    await preparePackageInstall(candidate)
    await normalizeComposition(candidate)
    for (const [id, version] of Object.entries(selection.pinned)) {
      if (RETIRED_PLUGIN_IDS.has(id)) continue
      if ((await packageVersion(candidate, id))?.version !== version) throw new Error('PLUGIN_ROLLBACK_PIN_CONFLICT: ' + id + '@' + version)
    }
    const normalized = await json(file)
    for (const id of normalized.dsh?.profile?.bundles ?? []) {
      const item = await packageVersion(candidate, id)
      if (Object.keys({ ...item?.peerDependencies, ...item?.dependencies, ...item?.optionalDependencies }).some(name => RETIRED_PLUGIN_IDS.has(name))) throw new Error('PLUGIN_ROLLBACK_RETIRED_DEPENDENCY: ' + id)
    }
    await writePluginSelection(selection)
    await activate(candidate, { operation: 'rollback' }, 'rolled-back')
    return { rolledBack: true }
  }

  async function rollbackPlugin(id) {
    if (RETIRED_PLUGIN_IDS.has(id)) throw new Error('Plugin has been retired')
    if (typeof id !== 'string' || id.length === 0) throw new Error('Invalid plugin identity')
    const file = join(pluginStateRoot, encodeURIComponent(id), 'history.json')
    const history = await json(file).catch(error => {
      if (error.code === 'ENOENT') return { records: [] }
      throw error
    })
    const installed = await packageVersion(active, id)
    const records = (history.records ?? []).filter(record => record.id === id && record.profile && record.version && record.version !== installed?.version)
    let previous
    for (let index = records.length - 1; index >= 0; index -= 1) {
      if (await exists(records[index].profile)) { previous = records[index]; break }
    }
    if (!previous) throw new Error('No previous generation is available for this plugin')
    const candidate = await prepareProfileCandidate(home)
    await copyProfileSkeleton(active, candidate)
    // Rollback is a surgical profile change. Keep every other installed
    // package from the active generation so updating A cannot remove B.
    await requireProfileLayout(candidate, active)
    await restorePluginGeneration(candidate, previous.profile, previous.packageIds, id)
    await normalizeComposition(candidate)
    const manifest = await json(join(candidate, 'package.json'))
    const restoredIds = new Set(previous.packageIds ?? [id])
    for (const name of manifest.dsh?.profile?.bundles ?? []) {
      const item = await packageVersion(candidate, name)
      const currentConsumer = await packageVersion(active, name)
      for (const [dependency, range] of Object.entries(item?.dependencies ?? {})) {
        if (!restoredIds.has(dependency)) continue
        const restored = await packageVersion(candidate, dependency)
        const currentDependency = await packageVersion(active, dependency)
        // Transactions record the whole dependency closure, including unchanged
        // adapted packages. Only changed requirements/resolutions can introduce
        // a new conflict; retain the current generation's admitted relationships.
        if (restored && restored.version === currentDependency?.version && range === currentConsumer?.dependencies?.[dependency]) continue
        const reference = typeof range === 'string' && /^workspace:[~^]$/u.test(range)
          ? await packageVersion(restoredIds.has(name) ? previous.profile : active, dependency)
          : undefined
        if (!restored || !satisfiesInstalledPackageRange(restored.version, range, reference?.version)) throw new Error('PLUGIN_ROLLBACK_CONFLICT: ' + name + ' requires ' + dependency + '@' + range)
      }
    }
    return activate(candidate, { operation: 'rollback', packageId: id, version: previous.version, rollback: true, packageIds: previous.packageIds }, 'rolled-back')
  }

  async function resource(kind, id, source) {
    const document = await catalog(source ?? `${feedBase}/${kind}-latest.json`, { kind })
    const entry = document.resources.find(item => item.id === id && item.kind === kind)
    if (!entry) throw new Error('Resource is absent from the signed catalog')
    assertCompatible(entry, target)
    const file = await downloadResource(entry, join(root, 'downloads'), { local })
    if (kind === 'mcp') {
      if (entry.role === 'server-bundle') {
        if (entry.runtime !== 'node' || typeof entry.server?.serverName !== 'string') throw new Error('Unsupported MCP server bundle')
        const { extractBundle } = await import('./skill-archive.mjs')
        const folder = await extractBundle(file, join(root, 'mcp', encodeURIComponent(entry.id), entry.sha256), entry.entrypoint)
        const existing = (await callHost('mcp.list', [])).find(item => item.serverName === entry.server.serverName)
        const changes = { command: process.execPath, args: [join(folder, entry.entrypoint)] }
        let activated
        try {
          activated = existing
            ? await callHost('mcp.edit', [{ id: existing.id, changes }])
            : await callHost('mcp.add', [{ ...entry.server, transport: 'stdio', ...changes }])
          const id = existing?.id ?? activated.id
          if (existing?.enabled ?? entry.server.enabled) {
            const deadline = Date.now() + 30_000
            let ready = false
            while (Date.now() < deadline) {
              const status = (await callHost('mcp.list', [])).find(item => item.id === id)
              if (status?.runtimeState === 'active') { ready = true; break }
              if (status && ['error', 'blocked', 'disabled'].includes(status.runtimeState)) throw new Error('Updated MCP server failed activation')
              await new Promise(accept => setTimeout(accept, 250))
            }
            if (!ready) throw new Error('Updated MCP server activation timed out')
          }
          const currentFile = join(root, 'mcp', encodeURIComponent(entry.id), 'current.json')
          const oldReceipt = await json(currentFile).catch(() => undefined)
          const historyFile = join(root, 'mcp', encodeURIComponent(entry.id), 'history.json')
          const history = await json(historyFile).catch(() => ({ records: [] }))
          if (oldReceipt?.version) history.records = [...(history.records ?? []), { ...oldReceipt, command: oldReceipt.command ?? oldReceipt.previous?.command, args: oldReceipt.args ?? oldReceipt.previous?.args }].slice(-12)
          await atomic(historyFile, history)
          await atomic(currentFile, { id, version: entry.version, sha256: entry.sha256, folder, command: changes.command, args: changes.args, previous: existing ? { command: existing.command, args: existing.args } : undefined })
          return { id, version: entry.version, generation: entry.sha256, rollbackSupported: true }
        } catch (error) {
          if (existing) await callHost('mcp.edit', [{ id: existing.id, changes: { command: existing.command, args: existing.args } }])
          else if (activated?.id) await callHost('mcp.remove', [activated.id])
          throw error
        }
      }
      const template = await json(file)
      const existing = (await callHost('mcp.list', [])).find(item => item.serverName === template.serverName)
      return existing ? callHost('mcp.edit', [{ id: existing.id, changes: { ...template, enabled: existing.enabled } }]) : callHost('mcp.add', [template])
    }
    // Skills imports use an explicit folder; archive extraction is handled by
    // the archive validation worker, never by an arbitrary shell command.
    if (kind === 'skill') {
      const { extractSkill } = await import('./skill-archive.mjs')
      const folder = await extractSkill(file, join(root, 'skills', entry.sha256))
      // Upstream Skills do not consistently carry a ZeroWall version in their
      // frontmatter. Stamp the signed catalog version into the extracted copy
      // so later checks can distinguish an installed update from an old,
      // unversioned user import without changing the archive bytes.
      const skillFile = join(folder, 'SKILL.md')
      const markdown = await readFile(skillFile, 'utf8')
      const match = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n/u.exec(markdown)
      if (!match) throw new Error('Skill archive frontmatter is missing or cannot be versioned')
      const metadata = yaml.parse(match[1])
      if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw new Error('Invalid Skill metadata')
      metadata.metadata = { ...metadata.metadata, zerowall: { ...metadata.metadata?.zerowall, version: entry.version, source: 'catalog' } }
      const stamped = `---\n${yaml.stringify(metadata).trimEnd()}\n---\n${markdown.slice(match[0].length)}`
      await writeFile(skillFile, stamped, 'utf8')
      return callHost('skill.update', [{ sourcePath: folder }])
    }
    if (kind === 'python' && entry.role === 'dependency-manifest' && applyPython) return applyPython(entry, file)
    throw new Error('This Python resource requires the dedicated runtime updater')
  }
  async function update(kind, source) {
    const document = await catalog(source ?? `${feedBase}/${kind}-latest.json`, { kind })
    if (kind === 'plugin') {
      const manifest = await json(join(active, 'package.json'))
      const ids = [], skipped = []
      const choices = await readPluginSelection()
      for (const entry of document.resources.filter(item => item.kind === 'plugin' && manifest.dsh?.profile?.bundles?.includes(item.id))) {
        if (choices.pinned[entry.id]) { skipped.push({ id: entry.id, reason: 'Pinned version' }); continue }
        const conflict = Object.keys(entry.dependencies ?? {}).find(id => choices.pinned[id] && choices.pinned[id] !== document.resources.find(item => item.id === id)?.version)
        if (conflict) { skipped.push({ id: entry.id, reason: 'Dependency version is pinned: ' + conflict }); continue }
        const installed = await json(join(active, 'node_modules', entry.id, 'package.json')).catch(() => undefined)
        if (installed && compareVersions(entry.version, installed.version) <= 0) continue
        if (!installed && compareVersions(entry.version, '0.1.0') <= 0) continue
        ids.push(entry.id)
      }
      return ids.length ? { ...await selectionTransaction(() => pluginBatch(ids, source, document)), skipped } : { updated: 0, skipped }
    }
    const installed = kind === 'skill' ? await callHost('skill.list', []) : kind === 'mcp' ? await callHost('mcp.list', []) : []
    const names = new Set(installed.map(item => kind === 'mcp' ? item.serverName : item.name))
    const result = []
    for (const entry of document.resources.filter(item => item.kind === kind && names.has(item.server?.serverName ?? item.id))) result.push(await resource(kind, entry.id, source))
    return { updated: result.length, results: result }
  }

  async function catalogState(kind, source, options = {}) {
    if (!['plugin', 'skill', 'mcp'].includes(kind)) throw new Error('Unsupported resource kind')
    let document
    let catalogError
    let unpublished = false
    try {
      if (!options.localOnly) {
        document = await catalog(source ?? `${feedBase}/${kind}-latest.json`, { signal: options.signal, kind })
        await atomic(join(root, 'catalogs', kind + '-verified.json'), document)
      } else {
        const cached = await json(join(root, 'catalogs', kind + '-verified.json')).catch(error => { if (error.code !== 'ENOENT') throw error; return undefined })
        if (cached) document = verifyCatalog(cached, keys, { local })
      }
    }
    catch (error) { unpublished = error.status === 404; if (!unpublished) catalogError = error instanceof Error ? error.message : 'Catalog check failed' }
    const catalogStatus = options.localOnly ? 'local' : document ? 'checked' : unpublished ? 'unpublished' : 'unavailable'
    return { document, catalogStatus, catalogError }
  }

  async function check(kind, source, options = {}) {
    const { document, catalogStatus, catalogError } = options.catalogState ?? await catalogState(kind, source, options)
    const entries = document?.resources?.filter(item => item.kind === kind) ?? []
    if (kind === 'plugin') {
      const manifest = await json(join(active, 'package.json'))
      const selection = await readPluginSelection()
      for (const id of manifest.zerowall?.disabledPlugins ?? []) selection.disabled.add(id)
      const bundled = new Map(bundledPlugins.filter(item => item && typeof item.id === 'string').map(item => [item.id, item]))
      const builtInIds = new Set(bundled.keys())
      const runtimeIds = new Set(defaultPlugins)
      const ids = new Set([...entries.map(item => item.id), ...(manifest.dsh?.profile?.bundles ?? []), ...runtimeIds, ...builtInIds].filter(id => !RETIRED_PLUGIN_IDS.has(id)))
      const resources = []
      let health
      try { health = await hostRead('host.health', []) } catch { /* Keep package presence and activation separate when Host is unavailable. */ }
      const activated = new Map((health?.entries ?? []).map(entry => [entry.name, entry.state]))
      for (const id of ids) {
        const packaged = bundled.get(id)
        const installed = await packageVersion(active, id)
        const activeVersion = installed?.version
        const installedState = selection.removed.has(id) ? 'removed' : selection.disabled.has(id) ? 'disabled' : installed ? 'profile' : packaged?.core ? 'runtime' : builtInIds.has(id) ? 'bundled' : entries.some(item => item.id === id) && !runtimeIds.has(id) && !(manifest.dsh?.profile?.bundles ?? []).includes(id) ? 'catalog' : 'runtime'
        const catalogEntry = entries.find(item => item.id === id)
        const version = catalogEntry?.version ?? activeVersion ?? bundled.get(id)?.version ?? (installedState === 'runtime' ? 'core' : '—')
        const managed = packaged?.managed !== false && !packaged?.core && installedState !== 'runtime'
        const enabled = !selection.disabled.has(id) && !selection.removed.has(id) && (packaged?.core || packaged?.managed === false || (manifest.dsh?.profile?.bundles ?? []).includes(id))
        const present = Boolean(activeVersion)
        resources.push({ id, version: present || catalogEntry || packaged ? version : '—', installedVersion: activeVersion, updateAvailable: Boolean(catalogEntry && activeVersion && compareVersions(catalogEntry.version, activeVersion) > 0), source: !present && !catalogEntry ? 'profile' : installedState, catalogSigned: Boolean(catalogEntry), signed: Boolean(catalogEntry), restartRequired: catalogEntry?.restartRequired ?? true, rollbackSupported: Boolean((await json(join(pluginStateRoot, encodeURIComponent(id), 'history.json')).catch(() => undefined))?.records?.length), enabled: Boolean(enabled), managed, installState: present ? 'installed' : 'missing', activationState: !present ? 'missing' : enabled ? 'active' : 'disabled', pinnedVersion: selection.pinned[id], ...(selection.pinned[id] ? { updateBlocked: 'Pinned version' } : {}) })
      }
      for (const resource of resources) {
        if (resource.installState === 'missing' || !resource.enabled) continue
        resource.activationState = activated.get(resource.id) === 2 ? 'active' : activated.has(resource.id) ? 'error' : 'unavailable'
        const entry = entries.find(item => item.id === resource.id)
        const conflict = Object.keys(entry?.dependencies ?? {}).find(id => selection.pinned[id] && entries.find(item => item.id === id)?.version !== selection.pinned[id])
        if (conflict) resource.updateBlocked = 'Dependency version is pinned: ' + conflict
      }
      const bundles = [...ids].filter(id => !selection.removed.has(id))
      return { kind, checkedAt: new Date().toISOString(), bundles, dependencies: manifest.dependencies ?? {}, resources, catalogStatus, ...(catalogError ? { error: catalogError } : {}) }
    }
    // Core profiles may not have the optional Skills/MCP domain provider yet.
    // Catalog browsing must remain available so users can install it. Preserve
    // real Host/IPC errors; only the explicit absent-service response is empty.
    let installed = [], skillSources, domainAvailable = true
    try {
      if (kind === 'skill') [installed, skillSources] = await Promise.all([hostRead('skill.list', []), hostRead('skill.sources', [])])
      else installed = await hostRead('mcp.list', [])
    } catch (error) {
      if (!['Requested plugin service is unavailable', 'Host is not ready', 'Local resource service timed out', 'Plugin management timed out', 'Host restarted'].includes(error.message)) throw error
      domainAvailable = false
    }
    const local = await Promise.all(installed.map(async item => {
      const id = kind === 'mcp' ? item.serverName : item.name
      const userSkill = kind === 'skill' && Boolean(skillSources?.enabled?.includes(id) || skillSources?.disabled?.includes(id))
      let installedVersion
      if (userSkill && entries.some(record => record.id === id)) {
        installedVersion = (await hostRead('skill.get', [id])).declaredVersion
        // Disabled Skills have no registry definition. Read their preserved
        // metadata, which the older domain service omits from its detail DTO.
        if (!installedVersion && skillSources?.disabled?.includes(id)) {
          if (!/^[a-z0-9][a-z0-9-]{0,63}$/u.test(id)) throw new Error('Invalid Skill identity')
          const markdown = await readFile(join(home, 'zerowall-skills', 'disabled', id, 'SKILL.md'), 'utf8')
          const frontmatter = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n/u.exec(markdown)
          installedVersion = frontmatter ? yaml.parse(frontmatter[1])?.metadata?.zerowall?.version : undefined
        }
      } else if (kind === 'skill' && !userSkill) installedVersion = bundledSkillVersions[id]
      else if (kind === 'mcp') installedVersion = (await json(join(root, 'mcp', encodeURIComponent(id), 'current.json')).catch(() => undefined))?.version
      return { item, id, userSkill, installedVersion: typeof installedVersion === 'string' ? installedVersion : undefined }
    }))
    const resources = []
    for (const { item, id, userSkill, installedVersion } of local) {
      const entry = entries.find(record => (record.server?.serverName ?? record.id) === id)
      const updateAvailable = Boolean(entry && (kind === 'skill' && userSkill && !installedVersion || installedVersion && compareVersions(entry.version, installedVersion) > 0))
      resources.push({ id, actionId: kind === 'mcp' ? item.id : id, name: kind === 'mcp' ? item.name : id, version: entry?.version ?? installedVersion ?? '—', installedVersion, updateAvailable, source: kind === 'skill' && !userSkill ? 'bundled' : 'profile', signed: Boolean(entry), catalogSigned: Boolean(entry), restartRequired: entry?.restartRequired ?? kind === 'mcp', rollbackSupported: Boolean(entry?.rollbackSupported), enabled: kind === 'skill' ? !skillSources?.disabled?.includes(id) : item.enabled, managed: kind === 'mcp' || Boolean(userSkill), runtimeState: item.runtimeState })
    }
    for (const entry of entries) {
      const identity = entry.server?.serverName ?? entry.id
      if (resources.some(item => item.id === identity)) continue
      resources.push({ id: identity, version: entry.version, source: 'catalog', signed: true, catalogSigned: true, restartRequired: entry.restartRequired, rollbackSupported: entry.rollbackSupported })
    }
    return { kind, checkedAt: new Date().toISOString(), resources: !domainAvailable && localSnapshots.has(kind) ? localSnapshots.get(kind).resources : resources, catalogStatus, domainAvailable, ...(catalogError ? { error: catalogError } : {}) }
  }
  async function rollbackMcp(id) {
    if (!/^[a-zA-Z0-9._-]{1,100}$/.test(id) || id === '.' || id === '..') throw new Error('Invalid MCP resource identity')
    const file = join(root, 'mcp', encodeURIComponent(id), 'current.json')
    const historyFile = join(root, 'mcp', encodeURIComponent(id), 'history.json')
    const current = await json(file)
    const history = await json(historyFile).catch(() => ({ records: [] }))
    const previous = (history.records ?? []).at(-1) ?? (current.previous ? { ...current, ...current.previous } : undefined)
    if (!previous?.previous && !previous?.command) throw new Error('No previous MCP generation is available')
    const changes = previous.command ? { command: previous.command, args: previous.args } : previous.previous
    await callHost('mcp.edit', [{ id: current.id, changes }])
    history.records = (history.records ?? []).slice(0, -1)
    await atomic(historyFile, history)
    await atomic(file, { ...current, version: previous.version, sha256: previous.sha256, folder: previous.folder, previous: undefined, rolledBack: true })
    return { id: current.id, version: previous.version, rolledBack: true }
  }
  // Network checks must not hold the profile transaction queue. Read local
  // state under the lock only after catalog verification has finished.
  const reads = new Map()
  const checkResources = (kind, source, options = {}) => {
    if (!['plugin', 'skill', 'mcp'].includes(kind)) return Promise.reject(new Error('Invalid resource kind'))
    const identity = JSON.stringify([kind, source, Boolean(options.localOnly)])
    if (reads.has(identity)) return reads.get(identity)
    const signal = AbortSignal.timeout(options.localOnly ? 4900 : 14500)
    const run = async () => {
      const state = await catalogState(kind, source, { ...options, signal })
      const result = await check(kind, source, { catalogState: state })
      if (signal.aborted) throw new Error('Resource request timed out')
      if (result.domainAvailable !== false) localSnapshots.set(kind, result)
      return result
    }
    let timer
    const pending = Promise.race([run(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Resource request timed out')), options.localOnly ? 4900 : 14500) })]).finally(() => { clearTimeout(timer); reads.delete(identity) })
    reads.set(identity, pending)
    return pending
  }
  const operations = { mutate, setPluginEnabled, rollbackPlugin, plugin, repairPlugin, updatePlugins: (ids, source) => pluginBatch(ids, source), update, rollback }
  const pendingAction = (method, args, task) => exclusive(async () => {
    try { return await selectionTransaction(task ?? (() => operations[method](...args))) }
    catch (error) { if (!targetLocked(error)) throw error; return enqueuePendingPlugin(home, { method, args }) }
  })
  const resumePending = id => exclusive(async () => {
    const record = await readPendingPlugin(home, id)
    if (record.state !== 'pending-restart' || !Object.hasOwn(operations, record.intent?.method) || !Array.isArray(record.intent.args)) throw new Error('Pending operation cannot be resumed')
    // Own the mutation lease before stopping the Host, and preserve its health
    // baseline across the explicit restart. Other queued operations keep their
    // Host until this retry has exclusive access to the profile.
    const baseline = await readHealth?.().catch(() => undefined)
    pendingActivationBaseline = baseline
    try {
      let result
      try {
        await stopHost()
        result = await selectionTransaction(() => operations[record.intent.method](...record.intent.args))
      } finally {
        if (hostNeedsRestart) await startHost({ baseline })
      }
      await writePendingPlugin(home, { ...record, state: 'complete', completedAt: new Date().toISOString() })
      return result
    } catch (error) { if (targetLocked(error)) return { pendingRestart: true, pendingId: id, reason: '目标文件仍被其他进程占用，请关闭占用程序后重试。' }; throw error }
    finally { pendingActivationBaseline = undefined }
  })
  const cancelPending = id => exclusive(async () => {
    const record = await readPendingPlugin(home, id)
    if (record.state !== 'pending-restart') throw new Error('Pending operation is already settled')
    await writePendingPlugin(home, { ...record, state: 'cancelled' })
    return { cancelled: true }
  })
  return { recover: () => exclusive(recover), inspectStartupProfile, repairOffline: (source, options) => exclusive(() => repairOffline(source, options)), catalog, check: checkResources, list: kind => checkResources(kind, undefined, { localOnly: true }), dependents, pinPlugin: (id, pinned) => exclusive(() => pinPlugin(id, pinned)), rollbackMcp: id => exclusive(() => rollbackMcp(id)), rollbackPlugin: id => pendingAction('rollbackPlugin', [id]), setPluginEnabled: (id, enabled, dependents = []) => pendingAction('setPluginEnabled', [id, enabled, dependents]), mutate: (args, dependents = []) => pendingAction('mutate', [args, dependents]), updatePlugins: (ids, source, options) => pendingAction('updatePlugins', [ids, source], () => pluginBatch(ids, source, undefined, options)), plugin: (id, source) => pendingAction('plugin', [id, source]), repairPlugin: (id, source) => pendingAction('repairPlugin', [id, source]), rollback: () => pendingAction('rollback', []), update: (kind, source) => pendingAction('update', [kind, source]), resource: (kind, id, source) => exclusive(() => resource(kind, id, source)), resumePending, cancelPending, pending: () => listPendingPlugins(home) }
}
