import { randomUUID } from 'node:crypto'
import { cp, lstat, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

const repositoryRoot = resolve(import.meta.dirname, '../..')

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
export async function cloneCurrentStage({ root = repositoryRoot, buildId, createdAt = new Date().toISOString() } = {}) {
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
  const runtimeReceiptPath = join(source, 'runtime', 'build-receipt.json')
  const runtimeReceipt = JSON.parse(await readFile(runtimeReceiptPath, 'utf8'))
  if (runtimeReceipt.applicationVersion !== applicationVersion || typeof runtimeReceipt.commit !== 'string' || typeof runtimeReceipt.version !== 'string') {
    throw new Error('The active stage does not contain a valid runtime build receipt for this application version.')
  }

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
    await cp(source, destination, { recursive: true, force: false, errorOnExist: true })
    await writeFile(join(destination, 'stage-clone-receipt.json'), `${JSON.stringify({
      schema: 1,
      applicationVersion,
      buildId: nextBuildId,
      sourceBuildId: active.buildId,
      runtimeCommit: runtimeReceipt.commit,
      dshVersion: runtimeReceipt.version,
      createdAt,
    }, null, 2)}\n`)
  } catch (error) {
    // Keep the interrupted candidate and failure evidence for inspection/GC.
    // The active pointer still references the previous complete generation.
    await writeFile(join(destination, 'stage-clone-failure.json'), `${JSON.stringify({
      schema: 1, buildId: nextBuildId, sourceBuildId: active.buildId, failedAt: new Date().toISOString(), error: String(error.message),
    }, null, 2)}\n`).catch(() => undefined)
    throw error
  }

  const pointerTemp = `${activePath}.${randomUUID()}.tmp`
  try {
    await writeFile(pointerTemp, `${JSON.stringify({ buildId: nextBuildId, applicationVersion }, null, 2)}\n`)
    await rename(pointerTemp, activePath)
  } catch (error) {
    await rm(pointerTemp, { force: true }).catch(() => undefined)
    throw error
  }
  return { applicationVersion, buildId: nextBuildId, sourceBuildId: active.buildId, stage: destination }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await cloneCurrentStage()
  console.log(`Cloned active runtime stage ${result.sourceBuildId} to ${result.buildId}.`)
}
