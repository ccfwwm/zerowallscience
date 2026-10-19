import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, readlink, realpath, rename, symlink, unlink, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { assertCompatible, compareVersions, fileDigest } from './resource-catalog.mjs'
import { carrierIndex, carrierName, offlineContentDigest } from './offline-carrier.mjs'
import { physicalFs } from './physical-fs.mjs'
import { repairProfileLayout } from './profile-layout.mjs'
import { renameProfile } from './profile-rename.mjs'
import { bounded, copyProfileTree } from './profile-copy.mjs'
import { scanProfileLinks } from './profile-link-scan.mjs'
import { RETIRED_PLUGIN_IDS, removeRetiredPlugins, removeRetiredPatch, removeRetiredResolutionRules } from './retired-plugins.mjs'
import { PROFILE_LAYOUT, materializationFile, materializeOfflinePackages, preserveMaterializedDependencies, verifyMaterializedProfile } from './profile-materialization.mjs'
import { importHistoricalPlugin, verifyHistoricalPluginImports } from './historical-plugin.mjs'
import { verifyPluginDocument } from './plugin-verification.mjs'
const { copyFile, lstat, readdir } = physicalFs.promises

/** Keep one staging name. Preserve displaced candidates and diagnostic data
 * in managed history instead of merging trees or discarding rollback data. */
export async function archiveProfileCandidate(home, directory, kind = 'candidate') {
  const profiles = resolve(home, 'profiles')
  const name = relative(profiles, resolve(directory))
  if (!['web', 'zerowall'].includes(name)) throw new Error('Invalid managed profile candidate')
  const info = await lstat(directory).catch(error => { if (error.code !== 'ENOENT') throw error })
  if (!info) return undefined
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Managed profile candidate must be a physical directory')
  const destination = join(home, 'resources/history', kind + '-' + randomUUID())
  await mkdir(dirname(destination), { recursive: true })
  await renameProfile(directory, destination)
  // Rebase internal links where possible; failed preparation may have an
  // incomplete tree, which is retained for diagnostics rather than activated.
  try { await repairProfileLayout(destination, { from: directory, home }) }
  catch (error) { await writeFile(join(destination, 'profile-archive-diagnostic.json'), JSON.stringify({ error: String(error) })) }
  return destination
}

export async function prepareProfileCandidate(home) {
  const candidate = join(home, 'profiles/zerowall')
  await archiveProfileCandidate(home, candidate)
  return candidate
}

export function pluginIdentity(id) {
  if (typeof id !== 'string' || !/^(?:@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._-]+$/u.test(id) || id.split('/').some(part => part === '.' || part === '..')) throw new Error('Invalid plugin identity')
  return id
}

export class OfflineProfileVerificationError extends Error {
  constructor(message, diagnostics = {}) {
    super(message)
    this.name = 'OfflineProfileVerificationError'
    this.code = 'OFFLINE_PROFILE_MISMATCH'
    this.diagnostics = diagnostics
  }
}

function mismatch(message, receipt, diagnostics = {}) {
  return new OfflineProfileVerificationError(message, {
    applicationVersion: receipt.applicationVersion,
    buildId: receipt.buildId,
    contentDigest: receipt.contentDigest,
    ...diagnostics,
  })
}

function compareEntries(actual, expected, hashes = true) {
  const actualByPath = new Map(actual.map(entry => [entry.path, entry]))
  const expectedByPath = new Map(expected.map(entry => [entry.path, entry]))
  const extraFiles = actual.filter(entry => !expectedByPath.has(entry.path)).map(entry => entry.path)
  const missingFiles = expected.filter(entry => !actualByPath.has(entry.path)).map(entry => entry.path)
  const sizeMismatches = [], hashMismatches = []
  for (const entry of actual) {
    const wanted = expectedByPath.get(entry.path)
    if (!wanted) continue
    if (entry.size !== wanted.size) sizeMismatches.push({ path: entry.path, expected: wanted.size, actual: entry.size })
    if (hashes && entry.sha256 !== wanted.sha256) hashMismatches.push({ path: entry.path, expected: wanted.sha256, actual: entry.sha256 })
  }
  return { extraFiles, missingFiles, sizeMismatches, hashMismatches }
}
function inside(root, path) {
  const rel = relative(root, path)
  if (!rel || rel === '..' || rel.startsWith('..\\') || rel.startsWith('../') || isAbsolute(rel)) throw new Error('Offline path escapes its signed root')
}
export async function offlineFiles(root, prefix = '') {
  const entries = []
  async function collect(directory, namePrefix) {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(directory, entry.name), name = namePrefix + entry.name
      if (entry.isSymbolicLink()) throw new Error('Offline closure contains a link')
      if (entry.isDirectory()) {
        if ((await lstat(path)).isSymbolicLink()) throw new Error('Offline closure contains a link')
        await collect(path, name + '/')
      } else if (entry.isFile()) entries.push({ path, name })
      else throw new Error('Offline closure contains a special file')
    }
  }
  await collect(root, prefix)
  const files = new Array(entries.length)
  await concurrentFiles(entries, async ({ path, name }, index) => {
    const info = await lstat(path)
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('Offline closure contains a link or special file')
    files[index] = { path: name, size: info.size, sha256: await fileDigest(path) }
  })
  return files
}

