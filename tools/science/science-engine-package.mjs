import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream, readFileSync } from 'node:fs'
import { lstat, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Transform } from 'node:stream'

const requireDesktop = createRequire(new URL('../../desktop/package.json', import.meta.url))
const APPLICATION_VERSION = '7.1.0'
const ENGINE_VERSION = '7.1.0'
const SHA = /^[a-f0-9]{64}$/u
const exists = async path => lstat(path).then(() => true, error => {
  if (error.code === 'ENOENT') return false
  throw error
})

const sharedDependencyManifest = JSON.parse(readFileSync(new URL('../../resources/python/dependency-manifest.json', import.meta.url), 'utf8'))
const sharedPins = new Map((sharedDependencyManifest.packages ?? []).map(pkg => [String(pkg.name).toLowerCase().replace(/[-_.]+/gu, '-'), pkg.version]))
function sharedPackageVersions(names) {
  return Object.fromEntries(names.map(name => {
    const version = sharedPins.get(String(name).toLowerCase().replace(/[-_.]+/gu, '-'))
    if (typeof version !== 'string') throw new Error(`Shared dependency manifest is missing ${name}.`)
    return [name, version]
  }))
}

export const HE_PACKAGES = Object.freeze(sharedPackageVersions(['openslide-python', 'openslide-bin', 'pillow']))
export const LIMITS = Object.freeze({ archive: 256 * 1024 ** 2, file: 128 * 1024 ** 2, expanded: 512 * 1024 ** 2, entries: 200 })
const STARDIST_LIMITS = Object.freeze({ archive: 1536 * 1024 ** 2, file: 512 * 1024 ** 2, expanded: 3 * 1024 ** 3, entries: 1500 })

export function engineProfile(id) {
  if (id === 'he') return { id, pythonVersion: '3.12', packages: HE_PACKAGES, limits: LIMITS }
  if (id !== 'he-stardist') throw new Error('Unsupported science engine profile.')
  const fixed = JSON.parse(readFileSync(new URL('./he-stardist-profile.json', import.meta.url), 'utf8'))
  if (fixed.pythonVersion !== '3.12' || !Array.isArray(fixed.requiredPackages) || !fixed.model) throw new Error('Incomplete shared-Python StarDist profile.')
  const packages = sharedPackageVersions(fixed.requiredPackages)
  return { ...fixed, id, packages, limits: STARDIST_LIMITS }
}

export function sharedPythonExecutable() {
  const managerRoot = process.env.ZEROWALL_PYTHON_ROOT?.trim() || process.env.ZEROWALL_MCP_ENVIRONMENT_ROOT?.trim()
  const userData = managerRoot
    ? resolve(managerRoot, '..')
    : join(process.env.APPDATA?.trim() || process.env.LOCALAPPDATA?.trim() || homedir(), 'zerowall-science')
  return join(userData, 'Python', 'python.exe')
}

export function sharedModelRoot(engineId = 'he-stardist') {
  if (engineId !== 'he-stardist') return undefined
  const base = process.env.LOCALAPPDATA?.trim() || process.env.APPDATA?.trim() || homedir()
  return join(base, 'ZeroWallScience', 'models', 'he-stardist-2d-versatile-he')
}

