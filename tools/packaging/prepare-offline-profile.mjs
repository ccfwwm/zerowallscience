import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { root, stageRoot, cacheRoot, releaseRoot, applicationVersion, buildId } from '../build/paths.mjs'
import { offlineFiles } from '../commands/offline-profile.mjs'
import { signCatalog } from '../release/resource-catalog.mjs'
import { loadResourceSigner } from '../release/resource-signing.mjs'

const directory = join(stageRoot, 'offline-profile')
const signer = await loadResourceSigner({ root, cacheRoot })
if (signer.localOnly) throw new Error('Stable offline closure requires a configured trusted release signer')
const plugins = JSON.parse(await readFile(join(stageRoot, 'commands/bundled-plugins.json'), 'utf8'))
const pin = JSON.parse(await readFile(join(root, 'config/deepseek-harness/upstream.json'), 'utf8'))
const archives = JSON.parse(await readFile(join(releaseRoot, 'plugin-packages.json'), 'utf8'))
await mkdir(join(directory, 'packages'), { recursive: true })
for (const entry of archives) await cp(entry.path, join(directory, 'packages', basename(entry.path)))
const files = (await offlineFiles(directory)).filter(entry => entry.path !== 'receipt.json')
const oldBuildReceipt = JSON.parse(await readFile(join(directory, 'build-receipt.json'), 'utf8'))
files.sort((a, b) => a.path.localeCompare(b.path))
const document = signCatalog({ schema: 1, kind: 'offline-profile', profileArchitecture: 7, applicationVersion, buildId,
  dshCommit: pin.commit, dshRange: { min: pin.version, max: pin.version }, desktopRange: { min: applicationVersion, max: applicationVersion }, platform: ['win32'], architecture: ['x64'],
  plugins, files, defaultPatch: JSON.parse(await readFile(join(stageRoot, 'commands/default-profile.patch.json'), 'utf8')),
  builtAt: oldBuildReceipt.builtAt, localOnly: false,
}, signer.privateKey, signer.keyId)
await writeFile(join(directory, 'receipt.json'), JSON.stringify(document, null, 2))
console.log(`Signed offline default closure: ${plugins.length} plugins, ${files.length} files, build ${buildId}`)
