import { randomUUID } from 'node:crypto'
import { rootCertificates } from 'node:tls'
import { devNull } from 'node:os'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { appendFile, mkdir, readFile, writeFile, cp, readdir, rm, stat } from 'node:fs/promises'
import { basename, join, dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mirrorArgs, resolveMirror, sanitizePythonTlsEnvironment, type MirrorConfig } from './python-mirror.js'
import { pipInvocation, publicCAFile } from './python-pip.js'
import type { McpEnvironmentManifest } from './mcp-environment.js'
import type { McpPythonInfo, PythonPackagePlan } from '../shared/contracts.js'
import { assertManifestWheels, type PythonDependencyManifest } from './python-dependency-manifest.js'
import { missingSourceRequirement, prepareRequestedSourceWheel, prepareSourceWheel, verifySourceWheel, type BuiltSourceWheel } from './python-source-packages.js'
import { withPackageDownloadRetries } from './python-download-retry.js'

interface Context { root: string; executable: string; sitePackages: string; overlayPath: string; manifest: McpEnvironmentManifest; mirror?: MirrorConfig | undefined; dependencyManifest?: PythonDependencyManifest; sourceWheels?: BuiltSourceWheel[] }
interface Wheel { name: string; version: string; url?: string; hash?: string; sourceArchiveSha256?: string; sourceFilename?: string; sourceBuildId?: string; sourceUrl?: string }
/** The only requirement form the installer uses for a mirror-resolved package. */
const pinnedRequirement = (wheel: { name: string; version: string }) => `${wheel.name}==${wheel.version}`
export interface StoredPackagePlan extends PythonPackagePlan { wheels: Wheel[]; removals?: string[]; profile?: string; dependencyManifest?: PythonDependencyManifest; manifestInstalled?: Array<{ name: string; version: string }>; /** Written after apply: which packages landed and which were skipped. */ installOutcome?: ApplyOutcome }
/**
 * Outcome of a per-package install.
 *
 * A 521-package science layer used to be applied as one `pip install -r` run,
 * so a single unresolvable pin (a version the mirror had never mirrored, a
 * package with no wheel for this interpreter) aborted the whole batch and left
 * the environment with none of the other 520. Installing one package at a time
 * turns that into a partial success: the failures are reported and skipped, and
 * the remainder of the layer lands.
 */
export interface PackageInstallFailure { name: string; version: string; message: string }
export interface ApplyOutcome { installed: number; skipped: PackageInstallFailure[]; pipCheckPassed: boolean; pipCheckMessage?: string; importCheckPassed: boolean; importCheckMessage?: string }
/** Progress sink. `stage` is a free-form label the caller renders verbatim. */
export interface ApplyProgress { (input: { completed: number; total: number; name?: string; stage?: string }): void }
const normalize = (name: string) => name.toLowerCase().replace(/[-_.]+/gu, '-')
function pinnedArtifactRequirement(wheel: Wheel): string {
  if (!wheel.url || !wheel.hash || !/^[a-f0-9]{64}$/u.test(wheel.hash)) return pinnedRequirement(wheel)
  const url = new URL(wheel.url)
  url.hash = ''
  return `${wheel.name} @ ${url.href}#sha256=${wheel.hash}`
}

function sha256FromReport(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined
  const archive = (value as { archive_info?: { hash?: unknown; hashes?: Record<string, unknown> } }).archive_info
  const raw = archive?.hashes?.sha256 ?? archive?.hash
  const match = typeof raw === 'string' ? /^(?:sha256=)?([a-f0-9]{64})$/iu.exec(raw) : undefined
  return match?.[1]?.toLowerCase()
}

async function validateDownloadedWheel(executable: string, directory: string, wheel: Wheel): Promise<void> {
  if (!wheel.hash || !/^[a-f0-9]{64}$/u.test(wheel.hash)) throw new Error(`依赖 ${wheel.name} 的安装计划缺少有效 SHA-256。`)
  const files = (await readdir(directory)).filter(name => name.toLowerCase().endsWith('.whl'))
  if (files.length !== 1) throw new Error(`依赖 ${wheel.name} 下载产物数量无效：${files.length}`)
  const path = join(directory, files[0]!)
  const before = await stat(path)
  if (!before.isFile() || before.size <= 0) throw new Error(`依赖 ${wheel.name} 下载文件长度无效。`)
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  const actual = hash.digest('hex')
  const after = await stat(path)
  if (after.size !== before.size || after.mtimeMs !== before.mtimeMs || actual !== wheel.hash) throw new Error(`依赖 ${wheel.name} 下载文件长度或 SHA-256 校验失败。`)
  const code = `import sys,zipfile
with zipfile.ZipFile(sys.argv[1]) as archive:
 if archive.testzip() is not None: raise RuntimeError('wheel archive CRC mismatch')`
  await python(executable, code, [path])
  await writeFile(join(directory, 'verified-artifact.json'), JSON.stringify({ name: wheel.name, version: wheel.version, bytes: before.size, sha256: actual, checkedAt: new Date().toISOString() }))
}
const sourceRequirement = (wheel: BuiltSourceWheel, extras = '') => `${wheel.name}${extras} @ ${wheel.url}#sha256=${wheel.hash}`