export async function hashFile(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

export function safeArchivePath(name) {
  if (typeof name !== 'string' || name.length > 240 || name.includes('\\') || name.startsWith('/') || name.includes(':') || /[\x00-\x1f<>"|?*]/u.test(name)) throw new Error(`Unsafe archive path: ${name}`)
  const parts = name.split('/')
  if (!parts.length || parts.some(part => !part || part === '.' || part === '..' || /[. ]$/u.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(part))) throw new Error(`Unsafe archive path: ${name}`)
  return name
}

export function validateManifest(manifest, platform = process.platform, arch = process.arch) {
  const m = manifest
  if (m?.schema !== 'zerowall-science-engine/v1' || !['he', 'he-stardist'].includes(m.engineId) || m.engineVersion !== ENGINE_VERSION || m.format !== 'shared-python-model-v1') throw new Error('Unsupported science engine manifest.')
  const profile = engineProfile(m.engineId)
  const limits = profile.limits
  if (m.platform !== 'win32' || m.arch !== 'x64' || platform !== m.platform || arch !== m.arch) throw new Error('Engine platform mismatch; Windows x64 is required.')
  if (m.python?.implementation !== 'cpython' || m.python?.version !== profile.pythonVersion || m.python?.bundled !== false) throw new Error(`Engine requires the shared CPython ${profile.pythonVersion} runtime.`)
  if (m.python.relativeExecutable !== 'Python/python.exe' || m.python.relativeSitePackages !== 'Python/Lib/site-packages') throw new Error('Shared science engine packages must use the ZeroWall Python layout.')
  if (!Array.isArray(m.compatibleApplications) || !m.compatibleApplications.includes(APPLICATION_VERSION)) throw new Error('Application compatibility is missing.')
  if (!m.archive || !SHA.test(m.archive.sha256) || !Number.isSafeInteger(m.archive.size) || m.archive.size < 1 || m.archive.size > limits.archive) throw new Error('Invalid archive integrity record.')
  if (!Array.isArray(m.files) || m.files.length < 1 || m.files.length > limits.entries) throw new Error('Invalid manifest file inventory.')
  let total = 0
  const paths = new Set()
  for (const file of m.files) {
    safeArchivePath(file.path)
    const key = file.path.toLowerCase()
    if (paths.has(key) || !SHA.test(file.sha256) || !Number.isSafeInteger(file.size) || file.size < 0 || file.size > limits.file) throw new Error('Invalid or duplicate manifest file.')
    paths.add(key); total += file.size
    if (!['provenance', 'model'].includes(file.kind)) throw new Error('Unsupported shared science engine file kind.')
    if (/^(?:wheels|venv|env|site-packages)(?:\/|$)/iu.test(file.path)) throw new Error('Shared science engine archives cannot contain wheels or private environments.')
  }
  if (total > limits.expanded) throw new Error('Engine expansion limit exceeded.')
  if (!Array.isArray(m.packages) || m.packages.length !== Object.keys(profile.packages).length) throw new Error('Engine package inventory is incomplete.')
  const packages = new Set()
  for (const pkg of m.packages) {
    const name = String(pkg?.name ?? '')
    const key = name.toLowerCase().replace(/[-_.]+/gu, '-')
    if (packages.has(key) || profile.packages[name] !== pkg.version) throw new Error('Engine package is not in the fixed shared profile.')
    if (pkg.source !== 'signed-shared-dependency-manifest' || pkg.file !== undefined || pkg.license !== undefined || pkg.licenseFiles !== undefined) throw new Error('Shared engine packages must reference the signed dependency manifest.')
    packages.add(key)
  }
  if (m.engineId === 'he-stardist') {
    if (JSON.stringify(m.model) !== JSON.stringify(profile.model)) throw new Error('Model provenance differs from the fixed StarDist profile.')
    const expected = profile.model.files
    if (!Array.isArray(expected) || !expected.length || m.files.filter(file => file.kind === 'model').length !== expected.length) throw new Error('StarDist model inventory is incomplete.')
    for (const item of expected) if (!m.files.some(file => file.kind === 'model' && file.path === item.path && file.sha256 === item.sha256)) throw new Error('StarDist model hash differs from the fixed profile.')
  } else if (m.files.some(file => file.kind === 'model')) throw new Error('The HE reader package cannot carry a model payload.')
  return m
}

export async function loadManifest(path, expectedHash, platform, arch) {
  if (!SHA.test(expectedHash ?? '')) throw new Error('A trusted manifest SHA-256 is required; obtain it separately from the package.')
  if ((await stat(path)).size > 1024 * 1024) throw new Error('Manifest size limit exceeded.')
  const bytes = await readFile(path)
  if (createHash('sha256').update(bytes).digest('hex') !== expectedHash) throw new Error('Manifest SHA-256 mismatch.')
  return validateManifest(JSON.parse(bytes.toString('utf8')), platform, arch)
}

function contained(root, path) {
  const rel = relative(resolve(root), resolve(path))
  return !!rel && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
}

export async function extractVerifiedArchive(archive, target, manifest) {
  const limits = engineProfile(manifest.engineId).limits
  const info = await stat(archive)
  if (info.size !== manifest.archive.size || info.size > limits.archive || await hashFile(archive) !== manifest.archive.sha256) throw new Error('Archive size or SHA-256 mismatch.')
  await mkdir(target, { recursive: false })
  const expected = new Map(manifest.files.map(file => [file.path, file]))
  const yauzl = requireDesktop('yauzl')
  await new Promise((accept, reject) => {
    yauzl.open(archive, { lazyEntries: true, autoClose: true, validateEntrySizes: true, strictFileNames: true }, (error, zip) => {
      if (error) return reject(error)
      let settled = false; let expanded = 0
      const seen = new Set()
      const abort = reason => { if (!settled) { settled = true; zip.close(); reject(reason) } }
      zip.on('error', abort)
      zip.on('end', () => {
        if (settled) return
        if (seen.size !== expected.size) return abort(new Error('Archive is missing manifest files.'))
        settled = true; accept()
      })
      zip.on('entry', entry => {
        void (async () => {
          const name = safeArchivePath(entry.fileName)
          const file = expected.get(name)
          const mode = (entry.externalFileAttributes >>> 16) & 0xf000
          if (mode && mode !== 0x8000) throw new Error('Archive links and special entries are forbidden.')
          if (!file || seen.has(name.toLowerCase()) || entry.uncompressedSize !== file.size || zip.entryCount > limits.entries || (entry.generalPurposeBitFlag & 1)) throw new Error('Unlisted, duplicate, encrypted or incorrectly sized archive entry.')
          expanded += entry.uncompressedSize
          if (expanded > limits.expanded || entry.uncompressedSize > limits.file) throw new Error('Archive expansion limit exceeded.')
          seen.add(name.toLowerCase())
          const destination = resolve(target, name)
          if (!contained(target, destination)) throw new Error('Archive destination escapes extraction root.')
          await mkdir(dirname(destination), { recursive: true })
          const stream = await new Promise((yes, no) => zip.openReadStream(entry, (streamError, value) => streamError ? no(streamError) : yes(value)))
          const hash = createHash('sha256'); let bytes = 0
          const meter = new Transform({ transform(chunk, _encoding, callback) {
            bytes += chunk.length
            if (bytes > file.size) return callback(new Error('Entry exceeds its declared size.'))
            hash.update(chunk); callback(null, chunk)
          } })
          await pipeline(stream, meter, createWriteStream(destination, { flags: 'wx' }))
          if (bytes !== file.size || hash.digest('hex') !== file.sha256) throw new Error(`File SHA-256 mismatch: ${name}`)
          if (!settled) zip.readEntry()
        })().catch(abort)
      })
      zip.readEntry()
    })
  })
}

/** Install model data atomically. Python packages are never copied here. */
export async function installSharedModelPackage({ manifest, archivePath, root: rootPath }) {
  validateManifest(manifest, 'win32', 'x64')
  const modelRoot = rootPath ? resolve(rootPath) : sharedModelRoot(manifest.engineId)
  if (!modelRoot) return { installed: false, engineId: manifest.engineId, sharedPython: manifest.python.relativeExecutable, packages: manifest.packages, modelRoot: null }
  const parent = dirname(modelRoot)
  await mkdir(parent, { recursive: true })
  const temporary = join(parent, `.zerowall-${manifest.engineId}-${randomUUID()}`)
  const previous = `${modelRoot}.previous`
  let committed = false
  try {
    await extractVerifiedArchive(archivePath, temporary, manifest)
    if (await exists(previous)) await rm(previous, { recursive: true, force: true })
    if (await exists(modelRoot)) await rename(modelRoot, previous)
    try {
      await rename(temporary, modelRoot)
      await writeFile(join(modelRoot, 'install-receipt.json'), JSON.stringify({ schema: 'zerowall-shared-model-install/v1', installedAt: new Date().toISOString(), manifest, sharedPython: manifest.python.relativeExecutable }, null, 2) + '\n')
      committed = true
    } catch (error) {
      if (await exists(previous) && !await exists(modelRoot)) await rename(previous, modelRoot)
      throw error
    }
    if (await exists(previous)) await rm(previous, { recursive: true, force: true })
    return { installed: true, engineId: manifest.engineId, modelRoot, sharedPython: manifest.python.relativeExecutable, packages: manifest.packages }
  } finally {
    if (!committed) await rm(temporary, { recursive: true, force: true })
  }
}

export async function importHeEngine({ manifestPath, archivePath, manifestSha256, root: rootPath, platform, arch }) {
  const manifest = await loadManifest(manifestPath, manifestSha256, platform, arch)
  return installSharedModelPackage({ manifest, archivePath, root: rootPath })
}

export async function verifyPackage(options) {
  const manifest = await loadManifest(options.manifestPath, options.manifestSha256, options.platform, options.arch)
  const parent = resolve(options.temporaryRoot)
  await mkdir(parent, { recursive: true })
  const target = join(parent, `verify-${randomUUID()}`)
  try {
    await extractVerifiedArchive(options.archivePath, target, manifest)
    return { verified: true, files: manifest.files.length, engineId: manifest.engineId, version: manifest.engineVersion, pythonBundled: false, sharedPython: manifest.python.relativeExecutable }
  } finally {
    await rm(target, { recursive: true, force: true })
  }
}
