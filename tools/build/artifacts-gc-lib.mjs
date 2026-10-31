import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, lstat, mkdir, readFile, readdir, rm, statfs, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

export function within(root, candidate) {
  const base = resolve(root)
  const path = resolve(candidate)
  const rel = relative(base, path)
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
}

const hasDependencyDirectory = path => resolve(path).split(/[\\/]/u).some(part => part.toLowerCase() === 'node_modules')

async function inventory(path, files = [], dirs = [], protectedPaths = [], { protectDependencies = true } = {}) {
  let mostRecentMs = 0, bytes = 0, next = 0
  const pending = [path]
  while (next < pending.length) {
    const batch = pending.slice(next, next + 32)
    next += batch.length
    const results = await Promise.allSettled(batch.map(async current => {
      if (protectDependencies && hasDependencyDirectory(current)) { protectedPaths.push(current); return }
      const info = await lstat(current, { bigint: true }).catch(error => error.code === 'ENOENT' ? undefined : Promise.reject(error))
      if (!info || info.isSymbolicLink()) return
      mostRecentMs = Math.max(mostRecentMs, Number(info.mtimeMs))
      if (info.isFile()) {
        files.push({ path: current, size: Number(info.size), inode: `${info.dev}:${info.ino}`, links: Number(info.nlink), mtimeMs: Number(info.mtimeMs) })
        bytes += Number(info.size)
      } else if (info.isDirectory()) {
        dirs.push(current)
        pending.push(...(await readdir(current)).map(child => join(current, child)))
      }
    }))
    const failed = results.find(result => result.status === 'rejected')
    if (failed) throw failed.reason
  }
  return { mostRecentMs, bytes, files, dirs, protectedPaths }
}

async function treeDigest(path, { protectDependencies = true, data, hashes = new Map(), digestMode = 'content' } = {}) {
  data ??= await inventory(path, [], [], [], { protectDependencies })
  if (data.protectedPaths.length) throw new Error(`Refusing to remove a tree containing protected node_modules: ${path}`)
  const digest = createHash('sha256')
  const base = resolve(path)
  const files = data.files.sort((a, b) => a.path.localeCompare(b.path))
  const rows = new Array(files.length)
  let next = 0
  const workers = await Promise.allSettled(Array.from({ length: Math.min(16, files.length) }, async () => {
    while (next < files.length) {
      const index = next++, file = files[index]
      const key = `${file.inode}:${file.size}:${file.mtimeMs}`
      if (digestMode === 'metadata') {
        rows[index] = [relative(base, file.path).replaceAll('\\', '/'), key]
        continue
      }
      if (!hashes.has(key)) hashes.set(key, (async () => {
        const fileHash = createHash('sha256')
        for await (const chunk of createReadStream(file.path)) fileHash.update(chunk)
        return fileHash.digest('hex')
      })())
      rows[index] = [relative(base, file.path).replaceAll('\\', '/'), await hashes.get(key)]
    }
  }))
  const failure = workers.find(result => result.status === 'rejected')
  if (failure) throw failure.reason
  for (const [rel, sha256] of rows) digest.update(rel).update('\0').update(sha256).update('\0')
  const inodes = inodeSummary(files)
  return { sha256: digest.digest('hex'), bytes: data.bytes, mostRecentMs: data.mostRecentMs, files: files.length, uniqueBytes: inodes.uniqueBytes }
}

function inodeSummary(files) {
  const inodes = new Map()
  for (const file of files) {
    const item = inodes.get(file.inode) ?? { bytes: file.size, links: file.links, selectedLinks: 0 }
    item.selectedLinks++; inodes.set(file.inode, item)
  }
  return { files: files.length, bytes: files.reduce((sum, file) => sum + file.size, 0), uniqueBytes: [...inodes.values()].reduce((sum, item) => sum + item.bytes, 0),
    reclaimableBytes: [...inodes.values()].reduce((sum, item) => sum + (item.selectedLinks === item.links ? item.bytes : 0), 0) }
}