// Bound disk operations instead of opening thousands of handles or performing
// one Windows filesystem round trip at a time. Wait for every worker on error.
async function concurrentFiles(entries, task) {
  let next = 0
  const results = await Promise.allSettled(Array.from({ length: Math.min(16, entries.length) }, async () => {
    while (next < entries.length) { const index = next++; await task(entries[index], index) }
  }))
  const failure = results.find(result => result.status === 'rejected')
  if (failure) throw failure.reason
}

async function copySignedModules(source, destination, files) {
  const directories = new Map()
  await concurrentFiles(files.filter(entry => entry.path.startsWith('modules/')), async entry => {
    const path = join(destination, entry.path.slice('modules/'.length))
    const parent = dirname(path)
    if (!directories.has(parent)) directories.set(parent, mkdir(parent, { recursive: true }))
    await directories.get(parent)
    await copyFile(join(source, entry.path), path)
    // Only verified complete bytes can become the active immutable cache.
    const info = await lstat(path)
    if (info.size !== entry.size || await fileDigest(path) !== entry.sha256) throw new Error('Copied offline module differs from its signed receipt')
  })
}
export async function readOfflineReceipt(source, keys, target, { local = false, generation = false } = {}) {
  const text = await readFile(join(source, 'receipt.json'), 'utf8')
  const receipt = verifyPluginDocument(JSON.parse(text), keys, target)
  if (![1, 2].includes(receipt.schema) || receipt.kind !== 'offline-profile' || receipt.profileArchitecture !== 7 || !Array.isArray(receipt.files) || !Array.isArray(receipt.plugins) || !Array.isArray(receipt.defaultPatch)) throw new Error('Invalid offline profile receipt')
  if (receipt.localOnly && !local) throw new Error('Development offline profile cannot enter a stable installation')
  if ((!generation && receipt.schema === 1 && receipt.applicationVersion !== target.desktopVersion) || receipt.dshCommit !== target.dshCommit) throw mismatch('Offline profile does not match this Desktop/DSH build', receipt, {
    source, generation, expectedDesktopVersion: target.desktopVersion, expectedDshCommit: target.dshCommit, receiptDshCommit: receipt.dshCommit,
  })
  // A historical generation may have been published by an older desktop,
  // but only its original signed range can admit this actual runtime.
  assertCompatible(receipt, target)
  const paths = new Set()
  for (const entry of [...receipt.files, ...(receipt.payloadFiles ?? [])]) {
    if (typeof entry.path !== 'string' || entry.path.includes('\\') || entry.path.split('/').some(part => !part || part === '.' || part === '..') || isAbsolute(entry.path) || !/^[a-f0-9]{64}$/u.test(entry.sha256) || !Number.isSafeInteger(entry.size) || entry.size < 0 || paths.has(entry.path)) throw new Error('Invalid signed offline file')
    paths.add(entry.path)
    inside(resolve(source), resolve(source, entry.path))
  }
  if (receipt.schema === 2 && (!Array.isArray(receipt.payloadFiles) || receipt.contentDigest !== offlineContentDigest(receipt) || !receipt.payloadFiles.some(entry => entry.path === carrierName) || receipt.files.some(entry => !entry.path.startsWith('modules/')))) throw new Error('Invalid offline content identity')
  const identities = new Set()
  for (const entry of receipt.plugins) {
    pluginIdentity(entry.id)
    if (identities.has(entry.id) || typeof entry.version !== 'string' || !/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/u.test(entry.version)) throw new Error('Invalid or duplicate signed offline plugin')
    identities.add(entry.id)
  }
  for (const row of receipt.defaultPatch) if (!row || typeof row.id !== 'string' || typeof row.config !== 'object') throw new Error('Invalid signed offline default configuration')
  return { receipt, digest: receipt.schema === 2 ? receipt.contentDigest : createHash('sha256').update(text).digest('hex') }
}

