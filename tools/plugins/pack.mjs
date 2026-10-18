import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile, realpath, stat, access } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { offlineFiles } from '../commands/offline-profile.mjs'
import { fileDigest } from '../commands/resource-catalog.mjs'
import { basename, dirname, join, sep } from 'node:path'
import { root, stageRoot, releaseRoot, cacheRoot, pluginStoreRoot, pluginSnapshotStoreRoot } from '../build/paths.mjs'
import { preparePublishPackage } from './publish-package.mjs'
import { commitImmutablePackage } from './immutable-package.mjs'
import { historicalPackage } from './package-history.mjs'
import { packageSource } from '../build/layout.mjs'
import { restorePublishedOutput } from './published-output.mjs'
import { integrationPublishSource, usesReviewedRuntime } from './publish-source.mjs'
import { pluginSnapshotId as snapshotId, readRetiredPluginIds, withoutRetiredPlugins, readVerifiedPluginFeed, assertFeedNotRegressed, mergePluginFeed } from './snapshot.mjs'
const pnpm = process.env.npm_execpath
if (!pnpm) throw new Error('Invoke with pnpm plugins:pack')
const records = []
const immutableReceipts = []
const historical = []
const selectedPlugin = process.argv.includes('--plugin') ? process.argv[process.argv.indexOf('--plugin') + 1] : undefined
const consumerOnly = process.argv.includes('--consumer-only')
if (consumerOnly && selectedPlugin) throw new Error('Consumer-only packaging cannot target one plugin.')
if (process.argv.includes('--plugin') && !selectedPlugin) throw new Error('Usage: pnpm plugin:pack <plugin-id>')
await mkdir(releaseRoot, { recursive: true })
await mkdir(pluginStoreRoot, { recursive: true })
await mkdir(pluginSnapshotStoreRoot, { recursive: true })
const sharedRecordsPath = join(pluginStoreRoot, 'plugin-packages.json')

const retiredPluginIds = await readRetiredPluginIds()
const sharedRecords = await readVerifiedPluginFeed(pluginStoreRoot) ?? []

async function writeSnapshot(records) {
  const dshCommit = JSON.parse(await readFile(join(root, 'config/deepseek-harness/upstream.json'), 'utf8')).commit
  const id = snapshotId(records, dshCommit)
  const document = { schema: 1, snapshotId: id, dshCommit, createdAt: new Date().toISOString(),
    applicationVersion: JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version,
    plugins: records.map(({ id: packageId, version, kind, size, sha256, path }) => ({ id: packageId, version, kind, size, sha256, path })),
  }
  const directory = join(pluginSnapshotStoreRoot, id)
  await mkdir(directory, { recursive: true })
  const path = join(directory, 'snapshot.json')
  try { await writeFile(path, JSON.stringify(document, null, 2) + '\n', { flag: 'wx' }) } catch (error) { if (error.code !== 'EEXIST') throw error }
  await writeFile(join(releaseRoot, 'plugin-snapshot.json'), JSON.stringify(document, null, 2) + '\n')
  await writeFile(join(stageRoot, 'plugin-snapshot.json'), JSON.stringify(document, null, 2) + '\n')
  return document
}

