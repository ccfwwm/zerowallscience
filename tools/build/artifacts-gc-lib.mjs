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
  if (protectDependencies && hasDependencyDirectory(path)) {
    protectedPaths.push(path)
    return { mostRecentMs: 0, bytes: 0, files, dirs, protectedPaths }
  }
  const info = await lstat(path, { bigint: true }).catch(error => error.code === 'ENOENT' ? undefined : Promise.reject(error))
  if (!info || info.isSymbolicLink()) return { mostRecentMs: 0, bytes: 0, files, dirs, protectedPaths }
  if (info.isFile()) {
    files.push({ path, size: Number(info.size), inode: `${info.dev}:${info.ino}`, links: Number(info.nlink), mtimeMs: Number(info.mtimeMs) })
    return { mostRecentMs: Number(info.mtimeMs), bytes: Number(info.size), files, dirs, protectedPaths }
  }
  if (!info.isDirectory()) return { mostRecentMs: Number(info.mtimeMs), bytes: 0, files, dirs, protectedPaths }
  dirs.push(path)
  let mostRecentMs = Number(info.mtimeMs), bytes = 0
  for (const child of await readdir(path)) {
    const item = await inventory(join(path, child), files, dirs, protectedPaths, { protectDependencies })
    mostRecentMs = Math.max(mostRecentMs, item.mostRecentMs)
    bytes += item.bytes
  }
  return { mostRecentMs, bytes, files, dirs, protectedPaths }
}

async function treeDigest(path, { protectDependencies = true, data, hashes = new Map() } = {}) {
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

async function collectJsonFiles(path, files = []) {
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
    if (entry.isDirectory() || (entry.isFile() && entry.name.toLowerCase().endsWith('.json'))) {
      await collectJsonFiles(join(path, entry.name), files)
    }
  }
  return files
}

