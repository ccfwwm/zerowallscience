import { cp, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { join, resolve, relative } from 'node:path'
import { createRequire } from 'node:module'
import { root, stageRoot, cacheRoot, applicationVersion, buildId } from '../build/paths.mjs'
import { offlineFiles } from '../commands/offline-profile.mjs'
import { carrierName, offlineContentDigest } from '../commands/offline-carrier.mjs'
import { compareVersions, fileDigest } from '../commands/resource-catalog.mjs'
import { signCatalog } from '../release/resource-catalog.mjs'
import { loadResourceSigner } from '../release/resource-signing.mjs'

const directory = join(stageRoot, 'offline-profile')
const signer = await loadResourceSigner({ root, cacheRoot })
if (signer.localOnly) throw new Error('Stable offline closure requires a configured trusted release signer')
const plugins = JSON.parse(await readFile(join(stageRoot, 'commands/bundled-plugins.json'), 'utf8'))
const pin = JSON.parse(await readFile(join(root, 'config/deepseek-harness/upstream.json'), 'utf8'))
const files = await offlineFiles(join(directory, 'modules'), 'modules/')
const require = createRequire(join(root, 'desktop/package.json'))
const { createPackageWithOptions } = require('@electron/asar')
const input = join(stageRoot, 'profile-carrier-input')
if (!relative(resolve(stageRoot), resolve(input)).startsWith('profile-carrier-input')) throw new Error('Invalid carrier input path')
// The archive has a standard node_modules boundary. Staging remains available
// for release tarballs and freshness checks; only the carrier enters Desktop.
const physicalRoots = [...plugins.filter(entry => !entry.core).map(entry => `node_modules/${entry.id}`),
  'node_modules/@deepseek-ai/libreoffice-kit*', 'node_modules/node-pty',
  'node_modules/sharp', 'node_modules/@img', 'node_modules/koffi',
  'node_modules/@koromix', 'node_modules/@zerowallscience/integrity-runtime']
const cacheKey = createHash('sha256').update(JSON.stringify({ files, physicalRoots, archiver: require('@electron/asar/package.json').version, recipe: await fileDigest(import.meta.filename) })).digest('hex')
const cached = join(cacheRoot, 'offline-carriers', cacheKey)
const cachedReceipt = await readFile(join(cached, 'payload.json'), 'utf8').then(JSON.parse, () => undefined)
async function payloadAt(path) {
  return [{ path: carrierName, size: (await stat(join(path, carrierName))).size, sha256: await fileDigest(join(path, carrierName)) },
    ...await offlineFiles(join(path, carrierName + '.unpacked'), carrierName + '.unpacked/')].sort((a, b) => a.path.localeCompare(b.path))
}
const cachedFiles = cachedReceipt && await payloadAt(cached).catch(() => undefined)
const cacheHit = cachedFiles && JSON.stringify(cachedFiles) === JSON.stringify(cachedReceipt.files)
if (cacheHit) {
  await cp(join(cached, carrierName), join(directory, carrierName))
  await cp(join(cached, carrierName + '.unpacked'), join(directory, carrierName + '.unpacked'), { recursive: true })
  console.log(`CACHE HIT offline-carrier ${cacheKey}; verified archive and native output hashes`)
} else {
  // Rename the owned staging directory while archiving rather than copying
  // the entire expanded closure again. Always restore it for tarball gates.
  await mkdir(input, { recursive: true })
  await rename(join(directory, 'modules'), join(input, 'node_modules'))
  try {
    await createPackageWithOptions(input, join(directory, carrierName), {
      unpackDir: `{${physicalRoots.join(',')}}`, unpack: '**/*.{node,dll,exe}',
    })
  } finally { await rename(join(input, 'node_modules'), join(directory, 'modules')) }
  await rm(input, { recursive: true })
  const pending = cached + '.candidate-' + randomUUID()
  await mkdir(pending, { recursive: true })
  await cp(join(directory, carrierName), join(pending, carrierName))
  await cp(join(directory, carrierName + '.unpacked'), join(pending, carrierName + '.unpacked'), { recursive: true })
  await writeFile(join(pending, 'payload.json'), JSON.stringify({ cacheKey, files: await payloadAt(pending) }))
  if (await stat(cached).catch(() => undefined)) await rename(cached, cached + '.damaged-' + randomUUID())
  await rename(pending, cached)
  console.log(`BUILT offline-carrier ${cacheKey}; stable component content identity`)
}
const payloadFiles = [{ path: carrierName, size: (await stat(join(directory, carrierName))).size, sha256: await fileDigest(join(directory, carrierName)) },
  ...await offlineFiles(join(directory, carrierName + '.unpacked'), carrierName + '.unpacked/')].sort((a, b) => a.path.localeCompare(b.path))
const oldBuildReceipt = JSON.parse(await readFile(join(directory, 'build-receipt.json'), 'utf8'))
files.sort((a, b) => a.path.localeCompare(b.path))
const desktopRange = { min: plugins.map(entry => entry.desktop?.min).filter(Boolean).reduce((a, b) => compareVersions(a, b) >= 0 ? a : b, '8.1.0') }
const upperBounds = plugins.map(entry => entry.desktop?.max).filter(Boolean)
if (upperBounds.length) desktopRange.max = upperBounds.reduce((a, b) => compareVersions(a, b) <= 0 ? a : b)
const content = { schema: 2, kind: 'offline-profile', profileArchitecture: 7, applicationVersion, buildId,
  dshCommit: pin.commit, dshRange: { min: pin.version, max: pin.version }, desktopRange, platform: ['win32'], architecture: ['x64'],
  plugins, files, payloadFiles, defaultPatch: JSON.parse(await readFile(join(stageRoot, 'commands/default-profile.patch.json'), 'utf8')),
  builtAt: oldBuildReceipt.builtAt, localOnly: false,
}
const document = signCatalog({ ...content, contentDigest: offlineContentDigest(content) }, signer.privateKey, signer.keyId)
await writeFile(join(directory, 'receipt.json'), JSON.stringify(document, null, 2))
console.log(`Signed offline default closure v2: ${plugins.length} plugins, ${files.length} logical files, ${payloadFiles.length} physical files, content ${document.contentDigest}, build ${buildId}`)