function summarizeInodes(inodes) {
  const summary = { files: 0, bytes: 0, uniqueBytes: 0, reclaimableBytes: 0 }
  for (const item of inodes.values()) {
    summary.files += item.selectedLinks
    summary.bytes += item.bytes * item.selectedLinks
    summary.uniqueBytes += item.bytes
    if (item.selectedLinks === item.links) summary.reclaimableBytes += item.bytes
  }
  return summary
}

export async function measureArtifactSpace(paths) {
  const files = []
  for (const path of paths) await inventory(path, files, [], [], { protectDependencies: false })
  return inodeSummary(files)
}

export async function freeArtifactSpace(root) {
  const disk = await statfs(root)
  return disk.bavail * disk.bsize
}

async function directChildren(path) {
  const info = await lstat(path).catch(() => undefined)
  if (!info) return []
  if (info.isSymbolicLink() || !info.isDirectory()) throw new Error(`Managed cleanup root is not a physical directory: ${path}`)
  const result = []
  for (const name of await readdir(path)) {
    const child = join(path, name)
    const item = await lstat(child)
    if (!item.isSymbolicLink() && (item.isDirectory() || item.isFile())) result.push(child)
  }
  return result
}

async function assertPhysicalAncestors(root, path) {
  for (let parent = dirname(path); ; parent = dirname(parent)) {
    if (resolve(parent) !== resolve(root) && !within(root, parent)) throw new Error('Cleanup ancestor escapes managed root')
    const info = await lstat(parent)
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`Cleanup ancestor is not a physical directory: ${parent}`)
    if (resolve(parent) === resolve(root)) return
  }
}

async function isReferenced(candidate, buildId, referenceFiles, contents = new Map()) {
  const rel = candidate.replaceAll('\\', '/')
  const normalizedCandidate = rel.toLowerCase()
  const artifactIndex = normalizedCandidate.indexOf('/artifacts/')
  const artifactRelative = artifactIndex >= 0 ? normalizedCandidate.slice(artifactIndex + 1) : normalizedCandidate
  for (const file of referenceFiles) {
    // A receipt stored inside a candidate can contain its own absolute path
    // (for example an installer diagnostic). It is evidence about the tree,
    // not a durable reference that should keep the tree alive.
    if (within(candidate, file)) continue
    if (!contents.has(file)) contents.set(file, (await readFile(file, 'utf8').catch(() => '')).replace(/\\+/gu, '/').replace(/\/{2,}/gu, '/').toLowerCase())
    const text = contents.get(file)
    if ((buildId && text.includes(buildId.toLowerCase())) || text.includes(normalizedCandidate) || text.includes(artifactRelative)) return true
  }
  return false
}

async function collectJsonFiles(path, files = [], depth = 0) {
  if (hasDependencyDirectory(path)) return files
  const info = await lstat(path).catch(() => undefined)
  if (!info || info.isSymbolicLink()) return files
  if (info.isFile()) {
    if (path.toLowerCase().endsWith('.json') && info.size <= 32 * 1024 * 1024) files.push(path)
    return files
  }
  if (!info.isDirectory()) return files
  for (const entry of await readdir(path, { withFileTypes: true })) {
    // Cleanup plans list candidates for audit; they do not keep those bytes.
    if (entry.name === 'cleanup' && path.split(/[\\/]/u).includes('verification')) continue
    // Test installations and extracted environments are payloads, not durable
    // build references. Never descend into their package/user-data trees.
    if (/^(?:node_modules|Python|Lib|\.zerowall|\.git|modules|app|resources|user-data)$/iu.test(entry.name)) continue
    if (entry.isDirectory() || (entry.isFile() && entry.name.toLowerCase().endsWith('.json'))) {
      await collectJsonFiles(join(path, entry.name), files, depth + 1)
    }
  }
  return files
}