/** A local source wheel is an additional candidate, never a replacement for
 * user or dependency constraints. Pip must still solve their intersection. */
export function packageResolutionRequirements(requested: string[], installed: Array<{ name: string; version: string }>, sources: BuiltSourceWheel[] = []): string[] {
  const constraints = requested.map(spec => {
    const current = installed.find(pkg => normalize(pkg.name) === normalize(spec))
    const explicitlyConstrained = /(?:===|==|~=|!=|<=|>=|<|>)/u.test(spec)
    return current && !explicitlyConstrained ? `${spec}>${current.version}` : spec
  })
  // Retain every original request (including multiple ranges for one package).
  // The original extras stay on those requests and activate wheel dependencies.
  // Pip 26 resolves criteria incrementally. Seed the explicit candidates first:
  // evaluating a range before its local source wheel can fail immediately when
  // the index has no wheels, before pip sees the later direct reference.
  return [...sources.map(wheel => sourceRequirement(wheel)), ...constraints]
}
async function run(executable: string, args: string[], paths: string[] = [], mirror?: MirrorConfig): Promise<string> {
  // 1.4.0 excluded all PEM files, including pip's public CA bundle. Use Node's
  // trusted Mozilla roots without changing the active environment or disabling TLS.
  const certificateFile = await publicCAFile()
  // Python -I does not isolate pip configuration. Disable pip config files and
  // pass the application mirror to the install/download subcommand explicitly.
  const { bootstrap } = pipInvocation([...args, ...(mirror ? mirrorArgs(mirror) : [])], paths, certificateFile)
  return new Promise((accept, reject) => {
    const env = { ...sanitizePythonTlsEnvironment(process.env, certificateFile), PYTHONNOUSERSITE: '1', PIP_DISABLE_PIP_VERSION_CHECK: '1', PIP_NO_INPUT: '1', PIP_CONFIG_FILE: devNull }
    for (const key of ['PIP_EXTRA_INDEX_URL', 'PIP_INDEX_URL', 'PIP_TRUSTED_HOST']) delete (env as NodeJS.ProcessEnv)[key]
    const child = spawn(executable, ['-I', '-B', '-c', bootstrap], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env })
    let stdout = ''; let stderr = ''
    const timer = setTimeout(() => { child.kill(); reject(new Error('依赖操作超时，当前环境保持可用。')) }, 15 * 60_000)
    child.stdout.on('data', chunk => { stdout = (stdout + chunk).slice(-512_000) })
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-16_000) })
    child.once('error', error => { clearTimeout(timer); reject(error) })
    child.once('exit', code => { clearTimeout(timer); code === 0 ? accept(stdout) : reject(new Error((stderr || stdout).replace(/https?:\/\/[^\s]+/gu, '[package-url]').slice(-4000))) })
  })
}