export async function createCleanupPlan({ root, policy, now = Date.now(), pruneIncomplete = false, pruneUnpacked = false, onCandidate = () => {} }) {
  const repositoryRoot = resolve(root)
  const artifacts = join(repositoryRoot, 'artifacts')
  let referenceFiles
  const durableReferences = [...await collectJsonFiles(join(artifacts, 'release')), ...await collectJsonFiles(join(artifacts, 'verification'))]
  const cacheReferences = [...durableReferences]
  const candidates = []
  const exclusions = []
  const contents = new Map(), hashes = new Map(), selectedFiles = []
  await assertNoActiveBuilds(repositoryRoot)
  const addCandidate = async (managedRoot, path, cutoffDays, reason, buildId, references = durableReferences, { protectDependencies = true, preserveEvidence = false } = {}) => {
    const absoluteRoot = resolve(repositoryRoot, managedRoot)
    const absolute = resolve(path)
    const protectedRoot = (policy.protectedRoots ?? []).some(item => {
      // Policy entries are repository-relative paths. Keep the literal
      // `%SystemDrive%` anomaly directory local to this repository instead of
      // expanding it to `C:\`, which would accidentally protect every artifact.
      const protectedPath = resolve(repositoryRoot, item)
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
    if (await isReferenced(absolute.replaceAll('\\', '/'), buildId, references, contents)) {
      exclusions.push({ path: absolute, reason: 'referenced-build' })
      return
    }
    onCandidate({ path: absolute, reason })
    const inventoryData = await inventory(absolute, [], [], [], { protectDependencies })
    if (inventoryData.protectedPaths.length) {
      exclusions.push({ path: absolute, reason: 'contains-protected-node-modules' })
      return
    }
    const ageDays = (now - inventoryData.mostRecentMs) / 86_400_000
    if (cutoffDays > 0 && ageDays < cutoffDays) return
    const digest = await treeDigest(absolute, { protectDependencies, data: inventoryData, hashes })
    selectedFiles.push(...inventoryData.files)
    candidates.push({ path: absolute, managedRoot: absoluteRoot, repositoryRoot, reason, ageDays: Math.floor(ageDays), protectDependencies, preserveEvidence,
      ...(managedRoot === 'artifacts/stage' ? { stageState: reason.startsWith('failed-') ? 'failed' : reason.startsWith('successful-') ? 'success' : inventoryData.files.length ? 'incomplete' : 'empty' } : {}), ...digest })
  }

  const stageRoot = join(artifacts, 'stage')
  for (const versionPath of await directChildren(stageRoot).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error))) {
    const version = versionPath.split(/[\\/]/u).at(-1)
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
      if (failed) await addCandidate('artifacts/stage', buildPath, policy.defaults.failedBuildDays, 'failed-build-expired', buildId, durableReferences, { protectDependencies: false })
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

  for (const [rootName, days, reason] of [
    ['artifacts/dev', policy.defaults.devDays, 'development-output-expired'],
    ['artifacts/cache/legacy-outputs', policy.defaults.devDays, 'legacy-output-expired'],
    ['artifacts/cache/electron-builder', policy.defaults.cacheDays, 'electron-builder-cache-expired'],
    ['artifacts/logs', policy.defaults.logsDays, 'build-log-expired'],
  ]) {
    const base = join(repositoryRoot, rootName)
    for (const child of await directChildren(base).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error))) {
      const leaf = child.split(/[\\/]/u).at(-1)
      await addCandidate(rootName, child, days, reason, leaf)
    }
  }

  // Verification trees are evidence, but historical unpacked installations
  // and native package copies are disposable once their receipts remain.
  // Keep the current application version complete and retain only small
  // receipts/logs for older versions.
  const currentVersion = policy.version
  const verificationRoot = join(artifacts, 'verification')
  for (const versionPath of await directChildren(verificationRoot).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error))) {
    const version = versionPath.split(/[\\/]/u).at(-1)
    if (version === currentVersion) continue
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
  for (const prefixPath of await directChildren(objectRoot).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error))) {
    const prefix = prefixPath.split(/[\\/]/u).at(-1)
    if (!/^[a-f0-9]{2}$/u.test(prefix)) continue
    for (const objectPath of await directChildren(prefixPath)) {
      const digest = objectPath.split(/[\\/]/u).at(-1)
      if (!/^[a-f0-9]{64}$/u.test(digest) || digest.slice(0, 2) !== prefix) continue
      // Recent objects cannot be candidates. Avoid reading every runtime
      // JSON for each new object in the content store.
      if ((now - (await lstat(objectPath)).mtimeMs) / 86_400_000 < (policy.defaults.objectDays ?? 30)) continue
      referenceFiles ??= await collectJsonFiles(artifacts)
      if (await isReferenced(relative(artifacts, objectPath).replaceAll('\\', '/'), undefined, referenceFiles, contents)) {
        exclusions.push({ path: objectPath, reason: 'referenced-content-object' })
        continue
      }
      await addCandidate('artifacts/objects', objectPath, policy.defaults.objectDays ?? 30, 'unreferenced-content-object-expired')
    }
  }
  return { generatedAt: new Date(now).toISOString(), candidates: candidates.sort((a, b) => a.path.localeCompare(b.path)), exclusions, space: inodeSummary(selectedFiles) }
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
  if (!within(root, path)) throw new Error(`Refusing to remove path outside managed root: ${path}`)
  await assertPhysicalAncestors(candidate.repositoryRoot ?? root, path)
  const info = await lstat(path)
  if (info.isSymbolicLink()) throw new Error(`Refusing to remove symbolic link: ${path}`)
  if (candidate.repositoryRoot) {
    await assertNoActiveBuilds(candidate.repositoryRoot)
    const artifacts = join(candidate.repositoryRoot, 'artifacts')
    const references = [...await collectJsonFiles(join(artifacts, 'release')), ...await collectJsonFiles(join(artifacts, 'verification'))]
    const id = candidate.reason.startsWith('historical-verification') || candidate.reason === 'disposable-package-unpacked' ? undefined : path.split(/[\\/]/u).at(-1)
    // A stage can become active or acquire a durable reference after planning.
    for (const version of await directChildren(join(artifacts, 'stage'))) {
      const active = await readFile(join(version, 'current.json'), 'utf8').then(JSON.parse, () => undefined)
      if (!active?.buildId || !/^[A-Za-z0-9._-]+$/u.test(active.buildId)) continue
      if (path === join(version, active.buildId)) throw new Error('Cleanup candidate became the active stage')
      references.push(...await collectJsonFiles(join(version, active.buildId)))
    }
    if (await isReferenced(path, id, references)) throw new Error('Cleanup candidate acquired a protected reference')
  }
  const current = await treeDigest(path, { protectDependencies: expected.protectDependencies !== false })
  if (current.sha256 !== expected.sha256 || current.bytes !== expected.bytes) throw new Error(`Cleanup candidate changed after dry-run: ${path}`)
  const evidence = candidate.preserveEvidence ? await retainVerificationEvidence(path) : undefined
  await rm(path, { recursive: info.isDirectory(), force: false })
  return evidence
}