export async function createCleanupPlan({ root, policy, now = Date.now(), pruneIncomplete = false, pruneUnpacked = false, deferObjectSweep = false, onCandidate = () => {} }) {
  const repositoryRoot = resolve(root)
  const artifacts = join(repositoryRoot, 'artifacts')
  const currentVersion = await readFile(join(repositoryRoot, 'package.json'), 'utf8').then(JSON.parse, () => ({})).then(pkg => pkg.version ?? policy.version)
  const strictVersions = policy.defaults.keepDesktopVersions != null
  const retainedVersions = new Set([currentVersion])
  if (strictVersions) {
    const versions = new Set()
    for (const family of ['stage', 'packages', 'release', 'verification', 'logs']) for (const path of await directChildren(join(artifacts, family))) {
      const name = path.split(/[\\/]/u).at(-1)
      if (/^\d+\.\d+\.\d+$/u.test(name)) versions.add(name)
    }
    const order = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); return y[0]-x[0] || y[1]-x[1] || y[2]-x[2] }
    for (const version of [...versions].filter(v => v !== currentVersion).sort(order).slice(0, Math.max(0, policy.defaults.keepDesktopVersions - 1))) retainedVersions.add(version)
  }
  let referenceFiles
  const durableReferences = strictVersions
    ? await collectJsonFiles(join(artifacts, 'packages', currentVersion))
    : [...await collectJsonFiles(join(artifacts, 'release')), ...await collectJsonFiles(join(artifacts, 'verification'))]
  const cacheReferences = [...durableReferences]
  const candidates = []
  const exclusions = []
  const contents = new Map(), hashes = new Map(), selectedInodes = new Map()
  await assertNoActiveBuilds(repositoryRoot)
  const addCandidate = async (managedRoot, path, cutoffDays, reason, buildId, references = durableReferences, { protectDependencies = true, preserveEvidence = false, retiredVersion } = {}) => {
    const absoluteRoot = resolve(repositoryRoot, managedRoot)
    const absolute = resolve(path)
    const protectedRoot = (policy.protectedRoots ?? []).some(item => {
      // Policy entries are repository-relative paths. Keep the literal
      // `%SystemDrive%` anomaly directory local to this repository instead of
      // expanding it to `C:\`, which would accidentally protect every artifact.
      const protectedPath = resolve(repositoryRoot, item)
      if (retiredVersion && item === 'artifacts/release') return false
      return absolute.toLowerCase() === protectedPath.toLowerCase() || absolute.toLowerCase().startsWith(`${protectedPath.toLowerCase()}${sep}`)
    })
    if (!within(absoluteRoot, absolute) || !within(artifacts, absolute) || protectedRoot) {
      exclusions.push({ path: absolute, reason: 'outside-managed-root' })
      return
    }
    const info = await lstat(absolute).catch(() => undefined)
    if (!info || info.isSymbolicLink()) {
      exclusions.push({ path: absolute, reason: 'missing-or-link' })
      return
    }
    await assertPhysicalAncestors(repositoryRoot, absolute)
    // A recently touched tree cannot have expired. Avoid scanning or hashing it.
    if (cutoffDays > 0 && (now - info.mtimeMs) / 86_400_000 < cutoffDays) return
    if (!retiredVersion && await isReferenced(absolute.replaceAll('\\', '/'), buildId, references, contents)) {
      exclusions.push({ path: absolute, reason: 'referenced-build' })
      return
    }
    onCandidate({ path: absolute, reason })
    let inventoryData
    try { inventoryData = await inventory(absolute, [], [], [], { protectDependencies }) }
    catch (error) { exclusions.push({ path: absolute, reason: 'unreadable-candidate', error: `${error.code}: ${error.path ?? absolute}` }); return }
    if (inventoryData.protectedPaths.length) {
      exclusions.push({ path: absolute, reason: 'contains-protected-node-modules' })
      return
    }
    const ageDays = (now - inventoryData.mostRecentMs) / 86_400_000
    if (cutoffDays > 0 && ageDays < cutoffDays) return
    const digestMode = strictVersions ? 'metadata' : 'content'
    const digest = await treeDigest(absolute, { protectDependencies, data: inventoryData, hashes, digestMode })
    for (const file of inventoryData.files) {
      const item = selectedInodes.get(file.inode) ?? { bytes: file.size, links: file.links, selectedLinks: 0 }
      item.selectedLinks++; selectedInodes.set(file.inode, item)
    }
    candidates.push({ path: absolute, managedRoot: absoluteRoot, repositoryRoot, reason, ageDays: Math.floor(ageDays), protectDependencies, preserveEvidence, digestMode, ...(strictVersions ? { referenceVersion: currentVersion } : {}), ...(retiredVersion ? { retiredVersion, retainedVersion: currentVersion } : {}),
      ...(managedRoot === 'artifacts/stage' ? { stageState: reason.startsWith('failed-') ? 'failed' : reason.startsWith('successful-') ? 'success' : inventoryData.files.length ? 'incomplete' : 'empty' } : {}), ...digest })
  }

  const retireVersion = async (family, path, version) => {
    if (['stage', 'verification'].includes(family) && path === join(artifacts, family, version)) {
      for (const child of await directChildren(path)) await retireVersion(family, child, version)
      return
    }
    const before = exclusions.length
    await addCandidate(`artifacts/${family}`, path, 0, 'retired-desktop-version', undefined, [], { protectDependencies: false, retiredVersion: version })
    if (exclusions.slice(before).some(item => item.path === resolve(path) && item.reason === 'unreadable-candidate')) {
      // Isolate inaccessible old test data instead of keeping every other
      // installation under that version. These exact children remain auditable.
      try { for (const child of await directChildren(path)) await retireVersion(family, child, version) }
      catch (error) { exclusions.push({ path, reason: 'unreadable-directory', error: `${error.code}: ${error.path ?? path}` }) }
    }
  }
  if (strictVersions) for (const family of ['stage', 'packages', 'release', 'verification', 'logs']) {
    for (const path of await directChildren(join(artifacts, family))) {
      const version = path.split(/[\\/]/u).at(-1)
      if (/^\d+\.\d+\.\d+$/u.test(version) && !retainedVersions.has(version)) await retireVersion(family, path, version)
    }
  }

  const stageRoot = join(artifacts, 'stage')
  for (const versionPath of await directChildren(stageRoot).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error))) {
    const version = versionPath.split(/[\\/]/u).at(-1)
    if (strictVersions && !retainedVersions.has(version)) continue
    const active = await readFile(join(versionPath, 'current.json'), 'utf8').then(JSON.parse, () => undefined)
    const builds = []
    for (const buildPath of await directChildren(versionPath)) {
      if (!(await lstat(buildPath)).isDirectory()) continue
      const receipt = await readFile(join(buildPath, 'build-receipt.json'), 'utf8').then(JSON.parse, () => undefined)
        ?? await readFile(join(buildPath, 'runtime/build-receipt.json'), 'utf8').then(JSON.parse, () => undefined)
      const packaged = await readFile(join(buildPath, 'desktop-package-receipt.json'), 'utf8').then(JSON.parse, () => undefined)
      const cloned = await readFile(join(buildPath, 'stage-clone-receipt.json'), 'utf8').then(JSON.parse, () => undefined)
      const failed = receipt?.status === 'failed' || await lstat(join(buildPath, 'FAILED')).then(() => true, () => false) || await lstat(join(buildPath, 'stage-clone-failure.json')).then(() => true, () => false)
      builds.push({ path: buildPath, buildId: buildPath.split(/[\\/]/u).at(-1), failed, success: !failed && (receipt?.status === 'success' || !!packaged || !!cloned), time: Date.parse(receipt?.finishedAt ?? cloned?.createdAt) || (await lstat(buildPath)).mtimeMs })
    }
    const keepCount = policy.defaults.keepStagesPerVersion ?? policy.defaults.keepStableVersions
    const successful = builds.filter(item => item.success).sort((a, b) => b.time - a.time || b.buildId.localeCompare(a.buildId))
    const activeIds = builds.some(item => item.buildId === active?.buildId) ? [active.buildId] : []
    const retained = new Set(keepCount == null ? [] : [...activeIds, ...successful.filter(item => item.buildId !== active?.buildId).slice(0, Math.max(0, keepCount - activeIds.length)).map(item => item.buildId)])
    for (const { path: buildPath, buildId, failed, success } of builds) {
      if (active?.buildId === buildId) { exclusions.push({ path: buildPath, reason: 'active-stage' }); continue }
      if (retained.has(buildId)) { exclusions.push({ path: buildPath, reason: 'retained-successful-stage' }); continue }
      if (failed) await addCandidate('artifacts/stage', buildPath, pruneIncomplete ? 0 : policy.defaults.failedBuildDays, 'failed-build-expired', buildId, durableReferences, { protectDependencies: false })
      else if (success && keepCount != null) await addCandidate('artifacts/stage', buildPath, 0, 'successful-stage-over-retention', buildId, durableReferences, { protectDependencies: false })
      else if (pruneIncomplete) await addCandidate('artifacts/stage', buildPath, 0, 'incomplete-build-expired', buildId, durableReferences, { protectDependencies: false })
      else await addCandidate('artifacts/stage', buildPath, policy.defaults.stageDays, 'unreferenced-stage-expired', buildId, durableReferences, { protectDependencies: false })
      void version
    }
    if (active?.buildId && /^[A-Za-z0-9._-]+$/u.test(active.buildId)) cacheReferences.push(...await collectJsonFiles(join(versionPath, active.buildId)))
  }

  const retainCache = async (managedRoot, directory, count, receiptName) => {
    const entries = []
    for (const path of await directChildren(directory)) {
      if (!(await lstat(path)).isDirectory()) continue
      const receipt = await readFile(join(path, receiptName), 'utf8').then(JSON.parse, () => undefined)
      if (!receipt || /\.(?:candidate|damaged)-/u.test(path)) {
        const name = path.split(/[\\/]/u).at(-1)
        // Interrupted direct-to-cache assembly can leave a large candidate.
        // The explicit flag may retire only our hash/UUID candidate namespace;
        // damaged rollback snapshots and other cache entries keep their TTL.
        const pending = pruneIncomplete && /^[a-f0-9]{64}\.candidate-[a-f0-9-]{36}$/u.test(name)
        await addCandidate(managedRoot, path, pending ? 0 : policy.defaults.cacheDays, 'incomplete-cache-expired', name, cacheReferences, { protectDependencies: !pending })
        continue
      }
      entries.push({ path, time: (await lstat(join(path, receiptName))).mtimeMs })
    }
    entries.sort((a, b) => b.time - a.time || b.path.localeCompare(a.path))
    for (const [index, entry] of entries.entries()) {
      if (index < count) exclusions.push({ path: entry.path, reason: 'retained-cache' })
      else await addCandidate(managedRoot, entry.path, 0, 'cache-over-retention', entry.path.split(/[\\/]/u).at(-1), cacheReferences, { protectDependencies: false })
    }
  }
  const assemblyRoot = join(artifacts, 'cache/runtime-assemblies')
  for (const kind of await directChildren(assemblyRoot)) if ((await lstat(kind)).isDirectory()) await retainCache('artifacts/cache/runtime-assemblies', kind, policy.defaults.keepRuntimeAssembliesPerKind ?? 2, 'receipt.json')
  await retainCache('artifacts/cache/offline-carriers', join(artifacts, 'cache/offline-carriers'), policy.defaults.keepOfflineCarriers ?? 2, 'payload.json')
  await retainCache('artifacts/cache/resource-trees', join(artifacts, 'cache/resource-trees'), policy.defaults.keepResourceTrees ?? 1, 'receipt.json')

  for (const [rootName, days, reason] of [
    ['artifacts/dev', policy.defaults.devDays, 'development-output-expired'],
    ['artifacts/cache/legacy-outputs', policy.defaults.devDays, 'legacy-output-expired'],
    ['artifacts/cache/electron-builder', policy.defaults.cacheDays, 'electron-builder-cache-expired'],
    ['artifacts/logs', policy.defaults.logsDays, 'build-log-expired'],
  ]) {
    const base = join(repositoryRoot, rootName)
    for (const child of await directChildren(base).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error))) {
      const leaf = child.split(/[\\/]/u).at(-1)
      if (strictVersions && rootName === 'artifacts/logs' && /^\d+\.\d+\.\d+$/u.test(leaf)) continue
      const logVersion = rootName === 'artifacts/logs' && leaf.match(/^(\d+\.\d+\.\d+)-/u)?.[1]
      if (strictVersions && logVersion && !retainedVersions.has(logVersion)) {
        await addCandidate(rootName, child, 0, 'retired-version-log', undefined, [], { protectDependencies: false })
        continue
      }
      await addCandidate(rootName, child, days, reason, leaf)
    }
  }

  // Verification trees are evidence, but historical unpacked installations
  // and native package copies are disposable once their receipts remain.
  // Keep the current application version complete and retain only small
  // receipts/logs for older versions.
  const verificationRoot = join(artifacts, 'verification')
  for (const versionPath of await directChildren(verificationRoot).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error))) {
    const version = versionPath.split(/[\\/]/u).at(-1)
    if (strictVersions && !retainedVersions.has(version)) continue
    if (version === currentVersion || strictVersions && retainedVersions.has(version)) {
      exclusions.push({ path: versionPath, reason: 'retained-version-verification' })
      continue
    }
    for (const child of await directChildren(versionPath)) {
      const name = child.split(/[\\/]/u).at(-1)
      if (/^(?:isolated-|native-pack$|installer-test(?:-|$)|unpacked-|profile-)/u.test(name)) {
        await addCandidate('artifacts/verification', child, 0, 'historical-verification-disposable', undefined, durableReferences, { protectDependencies: false, preserveEvidence: true })
      }
    }
  }

  // electron-builder's unpacked tree is a verified intermediate, not a
  // distributable. It is recreated on the next package build.
  if (pruneUnpacked) {
    const packageRoot = join(artifacts, 'packages')
    for (const versionPath of await directChildren(packageRoot).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error))) {
      for (const targetPath of await directChildren(versionPath)) {
        const unpacked = join(targetPath, 'win-unpacked')
        const manifest = join(targetPath, 'artifact-manifest.json')
        if (await lstat(manifest).catch(() => undefined)) {
          await addCandidate('artifacts/packages', unpacked, 0, 'disposable-package-unpacked', undefined, durableReferences, { protectDependencies: false })
        }
      }
    }
  }

  const objectRoot = join(artifacts, 'objects', 'sha256')
  if (deferObjectSweep) exclusions.push({ path: objectRoot, reason: 'deferred-object-sweep' })
  else {
    for (const prefixPath of await directChildren(objectRoot).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error))) {
      const prefix = prefixPath.split(/[\\/]/u).at(-1)
      if (!/^[a-f0-9]{2}$/u.test(prefix)) continue
      for (const objectPath of await directChildren(prefixPath)) {
        const digest = objectPath.split(/[\\/]/u).at(-1)
        if (!/^[a-f0-9]{64}$/u.test(digest) || digest.slice(0, 2) !== prefix) continue
        if ((await lstat(objectPath)).nlink > 1) { exclusions.push({ path: objectPath, reason: 'linked-content-object' }); continue }
        // Recent objects cannot be candidates. Avoid reading every runtime
        // JSON for each new object in the content store.
        if ((now - (await lstat(objectPath)).mtimeMs) / 86_400_000 < (policy.defaults.objectDays ?? 30)) continue
        // Historical cleanup plans/provenance must not pin discarded objects.
        // Hard-linked shared archives are protected above; strict retention only
        // keeps references from current distributables and the active stage.
        referenceFiles ??= strictVersions ? cacheReferences : await collectJsonFiles(artifacts)
        if (await isReferenced(relative(artifacts, objectPath).replaceAll('\\', '/'), undefined, referenceFiles, contents)) {
          exclusions.push({ path: objectPath, reason: 'referenced-content-object' })
          continue
        }
        await addCandidate('artifacts/objects', objectPath, policy.defaults.objectDays ?? 30, 'unreferenced-content-object-expired')
      }
    }
  }
  return { generatedAt: new Date(now).toISOString(), candidates: candidates.sort((a, b) => a.path.localeCompare(b.path)), exclusions, space: summarizeInodes(selectedInodes) }
}