export async function preparePackagePlan(root: string, context: Context, requested: string[], info: McpPythonInfo, profile?: string): Promise<StoredPackagePlan> {
  const planId = randomUUID(); const directory = join(root, 'plans'); await mkdir(directory, { recursive: true })
  const reportPath = join(directory, `${planId}-pip.json`)
  const requestedNames = new Set(requested.map(name => normalize(name.match(/^[A-Za-z0-9_.-]+/u)![0])))
  // No package family is categorically excluded: the shared environment is the single
  // install target, and science stacks (BrainGlobe via cellfinder/brainreg, StarDist,
  // deep-learning HE segmentation) legitimately pull torch, torchvision and the
  // nvidia-* CUDA wheels. Requesting any of them installs into the shared environment.
  const requirementsPath = join(directory, `${planId}.txt`)
  const constraintsPath = join(directory, `${planId}-constraints.txt`)
  // Retain existing distributions including locally built pure-Python wheels. Pip only
  // downloads wheels for changes; --ignore-installed would incorrectly reject those packages.
  const minimums = info.packages.filter(pkg => !requestedNames.has(normalize(pkg.name))).map(pkg => `${pkg.name}>=${pkg.version}`)
  const pins = info.packages.filter(pkg => !requestedNames.has(normalize(pkg.name))).map(pkg => `${pkg.name}==${pkg.version}`)
  const effectiveRequested = packageResolutionRequirements(requested, info.packages, context.sourceWheels)
  await writeFile(requirementsPath, [...effectiveRequested, ...minimums].join('\n'))
  const mirror = resolveMirror(context.mirror)
  let result: any
  try {
    await writeFile(constraintsPath, pins.join('\n'))
    // No `--only-binary=:all:`: it made the resolver reject any pin whose
    // mirror offers only a source archive, which several science packages do.
    const args = ['install', '--dry-run', ...(profile ? ['--ignore-installed'] : []), '--upgrade-strategy', 'only-if-needed', '--report', reportPath, '-r', requirementsPath, '-c', constraintsPath]
    try { await run(context.executable, args, [context.overlayPath, context.sitePackages], mirror) }
    catch {
      // On conflict allow upward changes only, with the full change set shown before applying.
      await writeFile(constraintsPath, minimums.join('\n'))
      try { await run(context.executable, args, [context.overlayPath, context.sitePackages], mirror) }
      catch (resolutionError) {
        const message = resolutionError instanceof Error ? resolutionError.message : String(resolutionError)
        const requirement = missingSourceRequirement(message)
        // The resolver's temporary PEP 517 subprocess cannot load a backend
        // through the embeddable interpreter's isolated `._pth` layout. Build
        // a single explicitly requested sdist with the disposable, normal-
        // layout interpreter, then let pip resolve its metadata and transitives
        // from that verified local wheel. Signed manifest syncs take their
        // separately authorized source path above and never use this fallback.
        const directRequest = requested.length === 1 ? requested[0] : undefined
        const directName = directRequest?.match(/^[A-Za-z0-9_.-]+/u)?.[0]
        const alreadyPrepared = directName && context.sourceWheels?.some(wheel => normalize(wheel.name) === normalize(directName))
        if (!requirement && !context.dependencyManifest && directRequest && directName && !alreadyPrepared && /BackendUnavailable: Cannot import ['"](?:setuptools\.)?build_meta['"]/u.test(message)) {
          const source = await prepareRequestedSourceWheel(root, context, directRequest, mirror)
          return preparePackagePlan(root, { ...context, sourceWheels: [...(context.sourceWheels ?? []), source] }, requested, info, profile)
        }
        if (!requirement || context.dependencyManifest || (context.sourceWheels?.length ?? 0) >= 30) throw resolutionError
        const missingName = normalize(requirement.match(/^[A-Za-z0-9_.-]+/u)?.[0] ?? '')
        if (!missingName || context.sourceWheels?.some(w => normalize(w.name) === missingName)) throw resolutionError
        const source = await prepareRequestedSourceWheel(root, context, requirement, mirror)
        return preparePackagePlan(root, { ...context, sourceWheels: [...(context.sourceWheels ?? []), source] }, requested, info, profile)
      }
    }
    result = JSON.parse(await readFile(reportPath, 'utf8'))
  } catch (error) {
    const failed: StoredPackagePlan = { planId, snapshotId: context.root, requested, changes: [], wheels: [], error: error instanceof Error ? error.message : String(error) }
    await writeFile(join(directory, `${planId}.json`), JSON.stringify(failed)); return failed
  }
  // Bind the selected artifact's digest to the plan. The app-level retry then
  // downloads that exact HTTPS artifact from the selected mirror and refuses
  // a changed or truncated response before it can reach site-packages.
  const wheels: Wheel[] = []
  for (const row of result.install as any[]) {
    const url = row.download_info?.url
    const source = context.sourceWheels?.find(pkg => normalize(pkg.name) === normalize(row.metadata.name))
    if (source && source.version !== row.metadata.version) throw new Error('源码构建产物与依赖解析计划不符。')
    if (source) { wheels.push({ ...source }); continue }
    if (typeof url !== 'string' || !url.startsWith('https://')) throw new Error('升级计划包含非 HTTPS 的依赖来源。')
    const hash = sha256FromReport(row.download_info)
    if (!hash) throw new Error(`依赖 ${row.metadata.name} 的镜像解析结果没有 SHA-256，已拒绝生成安装计划。`)
    const artifactUrl = new URL(url); artifactUrl.hash = ''
    const filename = decodeURIComponent(artifactUrl.pathname.split('/').at(-1) ?? '')
    if (filename.endsWith('.tar.gz') || filename.endsWith('.zip')) {
      // pip's dry-run can resolve an sdist even when the embedded interpreter
      // cannot build it during `pip download`. Build the exact hashed archive
      // before saving the plan, then install its verified wheel transactionally.
      wheels.push(await prepareSourceWheel(root, context, { name: row.metadata.name, version: row.metadata.version, filename, sha256: hash }, mirror))
    } else if (filename.endsWith('.whl')) wheels.push({ name: row.metadata.name, version: row.metadata.version, url: artifactUrl.href, hash })
    else throw new Error(`依赖 ${row.metadata.name} 的镜像产物格式不受支持：${filename}`)
  }
  const versions = new Map(info.packages.map(pkg => [normalize(pkg.name), pkg.version]))
  const plan: StoredPackagePlan = { planId, snapshotId: context.root, requested, wheels, ...(profile ? { profile } : {}), changes: wheels.map(w => ({ name: w.name, from: versions.get(normalize(w.name)), to: w.version })) }
  await writeFile(join(directory, `${planId}.json`), JSON.stringify(plan))
  return plan
}

/** Resolve every changed locked package then bind the exact signed manifest to
 * the stored plan. Application must repeat hash validation before downloading. */
export async function prepareManifestPackagePlan(root: string, context: Context, manifest: PythonDependencyManifest, info: McpPythonInfo): Promise<StoredPackagePlan> {
  const mirror = context.mirror ?? resolveMirror(manifest.index)
  const pending = manifest.packages.filter(pkg => !info.packages.some(installed => normalize(installed.name) === normalize(pkg.name) && installed.version === pkg.version))
  const sourceWheels: BuiltSourceWheel[] = []
  for (const pkg of pending) {
    if (pkg.source !== 'sdist') continue
    if (!pkg.filename) throw new Error(`源码依赖 ${pkg.name} 缺少锁定文件名。`)
    // A source build must name an archive to fetch and a digest to trust: there
    // is no index resolution step that could pick one for us.
    if (!pkg.sha256) throw new Error(`源码依赖 ${pkg.name} 缺少源码 SHA-256。`)
    sourceWheels.push(await prepareSourceWheel(root, context, { name: pkg.name, version: pkg.version, filename: pkg.filename, sha256: pkg.sha256 }, mirror))
  }
  if (!pending.length) {
    const plan: StoredPackagePlan = { planId: randomUUID(), snapshotId: context.root, requested: [], wheels: [], changes: [], dependencyManifest: manifest, manifestInstalled: info.packages.map(pkg => ({ name: pkg.name, version: pkg.version })) }
    await mkdir(join(root, 'plans'), { recursive: true })
    await writeFile(join(root, 'plans', `${plan.planId}.json`), JSON.stringify(plan))
    return plan
  }
  const plan = await preparePackagePlan(root, { ...context, dependencyManifest: manifest, sourceWheels, mirror }, pending.map(pkg => `${pkg.name}==${pkg.version}`), info)
  if (!plan.error) {
    assertManifestWheels(manifest, plan.wheels, info.packages)
    plan.dependencyManifest = manifest
    plan.manifestInstalled = info.packages.map(pkg => ({ name: pkg.name, version: pkg.version }))
    await writeFile(join(root, 'plans', `${plan.planId}.json`), JSON.stringify(plan))
  }
  return plan
}

export async function applyIsolatedProfile(root: string, context: Context, plan: StoredPackagePlan): Promise<string> {
  if (!plan.profile || !/^[a-z][a-z0-9-]{0,39}$/u.test(plan.profile)) throw new Error('Invalid dependency profile')
  if (plan.dependencyManifest) assertManifestWheels(plan.dependencyManifest, plan.wheels, plan.manifestInstalled)
  for (const wheel of plan.wheels) if (wheel.sourceArchiveSha256) await verifySourceWheel(root, wheel)
  const parent = join(root, 'profiles', plan.profile)
  const target = join(parent, plan.planId)
  const active = await readFile(join(parent, 'current.json'), 'utf8').then(JSON.parse, () => undefined)
  if (active?.planId === plan.planId && active.snapshotId === context.root) return active.root
  // A crashed attempt has never been activated; retry from clean owned output.
  await rm(target, { recursive: true, force: true })
  try {
  await mkdir(target, { recursive: true })
  const lock = join(target, 'requirements.lock')
  await writeFile(lock, plan.wheels.map(pinnedArtifactRequirement).join('\n'))
  const site = join(target, 'site-packages')
  await run(context.executable, ['install', '--ignore-installed', '--no-deps', '--target', site, '-r', lock], [context.sitePackages], resolveMirror(context.mirror))
  await python(context.executable, `import sys,json,importlib.metadata as m\nfrom packaging.requirements import Requirement\nfrom packaging.utils import canonicalize_name\npackages={canonicalize_name(d.metadata['Name']):d for d in m.distributions(path=[sys.argv[1]])}\nfor d in packages.values():\n for raw in d.requires or []:\n  r=Requirement(raw)\n  if r.marker and not r.marker.evaluate(): continue\n  dependency=packages.get(canonicalize_name(r.name))\n  if dependency is None or dependency.version not in r.specifier: raise RuntimeError(d.metadata['Name']+' has unsatisfied dependency '+raw)`, [site])
  const record = JSON.stringify({ profile: plan.profile, root: target, sitePackages: site, snapshotId: context.root, pythonVersion: context.manifest.python.version, planId: plan.planId, wheels: plan.wheels, verifiedAt: new Date().toISOString() })
  await writeFile(join(target, 'manifest.json'), record)
  const temporary = join(parent, `${plan.planId}.tmp`)
  await writeFile(temporary, record)
  const { rename } = await import('node:fs/promises')
  await rename(temporary, join(parent, 'current.json'))
  return target
  } catch (error) {
    await rm(target, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
}

async function python(executable: string, code: string, args: string[]): Promise<void> {
  await new Promise<void>((accept, reject) => {
    const child = spawn(executable, ['-I', '-B', '-c', code, ...args], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'], env: sanitizePythonTlsEnvironment() })
    let error = ''; child.stderr.on('data', data => { error = (error + data).slice(-4000) })
    const timer = setTimeout(() => { child.kill(); reject(new Error('候选环境验证超时。')) }, 180_000)
    child.once('error', err => { clearTimeout(timer); reject(err) })
    child.once('exit', code => { clearTimeout(timer); code === 0 ? accept() : reject(new Error(error || `Python exit ${code}`)) })
  })
}

async function pythonOutput(executable: string, code: string, args: string[]): Promise<string> {
  return new Promise((accept, reject) => {
    const child = spawn(executable, ['-I', '-B', '-c', code, ...args], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: sanitizePythonTlsEnvironment() })
    let stdout = ''; let stderr = ''
    child.stdout.on('data', chunk => { stdout = (stdout + chunk).slice(-2_000_000) })
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-16_000) })
    const timer = setTimeout(() => { child.kill(); reject(new Error('依赖文件清单校验超时。')) }, 120_000)
    child.once('error', error => { clearTimeout(timer); reject(error) })
    child.once('exit', code => { clearTimeout(timer); code === 0 ? accept(stdout) : reject(new Error(stderr || `Python exit ${code}`)) })
  })
}