async function verifyConsumerSnapshot() {
  // Plugin bytes live outside the application-version release directory.
  // A desktop-only version must consume this immutable feed rather than
  // guessing a historical application version by directory sort order.
  const records = sharedRecords
  if (!records?.length) throw new Error('Consumer-only packaging requires an existing verified plugin snapshot; run the component build and plugins:pack once.')
  const receipt = await readFile(join(stageRoot, 'build-receipt.json'), 'utf8').then(JSON.parse, () => undefined)
  const pin = JSON.parse(await readFile(join(root, 'config/deepseek-harness/upstream.json'), 'utf8'))
  if (!receipt?.pluginSnapshotId || receipt.pluginSnapshotId !== snapshotId(records, pin.commit)) {
    throw new Error('Consumer-only plugin snapshot differs from the verified component stage; run pnpm build before packaging updated plugins.')
  }
  await writeFile(join(releaseRoot, 'plugin-packages.json'), JSON.stringify(records, null, 2) + '\n')
  const snapshot = await writeSnapshot(records)
  console.log(`CONSUMER-ONLY plugin snapshot ${snapshot.snapshotId}; verified ${records.length} immutable artifacts`)
  process.exit(0)
}
if (consumerOnly) await verifyConsumerSnapshot()
for (const historyRoot of [dirname(releaseRoot), process.env.ZEROWALL_PACKAGE_HISTORY_ROOT].filter(Boolean)) for (const version of await readdir(historyRoot).catch(error => {
  if (error.code === 'ENOENT') return []
  throw error
})) {
  if (version === basename(releaseRoot)) continue
  try { historical.push(...JSON.parse(await readFile(join(historyRoot, version, 'plugin-packages.json'), 'utf8'))) }
  catch (error) { if (error.code !== 'ENOENT') throw error }
}
const existingRecords = withoutRetiredPlugins(await readFile(join(releaseRoot, 'plugin-packages.json'), 'utf8').then(JSON.parse, () => []), retiredPluginIds)
const packCachePath = join(cacheRoot, 'plugin-packages.json')
const cachedRecords = await readFile(packCachePath, 'utf8').then(JSON.parse, () => [])
async function checkpoint() {
  await mkdir(cacheRoot, { recursive: true })
  const identities = new Set(records.map(record => `${record.id}@${record.version}:${record.sourceFingerprint}`))
  await writeFile(packCachePath, JSON.stringify([...cachedRecords.filter(record => !identities.has(`${record.id}@${record.version}:${record.sourceFingerprint}`)), ...records]))
}
const sources = (await readdir(join(root, 'plugins'))).filter(name => name !== 'wechat').map(name => join(root, 'plugins', name))
sources.push(join(root, 'plugins', 'research-store'), await packageSource('integrity-runtime'), await packageSource('dsh-bundle-science'))
sources.push(await packageSource('dsh-wechat'))
// Optional catalog plugins do not require a desktop offline-profile build.
const integrations = JSON.parse(await readFile(join(root, 'config/integrations/upstream-sources.json'), 'utf8'))
for (const integration of Object.values(integrations)) {
  const source = integrationPublishSource(integration, { root, stageRoot })
  if (!source) continue
  // A missing reviewed runtime is a failed publication prerequisite, not
  // permission to change an existing version's archive shape.
  if (usesReviewedRuntime(integration)) await access(join(source, 'package.json'))
  sources.push(source)
}
// Preserve the tested Office adapter Git pin as an independently signed
// support tarball; pnpm 11 correctly rejects Git dependencies nested in bundles.
sources.push(dirname(await realpath(join(root, 'plugins/files/node_modules/dsh-office-tools/package.json'))))
if (!selectedPlugin) {
  const knownSources = new Set((await Promise.all(sources.map(async source => {
    const manifest = await readFile(join(source, 'package.json'), 'utf8').then(JSON.parse, error => {
      if (error.code === 'ENOENT') return undefined
      throw error
    })
    return manifest?.name
  }))).filter(Boolean))
  const defaults = JSON.parse(await readFile(join(stageRoot, 'commands/default-plugins.json'), 'utf8'))
  for (const id of defaults) {
    if (id.startsWith('@deepseek-ai/') || knownSources.has(id)) continue
    // Package the exact reviewed/adapted runtime rather than a registry copy
    // that could omit Office, Zotero, theme or sidebar compatibility fixes.
    sources.push(join(stageRoot, 'offline-profile/modules', id))
  }
}
// One package can have a source tree and a reviewed/adapted runtime tree.
// Resolve by package name and prefer the adapted stage output, then the
// canonical plugin source, so the feed contains one archive per package.
const sourceCandidates = []
for (const source of sources) {
  const manifest = await readFile(join(source, 'package.json'), 'utf8').then(JSON.parse, () => undefined)
  if (!manifest?.name) continue
  const priority = source.includes(`${sep}offline-profile${sep}modules${sep}`) ? 50
    : source.includes(`${sep}plugins${sep}`) ? 30 : 20
  sourceCandidates.push({ source, manifest, priority })
}
const sourceByPackage = new Map()
for (const candidate of sourceCandidates) {
  const current = sourceByPackage.get(candidate.manifest.name)
  if (!current || candidate.priority > current.priority) sourceByPackage.set(candidate.manifest.name, candidate)
}
const selectedSources = selectedPlugin
  ? [...sourceByPackage.values()].filter(({ source, manifest }) => source.split(/[\\/]/u).at(-1) === selectedPlugin || manifest.name === selectedPlugin).map(({ source }) => source)
  : [...sourceByPackage.values()].map(({ source }) => source)
