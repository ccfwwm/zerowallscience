import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, readFile, readdir, writeFile, realpath, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { offlineFiles } from '../commands/offline-profile.mjs'
import { fileDigest } from '../commands/resource-catalog.mjs'
import { basename, dirname, join } from 'node:path'
import { root, stageRoot, releaseRoot, cacheRoot } from '../build/paths.mjs'
import { preparePublishPackage } from './publish-package.mjs'
import { preserveImmutablePackage } from './immutable-package.mjs'
import { packageSource } from '../build/layout.mjs'
import { restorePublishedOutput } from './published-output.mjs'
const pnpm = process.env.npm_execpath
if (!pnpm) throw new Error('Invoke with pnpm plugins:pack')
const records = []
const immutableReceipts = []
const historical = []
const selectedPlugin = process.argv.includes('--plugin') ? process.argv[process.argv.indexOf('--plugin') + 1] : undefined
if (process.argv.includes('--plugin') && !selectedPlugin) throw new Error('Usage: pnpm plugin:pack <plugin-id>')
await mkdir(releaseRoot, { recursive: true })
for (const historyRoot of [dirname(releaseRoot), process.env.ZEROWALL_PACKAGE_HISTORY_ROOT].filter(Boolean)) for (const version of await readdir(historyRoot).catch(error => {
  if (error.code === 'ENOENT') return []
  throw error
})) {
  if (version === basename(releaseRoot)) continue
  try { historical.push(...JSON.parse(await readFile(join(historyRoot, version, 'plugin-packages.json'), 'utf8'))) }
  catch (error) { if (error.code !== 'ENOENT') throw error }
}
const existingRecords = await readFile(join(releaseRoot, 'plugin-packages.json'), 'utf8').then(JSON.parse, () => [])
const packCachePath = join(cacheRoot, 'plugin-packages.json')
const cachedRecords = await readFile(packCachePath, 'utf8').then(JSON.parse, () => [])
async function checkpoint() {
  await mkdir(cacheRoot, { recursive: true })
  const identities = new Set(records.map(record => `${record.id}@${record.version}:${record.sourceFingerprint}`))
  await writeFile(packCachePath, JSON.stringify([...cachedRecords.filter(record => !identities.has(`${record.id}@${record.version}:${record.sourceFingerprint}`)), ...records]))
}
const sources = (await readdir(join(root, 'plugins'))).filter(name => name !== 'wechat').map(name => join(root, 'plugins', name))
sources.push(join(root, 'store'), await packageSource('integrity-runtime'), await packageSource('dsh-bundle-science'))
sources.push(await packageSource('dsh-wechat'))
// This adapter's published runtime excludes generated TypeScript declarations.
sources.push(join(stageRoot, 'offline-profile/modules/@dingyi222666/dsh-session-notification'))
// Preserve the tested Office adapter Git pin as an independently signed
// support tarball; pnpm 11 correctly rejects Git dependencies nested in bundles.
sources.push(dirname(await realpath(join(root, 'plugins/files/node_modules/dsh-office-tools/package.json'))))
if (!selectedPlugin) {
  const knownSources = new Set(await Promise.all(sources.map(async source => JSON.parse(await readFile(join(source, 'package.json'), 'utf8')).name)))
  const defaults = JSON.parse(await readFile(join(stageRoot, 'commands/default-plugins.json'), 'utf8'))
  for (const id of defaults) {
    if (id.startsWith('@deepseek-ai/') || knownSources.has(id)) continue
    // Package the exact reviewed/adapted runtime rather than a registry copy
    // that could omit Office, Zotero, theme or sidebar compatibility fixes.
    sources.push(join(stageRoot, 'offline-profile/modules', id))
  }
}
const selectedSources = selectedPlugin ? sources.filter(source => source.split(/[\\/]/u).at(-1) === selectedPlugin) : sources
if (selectedPlugin && !selectedSources.length) throw new Error(`Unknown plugin source: ${selectedPlugin}`)
for (const source of selectedSources) {
  const manifest = await readFile(join(source, 'package.json'), 'utf8').then(JSON.parse, () => undefined)
  if (!manifest) continue
  const directory = manifest.name.split('/').at(-1)
  const version = manifest.version
  const staging = join(stageRoot, 'plugin-packages', directory, randomUUID())
  const { publish } = await preparePublishPackage(source, staging)
  const sourceFingerprint = createHash('sha256').update(JSON.stringify(await offlineFiles(staging))).digest('hex')
  const destination = join(releaseRoot, 'plugins', directory, version)
  await mkdir(destination, { recursive: true })
  const reusable = [...existingRecords, ...cachedRecords, ...historical].find(record => record.id === manifest.name && record.version === version && record.sourceFingerprint === sourceFingerprint)
  if (reusable?.sha256 && (await stat(reusable.path).catch(() => undefined))?.size === reusable.size && await fileDigest(reusable.path) === reusable.sha256) {
    const archive = join(destination, basename(reusable.path))
    if (archive !== reusable.path) await copyFile(reusable.path, archive)
    records.push({ ...reusable, path: archive })
    immutableReceipts.push({ id: manifest.name, version, preserved: true, sha256: reusable.sha256, reason: 'unchanged content fingerprint and verified original archive' })
    console.log(`CACHE HIT plugin-pack:${manifest.name} ${reusable.sha256}; reused original tarball`)
    await checkpoint()
    continue
  }
  const published = await restorePublishedOutput(source, { restore: false })
  if (published) {
    const archive = join(destination, basename(published.path))
    await copyFile(published.path, archive)
    records.push({ id: manifest.name, version, path: archive, kind: manifest.dsh?.bundle ? 'plugin' : 'support', manifest: publish.zerowall, dependencies: publish.dependencies, sourceFingerprint, size: (await stat(archive)).size, sha256: published.sha256 })
    immutableReceipts.push({ id: manifest.name, version, preserved: true, sha256: published.sha256, reason: 'signed archive and identical source, dependency, compiler and compiled bytes' })
    console.log(`CACHE HIT plugin-pack:${manifest.name} ${published.sha256}; verified published source and original tarball`)
    await checkpoint()
    continue
  }
  execFileSync(process.execPath, [pnpm, 'pack', '--pack-destination', destination], { cwd: staging, stdio: 'inherit' })
  const name = (await readdir(destination)).find(file => file.endsWith('.tgz'))
  const archive = join(destination, name)
  const baseline = historical.find(item => item.id === manifest.name && item.version === version)
  if (baseline) immutableReceipts.push({ id: manifest.name, version, ...await preserveImmutablePackage(archive, baseline.path) })
  const packed = JSON.parse(execFileSync('tar', ['-xOf', archive, 'package/package.json'], { encoding: 'utf8' }))
  if (JSON.stringify(packed.dependencies ?? {}).match(/workspace:|github:|git\+|git:/)) throw new Error(`Non-publishable dependency in ${manifest.name}`)
  const contents = execFileSync('tar', ['-tf', archive], { encoding: 'utf8' })
  if (manifest.main && !contents.includes('package/' + manifest.main.replace(/^\.\//, ''))) throw new Error(`Missing Host bundle for ${manifest.name}`)
  if (manifest.zerowall?.capabilities && !manifest.zerowall?.rollbackSupported) throw new Error('Missing plugin rollback contract')
  records.push({ id: manifest.name, version, path: archive, kind: manifest.dsh?.bundle && manifest.name !== 'dsh-office-tools' ? 'plugin' : 'support', manifest: publish.zerowall, dependencies: publish.dependencies, sourceFingerprint, size: (await stat(archive)).size, sha256: await fileDigest(archive) })
  await checkpoint()
}
const currentRecordsPath = join(releaseRoot, 'plugin-packages.json')
const currentReceiptsPath = join(releaseRoot, 'immutable-package-receipt.json')
if (selectedPlugin) {
  const prior = await readFile(currentRecordsPath, 'utf8').then(JSON.parse, () => [])
  const replaced = new Set(records.map(record => `${record.id}@${record.version}`))
  await writeFile(currentRecordsPath, JSON.stringify([...prior.filter(record => !replaced.has(`${record.id}@${record.version}`)), ...records], null, 2))
  const priorReceipts = await readFile(currentReceiptsPath, 'utf8').then(JSON.parse, () => [])
  await writeFile(currentReceiptsPath, JSON.stringify([...priorReceipts, ...immutableReceipts], null, 2) + '\n')
} else {
  await writeFile(currentRecordsPath, JSON.stringify(records, null, 2))
  await writeFile(currentReceiptsPath, JSON.stringify(immutableReceipts, null, 2) + '\n')
}
