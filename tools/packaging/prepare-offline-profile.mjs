import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join, resolve, relative } from 'node:path'
import { createRequire } from 'node:module'
import { root, stageRoot, cacheRoot, applicationVersion, buildId } from '../build/paths.mjs'
import { offlineFiles } from '../commands/offline-profile.mjs'
import { carrierName, offlineContentDigest } from '../commands/offline-carrier.mjs'
import { compareVersions, fileDigest } from '../commands/resource-catalog.mjs'
import { signCatalog } from '../release/resource-catalog.mjs'
import { loadResourceSigner } from '../release/resource-signing.mjs'
import { reuseOfflineCarrier } from './offline-carrier-cache.mjs'

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
const carrier = await reuseOfflineCarrier({ cache: join(cacheRoot, 'offline-carriers'), output: directory, key: cacheKey, prepare: async () => {
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
} })
const payloadFiles = carrier.files
const oldBuildReceipt = JSON.parse(await readFile(join(directory, 'build-receipt.json'), 'utf8'))
await writeFile(join(directory, 'build-receipt.json'), JSON.stringify({ ...oldBuildReceipt, carrierMaterialization: carrier.materialization }, null, 2))
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
