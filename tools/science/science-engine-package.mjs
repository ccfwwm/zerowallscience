import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream, readFileSync } from 'node:fs'
import { lstat, mkdir, open, readFile, rename, rm, stat, statfs, symlink, unlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Transform } from 'node:stream'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const requireDesktop = createRequire(new URL('../../desktop/package.json', import.meta.url))
const exec = promisify(execFile)
export const HE_PACKAGES = Object.freeze({ 'openslide-python': '1.4.6', 'openslide-bin': '4.0.1.2', pillow: '11.3.0' })
export const LIMITS = Object.freeze({ archive: 256 * 1024 ** 2, file: 128 * 1024 ** 2, expanded: 512 * 1024 ** 2, entries: 200 })
const SHA = /^[a-f0-9]{64}$/u
const STARDIST_LIMITS = Object.freeze({ archive: 1536 * 1024 ** 2, file: 512 * 1024 ** 2, expanded: 3 * 1024 ** 3, entries: 1500 })
export function engineProfile(id) {
  if (id === 'he') return { id, pythonVersion: '3.12', packages: HE_PACKAGES, limits: LIMITS }
  if (id !== 'he-stardist') throw new Error('Unsupported science engine profile.')
  const fixed = JSON.parse(readFileSync(new URL('./he-stardist-profile.json', import.meta.url), 'utf8'))
  if (fixed.pythonVersion !== '3.11' || !fixed.packages || !fixed.model) throw new Error('Incomplete fixed StarDist profile.')
  return { ...fixed, id, limits: STARDIST_LIMITS }
}
const slotPattern = id => new RegExp(`^${id}-7\\.0\\.0-[a-f0-9-]{36}$`, 'u')
const exists = async path => lstat(path).then(() => true, e => { if (e.code === 'ENOENT') return false; throw e })