export async function assertNoActiveBuilds(repositoryRoot) {
  const directory = join(repositoryRoot, 'artifacts/cache/build-graph/locks')
  for (const path of await directChildren(directory)) {
    const owner = await readFile(join(path, 'owner.json'), 'utf8').then(JSON.parse, () => undefined)
    if (!owner?.pid) throw new Error(`Unreadable build lock: ${path}; GC will not run`)
    try { process.kill(owner.pid, 0) }
    catch (error) {
      if (error.code !== 'ESRCH') throw new Error(`Active or inaccessible build lock: ${path}`)
      if (Date.now() - (await lstat(path)).mtimeMs >= 60_000) continue
      throw new Error(`Recent stale build lock: ${path}; GC will not run`)
    }
    throw new Error(`Build process ${owner.pid} is active; GC will not run`)
  }
}

async function retainVerificationEvidence(path) {
  const destination = join(dirname(path), 'summaries', path.split(/[\\/]/u).at(-1))
  const data = await inventory(path, [], [], [], { protectDependencies: false })
  const saved = []
  for (const file of data.files) {
    const rel = relative(path, file.path)
    if (!/\.(?:json|log|txt|md|csv)$/iu.test(rel) || /(?:^|[\\/])(?:node_modules|resources|modules|app|Lib|independent-plugins)(?:[\\/]|$)/iu.test(rel)) continue
    const target = join(destination, rel)
    if (!within(destination, target)) throw new Error('Verification evidence escapes summary directory')
    await mkdir(dirname(target), { recursive: true })
    await copyFile(file.path, target)
    if (!Buffer.compare(await readFile(file.path), await readFile(target))) saved.push(rel)
    else throw new Error(`Verification evidence copy differs: ${file.path}`)
  }
  await mkdir(destination, { recursive: true })
  await writeFile(join(destination, 'retention-receipt.json'), JSON.stringify({ source: path, files: saved, retainedAt: new Date().toISOString() }, null, 2))
  return { path: destination, files: saved.length }
}

