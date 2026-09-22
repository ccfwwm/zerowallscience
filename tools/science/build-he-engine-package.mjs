import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { resolve, join, basename } from 'node:path'
import { parseArgs } from 'node:util'
import { engineProfile, hashFile, probePython, validateManifest } from './science-engine-package.mjs'

const { values } = parseArgs({ options: { engine: { type: 'string', default: 'he' }, model: { type: 'string' }, wheelhouse: { type: 'string' }, output: { type: 'string' }, python: { type: 'string', default: 'python' } }, strict: true })
if (!values.output) throw new Error('Usage: node tools/science/build-he-engine-package.mjs --output <new-directory> [--python <Python-3.12-x64>]')
if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Build this HE profile on Windows x64.')
const profile = engineProfile(values.engine)
const python = await probePython(values.python, profile.pythonVersion)
if (profile.model && !values.model) throw new Error('A verified local model payload root is required for StarDist.')
const directory = resolve(values.output)
await mkdir(directory, { recursive: true })
if ((await readdir(directory)).length) throw new Error('Output directory must be empty; existing packages are not overwritten.')
const wheels = join(directory, 'wheels')
await mkdir(wheels)
const exec = promisify(execFile)
if (values.wheelhouse) {
  const sourceRoot = resolve(values.wheelhouse)
  for (const [name, version] of Object.entries(profile.packages)) {
    const prefix = `${name.replaceAll('-', '_')}-${version}-`
    const matches = (await readdir(sourceRoot)).filter(file => file.startsWith(prefix) && file.endsWith('.whl'))
    if (matches.length !== 1) throw new Error(`Exactly one fixed wheel is required for ${name}.`)
    await copyFile(join(sourceRoot, matches[0]), join(wheels, matches[0]))
  }
} else {
await exec(python.path, ['-I', '-m', 'pip', '--isolated', 'download', '--disable-pip-version-check', '--only-binary=:all:', '--no-deps', '--index-url', 'https://pypi.org/simple', '--dest', wheels, ...Object.entries(profile.packages).map(([name, version]) => `${name}==${version}`)], { windowsHide: true, timeout: 300_000, maxBuffer: 1024 ** 2 })
}
const JSZip = createRequire(new URL('../../desktop/package.json', import.meta.url))('jszip')
const archive = new JSZip()
const files = []; const packages = []
function add(path, bytes, kind) {
  archive.file(path, bytes, { createFolders: false, date: new Date('2026-01-01T00:00:00Z') })
  files.push({ path, kind, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })
}
for (const [name, version] of Object.entries(profile.packages)) {
  const response = await fetch(`https://pypi.org/pypi/${name}/${version}/json`, { signal: AbortSignal.timeout(60_000) })
  if (!response.ok) throw new Error(`PyPI source verification failed for ${name}: ${response.status}`)
  const pypi = await response.json()
  const matches = (await readdir(wheels)).filter(f => f.startsWith(name.replaceAll('-', '_') + '-') && f.endsWith('.whl'))
  if (matches.length !== 1) throw new Error(`Expected exactly one wheel for ${name}.`)
  const filename = matches[0]
  const source = pypi.urls.find(item => item.filename === filename)
  if (!source || source.digests.sha256 !== await hashFile(join(wheels, filename))) throw new Error(`Downloaded wheel differs from official PyPI digest: ${name}`)
  const bytes = await readFile(join(wheels, filename))
  const content = await JSZip.loadAsync(bytes)
  const licenseEntries = Object.values(content.files).filter(entry => !entry.dir && /\/(licenses?\/|(?:LICENSE|COPYING|NOTICE)(?:[./_-]|$))/iu.test(entry.name))
  const metadataEntry = Object.values(content.files).find(entry => /\.dist-info\/METADATA$/u.test(entry.name))
  const metadata = metadataEntry ? await metadataEntry.async('string') : ''
  let externalLicenseSource
  if (!licenseEntries.length && /^License: Apache 2\.0\s*$/mu.test(metadata)) {
    externalLicenseSource = 'https://www.apache.org/licenses/LICENSE-2.0.txt'
    const response = await fetch(externalLicenseSource, { signal: AbortSignal.timeout(60_000) })
    if (!response.ok) throw new Error('Canonical Apache license download failed.')
    const licenseBytes = Buffer.from(await response.arrayBuffer())
    if (createHash('sha256').update(licenseBytes).digest('hex') !== 'cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30') throw new Error('Canonical Apache license hash changed.')
    // Upstream wheel metadata declares this license, but omits the text.
    licenseEntries.push({ name: 'external/LICENSE-2.0.txt', async: async () => licenseBytes })
  }
  if (!licenseEntries.length) throw new Error(`Wheel has no bundled license text: ${filename}`)
  const licenseFiles = []
  for (const [index, entry] of licenseEntries.entries()) {
    const path = `licenses/${name}/${index}-${basename(entry.name).replaceAll(/[^a-z0-9._-]/giu, '_')}`
    add(path, await entry.async('nodebuffer'), 'license'); licenseFiles.push(path)
  }
  const expression = metadata.match(/^License-Expression: (.+)$/mu)?.[1]?.trim()
  const licenseField = metadata.match(/^License: (.+)$/mu)?.[1]?.trim()
  let license = expression || pypi.info.license_expression || licenseField || pypi.info.license
  // These upstream wheels omit the metadata field. The actual bundled license
  // texts were reviewed; exact byte hashes prevent an override hiding a change.
  const reviewed = {
    'colorama@0.4.6': ['BSD-3-Clause', 'cac35c02686e5d04a5a7140bfb3b36e73aed496656e891102e428886d7930318'],
    'llvmlite@0.49.0': ['BSD-2-Clause', '7d6aa93e52a7ae9a995ff6a40c0ea5628311cdf1bd8dcd29c8ce9181f4af3a81'],
    'tensorflow-io-gcs-filesystem@0.31.0': ['Apache-2.0', '1eb85fc97224598dad1852b5d6483bbcf0aa8608790dcc657a5a2a761ae9c8c6'],
  }[`${name}@${version}`]
  if ((!license || license === 'UNKNOWN') && reviewed) {
    const licenseHashes = await Promise.all(licenseEntries.map(async entry => createHash('sha256').update(await entry.async('nodebuffer')).digest('hex')))
    if (!licenseHashes.includes(reviewed[1])) throw new Error(`Reviewed license text changed: ${name}`)
    license = reviewed[0]
  }
  if (!license || license === 'UNKNOWN') throw new Error(`License is unknown for ${name}; inspect the wheel before packaging.`)
  const path = `wheels/${filename}`
  add(path, bytes, 'wheel')
  add(`provenance/${name}.json`, Buffer.from(JSON.stringify({ name, version, source: source.url, wheelSha256: source.digests.sha256, projectUrl: `https://pypi.org/project/${name}/${version}/`, license, retrievedAt: new Date().toISOString(), licenseWheelPaths: externalLicenseSource ? [] : licenseEntries.map(e => e.name), ...(externalLicenseSource ? { externalLicenseSource, licenseBasis: 'Wheel METADATA declares Apache 2.0; canonical text supplied separately.' } : {}) }, null, 2) + '\n'), 'provenance')
  packages.push({ name, version, file: path, source: source.url, license, licenseFiles })
}
if (profile.model) {
  for (const file of profile.model.files) {
    const bytes = await readFile(join(resolve(values.model), file.path))
    if (createHash('sha256').update(bytes).digest('hex') !== file.sha256) throw new Error(`Model file differs from fixed profile: ${file.path}`)
    add(file.path, bytes, 'model')
  }
}
const archivePath = join(directory, `${profile.id}-7.0.0-win32-x64.zip`)
await writeFile(archivePath, await archive.generateAsync({ type: 'nodebuffer', compression: 'STORE', platform: 'UNIX' }))
const manifest = {
  schema: 'zerowall-science-engine/v1', engineId: profile.id, engineVersion: '7.0.0', format: 'python-wheels-v1',
  platform: 'win32', arch: 'x64', compatibleApplications: ['7.0.0'],
  python: { implementation: 'cpython', version: profile.pythonVersion, bundled: false, note: `Requires an existing Python ${profile.pythonVersion} x64 with venv and pip; it remains an external dependency.` },
  capabilities: profile.id === 'he' ? ['openslide-pyramid-region-read', 'pillow-image-read'] : ['openslide-pyramid-region-read', 'stardist-he-cpu-segmentation'],
  ...(profile.model ? { model: profile.model } : {}),
  excludedCapabilities: [...(profile.id === 'he' ? ['stardist'] : []), 'whole-slide-batch-segmentation', 'bundled-python'],
  archive: { filename: basename(archivePath), size: (await stat(archivePath)).size, sha256: await hashFile(archivePath) },
  packages, files, builtAt: new Date().toISOString(),
}
validateManifest(manifest)
const manifestPath = join(directory, `${profile.id}-7.0.0-win32-x64.manifest.json`)
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
const manifestSha256 = await hashFile(manifestPath)
await writeFile(join(directory, 'SHA256SUMS'), `${manifestSha256}  ${basename(manifestPath)}\n${manifest.archive.sha256}  ${basename(archivePath)}\n`)
console.log(JSON.stringify({ archivePath, manifestPath, manifestSha256, bytes: manifest.archive.size, files: files.length, pythonBundled: false }, null, 2))