export async function hashFile(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

export function safeArchivePath(name) {
  if (typeof name !== 'string' || name.length > 240 || name.includes('\\') || name.startsWith('/') || name.includes(':') || /[\x00-\x1f<>"|?*]/u.test(name)) throw new Error(`Unsafe archive path: ${name}`)
  const parts = name.split('/')
  if (!parts.length || parts.some(p => !p || p === '.' || p === '..' || /[. ]$/u.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(p))) throw new Error(`Unsafe archive path: ${name}`)
  return name
}

export function validateManifest(m, platform = process.platform, arch = process.arch) {
  if (m?.schema !== 'zerowall-science-engine/v1' || !['he', 'he-stardist'].includes(m.engineId) || m.engineVersion !== '7.0.0' || m.format !== 'python-wheels-v1') throw new Error('Unsupported science engine manifest.')
  const profile = engineProfile(m.engineId); const limits = profile.limits
  if (m.platform !== 'win32' || m.arch !== 'x64' || platform !== m.platform || arch !== m.arch) throw new Error('Engine platform mismatch; Windows x64 is required.')
  if (m.python?.implementation !== 'cpython' || m.python?.version !== profile.pythonVersion || m.python?.bundled !== false) throw new Error(`Engine requires an external CPython ${profile.pythonVersion} x64 runtime.`)
  if (!Array.isArray(m.compatibleApplications) || !m.compatibleApplications.includes('7.0.0')) throw new Error('Application compatibility is missing.')
  if (!m.archive || !SHA.test(m.archive.sha256) || !Number.isSafeInteger(m.archive.size) || m.archive.size < 1 || m.archive.size > limits.archive) throw new Error('Invalid archive integrity record.')
  if (!Array.isArray(m.files) || m.files.length < 3 || m.files.length > limits.entries) throw new Error('Invalid manifest file inventory.')
  let total = 0
  const paths = new Set()
  for (const f of m.files) {
    safeArchivePath(f.path)
    const key = f.path.toLowerCase()
    if (paths.has(key) || !SHA.test(f.sha256) || !Number.isSafeInteger(f.size) || f.size < 0 || f.size > limits.file) throw new Error('Invalid or duplicate manifest file.')
    paths.add(key); total += f.size
    if (!['wheel', 'license', 'provenance', ...(m.engineId === 'he-stardist' ? ['model'] : [])].includes(f.kind)) throw new Error('Unsupported engine file kind.')
  }
  if (total > limits.expanded) throw new Error('Engine expansion limit exceeded.')
  if (!Array.isArray(m.packages) || m.packages.length !== Object.keys(profile.packages).length) throw new Error('Engine package inventory is incomplete.')
  const packages = new Set()
  for (const p of m.packages) {
    if (packages.has(p.name) || profile.packages[p.name] !== p.version) throw new Error('Engine package is not in the fixed HE profile.')
    packages.add(p.name)
    const wheel = m.files.find(f => f.path === p.file && f.kind === 'wheel')
    const source = new URL(p.source)
    if (!wheel || !p.file.startsWith('wheels/') || !p.file.endsWith('.whl') || source.protocol !== 'https:' || source.hostname !== 'files.pythonhosted.org' || source.username || source.password || source.search || source.hash || source.pathname.split('/').at(-1) !== basename(p.file)) throw new Error('Invalid wheel source or file.')
    if (typeof p.license !== 'string' || !p.license.trim() || !Array.isArray(p.licenseFiles) || !p.licenseFiles.length || p.licenseFiles.some(path => !m.files.some(f => f.path === path && f.kind === 'license'))) throw new Error('Package license declaration or license texts are missing.')
  }
  if (m.files.filter(f => f.kind === 'wheel').length !== packages.size) throw new Error('Unlisted wheel in manifest.')
  if (m.engineId === 'he-stardist') {
    if (JSON.stringify(m.model) !== JSON.stringify(profile.model)) throw new Error('Model provenance differs from the fixed StarDist profile.')
    const expected = profile.model.files
    if (!Array.isArray(expected) || !expected.length || m.files.filter(f => f.kind === 'model').length !== expected.length) throw new Error('StarDist model inventory is incomplete.')
    for (const item of expected) if (!m.files.some(f => f.kind === 'model' && f.path === item.path && f.sha256 === item.sha256)) throw new Error('StarDist model hash differs from the fixed profile.')
  }
  return m
}

export async function loadManifest(path, expectedHash, platform, arch) {
  if (!SHA.test(expectedHash ?? '')) throw new Error('A trusted manifest SHA-256 is required; obtain it separately from the package.')
  if ((await stat(path)).size > 1024 * 1024) throw new Error('Manifest size limit exceeded.')
  const bytes = await readFile(path)
  if (createHash('sha256').update(bytes).digest('hex') !== expectedHash) throw new Error('Manifest SHA-256 mismatch.')
  return validateManifest(JSON.parse(bytes.toString('utf8')), platform, arch)
}

// Uses the same lazy yauzl reader as the desktop runtime. No archive-provided
// script is executed. Every entry must match the inventory before extraction.
export async function extractVerifiedArchive(archive, target, manifest) {
  const limits = engineProfile(manifest.engineId).limits
  const info = await stat(archive)
  if (info.size !== manifest.archive.size || info.size > limits.archive || await hashFile(archive) !== manifest.archive.sha256) throw new Error('Archive size or SHA-256 mismatch.')
  await mkdir(target, { recursive: false })
  const expected = new Map(manifest.files.map(f => [f.path, f]))
  const yauzl = requireDesktop('yauzl')
  await new Promise((accept, reject) => {
    yauzl.open(archive, { lazyEntries: true, autoClose: true, validateEntrySizes: true, strictFileNames: true }, (error, zip) => {
      if (error) return reject(error)
      let settled = false; let expanded = 0
      const seen = new Set()
      const abort = error => { if (!settled) { settled = true; zip.close(); reject(error) } }
      zip.on('error', abort)
      zip.on('end', () => {
        if (settled) return
        if (seen.size !== expected.size) return abort(new Error('Archive is missing manifest files.'))
        settled = true; accept()
      })
      zip.on('entry', entry => {
        void (async () => {
          const name = safeArchivePath(entry.fileName)
          const key = name.toLowerCase()
          const file = expected.get(name)
          const mode = (entry.externalFileAttributes >>> 16) & 0xf000
          if (mode && mode !== 0x8000) throw new Error('Archive links and special entries are forbidden.')
          if (!file || seen.has(key) || entry.uncompressedSize !== file.size || zip.entryCount > limits.entries || (entry.generalPurposeBitFlag & 1)) throw new Error('Unlisted, duplicate, encrypted or incorrectly sized archive entry.')
          expanded += entry.uncompressedSize
          if (expanded > limits.expanded || entry.uncompressedSize > limits.file) throw new Error('Archive expansion limit exceeded.')
          seen.add(key)
          const destination = resolve(target, name)
          if (!contained(target, destination)) throw new Error('Archive destination escapes extraction root.')
          await mkdir(dirname(destination), { recursive: true })
          const stream = await new Promise((yes, no) => zip.openReadStream(entry, (e, value) => e ? no(e) : yes(value)))
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

function contained(root, path) {
  const rel = relative(resolve(root), resolve(path))
  return !!rel && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
}

async function removeOwnedDirectory(root, path) {
  const target = resolve(path)
  if (!contained(root, target)) throw new Error('Refusing cleanup outside the managed workspace.')
  await rm(target, { recursive: true, force: true })
}

async function removeActivationLink(path) {
  if (!await exists(path)) return
  if (!(await lstat(path)).isSymbolicLink()) throw new Error('Activation pointer changed unexpectedly; preserved for inspection.')
  await unlink(path)
}

async function managedRoot(path) {
  const root = resolve(path)
  if (basename(root).toLowerCase() !== 'science-engines') throw new Error('The managed root must be a dedicated science-engines directory.')
  await mkdir(root, { recursive: true })
  for (const directory of [root, join(root, '.installs'), join(root, '.history')]) {
    await mkdir(directory, { recursive: true })
    const info = await lstat(directory)
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Managed engine directories cannot be links.')
  }
  return root
}

async function withLock(root, action) {
  const lockPath = join(root, '.install.lock')
  let lock
  try { lock = await open(lockPath, 'wx') } catch (error) { if (error.code === 'EEXIST') throw new Error('Another engine operation is active, or an interrupted operation requires inspection of .install.lock.'); throw error }
  try { await lock.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })); return await action() }
  finally { await lock.close(); await rm(lockPath, { force: true }) }
}

async function runPython(python, args) {
  const { stdout } = await exec(python, args, { windowsHide: true, timeout: 180_000, maxBuffer: 2 * 1024 ** 2, env: { ...process.env, PYTHONNOUSERSITE: '1', PYTHONPATH: '', PIP_CONFIG_FILE: process.platform === 'win32' ? 'NUL' : '/dev/null', PIP_NO_INDEX: '1' } })
  return stdout.trim()
}

export async function probePython(python, requiredVersion = '3.12') {
  const value = JSON.parse(await runPython(python, ['-I', '-c', 'import sys,struct,json; print(json.dumps({"implementation":sys.implementation.name,"version":"%d.%d"%sys.version_info[:2],"fullVersion":"%d.%d.%d"%sys.version_info[:3],"bits":struct.calcsize("P")*8,"path":sys.executable}))']))
  if (value.implementation !== 'cpython' || value.version !== requiredVersion || value.bits !== 64) throw new Error(`CPython ${requiredVersion} x64 is required; existing Python/Fiji/napari installations were not changed.`)
  return { ...value, executableSha256: await hashFile(value.path) }
}

export async function createHeEnvironment(candidate, payload, manifest, python) {
  const runtime = await probePython(python, engineProfile(manifest.engineId).pythonVersion)
  const venv = join(candidate, 'venv')
  await runPython(runtime.path, ['-I', '-m', 'venv', venv])
  const executable = join(venv, 'Scripts', 'python.exe')
  const requirements = manifest.packages.map(p => `${p.name}==${p.version} --hash=sha256:${manifest.files.find(f => f.path === p.file).sha256}`).join('\n') + '\n'
  const requirementsPath = join(candidate, 'requirements.lock')
  await writeFile(requirementsPath, requirements)
  await runPython(executable, ['-I', '-m', 'pip', '--isolated', 'install', '--no-index', '--no-cache-dir', '--disable-pip-version-check', '--only-binary=:all:', '--require-hashes', '--find-links', join(payload, 'wheels'), '-r', requirementsPath])
  if (manifest.engineId === 'he-stardist') {
    const probe = readFileSync(new URL('./he-stardist-health.py', import.meta.url), 'utf8')
    const health = JSON.parse(await runPython(executable, ['-I', '-c', probe, payload]))
    return { runtime, health }
  }
  // The trusted health probe calls the OpenSlide DLL and reads a known image.
  const health = JSON.parse(await runPython(executable, ['-I', '-c', 'import json,os,tempfile,openslide,PIL; from PIL import Image; from importlib.metadata import version; f=tempfile.NamedTemporaryFile(suffix=".png",delete=False); f.close();\ntry:\n Image.new("RGB",(8,8),(80,60,120)).save(f.name); s=openslide.ImageSlide(f.name); pixel=s.read_region((0,0),0,(8,8)).getpixel((0,0)); s.close(); assert pixel[:3]==(80,60,120); print(json.dumps({"binding":openslide.__version__,"binary":version("openslide-bin"),"library":openslide.__library_version__,"pillow":PIL.__version__,"pixel":list(pixel)}))\nfinally: os.unlink(f.name)']))
  if (health.binding !== HE_PACKAGES['openslide-python'] || health.binary !== HE_PACKAGES['openslide-bin'] || health.pillow !== HE_PACKAGES.pillow) throw new Error('HE package version probe failed.')
  return { runtime, health }
}

async function replaceState(root, state) {
  const temporary = join(root, `.state-${randomUUID()}.json`)
  await writeFile(temporary, JSON.stringify(state, null, 2) + '\n', { flag: 'wx' })
  try { await rename(temporary, join(root, `${state.engineId}-7.0.0-state.json`)) } finally { await rm(temporary, { force: true }) }
}

// createEnvironment is injected only by local contract tests. The CLI always
// uses the fixed HE builder; manifests cannot select commands or callbacks.
export async function importHeEngine({ manifestPath, archivePath, manifestSha256, root: rootPath, python = 'python', createEnvironment = createHeEnvironment, platform, arch }) {
  const manifest = await loadManifest(manifestPath, manifestSha256, platform, arch)
  const root = await managedRoot(rootPath)
  return withLock(root, async () => {
    const disk = await statfs(root)
    const profile = engineProfile(manifest.engineId)
    if (disk.bavail * disk.bsize < profile.limits.expanded * 3) throw new Error('Insufficient free space for isolated engine installation.')
    const slot = `${manifest.engineId}-7.0.0-${randomUUID()}`
    const candidate = join(root, '.installs', slot)
    const payload = join(candidate, 'payload')
    const active = join(root, `${manifest.engineId}-7.0.0`)
    const previous = join(root, '.history', slot)
    const link = join(root, `.activate-${randomUUID()}`)
    let moved = false; let activated = false; let committed = false; let cleanupCandidate = true
    await mkdir(candidate)
    try {
      await extractVerifiedArchive(archivePath, payload, manifest)
      const verified = await createEnvironment(candidate, payload, manifest, python)
      await writeFile(join(candidate, 'install-receipt.json'), JSON.stringify({ schema: 'zerowall-engine-install/v1', installedAt: new Date().toISOString(), manifestSha256, manifest, ...verified }, null, 2) + '\n')
      await symlink(candidate, link, process.platform === 'win32' ? 'junction' : 'dir')
      if (await exists(active)) { await rename(active, previous); moved = true }
      await rename(link, active); activated = true
      const state = { schema: 'zerowall-engine-state/v1', engineId: manifest.engineId, active: slot, previous: moved ? slot : null, manifestSha256, activatedAt: new Date().toISOString() }
      await replaceState(root, state)
      committed = true
      return { ...state, python: join(active, 'venv', 'Scripts', 'python.exe'), ...verified }
    } catch (error) {
      try {
        if (activated) await removeActivationLink(active)
        if (moved) await rename(previous, active)
      } catch (rollbackError) {
        cleanupCandidate = false
        throw new AggregateError([error, rollbackError], 'Activation and rollback both failed. Candidate and previous installation were preserved for recovery.')
      }
      throw error
    } finally {
      await removeActivationLink(link)
      if (!committed && cleanupCandidate) await removeOwnedDirectory(join(root, '.installs'), candidate)
    }
  })
}

export async function rollbackHeEngine(rootPath, engineId = 'he') {
  engineProfile(engineId)
  const root = await managedRoot(rootPath)
  return withLock(root, async () => {
    const state = JSON.parse(await readFile(join(root, `${engineId}-7.0.0-state.json`), 'utf8'))
    if (state.schema !== 'zerowall-engine-state/v1' || state.engineId !== engineId || !slotPattern(engineId).test(state.previous ?? '')) throw new Error('No valid previous HE installation is available.')
    const previous = join(root, '.history', state.previous)
    const active = join(root, `${engineId}-7.0.0`)
    const backupSlot = `${engineId}-7.0.0-${randomUUID()}`
    const backup = join(root, '.history', backupSlot)
    if (!await exists(previous) || !await exists(active)) throw new Error('Rollback installation is missing; nothing was changed.')
    await rename(active, backup)
    try {
      await rename(previous, active)
      try { await replaceState(root, { ...state, active: null, previous: backupSlot, manifestSha256: null, activatedAt: new Date().toISOString(), restoredFrom: state.previous }) }
      catch (error) { await rename(active, previous); throw error }
    } catch (error) { await rename(backup, active); throw error }
    return { restored: true, python: join(active, 'venv', 'Scripts', 'python.exe'), previous: backupSlot }
  })
}

export async function verifyPackage(options) {
  const manifest = await loadManifest(options.manifestPath, options.manifestSha256, options.platform, options.arch)
  const parent = resolve(options.temporaryRoot)
  await mkdir(parent, { recursive: true })
  const target = join(parent, `verify-${randomUUID()}`)
  try { await extractVerifiedArchive(options.archivePath, target, manifest); return { verified: true, files: manifest.files.length, engineId: manifest.engineId, version: manifest.engineVersion, pythonBundled: false } }
  finally { await removeOwnedDirectory(parent, target) }
}
