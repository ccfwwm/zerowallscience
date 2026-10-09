import { createHash, randomUUID } from 'node:crypto'
import { cp, link, mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { offlineFiles } from '../commands/offline-profile.mjs'
import { root, stageRoot, cacheRoot, applicationVersion } from './paths.mjs'

/** Reuse verified assembled bytes, including their exact file set. The stage
 * receives immutable hard links; later tasks read them or copy into packages.
 * Build provenance is written separately for each stage. */
export async function reuseAssembly({ cache, output, key, prepare }) {
  const cached = join(cache, key)
  const prior = await readFile(join(cached, 'receipt.json'), 'utf8').then(JSON.parse, () => undefined)
  const actual = prior && await offlineFiles(join(cached, 'modules')).catch(() => undefined)
  const started = Date.now()
  if (prior?.key === key && actual && JSON.stringify(actual) === JSON.stringify(prior.files)) {
    await mkdir(output, { recursive: true })
    let next = 0
    await Promise.all(Array.from({ length: 16 }, async () => {
      while (next < actual.length) {
        const entry = actual[next++]
        const source = join(cached, 'modules', entry.path), target = join(output, entry.path)
        await mkdir(dirname(target), { recursive: true })
        try { await link(source, target) }
        catch (error) { if (!['EXDEV', 'EPERM', 'EACCES'].includes(error.code)) throw error; await cp(source, target) }
      }
    }))
    console.log(`CACHE HIT runtime-assembly ${key.slice(0, 12)} ${Date.now() - started}ms; verified ${actual.length} files`)
    return prior.metadata
  }
  console.log(`REBUILD runtime-assembly ${key.slice(0, 12)}: ${prior ? 'output file set/hash changed' : 'no component cache'}`)
  const metadata = await prepare()
  const pending = cached + '.candidate-' + randomUUID()
  await mkdir(pending, { recursive: true })
  await cp(output, join(pending, 'modules'), { recursive: true })
  await writeFile(join(pending, 'receipt.json'), JSON.stringify({ key, metadata, files: await offlineFiles(join(pending, 'modules')) }))
  const withinCache = path => { const rel = relative(resolve(cache), resolve(path)); return rel && rel !== '..' && !rel.startsWith('..' + sep) }
  if (!withinCache(cached) || !withinCache(pending)) throw new Error('Runtime assembly cache escapes its owned root')
  if (await stat(cached).catch(() => undefined)) await rename(cached, cached + '.damaged-' + randomUUID())
  await rename(pending, cached)
  console.log(`BUILT runtime-assembly ${key.slice(0, 12)} ${Date.now() - started}ms`)
  return metadata
}

export async function assembleRuntime(kind, run) {
  const offline = kind === 'offline'
  const profile = JSON.parse(await readFile(join(root, 'config/layout/runtime-profile.json'), 'utf8'))
  delete profile.version
  const tasks = []
  for (const file of await readdir(join(cacheRoot, 'build-graph/tasks'))) {
    const receipt = JSON.parse(await readFile(join(cacheRoot, 'build-graph/tasks', file), 'utf8'))
    if (receipt.status !== 'success' || receipt.task === 'desktop' || receipt.task === 'runtime' || receipt.task.startsWith('resource:')) continue
    if (!offline && receipt.task.startsWith('plugin-build:') && !profile.corePlugins.includes('@zerowallscience/plugin-' + receipt.task.split(':')[1])) continue
    if (!offline && receipt.task.startsWith('package-build:') && receipt.task !== 'package-build:integrity-runtime' && !profile.corePackageDependencies.includes(receipt.dependencyVersions?.package)) continue
    tasks.push({ task: receipt.task, fingerprint: receipt.fingerprint, outputIntegrity: receipt.outputIntegrity })
  }
  const recipes = {}
  for (const file of await readdir(join(root, 'tools/packaging'))) if (['prepare-runtime.mjs', 'dedupe-runtime.mjs'].includes(file) || file.startsWith('adapt-')) recipes[file] = createHash('sha256').update(await readFile(join(root, 'tools/packaging', file))).digest('hex')
  const key = createHash('sha256').update(JSON.stringify({ schema: 1, kind, profile, tasks: tasks.sort((a, b) => a.task.localeCompare(b.task)), recipes, native: JSON.parse(await readFile(join(cacheRoot, 'native-runtime.json'), 'utf8')), ...(offline ? {} : { applicationVersion }) })).digest('hex')
  const parent = join(stageRoot, offline ? 'offline-profile' : 'runtime')
  const receiptPath = join(parent, 'build-receipt.json')
  const metadata = await reuseAssembly({ cache: join(cacheRoot, 'runtime-assemblies', kind), output: join(parent, offline ? 'modules' : 'node_modules'), key, prepare: async () => {
    run(offline ? 'runtime:profile:prepare' : 'runtime:prepare')
    const receipt = JSON.parse(await readFile(receiptPath, 'utf8'))
    return { deduplication: receipt.deduplication, topLevelInstances: receipt.topLevelInstances }
  } })
  const build = JSON.parse(await readFile(join(stageRoot, 'dsh/build-receipt.json'), 'utf8'))
  await writeFile(receiptPath, JSON.stringify({ ...build, ...metadata }, null, 2))
}
