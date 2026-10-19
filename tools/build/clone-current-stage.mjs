import { randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { materializeTree, mutableReceipt } from './materialize-tree.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')

/** A runtime receipt alone cannot certify that plugins:pack and the build finished. */
export async function verifyStageCompletion(stage, { applicationVersion, buildId }) {
  const directory = await lstat(stage)
  if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error(`Invalid build stage: ${stage}`)
  const json = async path => {
    const file = join(stage, path)
    const info = await lstat(file)
    if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Invalid stage receipt: ${file}`)
    return JSON.parse(await readFile(file, 'utf8'))
  }
  const receipt = await json('build-receipt.json')
  if (receipt.status !== 'success' || receipt.applicationVersion !== applicationVersion || receipt.buildId !== buildId) {
    throw new Error('The stage does not contain a successful final build receipt for this application version and build ID.')
  }
  const snapshot = await json('plugin-snapshot.json')
  if (!/^[a-f0-9]{64}$/u.test(receipt.pluginSnapshotId ?? '') || receipt.pluginSnapshotId !== snapshot.snapshotId || snapshot.applicationVersion !== applicationVersion) {
    throw new Error('The stage final build receipt is not bound to its plugin snapshot.')
  }
  const runtimeReceipt = await json('runtime/build-receipt.json')
  if (runtimeReceipt.applicationVersion !== applicationVersion || typeof runtimeReceipt.commit !== 'string' || typeof runtimeReceipt.version !== 'string') {
    throw new Error('The stage does not contain a valid runtime build receipt for this application version.')
  }
  for (const path of ['dsh/build-receipt.json', 'offline-profile/receipt.json', 'runtime/integrity-receipt.json']) await json(path)
  return { receipt, snapshot, runtimeReceipt }
}

function contained(parent, candidate) {
  const rel = relative(resolve(parent), resolve(candidate))
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
}

async function assertNoLinks(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    const info = await lstat(path)
    if (info.isSymbolicLink()) throw new Error(`Refusing to clone a stage containing a symbolic link: ${path}`)
    if (info.isDirectory()) await assertNoLinks(path)
    else if (!info.isFile()) throw new Error(`Refusing to clone a stage containing a special file: ${path}`)
  }
}

/** Clone the active, verified runtime stage to a fresh build ID for desktop-only packaging. */
export async function activateStage({ root = repositoryRoot, applicationVersion, buildId } = {}) {
  const artifactRoot = resolve(process.env.ZEROWALL_ARTIFACT_ROOT ?? join(root, 'artifacts'))
  const version = applicationVersion ?? JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version
  if (!/^[A-Za-z0-9._-]+$/u.test(buildId ?? '')) throw new Error('The build ID is invalid.')
  const versionRoot = join(artifactRoot, 'stage', version)
  const destination = resolve(versionRoot, buildId)
  if (!contained(versionRoot, destination) || !(await stat(destination).catch(() => undefined))?.isDirectory()) {
    throw new Error(`Cannot activate a missing build stage: ${destination}`)
  }
  await verifyStageCompletion(destination, { applicationVersion: version, buildId })
  const pointer = join(versionRoot, 'current.json')
  const temporary = `${pointer}.${randomUUID()}.tmp`
  await writeFile(temporary, `${JSON.stringify({ buildId, applicationVersion: version }, null, 2)}\n`)
  try { await rename(temporary, pointer) } catch (error) { await rm(temporary, { force: true }).catch(() => undefined); throw error }
  return { applicationVersion: version, buildId, stage: destination }
}

export async function cloneCurrentStage({ root = repositoryRoot, buildId, createdAt = new Date().toISOString(), activate = true } = {}) {
  const applicationVersion = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version
  const artifactRoot = resolve(process.env.ZEROWALL_ARTIFACT_ROOT ?? join(root, 'artifacts'))
  const versionRoot = join(artifactRoot, 'stage', applicationVersion)
  const activePath = join(versionRoot, 'current.json')
  const active = JSON.parse(await readFile(activePath, 'utf8'))
  if (active.applicationVersion !== applicationVersion || !/^[A-Za-z0-9._-]+$/u.test(active.buildId ?? '')) {
    throw new Error('The active stage pointer has an invalid application version or build ID.')
  }

  const source = resolve(versionRoot, active.buildId)
  const sourceInfo = await lstat(source).catch(() => undefined)
  if (!contained(versionRoot, source) || !sourceInfo?.isDirectory() || sourceInfo.isSymbolicLink()) {
    throw new Error(`The active build stage is missing or outside its version directory: ${source}`)
  }
  const { receipt: sourceReceipt, runtimeReceipt } = await verifyStageCompletion(source, { applicationVersion, buildId: active.buildId })

  const nextBuildId = buildId ?? `${Date.now()}-${randomUUID().slice(0, 8)}`
  if (!/^[A-Za-z0-9._-]+$/u.test(nextBuildId) || nextBuildId === active.buildId) throw new Error('The new build ID is invalid or matches the active build ID.')
  const destination = resolve(versionRoot, nextBuildId)
  if (!contained(versionRoot, destination)) throw new Error('The new stage path escapes the application version directory.')
  if (await stat(destination).catch(() => undefined)) throw new Error(`Refusing to overwrite an existing build stage: ${destination}`)

  await assertNoLinks(source)
  await mkdir(versionRoot, { recursive: true })
  // The destination is unique and inactive until current.json is switched.
  // Avoid renaming a large directory on Windows, where antivirus/indexers
  // may hold descendants open even after all copy operations have finished.
  await mkdir(destination)
  try {
    const materialization = await materializeTree({ source, destination, sourceKey: active.buildId,
      // These script-owned areas are refreshed during packaging. Copy them
      // privately so an in-place adaptation cannot alter the prior stage.
      shouldCopy: path => path === 'plugin-snapshot.json' || path === 'bundled-resource-receipt.json' || path === 'resources/zerowall-core.patch.yml' || mutableReceipt(path) || /^(?:commands|electron-app|installer-ui|nsis-overlay|python-updater)\//u.test(path),
      include: path => !/^(?:stage-clone-(?:receipt|failure)|build-failure)\.json$/u.test(path),
    })
    await writeFile(join(destination, 'stage-clone-receipt.json'), `${JSON.stringify({
      schema: 1,
      applicationVersion,
      buildId: nextBuildId,
      sourceBuildId: active.buildId,
      pluginSnapshotId: sourceReceipt.pluginSnapshotId,
      runtimeCommit: runtimeReceipt.commit,
      dshVersion: runtimeReceipt.version,
      createdAt,
      materialization,
    }, null, 2)}\n`)
    await writeFile(join(destination, 'build-receipt.json'), `${JSON.stringify({
      ...sourceReceipt, buildId: nextBuildId, sourceBuildId: active.buildId,
      mode: 'stage-clone', status: activate ? 'success' : 'pending',
    }, null, 2)}\n`)
    if (activate) await activateStage({ root, applicationVersion, buildId: nextBuildId })
  } catch (error) {
    // Keep the interrupted candidate and failure evidence for inspection/GC.
    // The active pointer still references the previous complete generation.
    await writeFile(join(destination, 'stage-clone-failure.json'), `${JSON.stringify({
      schema: 1, buildId: nextBuildId, sourceBuildId: active.buildId, failedAt: new Date().toISOString(), error: String(error.message),
    }, null, 2)}\n`).catch(() => undefined)
    throw error
  }

  return { applicationVersion, buildId: nextBuildId, sourceBuildId: active.buildId, stage: destination, activated: activate }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await cloneCurrentStage()
  console.log(`Cloned active runtime stage ${result.sourceBuildId} to ${result.buildId}.`)
}
