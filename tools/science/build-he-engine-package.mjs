import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { resolve, join, basename } from 'node:path'
import { parseArgs } from 'node:util'
import { engineProfile, hashFile, validateManifest, sharedPythonExecutable } from './science-engine-package.mjs'

/* HE/StarDist packages contain model data only. Python dependencies are
 * installed from the signed application manifest into the one shared runtime. */
const { values } = parseArgs({ options: {
  engine: { type: 'string', default: 'he' }, model: { type: 'string' }, output: { type: 'string' },
}, strict: true })
if (!values.output) throw new Error('Usage: node tools/science/build-he-engine-package.mjs --output <new-directory> [--model <verified-model-root>]')
if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Build this HE profile on Windows x64.')
const profile = engineProfile(values.engine)
if (profile.model && !values.model) throw new Error('A verified local model payload root is required for StarDist.')
const directory = resolve(values.output)
await mkdir(directory, { recursive: true })
if ((await readdir(directory)).length) throw new Error('Output directory must be empty; existing packages are not overwritten.')

const JSZip = createRequire(new URL('../../desktop/package.json', import.meta.url))('jszip')
const archive = new JSZip()
const files = []
function add(path, bytes, kind) {
  archive.file(path, bytes, { createFolders: false, date: new Date('2026-01-01T00:00:00Z') })
  files.push({ path, kind, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })
}

add(`provenance/${profile.id}-shared-python.json`, Buffer.from(JSON.stringify({
  engineId: profile.id, pythonVersion: profile.pythonVersion, packages: profile.packages,
  dependencySource: 'resources/python/dependency-manifest.json', sharedPython: 'Python/python.exe',
}, null, 2) + '\n'), 'provenance')
if (profile.model) {
  for (const file of profile.model.files) {
    const bytes = await readFile(join(resolve(values.model), file.path))
    if (createHash('sha256').update(bytes).digest('hex') !== file.sha256) throw new Error(`Model file differs from fixed profile: ${file.path}`)
    add(file.path, bytes, 'model')
  }
}

const archivePath = join(directory, `${profile.id}-7.1.0-win32-x64.zip`)
await writeFile(archivePath, await archive.generateAsync({ type: 'nodebuffer', compression: 'STORE', platform: 'UNIX' }))
const packages = Object.entries(profile.packages).map(([name, version]) => ({ name, version, source: 'signed-shared-dependency-manifest' }))
const manifest = {
  schema: 'zerowall-science-engine/v1', engineId: profile.id, engineVersion: '7.1.0', format: 'shared-python-model-v1',
  platform: 'win32', arch: 'x64', compatibleApplications: ['7.1.0'],
  python: { implementation: 'cpython', version: profile.pythonVersion, bundled: false, relativeExecutable: 'Python/python.exe', relativeSitePackages: 'Python/Lib/site-packages', note: 'Uses the application shared Python; no engine venv or private site-packages.' },
  capabilities: profile.id === 'he' ? ['openslide-pyramid-region-read', 'pillow-image-read'] : ['openslide-pyramid-region-read', 'stardist-he-cpu-segmentation'],
  ...(profile.model ? { model: profile.model } : {}),
  excludedCapabilities: [...(profile.id === 'he' ? ['stardist'] : []), 'whole-slide-batch-segmentation', 'bundled-python', 'private-python-environment'],
  archive: { filename: basename(archivePath), size: (await stat(archivePath)).size, sha256: await hashFile(archivePath) },
  packages, files, builtAt: new Date().toISOString(), dependencyRuntime: sharedPythonExecutable(),
}
validateManifest(manifest)
const manifestPath = join(directory, `${profile.id}-7.1.0-win32-x64.manifest.json`)
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
const manifestSha256 = await hashFile(manifestPath)
await writeFile(join(directory, 'SHA256SUMS'), `${manifestSha256}  ${basename(manifestPath)}\n${manifest.archive.sha256}  ${basename(archivePath)}\n`)
console.log(JSON.stringify({ archivePath, manifestPath, manifestSha256, bytes: manifest.archive.size, files: files.length, pythonBundled: false, sharedPython: manifest.python.relativeExecutable, wheels: 0 }, null, 2))