if (selectedPlugin && !selectedSources.length) throw new Error(`Unknown plugin source: ${selectedPlugin}`)
for (const source of selectedSources) {
  const manifest = await readFile(join(source, 'package.json'), 'utf8').then(JSON.parse, () => undefined)
  if (!manifest) continue
  const directory = manifest.name.split('/').at(-1)
  const version = manifest.version
  const staging = join(stageRoot, 'plugin-packages', directory, randomUUID())
  const { publish } = await preparePublishPackage(source, staging)
  const baseline = await historicalPackage(manifest.name, version)
  const sourceFingerprint = createHash('sha256').update(JSON.stringify(await offlineFiles(staging))).digest('hex')
  const destination = join(pluginStoreRoot, directory, version)
  await mkdir(destination, { recursive: true })
  const reusable = [...sharedRecords, ...existingRecords, ...cachedRecords, ...historical].find(record => record.id === manifest.name && record.version === version && record.sourceFingerprint === sourceFingerprint)
  if (reusable?.sha256 && (await stat(reusable.path).catch(() => undefined))?.size === reusable.size && await fileDigest(reusable.path) === reusable.sha256) {
    const archive = join(destination, basename(reusable.path))
    immutableReceipts.push({ id: manifest.name, version, ...await commitImmutablePackage(reusable.path, archive, baseline?.path) })
    records.push({ ...reusable, path: archive, size: (await stat(archive)).size, sha256: await fileDigest(archive) })
    immutableReceipts.push({ id: manifest.name, version, preserved: true, sha256: reusable.sha256, reason: 'unchanged content fingerprint and verified original archive' })
    console.log(`CACHE HIT plugin-pack:${manifest.name} ${reusable.sha256}; reused original tarball`)
    await checkpoint()
    continue
  }
  const published = await restorePublishedOutput(source, { restore: false })
  if (published) {
    const archive = join(destination, basename(published.path))
    await commitImmutablePackage(published.path, archive, baseline?.path)
    records.push({ id: manifest.name, version, path: archive, kind: manifest.dsh?.bundle ? 'plugin' : 'support', manifest: publish.zerowall, dependencies: publish.dependencies, sourceFingerprint, size: (await stat(archive)).size, sha256: published.sha256 })
    immutableReceipts.push({ id: manifest.name, version, preserved: true, sha256: published.sha256, reason: 'signed archive and identical source, dependency, compiler and compiled bytes' })
    console.log(`CACHE HIT plugin-pack:${manifest.name} ${published.sha256}; verified published source and original tarball`)
    await checkpoint()
    continue
  }
  const pendingDirectory = join(staging, 'archive')
  await mkdir(pendingDirectory, { recursive: true })
  execFileSync(process.execPath, [pnpm, 'pack', '--pack-destination', pendingDirectory], { cwd: staging, stdio: 'inherit' })
  const name = (await readdir(pendingDirectory)).find(file => file.endsWith('.tgz'))
  const candidate = join(pendingDirectory, name)
  const archive = join(destination, name)
  const packed = JSON.parse(execFileSync('tar', ['-xOf', candidate, 'package/package.json'], { encoding: 'utf8' }))
  if (JSON.stringify(packed.dependencies ?? {}).match(/workspace:|github:|git\+|git:/)) throw new Error(`Non-publishable dependency in ${manifest.name}`)
  const contents = execFileSync('tar', ['-tf', candidate], { encoding: 'utf8' })
  for (const entry of manifest.zerowall?.runtimeFiles ?? []) if (!contents.split(/\r?\n/u).includes('package/' + entry)) throw new Error(`Missing runtime asset for ${manifest.name}: ${entry}`)
  if (manifest.main && !contents.includes('package/' + manifest.main.replace(/^\.\//, ''))) throw new Error(`Missing Host bundle for ${manifest.name}`)
  if (manifest.zerowall?.capabilities && !manifest.zerowall?.rollbackSupported) throw new Error('Missing plugin rollback contract')
  immutableReceipts.push({ id: manifest.name, version, ...await commitImmutablePackage(candidate, archive, baseline?.path) })
  records.push({ id: manifest.name, version, path: archive, kind: manifest.dsh?.bundle && manifest.name !== 'dsh-office-tools' ? 'plugin' : 'support', manifest: publish.zerowall, dependencies: publish.dependencies, sourceFingerprint, size: (await stat(archive)).size, sha256: await fileDigest(archive) })
  await checkpoint()
}
const currentRecordsPath = join(releaseRoot, 'plugin-packages.json')
const currentReceiptsPath = join(releaseRoot, 'immutable-package-receipt.json')
const completeRecords = selectedPlugin ? mergePluginFeed(sharedRecords.length ? sharedRecords : existingRecords, records) : records
assertFeedNotRegressed(sharedRecords, completeRecords)
if (selectedPlugin) {
  // A feed advertises the current version for each plugin. Keep historical
  // archives in the content cache, not ahead of the new version in this list.
  await writeFile(currentRecordsPath, JSON.stringify(completeRecords, null, 2))
  const priorReceipts = await readFile(currentReceiptsPath, 'utf8').then(JSON.parse, () => [])
  await writeFile(currentReceiptsPath, JSON.stringify([...priorReceipts, ...immutableReceipts], null, 2) + '\n')
} else {
  await writeFile(currentRecordsPath, JSON.stringify(records, null, 2))
  await writeFile(currentReceiptsPath, JSON.stringify(immutableReceipts, null, 2) + '\n')
}
await writeFile(sharedRecordsPath, JSON.stringify(completeRecords, null, 2) + '\n')
const snapshot = await writeSnapshot(completeRecords)
console.log(`PLUGIN SNAPSHOT ${snapshot.snapshotId}; ${completeRecords.length} immutable component artifacts`)