export async function removeCandidate(candidate, expected) {
  const root = resolve(candidate.managedRoot)
  const path = resolve(candidate.path)
  if (candidate.repositoryRoot) {
    const artifacts = join(resolve(candidate.repositoryRoot), 'artifacts')
    if (!within(artifacts, root) || !within(artifacts, path)) throw new Error('Cleanup candidate is outside repository artifacts')
    const protectedParts = relative(artifacts, path).split(/[\\/]/u).map(part => part.toLowerCase())
    if (protectedParts[0] === 'source' || (protectedParts[0] === 'release' && !candidate.retiredVersion)) throw new Error('Cleanup candidate targets protected source or shared release resources')
  }
  if (!within(root, path)) throw new Error(`Refusing to remove path outside managed root: ${path}`)
  await assertPhysicalAncestors(candidate.repositoryRoot ?? root, path)
  const info = await lstat(path)
  if (info.isSymbolicLink()) throw new Error(`Refusing to remove symbolic link: ${path}`)
  if (candidate.repositoryRoot && candidate.retiredVersion) {
    await assertNoActiveBuilds(candidate.repositoryRoot)
    const version = JSON.parse(await readFile(join(candidate.repositoryRoot, 'package.json'), 'utf8')).version
    const versionRoot = join(root, candidate.retiredVersion)
    if (version !== candidate.retainedVersion || version === candidate.retiredVersion || (path !== versionRoot && !within(versionRoot, path)) || !/^\d+\.\d+\.\d+$/u.test(candidate.retiredVersion)) throw new Error('Desktop version changed since cleanup planning')
  } else if (candidate.repositoryRoot) {
    await assertNoActiveBuilds(candidate.repositoryRoot)
    if (candidate.referenceVersion && JSON.parse(await readFile(join(candidate.repositoryRoot, 'package.json'), 'utf8')).version !== candidate.referenceVersion) throw new Error('Desktop version changed since cleanup planning')
    const artifacts = join(candidate.repositoryRoot, 'artifacts')
    const references = candidate.referenceVersion
      ? await collectJsonFiles(join(artifacts, 'packages', candidate.referenceVersion))
      : [...await collectJsonFiles(join(artifacts, 'release')), ...await collectJsonFiles(join(artifacts, 'verification'))]
    // Generic development and legacy output directories often share names
    // with packaged modules (for example `pptx` or `dsh-office-tools`); their
    // basename alone must not be treated as a durable reference. Content
    // object hashes remain valid identifiers because receipts store them.
    const id = candidate.reason.startsWith('historical-verification')
      || candidate.reason === 'disposable-package-unpacked'
      || candidate.reason === 'development-output-expired'
      || candidate.reason === 'legacy-output-expired'
      ? undefined
      : path.split(/[\\/]/u).at(-1)
    // A stage can become active or acquire a durable reference after planning.
    for (const version of await directChildren(join(artifacts, 'stage'))) {
      if (candidate.referenceVersion && version.split(/[\\/]/u).at(-1) !== candidate.referenceVersion) continue
      const active = await readFile(join(version, 'current.json'), 'utf8').then(JSON.parse, () => undefined)
      if (!active?.buildId || !/^[A-Za-z0-9._-]+$/u.test(active.buildId)) continue
      const activeStage = join(version, active.buildId)
      if (path === activeStage || within(path, activeStage)) throw new Error('Cleanup candidate contains the active stage')
      // Clone receipts and signed offline documents retain the source build ID
      // as provenance. A complete clone has its own ordinary files; the source
      // stage is not a runtime dependency. Cache/object references still count.
      if (!candidate.referenceVersion || !within(join(artifacts, 'stage'), path)) references.push(...await collectJsonFiles(activeStage))
    }
    if (await isReferenced(path, id, references)) throw new Error('Cleanup candidate acquired a protected reference')
  }
  const current = await treeDigest(path, { protectDependencies: expected.protectDependencies !== false, digestMode: expected.digestMode })
  if (current.sha256 !== expected.sha256 || current.bytes !== expected.bytes) throw new Error(`Cleanup candidate changed after dry-run: ${path}`)
  const evidence = candidate.preserveEvidence ? await retainVerificationEvidence(path) : undefined
  await rm(path, { recursive: info.isDirectory(), force: false })
  if (candidate.retiredVersion) for (let parent = dirname(path); within(root, parent); parent = dirname(parent)) {
    const info = await lstat(parent)
    if (!info.isDirectory() || info.isSymbolicLink() || (await readdir(parent)).length) break
    await rm(parent, { recursive: true })
  }
  return evidence
}