export async function verifyOfflineProfile(source, keys, target, { local = false, staging = false } = {}) {
  const verified = await readOfflineReceipt(source, keys, target, { local })
  const { receipt } = verified
  if (receipt.schema === 1) {
    const actual = (await offlineFiles(source)).filter(entry => entry.path !== 'receipt.json').sort((a, b) => a.path.localeCompare(b.path))
    const differences = compareEntries(actual, receipt.files)
    if (differences.extraFiles.length || differences.missingFiles.length || differences.sizeMismatches.length || differences.hashMismatches.length) throw mismatch('Offline profile size, SHA-256 or file set mismatch', receipt, differences)
  } else {
    const actual = []
    const payloadTasks = []
    for (const entry of await readdir(source, { withFileTypes: true })) {
      if (entry.name === 'receipt.json' || staging && ['modules', 'build-receipt.json'].includes(entry.name)) continue
      if (entry.name === carrierName && entry.isFile()) payloadTasks.push((async () => [{ path: entry.name, size: (await lstat(join(source, entry.name))).size, sha256: await fileDigest(join(source, entry.name)) }])())
      else if (entry.name === carrierName + '.unpacked' && entry.isDirectory() && !(await lstat(join(source, entry.name))).isSymbolicLink()) payloadTasks.push(offlineFiles(join(source, entry.name), entry.name + '/'))
      else throw mismatch('Offline profile file set mismatch', receipt, { extraFiles: [entry.name], missingFiles: [] })
    }
    const payloadResults = await Promise.allSettled(payloadTasks)
    for (const result of payloadResults) {
      if (result.status === 'rejected') throw result.reason
      actual.push(...result.value)
    }
    actual.sort((a, b) => a.path.localeCompare(b.path))
    const differences = compareEntries(actual, receipt.payloadFiles)
    if (differences.extraFiles.length || differences.missingFiles.length || differences.sizeMismatches.length || differences.hashMismatches.length) throw mismatch('Offline profile size, SHA-256 or file set mismatch', receipt, differences)
    const logical = (await carrierIndex(source)).rows.map(({ path, size, sha256 }) => ({ path: path.replace(/^node_modules\//u, 'modules/'), size, sha256 })).sort((a, b) => a.path.localeCompare(b.path))
    const logicalDifferences = compareEntries(logical, receipt.files)
    if (logicalDifferences.extraFiles.length || logicalDifferences.missingFiles.length || logicalDifferences.sizeMismatches.length || logicalDifferences.hashMismatches.length) throw mismatch('Offline archive logical file set mismatch', receipt, { logicalArchiveMismatch: logicalDifferences })
  }
  return verified
}

async function assertCarrierSourceFiles(source, receipt, staging) {
  const expected = new Map(receipt.payloadFiles.map(entry => [entry.path, entry]))
  const actual = []
  async function collect(directory, prefix = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!prefix && (entry.name === 'receipt.json' || staging && ['modules', 'build-receipt.json'].includes(entry.name))) continue
      const path = join(directory, entry.name), name = prefix + entry.name
      if (entry.isSymbolicLink()) throw new Error('Offline closure contains a link')
      if (entry.isDirectory()) await collect(path, name + '/')
      else if (entry.isFile()) actual.push({ path, name })
      else throw mismatch('Offline profile file set mismatch', receipt, { extraFiles: [name], missingFiles: [] })
    }
  }
  await collect(source)
  const actualEntries = []
  await concurrentFiles(actual, async ({ path, name }, index) => {
    const info = await lstat(path)
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('Offline closure contains a link or special file')
    actualEntries[index] = { path: name, size: info.size }
  })
  const differences = compareEntries(actualEntries, [...expected.values()], false)
  if (differences.extraFiles.length || differences.missingFiles.length || differences.sizeMismatches.length) throw mismatch('Offline profile file set mismatch (size mismatch included)', receipt, differences)
}

export function generationModules(cache, receipt) {
  return join(cache, receipt.schema === 2 ? carrierName + '.unpacked/node_modules' : 'node_modules')
}

/** Ordinary launch authenticates the receipt and required entrypoints only.
 * Full content verification happens before atomic generation commit. */
export function profileCarrier(profile, digest) {
  if (!/^[a-f0-9]{64}$/u.test(digest ?? '')) throw new Error('Invalid profile carrier identity')
  return join(profile, 'node_modules/.zerowall-carriers', digest)
}

export async function verifiedGeneration(home, digest, keys, target, ids, { local = false, directory } = {}) {
  if (!/^[a-f0-9]{64}$/u.test(digest ?? '')) return undefined
  const cache = directory ?? join(home, 'resources/offline', digest)
  try {
    const verified = await readOfflineReceipt(cache, keys, target, { local, generation: true })
    if (verified.digest !== digest) return undefined
    const receipt = verified.receipt, modules = generationModules(cache, receipt)
    if (receipt.schema === 2) {
      const marker = JSON.parse(await readFile(join(cache, 'verified.json'), 'utf8'))
      if (marker.contentDigest !== digest) return undefined
      for (const entry of receipt.payloadFiles.filter(entry => entry.path === carrierName)) {
        const info = await lstat(join(cache, entry.path))
        if (!info.isFile() || info.isSymbolicLink() || info.size !== entry.size || info.mtimeMs !== marker.archiveMtimeMs) return undefined
      }
    }
    const files = new Map(receipt.files.map(entry => [entry.path, entry]))
    for (const id of ids) {
      const record = receipt.plugins.find(entry => entry.id === id)
      if (record?.core) continue
      const manifestPath = join(modules, pluginIdentity(id), 'package.json')
      const bytes = await readFile(manifestPath), manifest = JSON.parse(bytes)
      if (!record || manifest.name !== id || manifest.version !== record.version) return undefined
      if (manifest.zerowall?.desktop) assertCompatible({ ...receipt, desktopRange: manifest.zerowall.desktop }, target)
      const exported = Object.values(manifest.exports ?? {}).map(entry => typeof entry === 'string' ? entry : entry?.default).filter(entry => typeof entry === 'string' && !entry.includes('*') && !entry.endsWith('.ts'))
      const entryPaths = [...new Set(['package.json', manifest.main, manifest.dsh?.bundle?.patch, ...exported, ...(manifest.zerowall?.runtimeFiles ?? [])].filter(entry => typeof entry === 'string').map(entry => entry.replace(/^\.\//u, '')))]
      for (const entry of entryPaths) {
        const signed = files.get('modules/' + id + '/' + entry)
        if (!signed || await fileDigest(join(modules, id, entry)) !== signed.sha256) return undefined
      }
    }
    return { ...verified, cache, modules }
  } catch {
    // A damaged local cache is never trusted. The signed installer source is
    // fully verified before repairing it, including when this receipt fails.
    return undefined
  }
}

/** Profile-owned, independent bytes. Offline storage supplies repairs only. */
export async function materializeProfileCarrier(profile, source, digest, receipt, keys, target, local) {
  const destination = profileCarrier(profile, digest)
  const ids = receipt.plugins.filter(entry => !entry.core && !RETIRED_PLUGIN_IDS.has(entry.id)).map(entry => entry.id)
  if (await verifiedGeneration('', digest, keys, target, ids, { local, directory: destination })) return destination
  if (await lstat(destination).catch(() => undefined)) await rename(destination, destination + '.damaged-' + randomUUID())
  await mkdir(destination, { recursive: true })
  if (receipt.schema === 1) {
    // A legacy generation is immutable signed supply, not an active profile.
    // Preserve every receipt byte, including retired packages and asset names
    // resembling old shadows; only active links/declarations are retired.
    await bounded(receipt.files, async entry => {
      const localPath = entry.path.replace(/^modules\//u, 'node_modules/'), path = join(destination, localPath)
      await mkdir(dirname(path), { recursive: true })
      await copyFile(join(source, localPath), path)
      if ((await lstat(path)).size !== entry.size || await fileDigest(path) !== entry.sha256) throw new Error('Copied profile module differs from signed receipt')
    })
  }
  else await bounded(receipt.payloadFiles, async entry => {
    const path = join(destination, entry.path)
    await mkdir(dirname(path), { recursive: true })
    await copyFile(join(source, entry.path), path)
  })
  await writeFile(join(destination, 'receipt.json'), JSON.stringify(receipt))
  if (receipt.schema === 2) await verifyOfflineProfile(destination, keys, target, { local })
  if (receipt.schema === 2) await writeFile(join(destination, 'verified.json'), JSON.stringify({ contentDigest: digest, archiveMtimeMs: (await lstat(join(destination, carrierName))).mtimeMs }))
  return destination
}

export async function migrateOfflineProfileLinks(profile, home, manifest, keys, target, local, runtimeModules) {
  const imported = new Map()
  async function replacePath(path, id) {
    const normalized = path.replaceAll('\\', '/')
    const match = /^(.*\/(?:resources\/offline|node_modules\/\.zerowall-carriers))\/([a-f0-9]{64})\/(?:profile-runtime\.asar(?:\.unpacked)?\/node_modules|node_modules)\/(.+)$/u.exec(normalized)
    if (!match) return path
    const source = resolve(match[1], match[2]), digest = match[2]
    const child = relative(resolve(home), source)
    if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('Historical plugin source is outside managed storage')
    if (!imported.has(id)) {
      const promise = importHistoricalPlugin({ profile, source, digest, id, keys, target, runtimeModules, local })
      imported.set(id, promise)
    }
    return (await imported.get(id)).path
  }
  const modules = join(profile, 'node_modules')
  // Historical profiles may legitimately have no dependencies. Only absence
  // of this root is empty; failures encountered inside an existing tree fail.
  const modulesInfo = await lstat(modules).catch(error => { if (error.code !== 'ENOENT') throw error })
  let level = modulesInfo ? [modules] : []
  while (level.length) {
    const next = []
    await bounded(level, async directory => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name)
        if (entry.name === '.zerowall-carriers') continue
        if (entry.isSymbolicLink()) {
          const original = resolve(dirname(path), await readlink(path))
          const id = relative(modules, path).replaceAll('\\', '/')
          // Only root package entries are imported. Their private dependency
          // closure is reconstructed by the signed single-package importer.
          if (/^(?:@[^/]+\/)?[^/]+$/u.test(id)) await replacePath(original, id)
          else if (/\/(?:resources\/offline|\.zerowall-carriers)\//u.test(original.replaceAll('\\', '/'))) throw new Error('Nested offline dependency requires a verified plugin import')
        } else if (entry.isDirectory()) next.push(path)
      }
    })
    level = next
  }
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    for (const [id, spec] of Object.entries(manifest[field] ?? {})) {
      if (!/^(file|link):/u.test(spec)) continue
      const original = resolve(profile, spec.slice(5)), replacement = imported.has(id) ? (await imported.get(id)).path : await replacePath(original, id)
      if (replacement !== original || imported.has(id)) manifest[field][id] = 'link:./' + relative(profile, replacement).replaceAll('\\', '/')
    }
  }
  const oldCarriers = join(profile, 'node_modules/.zerowall-carriers')
  if (await lstat(oldCarriers).catch(() => undefined)) {
    const history = join(home, 'resources/history', 'legacy-carriers-' + randomUUID())
    await mkdir(dirname(history), { recursive: true }); await rename(oldCarriers, history)
  }
}

/** A manual rollback is an explicit install action. Authenticate every copied
 * carrier before activation, without modifying its historical source. */
export async function verifyProfileCarriers(profile, keys, target, { local = false } = {}) {
  const root = join(profile, 'node_modules/.zerowall-carriers')
  const entries = await readdir(root, { withFileTypes: true }).catch(error => { if (error.code !== 'ENOENT') throw error; return [] })
  for (const entry of entries) {
    if (!/^[a-f0-9]{64}$/u.test(entry.name)) continue
    if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error('Rollback carrier must be a physical directory')
    const directory = join(root, entry.name), verified = await readOfflineReceipt(directory, keys, target, { local, generation: true })
    if (verified.digest !== entry.name) throw new Error('Rollback carrier identity mismatch')
    const { receipt } = verified
    const actual = (await offlineFiles(directory)).filter(file => !['receipt.json', 'verified.json'].includes(file.path))
      .map(file => receipt.schema === 1 ? { ...file, path: file.path.replace(/^node_modules\//u, 'modules/') } : file)
    const differences = compareEntries(actual, receipt.schema === 2 ? receipt.payloadFiles : receipt.files)
    if (Object.values(differences).some(items => items.length)) throw mismatch('Rollback carrier size, SHA-256 or file set mismatch', receipt, differences)
    if (receipt.schema === 2) await writeFile(join(directory, 'verified.json'), JSON.stringify({ contentDigest: verified.digest, archiveMtimeMs: (await lstat(join(directory, carrierName))).mtimeMs }))
  }
}

/** Install authenticated supply bytes directly into a profile candidate. */
export async function prepareOfflineCandidate({ home, source, keys, target, defaults, bundledPlugins = [], yaml, runtimeModules, local = false, staging = false, repairOnly = false, onPhase = () => {} }) {
  let started = Date.now()
  const metadata = await readOfflineReceipt(source, keys, target, { local })
  const { receipt, digest } = metadata
  onPhase({ phase: 'offline-verify', state: 'started' })
  if (receipt.schema === 1) await verifyOfflineProfile(source, keys, target, { local, staging })
  else await assertCarrierSourceFiles(source, receipt, staging)
  onPhase({ phase: 'offline-verify', state: 'complete', durationMs: Date.now() - started })
  started = Date.now()
  onPhase({ phase: 'profile-prepare', state: 'started' })
  const active = join(home, 'profiles/web')
  const damagedLinks = await scanProfileLinks(active)
  const manifest = JSON.parse(await readFile(join(active, 'package.json'), 'utf8'))
  const selection = JSON.parse(await readFile(join(home, 'resources/plugins/selection.json'), 'utf8').catch(error => { if (error.code !== 'ENOENT') throw error; return '{}' }))
  const disabled = new Set([...(selection.disabled ?? []), ...(manifest.zerowall?.disabledPlugins ?? [])])
  const removed = new Set(selection.removed ?? [])
  const pins = selection.pinned ?? {}
  const packages = new Map(receipt.plugins.map(entry => [entry.id, entry]))
  // A desktop upgrade owns the managed packages declared by its bundled
  // inventory. Rebuild those roots from this installer's signed closure so a
  // previous desktop/DSH generation cannot remain active through a link or a
  // historical provenance receipt. Packages outside this set are user-owned
  // and remain untouched (for example dsh-context).
  const bundledManagedIds = new Set(bundledPlugins
    .filter(item => item && item.managed !== false && !item.core)
    .map(item => item.id))
  const oldMaterialization = await readFile(join(active, materializationFile), 'utf8').then(JSON.parse).catch(error => { if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error; return {} })
  // Supporting packages are not DSH bundles, but previously imported managed
  // roots still need the current installer's compatible bytes and provenance.
  // Otherwise an old exact-runtime receipt survives a desktop/DSH upgrade.
  const installationIds = new Set(defaults)
  for (const record of receipt.plugins) {
    if (record.core || record.managed === false || !bundledPlugins.some(item => item.id === record.id && item.managed !== false && !item.core)) continue
    const id = pluginIdentity(record.id)
    if (oldMaterialization.ids?.includes(id)
      || ['dependencies', 'devDependencies', 'optionalDependencies'].some(field => Object.hasOwn(manifest[field] ?? {}, id))
      || await lstat(join(active, 'node_modules', id)).catch(error => { if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error })
      || await lstat(join(active, '.zerowall/plugin-imports', encodeURIComponent(id) + '.json')).catch(error => { if (error.code !== 'ENOENT') throw error })) installationIds.add(id)
  }
  const installedPackages = new Map(), replacing = new Set()
  for (const id of installationIds) {
    pluginIdentity(id)
    if (removed.has(id) || (!repairOnly && disabled.has(id)) || RETIRED_PLUGIN_IDS.has(id)) continue
    const record = packages.get(id)
    if (!record) throw new Error('Default plugin absent from signed offline closure: ' + id)
    const installed = await readFile(join(active, 'node_modules', id, 'package.json'), 'utf8').then(JSON.parse).catch(error => { if (!['ENOENT', 'ENOTDIR', 'ELOOP'].includes(error.code)) throw error })
    installedPackages.set(id, installed)
    if (record.core) continue
    if (pins[id] && installed?.version === pins[id]) {
      // A pin protects the selected version, not damaged bytes. The installer
      // may restore that exact immutable version without consulting old supply.
      if (record.version === pins[id] && !await verifyMaterializedProfile({ profile: active, keys, target, expected: [id], local })) replacing.add(id)
      continue
    }
    const root = installed && await realpath(join(active, 'node_modules', id)).catch(() => undefined)
    const owned = oldMaterialization.ids?.includes(id) || root && [join(home, 'resources/offline'), join(active, 'node_modules/.zerowall-carriers')].some(base => !relative(base, root).startsWith('..') && !isAbsolute(relative(base, root)))
    const managed = bundledManagedIds.has(id)
    const declared = ['dependencies', 'devDependencies', 'optionalDependencies']
      .some(field => Object.hasOwn(manifest[field] ?? {}, id))
    const provenance = await lstat(join(active, '.zerowall/plugin-imports', encodeURIComponent(id) + '.json'))
      .catch(error => { if (error.code !== 'ENOENT') throw error })
    if (installed && !owned && !provenance && compareVersions(installed.version, record.version) > 0
      && damagedLinks.some(link => link.path.startsWith('node_modules/' + id + '/'))) {
      throw new Error('Nested offline dependency requires a verified plugin import: ' + id + '@' + installed.version + '; exact trusted recovery source is unavailable')
    }
    // A declared managed package belongs to the desktop profile even when its
    // version happens to be newer than the bundled record. Keeping that tree
    // would also keep its old exact-runtime receipt and reproduce the startup
    // failure. An undeclared newer package is an independent user install and
    // is deliberately preserved.
    if (!installed || owned || provenance || managed && (declared || compareVersions(installed.version, record.version) <= 0)) replacing.add(id)
  }
  const candidate = await prepareProfileCandidate(home)
  // Supplied replacements are installed once. A broken old entry or missing
  // old offline directory cannot block an installer that already owns its bytes.
  await copyProfileTree(active, candidate, { filter: path => ![...replacing].some(id => path === 'node_modules/' + id) })
  if (damagedLinks.length) {
    const evidence = join(candidate, '.zerowall/link-recovery', randomUUID())
    await mkdir(evidence, { recursive: true })
    await writeFile(join(evidence, 'links.json'), JSON.stringify({ source: active, replacing: [...replacing], links: damagedLinks }, null, 2))
    for (const link of damagedLinks) {
      if (!link.path.startsWith('.zerowall/install-sources/')) continue
      const path = join(candidate, link.path)
      const info = await lstat(path).catch(error => { if (error.code !== 'ENOENT') throw error })
      if (info?.isSymbolicLink()) await rename(path, join(evidence, encodeURIComponent(link.path)))
    }
  }
  const inactiveArchived = []
  // Disabled/removed managed leftovers must not import an obsolete supply.
  // Keep their bytes/links and original declarations as rollback evidence,
  // outside the active dependency tree; third-party packages are untouched.
  for (const id of new Set([...disabled, ...removed])) {
    pluginIdentity(id)
    if (!bundledPlugins.some(item => item.id === id && item.managed !== false && !item.core)) continue
    const root = join(candidate, 'node_modules', id)
    const info = await lstat(root).catch(error => { if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error })
    const pending = info ? [{ path: root, info }] : []
    let obsolete = false
    while (pending.length && !obsolete) {
      const { path, info } = pending.pop()
      if (info.isSymbolicLink()) {
        const destination = resolve(dirname(path), await readlink(path)).replaceAll('\\', '/')
        obsolete = /\/(?:resources\/offline|node_modules\/\.zerowall-carriers)\/[a-f0-9]{64}\//u.test(destination)
      } else if (info.isDirectory()) for (const entry of await readdir(path, { withFileTypes: true })) {
        if (entry.isDirectory() || entry.isSymbolicLink()) pending.push({ path: join(path, entry.name), info: entry })
      }
    }
    // Physical historical imports can also retain an obsolete exact-runtime
    // receipt without any carrier link. Keep inactive bytes as history rather
    // than letting their provenance block every future startup.
    if (!obsolete) {
      try { await verifyHistoricalPluginImports({ profile: candidate, keys, target, runtimeModules, local, full: false, ids: [id] }) }
      catch { obsolete = true }
    }
    if (!obsolete) continue
    const history = join(candidate, '.zerowall/inactive-plugin-history', encodeURIComponent(id) + '-' + randomUUID())
    await mkdir(history, { recursive: true })
    if (info) await rename(root, join(history, 'package'))
    const declarations = {}
    for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) if (Object.hasOwn(manifest[field] ?? {}, id)) {
      declarations[field] = manifest[field][id]
      delete manifest[field][id]
    }
    const provenance = join(candidate, '.zerowall/plugin-imports', encodeURIComponent(id) + '.json')
    if (await lstat(provenance).catch(error => { if (error.code !== 'ENOENT') throw error })) await rename(provenance, join(history, 'provenance.json'))
    await writeFile(join(history, 'receipt.json'), JSON.stringify({ id, reason: 'Inactive managed package referenced obsolete supply or incompatible provenance', declarations }))
    inactiveArchived.push(id)
  }
  const layout = await repairProfileLayout(candidate, { from: active, home, pendingRoots: [...replacing].map(id => join(candidate, 'node_modules', id)) })
  if (layout.needsRelink) throw new Error('PROFILE_LAYOUT_RELINK_REQUIRED: repair the plugin profile before upgrading its offline resources')
  removeRetiredPlugins(manifest)
  const workspacePath = join(candidate, 'pnpm-workspace.yaml')
  const workspaceText = await readFile(workspacePath, 'utf8').catch(error => { if (error.code !== 'ENOENT') throw error; return undefined })
  if (workspaceText?.trim()) {
    const workspace = yaml.parse(workspaceText)
    if (workspace && removeRetiredResolutionRules(workspace)) await writeFile(workspacePath, yaml.stringify(workspace))
  }
  const changed = [], blocked = [], materialized = []
  async function displace(path) {
    const history = join(home, 'resources/history', 'upgrade-shadow-' + randomUUID())
    await mkdir(dirname(history), { recursive: true })
    await rename(path, history)
  }
  const bundles = new Set(manifest.dsh?.profile?.bundles ?? [])
  const defaultBundles = new Set(defaults)
  for (const id of installationIds) {
    pluginIdentity(id)
    if (removed.has(id) || (!repairOnly && disabled.has(id)) || RETIRED_PLUGIN_IDS.has(id)) continue
    const record = packages.get(id)
    if (!record) throw new Error('Default plugin absent from signed offline closure: ' + id)
    const installed = installedPackages.get(id)
    if (pins[id]) {
      if (installed?.version !== pins[id]) {
        if (record.version !== pins[id]) { blocked.push({ id, version: pins[id], reason: 'Pinned package is missing; import this exact version or explicitly unpin' }); continue }
      } else if (!replacing.has(id)) {
        try { await verifyHistoricalPluginImports({ profile: candidate, keys, target, runtimeModules, local, full: false, ids: [id] }) }
        catch (error) { blocked.push({ id, version: pins[id], reason: 'Pinned package cannot run on the current runtime; explicitly unpin to use the bundled version: ' + error.message }); continue }
        if (defaultBundles.has(id)) bundles.add(id)
        continue
      }
    }
    if (defaultBundles.has(id)) bundles.add(id)
    if (record.core) {
      // Core plugin code lives in the verified desktop runtime. Remove only
      // older, unpinned managed shadows; retain the package tree for rollback.
      if (installed?.version && bundledPlugins.some(item => item.id === id && item.managed !== false)
        && compareVersions(installed.version, record.version) < 0) {
        const path = join(candidate, 'node_modules', id)
        await displace(path)
        for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) if (manifest[field]?.[id]) delete manifest[field][id]
        changed.push({ id, from: installed.version, to: record.version })
      }
      continue
    }
    // A desktop upgrade is an explicit install action. Update its unpinned
    // managed packages even when a previous catalog/pnpm install shadows the
    // bundled closure. Preserve unrelated packages and newer generations.
    if (!replacing.has(id)) continue
    const path = join(candidate, 'node_modules', id)
    await mkdir(resolve(path, '..'), { recursive: true })
    if (await lstat(path).catch(() => undefined)) await displace(path)
    const oldProvenance = join(candidate, '.zerowall/plugin-imports', encodeURIComponent(id) + '.json')
    if (await lstat(oldProvenance).catch(() => undefined)) await displace(oldProvenance)
    materialized.push(id)
    manifest.dependencies ??= {}
    manifest.dependencies[id] = 'link:./node_modules/' + id
    changed.push({ id, from: installed?.version ?? null, to: record.version })
  }
  // DSH resolves imported bundles directly from profile node_modules.
  // Preserve their dependency declarations: a file reference into this
  // temporary candidate would break when activation renames it to web.
  if (blocked.length) return { candidate, receipt, digest, changed, blocked }
  const preserved = await preserveMaterializedDependencies({ profile: candidate, previous: oldMaterialization, replacedIds: materialized, removedIds: [...removed, ...inactiveArchived] })
  const previousDependencies = join(candidate, 'node_modules/.zerowall-dependencies')
  if (await lstat(previousDependencies).catch(() => undefined)) await displace(previousDependencies)
  const materializingAt = Date.now()
  await materializeOfflinePackages({ profile: candidate, source, receipt, digest, ids: materialized, keys, target, runtimeModules, preserved: preserved.sources, local })
  onPhase({ phase: 'profile-prepare', state: 'materialized', durationMs: Date.now() - materializingAt })
  try { await migrateOfflineProfileLinks(candidate, home, manifest, keys, target, local, runtimeModules) }
  catch (error) {
    if (error.code !== 'HISTORICAL_PLUGIN_IMPORT_BLOCKED') throw error
    blocked.push({ id: error.pluginId, reason: error.reason })
    return { candidate, receipt, digest, changed, blocked }
  }
  if (layout.pendingTargets?.length) {
    // Already-rebased links are not visited as repairs again. Explicitly
    // prove every deferred target exists before strict relocation and the
    // original complete signed-content verification below.
    await bounded(layout.pendingTargets, path => lstat(path))
    const completedLayout = await repairProfileLayout(candidate, { from: active, home })
    if (completedLayout.needsRelink) throw new Error('PROFILE_LAYOUT_RELINK_REQUIRED: repair the plugin profile before upgrading its offline resources')
  }
  const oldCarriers = join(candidate, 'node_modules/.zerowall-carriers')
  if (await lstat(oldCarriers).catch(() => undefined)) await displace(oldCarriers)
  const expected = [...installationIds].filter(id => !removed.has(id) && (repairOnly || !disabled.has(id)) && !RETIRED_PLUGIN_IDS.has(id))
  const verifyingAt = Date.now()
  if (!await verifyMaterializedProfile({ profile: candidate, keys, target, expected, digest, local, full: true })) throw new Error('Installed plugin candidate is incomplete or invalid; previous profile preserved')
  await verifyHistoricalPluginImports({ profile: candidate, keys, target, runtimeModules, local, full: true })
  onPhase({ phase: 'profile-prepare', state: 'content-verified', durationMs: Date.now() - verifyingAt })
  manifest.dsh = { ...manifest.dsh, profile: { ...manifest.dsh?.profile, bundles: [...bundles].filter(id => !removed.has(id) && !disabled.has(id) && !RETIRED_PLUGIN_IDS.has(id)) } }
  manifest.zerowall = { ...manifest.zerowall, pluginArchitecture: 7, profileLayout: PROFILE_LAYOUT, disabledPlugins: [...disabled].filter(id => !RETIRED_PLUGIN_IDS.has(id)).sort(), offlineGeneration: digest }
  const patchPath = join(candidate, 'cordis.patch.yml')
  const existingPatch = yaml.parse(await readFile(patchPath, 'utf8')) ?? []
  if (!Array.isArray(existingPatch)) throw new Error('Profile patch must remain an array')
  // Existing settings always win; only fill the missing product defaults.
  const patches = receipt.defaultPatch.filter(row => !existingPatch.some(existing => existing.id === row.id))
  await writeFile(patchPath, yaml.stringify(removeRetiredPatch([...patches, ...existingPatch])))
  await writeFile(join(candidate, 'package.json'), JSON.stringify(manifest, null, 2))
  onPhase({ phase: 'profile-prepare', state: 'complete', durationMs: Date.now() - started })
  return { candidate, receipt, digest, changed, blocked }
}