async function distributionFiles(executable: string, site: string, name: string): Promise<string[]> {
  const code = `import importlib.metadata as m,pathlib,sys,json,re
root=pathlib.Path(sys.argv[1]).resolve();wanted=re.sub(r'[-_.]+','-',sys.argv[2]).lower(); found=[]
for d in m.distributions(path=[str(root)]):
 if re.sub(r'[-_.]+','-',d.metadata.get('Name','')).lower()!=wanted: continue
 if d.files is None: raise RuntimeError('Missing RECORD for '+sys.argv[2])
 for item in d.files:
  p=pathlib.Path(d.locate_file(item)).resolve()
  if p.is_relative_to(root) and p.is_file(): found.append(p.relative_to(root).as_posix())
print(json.dumps(sorted(set(found))))`
  return JSON.parse(await pythonOutput(executable, code, [site, name])) as string[]
}

async function stagedFiles(root: string): Promise<string[]> {
  const result: string[] = []; const pending = ['']
  while (pending.length) {
    const relativeDirectory = pending.pop()!; const directory = join(root, relativeDirectory)
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relativePath = (relativeDirectory ? join(relativeDirectory, entry.name) : entry.name).replaceAll('\\', '/')
      if (entry.isSymbolicLink()) throw new Error('依赖安装包包含不安全的符号链接。')
      if (entry.isDirectory()) pending.push(relativePath)
      else if (entry.isFile()) result.push(relativePath)
    }
  }
  return result.sort()
}

