import { createHash, randomUUID } from 'node:crypto'
import { cp, mkdir, readFile, realpath, rename, symlink, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { assertCompatible, compareVersions, fileDigest, verifySignedDocument } from './resource-catalog.mjs'
import { carrierIndex, carrierName, offlineContentDigest } from './offline-carrier.mjs'
import { physicalFs } from './physical-fs.mjs'
const { copyFile, lstat, readdir } = physicalFs.promises

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
  const receipt = verifySignedDocument(JSON.parse(text), keys)
  if (![1, 2].includes(receipt.schema) || receipt.kind !== 'offline-profile' || receipt.profileArchitecture !== 7 || !Array.isArray(receipt.files) || !Array.isArray(receipt.plugins) || !Array.isArray(receipt.defaultPatch)) throw new Error('Invalid offline profile receipt')
  if (receipt.localOnly && !local) throw new Error('Development offline profile cannot enter a stable installation')
  if ((!generation && receipt.schema === 1 && receipt.applicationVersion !== target.desktopVersion) || receipt.dshCommit !== target.dshCommit) throw new Error('Offline profile does not match this Desktop/DSH build')
  assertCompatible(receipt, generation && receipt.schema === 1 ? { ...target, desktopVersion: receipt.applicationVersion } : target)
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
export async function verifiedGeneration(home, digest, keys, target, ids, { local = false } = {}) {
  if (!/^[a-f0-9]{64}$/u.test(digest ?? '')) return undefined
  const cache = join(home, 'resources/offline', digest)
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
      const entryPaths = [...new Set(['package.json', manifest.main, manifest.dsh?.bundle?.patch, ...exported].filter(entry => typeof entry === 'string').map(entry => entry.replace(/^\.\//u, '')))]
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

/** Materialize a verified immutable generation in user-owned storage. */
export async function prepareOfflineCandidate({ home, source, keys, target, defaults, bundledPlugins, yaml, local = false, staging = false, onPhase = () => {} }) {
  let started = Date.now()
  const metadata = await readOfflineReceipt(source, keys, target, { local })
  const { receipt, digest } = metadata
  const cache = join(home, 'resources/offline', digest)
  const cacheReady = await verifiedGeneration(home, digest, keys, target, receipt.plugins.filter(entry => !entry.core).map(entry => entry.id), { local })
  if (!cacheReady) {
    onPhase({ phase: 'offline-verify', state: 'started' })
    if (receipt.schema === 1) await verifyOfflineProfile(source, keys, target, { local, staging })
    else await assertCarrierSourceFiles(source, receipt, staging)
    onPhase({ phase: 'offline-verify', state: 'complete', durationMs: Date.now() - started })
    started = Date.now()
    onPhase({ phase: 'offline-copy', state: 'started' })
    const pending = cache + '.candidate-' + randomUUID()
    await mkdir(pending, { recursive: true })
    if (receipt.schema === 1) await copySignedModules(source, join(pending, 'node_modules'), receipt.files)
    else {
      await concurrentFiles(receipt.payloadFiles, async entry => {
        const path = join(pending, entry.path)
        await mkdir(dirname(path), { recursive: true })
        await copyFile(join(source, entry.path), path)
      })
    }
    await writeFile(join(pending, 'receipt.json'), JSON.stringify(receipt))
    onPhase({ phase: 'offline-copy', state: 'complete', durationMs: Date.now() - started })
    started = Date.now()
    if (receipt.schema === 2) {
      // Verify the actual copied candidate, including all physical hashes
      // and the archive's logical set. This binds source bytes without a
      // duplicate full read and closes copy-time changes before activation.
      onPhase({ phase: 'offline-verify-candidate', state: 'started' })
      await verifyOfflineProfile(pending, keys, target, { local })
      await writeFile(join(pending, 'verified.json'), JSON.stringify({ contentDigest: digest, archiveMtimeMs: (await lstat(join(pending, carrierName))).mtimeMs }))
      onPhase({ phase: 'offline-verify-candidate', state: 'complete', durationMs: Date.now() - started })
    }
    if (await lstat(cache).catch(() => undefined)) await rename(cache, cache + '.damaged-' + randomUUID())
    await rename(pending, cache)
  }
  started = Date.now()
  onPhase({ phase: 'profile-prepare', state: 'started' })
  const active = join(home, 'profiles/web')
  const manifest = JSON.parse(await readFile(join(active, 'package.json'), 'utf8'))
  const selection = JSON.parse(await readFile(join(home, 'resources/plugins/selection.json'), 'utf8').catch(error => { if (error.code !== 'ENOENT') throw error; return '{}' }))
  const disabled = new Set([...(selection.disabled ?? []), ...(manifest.zerowall?.disabledPlugins ?? [])])
  const removed = new Set(selection.removed ?? [])
  const pins = selection.pinned ?? {}
  const candidate = join(home, 'profiles', 'zerowall-offline-' + randomUUID())
  await cp(active, candidate, { recursive: true, dereference: false })
  const packages = new Map(receipt.plugins.map(entry => [entry.id, entry]))
  const changed = [], blocked = []
  const bundles = new Set(manifest.dsh?.profile?.bundles ?? [])
  for (const id of defaults) {
    pluginIdentity(id)
    if (removed.has(id) || disabled.has(id)) continue
    const record = packages.get(id)
    if (!record) throw new Error('Default plugin absent from signed offline closure: ' + id)
    const installed = await readFile(join(candidate, 'node_modules', id, 'package.json'), 'utf8').then(JSON.parse).catch(error => { if (error.code !== 'ENOENT') throw error; return undefined })
    if (pins[id]) {
      if (installed?.version !== pins[id]) {
        if (record.version !== pins[id]) { blocked.push({ id, version: pins[id], reason: 'Pinned package is missing; import this exact version or explicitly unpin' }); continue }
      } else { bundles.add(id); continue }
    }
    bundles.add(id)
    // Explicitly installed packages have precedence even at an older version.
    // Only installer-owned generations participate in seed replacement.
    const installedRoot = installed && await realpath(join(candidate, 'node_modules', id)).catch(() => undefined)
    const offlineRoot = join(home, 'resources/offline')
    const owned = installedRoot && !relative(offlineRoot, installedRoot).startsWith('..') && !isAbsolute(relative(offlineRoot, installedRoot))
    if (installed?.version && !owned) continue
    if (installed?.version && compareVersions(installed.version, record.version) > 0) continue
    if (record.core) continue
    const replacement = join(generationModules(cache, receipt), id)
    if (installed?.version === record.version && installedRoot === await realpath(replacement)) continue
    const physical = JSON.parse(await readFile(join(replacement, 'package.json'), 'utf8'))
    if (physical.version !== record.version || physical.name !== id) throw new Error('Offline plugin identity/version mismatch')
    const path = join(candidate, 'node_modules', id)
    await mkdir(resolve(path, '..'), { recursive: true })
    if (await lstat(path).catch(() => undefined)) await rename(path, path + '.previous-' + randomUUID())
    await symlink(replacement, path, process.platform === 'win32' ? 'junction' : 'dir')
    manifest.dependencies ??= {}
    manifest.dependencies[id] = 'file:' + replacement.replaceAll('\\', '/')
    changed.push({ id, from: installed?.version ?? null, to: record.version })
  }
  // DSH resolves imported bundles directly from profile node_modules.
  // Preserve their dependency declarations: a file reference into this
  // temporary candidate would break when activation renames it to web.
  if (blocked.length) return { candidate, receipt, digest, changed, blocked }
  manifest.dsh = { ...manifest.dsh, profile: { ...manifest.dsh?.profile, bundles: [...bundles].filter(id => !removed.has(id) && !disabled.has(id) && id !== 'dsh-auto-review') } }
  manifest.zerowall = { ...manifest.zerowall, pluginArchitecture: 7, disabledPlugins: [...disabled].sort(), offlineGeneration: digest }
  const patchPath = join(candidate, 'cordis.patch.yml')
  const existingPatch = yaml.parse(await readFile(patchPath, 'utf8')) ?? []
  if (!Array.isArray(existingPatch)) throw new Error('Profile patch must remain an array')
  // Existing settings always win; only fill the missing product defaults.
  const patches = receipt.defaultPatch.filter(row => !existingPatch.some(existing => existing.id === row.id))
  await writeFile(patchPath, yaml.stringify([...patches, ...existingPatch]))
  await writeFile(join(candidate, 'package.json'), JSON.stringify(manifest, null, 2))
  onPhase({ phase: 'profile-prepare', state: 'complete', durationMs: Date.now() - started })
  return { candidate, receipt, digest, changed, blocked }
}
