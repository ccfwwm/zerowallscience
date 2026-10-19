import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { offlineFiles } from '../commands/offline-profile.mjs'
import { root, stageRoot, cacheRoot, applicationVersion, artifactRoot } from './paths.mjs'
import { materializeTree } from './materialize-tree.mjs'
import { commitCache } from './commit-cache.mjs'
import { shareImmutableFiles } from './share-immutable-files.mjs'
import { stampDesktopVersion } from './stamp-desktop-version.mjs'
import { runtimeRecipes } from './runtime-recipes.mjs'

/** Reuse verified assembled bytes, including their exact file set. The stage
 * receives immutable hard links; later tasks read them or copy into packages.
 * Build provenance is written separately for each stage. */
export async function reuseAssembly({ cache, output, key, prepare, linkFile, objectRoot }) {
  if (!/^[A-Za-z0-9_-]+$/u.test(key)) throw new Error('Invalid runtime assembly cache key')
  const cached = join(cache, key)
  const prior = await readFile(join(cached, 'receipt.json'), 'utf8').then(JSON.parse, () => undefined)
  const actual = prior && await offlineFiles(join(cached, 'modules')).catch(() => undefined)
  const started = Date.now()
  if (prior?.key === key && actual && JSON.stringify(actual) === JSON.stringify(prior.files)) {
    await mkdir(output, { recursive: true })
    const materialization = await materializeTree({ source: join(cached, 'modules'), destination: output, sourceKey: key, expectedFiles: actual, linkFile })
    console.log(`CACHE HIT runtime-assembly ${key.slice(0, 12)} ${Date.now() - started}ms; verified ${actual.length} files`)
    return { ...(prior.metadata ?? {}), materialization }
  }
  console.log(`REBUILD runtime-assembly ${key.slice(0, 12)}: ${prior ? 'output file set/hash changed' : 'no component cache'}`)
  const pending = cached + '.candidate-' + randomUUID()
  await mkdir(pending, { recursive: true })
  const pendingModules = join(pending, 'modules')
  // Assemble directly in the owned candidate, including all adaptations.
  // Only validated immutable bytes are ever linked into a release stage.
  const metadata = await prepare(pendingModules)
  const files = await offlineFiles(pendingModules)
  if (objectRoot) await shareImmutableFiles(pendingModules, files, objectRoot)
  await writeFile(join(pending, 'receipt.json'), JSON.stringify({ key, metadata, files, createdAt: new Date().toISOString() }, null, 2))
  await commitCache(pending, cached)
  const materialization = await materializeTree({ source: join(cached, 'modules'), destination: output, sourceKey: key, expectedFiles: files, linkFile })
  console.log(`BUILT runtime-assembly ${key.slice(0, 12)} ${Date.now() - started}ms`)
  return { ...metadata, materialization }
}

export async function assembleRuntime(kind, run) {
  const offline = kind === 'offline'
  const profile = JSON.parse(await readFile(join(root, 'config/layout/runtime-profile.json'), 'utf8'))
  delete profile.version
  const tasks = []
  for (const file of await readdir(join(cacheRoot, 'build-graph/tasks'))) {
    const receipt = JSON.parse(await readFile(join(cacheRoot, 'build-graph/tasks', file), 'utf8'))
    if (receipt.status !== 'success' || receipt.task === 'desktop' || receipt.task === 'runtime' || receipt.task.startsWith('resource:') || receipt.task.startsWith('plugin-pack:')) continue
    if (!offline && receipt.task.startsWith('plugin-build:') && !profile.corePlugins.includes('@zerowallscience/plugin-' + receipt.task.split(':')[1])) continue
    if (!offline && receipt.task.startsWith('package-build:') && receipt.task !== 'package-build:integrity-runtime' && !profile.corePackageDependencies.includes(receipt.dependencyVersions?.package)) continue
    tasks.push({ task: receipt.task, fingerprint: receipt.fingerprint, outputIntegrity: receipt.outputIntegrity })
  }
  const recipes = await runtimeRecipes(root)
  const key = createHash('sha256').update(JSON.stringify({ schema: 2, kind, profile, tasks: tasks.sort((a, b) => a.task.localeCompare(b.task)), recipes, native: JSON.parse(await readFile(join(cacheRoot, 'native-runtime.json'), 'utf8')) })).digest('hex')
  const parent = join(stageRoot, offline ? 'offline-profile' : 'runtime')
  const receiptPath = join(parent, 'build-receipt.json')
  const metadata = await reuseAssembly({ cache: join(cacheRoot, 'runtime-assemblies', kind), objectRoot: artifactRoot, output: join(parent, offline ? 'modules' : 'node_modules'), key, prepare: async destination => {
    run(offline ? 'runtime:profile:prepare' : 'runtime:prepare', ['--cache-output', destination])
    const receipt = JSON.parse(await readFile(receiptPath, 'utf8'))
    return { deduplication: receipt.deduplication, topLevelInstances: receipt.topLevelInstances }
  } })
  metadata.desktopVersionStamp = { version: applicationVersion,
    files: await stampDesktopVersion(join(parent, offline ? 'modules' : 'node_modules'), applicationVersion) }
  const build = JSON.parse(await readFile(join(stageRoot, 'dsh/build-receipt.json'), 'utf8'))
  await writeFile(receiptPath, JSON.stringify({ ...build, ...metadata, recipes }, null, 2))
}