async function installDistributionTransaction(executable: string, site: string, unpacked: string, packageName: string, version: string, backup: string): Promise<void> {
  const before = await distributionFiles(executable, site, packageName).catch(error => {
    if (String(error).includes('No package metadata was found')) return []
    throw error
  })
  const after = await stagedFiles(unpacked)
  if (!after.length) throw new Error(`依赖 ${packageName} 的临时安装结果为空。`)
  const affected = [...new Set([...before, ...after])]
  const saved: string[] = []
  await mkdir(backup, { recursive: true })
  for (const path of affected) {
    const source = join(site, path)
    if (!await stat(source).then(value => value.isFile(), () => false)) continue
    const destination = join(backup, path)
    await mkdir(dirname(destination), { recursive: true }); await cp(source, destination); saved.push(path)
  }
  const restore = async () => {
    for (const path of affected) await rm(join(site, path), { force: true }).catch(() => undefined)
    for (const path of saved) { const source = join(backup, path); const destination = join(site, path); await mkdir(dirname(destination), { recursive: true }); await cp(source, destination) }
  }
  try {
    for (const path of after) {
      const source = join(unpacked, path); const destination = join(site, path)
      await mkdir(dirname(destination), { recursive: true }); await cp(source, destination)
    }
    const verify = `import importlib.metadata as m,sys,re
norm=lambda s:re.sub(r'[-_.]+','-',s).lower()
d=next((d for d in m.distributions(path=[sys.argv[1]]) if norm(d.metadata.get('Name',''))==norm(sys.argv[2])),None)
assert d is not None and d.version==sys.argv[3], 'installed distribution version mismatch'`
    await python(executable, verify, [site, packageName, version])
    for (const path of before) if (!after.includes(path)) await rm(join(site, path), { force: true })
  } catch (error) {
    await restore().catch(() => undefined)
    throw error
  }
}

