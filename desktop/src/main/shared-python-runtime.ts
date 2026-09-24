import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { rootCertificates } from 'node:tls'
import { chmod, cp, lstat, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, isAbsolute } from 'node:path'
import type { McpEnvironmentManifest } from './mcp-environment.js'
import { sanitizePythonTlsEnvironment } from './python-mirror.js'

export const SHARED_LAYOUT = { relativeExecutable: 'Python/python.exe', relativeSitePackages: 'Python/Lib/site-packages' } as const

/** Only a real directory containing its own interpreter is the stable runtime. */
export async function isStablePythonDirectory(userDataRoot: string): Promise<boolean> {
  const root = join(userDataRoot, 'Python')
  const [directory, interpreter] = await Promise.all([
    lstat(root).catch(() => undefined),
    lstat(join(root, 'python.exe')).catch(() => undefined),
  ])
  return directory?.isDirectory() === true && !directory.isSymbolicLink() && interpreter?.isFile() === true && !interpreter.isSymbolicLink()
}

/** Move a legacy slot runtime into the real, stable product directory. */
export async function migrateStablePython(managementRoot: string, sourceRoot: string, manifest: McpEnvironmentManifest, overlay?: string, replaceExisting = false): Promise<string> {
  const stableRoot = dirname(managementRoot)
  const publicPython = join(stableRoot, 'Python')
  const sourceIsStableRoot = resolve(sourceRoot).toLowerCase() === resolve(stableRoot).toLowerCase()
  if (sourceIsStableRoot && await isStablePythonDirectory(stableRoot)) return stableRoot
  const existing = await lstat(publicPython).catch(() => undefined)
  if (existing && !existing.isSymbolicLink()) {
    if (await stat(join(publicPython, 'python.exe')).then(() => true, () => false) && !replaceExisting) return stableRoot
    if (!await stat(join(publicPython, 'python.exe')).then(() => true, () => false)) throw new Error('Stable Python directory is occupied.')
  }
  const staging = join(stableRoot, `Python.migrating-${randomUUID()}`)
  const backup = join(stableRoot, `Python.previous-link-${randomUUID()}`)
  try {
    await mkdir(staging, { recursive: true })
    if (manifest.python.relativeExecutable === SHARED_LAYOUT.relativeExecutable && manifest.python.relativeSitePackages === SHARED_LAYOUT.relativeSitePackages) {
      await copyRuntimeSnapshot(dirname(join(sourceRoot, manifest.python.relativeExecutable)), staging)
    } else {
      const candidate = join(managementRoot, `python-migration-${randomUUID()}`)
      try {
        if (sourceIsStableRoot) {
          // A legacy in-place installation can share the AppData parent. Copy
          // only its runtime trees; copying the parent would recurse into the
          // migration candidate and the management directory itself.
          const roots = new Set([manifest.python.relativeExecutable, manifest.python.relativeSitePackages].map(path => path.split(/[\\/]/u)[0]!))
          for (const name of roots) await copyRuntimeSnapshot(join(sourceRoot, name), join(candidate, name))
          const legacyPythonResources = await lstat(join(sourceRoot, 'python')).catch(() => undefined)
          // On Windows this also names `Python`. Do not pull an active
          // junction into the candidate as though it were the old lockfile
          // directory; doing so makes normalization mistake it for a second
          // interpreter and can copy an entire live environment recursively.
          if (!roots.has('python') && legacyPythonResources?.isDirectory() && !legacyPythonResources.isSymbolicLink()) await copyRuntimeSnapshot(join(sourceRoot, 'python'), join(candidate, 'python'))
        } else await copyRuntimeSnapshot(sourceRoot, candidate)
        await normalizeRuntimeCandidate(candidate, manifest, overlay)
        await copyRuntimeSnapshot(join(candidate, 'Python'), staging)
      } finally { await rm(candidate, { recursive: true, force: true }) }
    }
    await stat(join(staging, 'python.exe'))
    if (existing) await rename(publicPython, backup)
    try { await rename(staging, publicPython) }
    catch (error) { if (existing) await rename(backup, publicPython); throw error }
    if (existing) await rm(backup, { recursive: true, force: true }).catch(() => undefined)
    return stableRoot
  } catch (error) {
    await rm(staging, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
}

/** Windows' native bounded copy pool avoids fs.cp's serial per-file overhead
 * for scientific environments containing hundreds of thousands of files.
 * /E copies only; /MIR and /PURGE are deliberately never used. */
export async function copyRuntimeSnapshot(source: string, target: string): Promise<void> {
  if (process.platform !== 'win32') {
    await cp(source, target, { recursive: true, filter: async path => !path.includes('__pycache__') && !(await lstat(path)).isSymbolicLink() })
    return
  }
  await mkdir(target, { recursive: true })
  await new Promise<void>((accept, reject) => {
    const child = spawn('robocopy.exe', [resolve(source), resolve(target), '/E', '/COPY:DAT', '/DCOPY:DAT', '/XJ', '/MT:8', '/R:1', '/W:1', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/XD', '__pycache__'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', data => { output = (output + data).slice(-4000) }); child.stderr.on('data', data => { output = (output + data).slice(-4000) })
    child.once('error', reject)
    child.once('exit', code => code !== null && code < 8 ? accept() : reject(new Error(`Python snapshot copy failed (${code}): ${output}`)))
  })
}

function contained(root: string, path: string): string {
  const result = resolve(root, path); const rel = relative(resolve(root), result)
  if (rel === '..' || rel.startsWith('..\\') || rel.startsWith('../') || isAbsolute(rel)) throw new Error('Python runtime path escapes candidate snapshot.')
  return result
}

/** Keep the signed archive manifest unchanged; layout metadata describes only
 * deterministic, local relocation, and can never redirect outside a snapshot. */
export async function readRuntimeLayout(root: string, signed: McpEnvironmentManifest): Promise<McpEnvironmentManifest> {
  const layout = await readFile(join(root, 'runtime-layout.json'), 'utf8').then(JSON.parse, () => undefined)
  if (!layout) return signed
  if (layout.schema !== 1 || layout.archiveSha256 !== signed.archiveSha256 || layout.relativeExecutable !== SHARED_LAYOUT.relativeExecutable || layout.relativeSitePackages !== SHARED_LAYOUT.relativeSitePackages) throw new Error('Invalid shared Python layout metadata.')
  await stat(join(root, SHARED_LAYOUT.relativeExecutable))
  // Repairing here as well as at migration time covers the active environment.
  // The candidate repair below only ever saw an unactivated snapshot, so a PEM
  // that went missing after activation — a partially applied overlay, a package
  // operation that replaced certifi, a hand-edited directory — stayed missing,
  // and every `requests` call in the child died on `certifi.where()`. This is
  // the one read that every active-layout consumer performs.
  await repairCertifiBundles(join(root, SHARED_LAYOUT.relativeSitePackages))
  return { ...signed, python: { ...signed.python, ...SHARED_LAYOUT, ...(layout.resourcesRelocated ? { dependencyManifests: signed.python.dependencyManifests?.map(path => path.replace(/^python[\\/]/iu, 'resources/python/')) } : {}) } }
}

/**
 * Earlier archives omitted the public PEM data files, and an installed
 * environment can lose them later. Rewrite a missing bundle from the desktop's
 * trusted root store.
 *
 * Only `certifi` and its `pip` vendored copy are touched, only when the package
 * directory already exists and the bundle file does not, and never in place:
 * an existing `cacert.pem` is opened with `wx` so it can never be truncated or
 * overwritten. Repair is best-effort — a failure here must not fail the
 * caller's read, since a missing bundle is reported by the child with a clear
 * message either way.
 */
export async function repairCertifiBundles(site: string): Promise<void> {
  for (const module of ['certifi', 'pip/_vendor/certifi']) {
    const directory = join(site, module)
    if (!await stat(directory).then(value => value.isDirectory(), () => false)) continue
    const certificate = join(directory, 'cacert.pem')
    if (await stat(certificate).then(value => value.isFile(), () => false)) continue
    await writeFile(certificate, rootCertificates.join('\n'), { encoding: 'utf8', flag: 'wx' }).catch(() => undefined)
  }
}

/** Only called on an unactivated, owned candidate. The source remains intact. */
export async function normalizeRuntimeCandidate(root: string, manifest: McpEnvironmentManifest, overlay?: string): Promise<McpEnvironmentManifest> {
  const sourceInterpreter = dirname(contained(root, manifest.python.relativeExecutable))
  const sourceSite = contained(root, manifest.python.relativeSitePackages)
  const runtime = join(root, 'Python'); const site = join(runtime, 'Lib', 'site-packages')
  const oldSiteRelative = relative(sourceInterpreter, sourceSite)
  if (oldSiteRelative.startsWith('..')) throw new Error('Python site-packages must be located under the managed interpreter.')
  // Old archives also contain a top-level `python` directory holding lock
  // files. On Windows this collides with the new interpreter directory.
  let resourcesRelocated = await stat(join(root, 'resources', 'python')).then(value => value.isDirectory(), () => false)
  const resourceDirectory = join(root, 'python')
  if (resolve(sourceInterpreter) !== resolve(runtime) && await stat(resourceDirectory).then(value => value.isDirectory(), () => false)) {
    if (await stat(join(resourceDirectory, 'python.exe')).then(() => true, () => false)) throw new Error('Candidate already has a different Python interpreter directory.')
    await mkdir(join(root, 'resources'), { recursive: true })
    await rename(resourceDirectory, join(root, 'resources', 'python'))
    resourcesRelocated = true
  }
  if (resolve(sourceInterpreter) !== resolve(runtime)) {
    await chmod(sourceInterpreter, 0o755)
    try { await renameDirectory(sourceInterpreter, runtime) } catch (error) {
      if (process.platform !== 'win32' || !['EPERM', 'EBUSY', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error
      // Large extracted trees can be temporarily held by Windows scanners.
      // Copying into the owned candidate avoids changing the active runtime.
      await copyRuntimeSnapshot(sourceInterpreter, runtime)
      await rm(sourceInterpreter, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
    }
  }
  const relocatedSite = join(runtime, oldSiteRelative)
  if (resolve(relocatedSite) !== resolve(site)) {
    await mkdir(dirname(site), { recursive: true })
    try { await renameDirectory(relocatedSite, site) } catch (error) {
      if (process.platform !== 'win32' || !['EPERM', 'EBUSY', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error
      await copyRuntimeSnapshot(relocatedSite, site)
      await rm(relocatedSite, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
    }
  }
  // Rewrite embeddable Python's import search path; no old overlay is used.
  for (const name of await readdir(runtime)) if (name.endsWith('._pth')) {
    const file = join(runtime, name)
    const lines = (await readFile(file, 'utf8')).split(/\r?\n/u).filter(line => line && !line.includes('site-packages') && !line.includes('overlay'))
    await writeFile(file, [...lines.filter(line => line !== 'import site'), 'Lib/site-packages', 'import site', ''].join('\n'))
  }
  if (overlay && resolve(overlay) !== resolve(site) && await stat(overlay).then(v => v.isDirectory(), () => false)) {
    // Remove only distributions replaced by user packages, using their RECORD
    // metadata to preserve shared namespace directories.
    const script = `import importlib.metadata as m,pathlib,sys,re,shutil
site=pathlib.Path(sys.argv[1]).resolve(); overlay=sys.argv[2]
norm=lambda s:re.sub(r'[-_.]+','-',s).lower()
names={norm(d.metadata['Name']) for d in m.distributions(path=[overlay])}
for d in list(m.distributions(path=[str(site)])):
 if norm(d.metadata['Name']) not in names: continue
 if d.files is None: raise RuntimeError('Missing RECORD: '+d.metadata['Name'])
 for f in d.files:
  p=pathlib.Path(d.locate_file(f)).resolve()
  if p.is_relative_to(site) and p.is_file(): p.unlink()
 metadata=pathlib.Path(d._path).resolve()
 if metadata.is_relative_to(site) and metadata.is_dir(): shutil.rmtree(metadata)
`
    await runPython(join(runtime, 'python.exe'), ['-I', '-B', '-c', script, site, overlay])
    await cp(overlay, site, { recursive: true, dereference: true })
  }
  // Same repair as `readRuntimeLayout`; see `repairCertifiBundles`.
  await repairCertifiBundles(site)
  const layout = { schema: 1, ...SHARED_LAYOUT, archiveSha256: manifest.archiveSha256, migratedAt: new Date().toISOString(), sourceExecutable: manifest.python.relativeExecutable, sourceSitePackages: manifest.python.relativeSitePackages, resourcesRelocated }
  await writeFile(join(root, 'runtime-layout.json'), JSON.stringify(layout, null, 2))
  return { ...manifest, python: { ...manifest.python, ...SHARED_LAYOUT, ...(resourcesRelocated ? { dependencyManifests: manifest.python.dependencyManifests?.map(path => path.replace(/^python[\\/]/iu, 'resources/python/')) } : {}) } }
}

async function renameDirectory(source: string, target: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try { await rename(source, target); return } catch (error) {
      if (attempt >= 7 || !['EPERM', 'EBUSY', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error
      await new Promise(accept => setTimeout(accept, 250 * (attempt + 1)))
    }
  }
}

export async function verifySharedPackages(root: string): Promise<void> {
  await runPython(join(root, SHARED_LAYOUT.relativeExecutable), ['-I', '-B', '-m', 'pip', 'check'])
}

async function runPython(executable: string, args: string[]): Promise<void> {
  await new Promise<void>((accept, reject) => {
    const child = spawn(executable, args, { windowsHide: true, env: sanitizePythonTlsEnvironment(), stdio: ['ignore', 'ignore', 'pipe'] })
    let error = ''; child.stderr.on('data', data => { error = (error + data).slice(-4000) })
    const timer = setTimeout(() => { child.kill(); reject(new Error('Shared Python migration verification timed out.')) }, 120_000)
    child.once('error', err => { clearTimeout(timer); reject(err) })
    child.once('exit', code => { clearTimeout(timer); code === 0 ? accept() : reject(new Error(error || `Python exit ${code}`)) })
  })
}