const REMOVE_DISTRIBUTIONS = `import importlib.metadata as m,pathlib,sys,json,re,shutil
site=pathlib.Path(sys.argv[1]).resolve()
names=set(json.loads(sys.argv[2]))
for d in list(m.distributions(path=[str(site)])):
 if re.sub(r'[-_.]+','-',d.metadata['Name']).lower() not in names: continue
 if d.files is None: raise RuntimeError('Missing RECORD: '+d.metadata['Name'])
 for item in d.files:
  p=pathlib.Path(d.locate_file(item)).resolve()
  if p.is_relative_to(site) and p.is_file(): p.unlink()
 metadata=pathlib.Path(d._path).resolve()
 if metadata.is_relative_to(site) and metadata.name.endswith(('.dist-info','.egg-info')) and metadata.is_dir(): shutil.rmtree(metadata)
` // Empty namespace directories are intentionally retained, never recursively removed.

export async function snapshotPythonPaths(root: string, manifest: McpEnvironmentManifest, overlayPath: string): Promise<void> {
  const executable = join(root, manifest.python.relativeExecutable)
  const directory = dirname(executable)
  for (const name of await readdir(directory)) if (name.endsWith('._pth')) {
    const path = join(directory, name)
    const lines = (await readFile(path, 'utf8')).split(/\r?\n/u).filter(line => line && !line.includes('python-overlay') && !line.includes('user-overlay'))
    lines.unshift(relative(directory, overlayPath).replaceAll('\\', '/'))
    await writeFile(path, lines.join('\n') + '\n')
  }
  // The shipped 1.4.0 ZIP excluded public CA PEMs. Repair only the unactivated
  // candidate, with the same trusted roots used by this desktop's TLS stack.
  const site = join(root, manifest.python.relativeSitePackages)
  for (const module of ['certifi', 'pip/_vendor/certifi']) {
    const path = join(site, module, 'cacert.pem')
    if (await readFile(path).then(() => false, () => true)) {
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, rootCertificates.join('\n'))
    }
  }
}

export async function applyPackagePlanFiles(root: string, context: Context, target: string, plan: StoredPackagePlan, progress?: ApplyProgress): Promise<ApplyOutcome> {
  if (plan.dependencyManifest) assertManifestWheels(plan.dependencyManifest, plan.wheels, plan.manifestInstalled)
  // Only locally built source wheels are still digest-checked: they are our own
  // build output in our own cache, not an artifact a mirror re-publishes.
  for (const wheel of plan.wheels) if (wheel.sourceArchiveSha256) await verifySourceWheel(root, wheel)
  const executable = context.executable
  const site = context.sitePackages
  // New shared runtimes expose one public site-packages directory. Keep the
  // legacy overlay for old archives, but merge user wheels directly into the
  // shared directory when the manifest uses the stable Python/ layout.
  const shared = /^Python[\\/]Lib[\\/]site-packages$/u.test(context.manifest.python.relativeSitePackages)
  const overlay = shared ? site : join(target, 'user-overlay')
  await mkdir(overlay, { recursive: true })
  if (!shared && resolve(context.overlayPath) !== resolve(overlay)) await cp(context.overlayPath, overlay, { recursive: true })
  if (!shared) await snapshotPythonPaths(target, context.manifest, overlay)
  if (plan.removals?.length) {
    await python(executable, REMOVE_DISTRIBUTIONS, [site, JSON.stringify(plan.removals)])
    if (!shared) await python(executable, REMOVE_DISTRIBUTIONS, [overlay, JSON.stringify(plan.removals)])
  }
  const wheelDir = join(root, 'plans', `${plan.planId}-wheels`); await mkdir(wheelDir, { recursive: true })
  const total = plan.wheels.length
  // One package per pip invocation. The previous batch form meant any single
  // failure rolled the whole layer back; now each package is attempted on its
  // own and a failure is recorded instead of aborting the run.
  //
  // Each package is requested as `name==version` and resolved against the
  // active mirror, so a wheel the mirror has rebuilt or re-compressed since
  // the manifest was signed still installs. `--only-binary` is intentionally
  // absent: several pinned science packages (flowio, nglview, docopt,
  // bibtexparser, autograd-gamma) ship source only, and pip needs to be
  // allowed to build them. A locally built source wheel keeps its exact
  // digest pin, because that artifact is ours rather than the mirror's.
  const skipped: PackageInstallFailure[] = []
  let installed = 0
  for (const [index, wheel] of plan.wheels.entries()) {
    progress?.({ completed: index, total, name: wheel.name, stage: `正在安装 ${wheel.name}` })
    try {
      const name = wheel.name.replace(/[^A-Za-z0-9_.-]/gu, '-')
      const itemDir = join(wheelDir, `${index}-${name}`)
      const downloadRequirement = pinnedArtifactRequirement(wheel)
      const installRequirement = wheel.sourceArchiveSha256 && wheel.url ? downloadRequirement : pinnedRequirement(wheel)
      // Download and install this one package to an isolated directory, then
      // merge only its files. Shared namespace directories already present in
      // site-packages survive, and pip cannot silently skip an existing dir.
      const mirror = resolveMirror(context.mirror)
      const unpacked = join(itemDir, 'unpacked')
      await withPackageDownloadRetries({ packageName: wheel.name, mirrorUrl: mirror.indexUrl, run: async () => {
        await mkdir(itemDir, { recursive: true })
        if (wheel.sourceArchiveSha256 && wheel.url) {
          const sourceWheel = fileURLToPath(wheel.url)
          await cp(sourceWheel, join(itemDir, basename(sourceWheel)))
        } else await run(context.executable, ['download', '--no-deps', '--dest', itemDir, downloadRequirement], [context.sitePackages], mirror)
        await validateDownloadedWheel(context.executable, itemDir, wheel)
        await run(context.executable, ['install', '--no-index', '--find-links', itemDir, '--no-deps', '--target', unpacked, installRequirement], [context.sitePackages])
        return unpacked
      }, validate: async directory => {
        const files = await readdir(directory).catch(() => [])
        if (!files.length) throw new Error('镜像返回空包或损坏的临时包。')
      }, clear: async () => { await rm(itemDir, { recursive: true, force: true }) } })
      // The candidate is complete before touching the live directory. Remove
      // only the previous distribution's RECORD files; a failed download or
      // wheel install therefore leaves the old package intact.
      await installDistributionTransaction(executable, site, unpacked, wheel.name, wheel.version, join(itemDir, 'rollback'))
      await rm(itemDir, { recursive: true, force: true })
      installed++
    } catch (error) {
      const message = (error instanceof Error ? error.message : String(error)).slice(-1200)
      skipped.push({ name: wheel.name, version: wheel.version, message })
      // Record the skip durably so a later run can retry just these packages.
      await appendFile(join(root, 'plans', `${plan.planId}-skipped.jsonl`), JSON.stringify({ name: wheel.name, version: wheel.version, message, at: new Date().toISOString() }) + '\n').catch(() => undefined)
      progress?.({ completed: index + 1, total, name: wheel.name, stage: `跳过 ${wheel.name}` })
      continue
    }
    progress?.({ completed: index + 1, total, name: wheel.name, stage: `已安装 ${wheel.name}` })
  }
  // `pip check` is advisory here: a skipped package legitimately leaves an
  // unsatisfied requirement, and failing the whole run for it would undo the
  // point of installing the rest.
  let pipCheckPassed = false; let pipCheckMessage: string | undefined
  try { await run(executable, ['check'], [overlay, site]); pipCheckPassed = true }
  catch (error) { pipCheckMessage = error instanceof Error ? error.message.slice(-2000) : String(error).slice(-2000) }
  // Only verify the packages that actually landed. A skipped package has no
  // import entry point by definition, and asserting one here would turn a
  // deliberate skip into a hard failure after the work is already done.
  const verified = plan.wheels.map(wheel => wheel.name).filter(name => !skipped.some(item => normalize(item.name) === normalize(name)))
  let importCheckPassed = true; let importCheckMessage: string | undefined
  if (verified.length) try { await python(executable, `import importlib,importlib.metadata as m,sys,json,pathlib
names=json.loads(sys.argv[1])
mapping=m.packages_distributions()
for name in names:
 modules=[k for k,v in mapping.items() if any(n.lower().replace('_','-')==name.lower().replace('_','-') for n in v)]
 if not modules:
  d=m.distribution(name)
  modules=[p.split('/')[0][:-3] for p in map(str,d.files or []) if '/' not in p and p.endswith('.py')]
 if not modules: raise RuntimeError('缺少可验证的导入入口: '+name)
 for module in modules:
  if module.isidentifier() and not module.startswith('_'): importlib.import_module(module)
`, [JSON.stringify(verified)]) } catch (error) { importCheckPassed = false; importCheckMessage = error instanceof Error ? error.message.slice(-2000) : String(error).slice(-2000) }
  try { await python(executable, `import json,sys,importlib.util
names=set(json.loads(sys.argv[1]))
checks={
 'numpy':"import numpy as n; assert n.linalg.det(n.eye(3)) == 1",
 'pandas':"import pandas as p; assert p.DataFrame({'x':[1,2]}).x.sum()==3",
 'scipy':"from scipy.integrate import quad; assert abs(quad(lambda x:x,0,1)[0]-.5)<1e-8",
 'opencv-python-headless':"import cv2,numpy as n; assert cv2.cvtColor(n.zeros((8,8,3),dtype=n.uint8),cv2.COLOR_BGR2GRAY).shape==(8,8)",
 'pillow':"from PIL import Image; assert Image.new('RGB',(8,8)).resize((4,4)).size==(4,4)",
 'imagehash':"import imagehash; from PIL import Image; assert imagehash.phash(Image.new('RGB',(8,8))) is not None",
 'pyzotero':"from pyzotero import zotero; z=zotero.Zotero('1','user',None); assert callable(z.items)",
}
for name,code in checks.items():
 if name in names: exec(code)
`, [JSON.stringify(verified.map(name => normalize(name)))]) } catch (error) { importCheckPassed = false; importCheckMessage = [importCheckMessage, error instanceof Error ? error.message.slice(-2000) : String(error).slice(-2000)].filter(Boolean).join('\n') }
  return { installed, skipped, pipCheckPassed, pipCheckMessage, importCheckPassed, importCheckMessage }
}

export async function replayCustomizations(target: string, manifest: McpEnvironmentManifest, overlayPath: string, customizations: Record<string, string>, removals: string[] = []): Promise<void> {
  await snapshotPythonPaths(target, manifest, overlayPath)
  const executable = join(target, manifest.python.relativeExecutable)
  const site = join(target, manifest.python.relativeSitePackages)
  if (removals.length) {
    const required = new Set(manifest.dependencies?.corePackages.map(pkg => normalize(pkg.name)) ?? [])
    if (removals.some(name => required.has(normalize(name)))) throw new Error('新版环境将已卸载包列为必需依赖，请审核后重新升级。')
    await python(executable, REMOVE_DISTRIBUTIONS, [site, JSON.stringify(removals)])
    await python(executable, REMOVE_DISTRIBUTIONS, [overlayPath, JSON.stringify(removals)])
  }
  if (Object.keys(customizations).length) {
    // Resolve against the new official environment before touching the candidate.
    const info: McpPythonInfo = { ready: true, packages: (manifest.dependencies?.corePackages ?? []).map(p => ({ name: p.name, version: p.requiredVersion, source: 'core', health: 'locked' })) }
    // Replayed customizations resolve against the same manifest-provided index.
    const context: Context = { root: target, executable, sitePackages: site, overlayPath, manifest, mirror: resolveMirror(manifest.dependencies?.indexUrl) }
    const managementRoot = resolveManagementRoot(target)
    const plan = await preparePackagePlan(managementRoot, context, Object.entries(customizations).map(([name, version]) => `${name}==${version}`), info)
    if (plan.error) throw new Error('新版环境与本地定制不兼容：' + plan.error)
    await applyPackagePlanFiles(managementRoot, context, target, plan)
  }
  await run(executable, ['check'], [overlayPath, site])
}
function resolveManagementRoot(target: string): string { return dirname(dirname(target)) }
