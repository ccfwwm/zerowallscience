import { randomUUID } from 'node:crypto'
import { rootCertificates } from 'node:tls'
import { devNull } from 'node:os'
import { operationSpawn as spawn, checkPythonCancellation, pythonOperationSignal } from './python-operation.js'
import { windowsProcessPath } from './windows-process-path.js'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { appendFile, mkdir, readFile, writeFile, cp, readdir, rm, stat } from 'node:fs/promises'
import { basename, join, dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mirrorArgs, PYPI_INDEX_URL, resolveMirror, sanitizePythonTlsEnvironment, type MirrorConfig } from './python-mirror.js'
import { pipInvocation, publicCAFile } from './python-pip.js'
import type { McpEnvironmentManifest } from './mcp-environment.js'
import type { McpPythonInfo, PythonPackagePlan } from '../shared/contracts.js'
import { assertManifestWheels, type PythonDependencyManifest } from './python-dependency-manifest.js'
import { missingSourceRequirement, prepareRequestedSourceWheel, prepareSourceWheel, verifySourceWheel, type BuiltSourceWheel } from './python-source-packages.js'
import { withPackageDownloadRetries } from './python-download-retry.js'
import { commitFixedRuntime } from './python-fixed-transaction.js'
import { mayUseFallbackWheel, prepareFallbackWheel } from './python-fallback-wheel.js'

interface Context { root: string; executable: string; sitePackages: string; manifest: McpEnvironmentManifest; mirror?: MirrorConfig | undefined; dependencyManifest?: (PythonDependencyManifest) | undefined; sourceWheels?: (BuiltSourceWheel[]) | undefined }
interface Wheel { name: string; version: string; url?: (string) | undefined; hash?: (string) | undefined; sourceArchiveSha256?: (string) | undefined; sourceFilename?: (string) | undefined; sourceBuildId?: (string) | undefined; sourceUrl?: (string) | undefined; deferredSourceBuild?: (true) | undefined; deferredResolution?: (true) | undefined }
/** The only requirement form the installer uses for a mirror-resolved package. */
const pinnedRequirement = (wheel: { name: string; version: string }) => `${wheel.name}==${wheel.version}`
export interface StoredPackagePlan extends PythonPackagePlan { wheels: Wheel[]; removals?: (string[]) | undefined; dependencyManifest?: (PythonDependencyManifest) | undefined; manifestInstalled?: (Array<{ name: string; version: string }>) | undefined; preparationFailures?: (PackageInstallFailure[]) | undefined; /** Automatic signed updates may replace an older installed distribution. */ replaceInstalled?: boolean | undefined; /** Written after apply: which packages landed and which were skipped. */ installOutcome?: (ApplyOutcome) | undefined }
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
export interface ApplyOutcome { installed: number; skipped: PackageInstallFailure[]; pipCheckPassed?: boolean | undefined; pipCheckMessage?: (string) | undefined; importCheckPassed?: boolean | undefined; importCheckMessage?: (string) | undefined; diagnosticsSkipped?: boolean }
/** Progress sink. `stage` is a free-form label the caller renders verbatim. */
export interface ApplyProgress { (input: { completed: number; total: number; name?: (string) | undefined; stage?: (string) | undefined; logLine?: (string) | undefined }): void }
const normalize = (name: string) => name.toLowerCase().replace(/[-_.]+/gu, '-')
function pinnedArtifactRequirement(wheel: Wheel): string {
  if (!wheel.url || !wheel.hash || !/^[a-f0-9]{64}$/u.test(wheel.hash)) return pinnedRequirement(wheel)
  const url = new URL(wheel.url)
  url.hash = ''
  return `${wheel.name} @ ${url.href}#sha256=${wheel.hash}`
}

function sha256FromReport(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined
  const archive = (value as { archive_info?: ({ hash?: (unknown) | undefined; hashes?: (Record<string, unknown>) | undefined }) | undefined }).archive_info
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
async function run(executable: string, args: string[], paths: string[] = [], mirror?: MirrorConfig, onLine?: (line: string) => void, options: { timeoutMs?: (number) | undefined; heartbeat?: (string) | undefined } = {}): Promise<string> {
  // 1.4.0 excluded all PEM files, including pip's public CA bundle. Use Node's
  // trusted Mozilla roots without changing the active environment or disabling TLS.
  const certificateFile = await publicCAFile()
  // Python -I does not isolate pip configuration. Disable pip config files and
  // pass the application mirror to the install/download subcommand explicitly.
  const { bootstrap } = pipInvocation([...args, ...(mirror ? mirrorArgs(mirror) : [])], paths, certificateFile)
  return new Promise((accept, reject) => {
    const env: NodeJS.ProcessEnv = { ...sanitizePythonTlsEnvironment(process.env, certificateFile), PYTHONNOUSERSITE: '1' }
    // pip reads PIP_* environment variables even under Python -I and despite
    // PIP_CONFIG_FILE. Keep only the user's proxy and our validated CA bundle;
    // inherited no-binary/find-links/index settings can otherwise turn a wheel
    // preflight into an sdist build or silently send it to a different index.
    for (const key of Object.keys(env)) if (key.startsWith('PIP_') && !['PIP_PROXY', 'PIP_CERT'].includes(key)) delete (env as NodeJS.ProcessEnv)[key]
    env.PIP_DISABLE_PIP_VERSION_CHECK = '1'
    env.PIP_NO_INPUT = '1'
    env.PIP_CONFIG_FILE = devNull
    const child = spawn(windowsProcessPath(executable), ['-I', '-B', '-c', bootstrap], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env })
    let stdout = ''; let stderr = ''
    const startedAt = Date.now()
    let settled = false
    const timeoutMs = options.timeoutMs ?? 15 * 60_000
    const timer = setTimeout(() => { child.kill(); finish(); reject(new Error(`依赖操作超过 ${Math.ceil(timeoutMs / 1000)} 秒，当前环境保持可用。`)) }, timeoutMs)
    const heartbeat = options.heartbeat ? setInterval(() => {
      const seconds = Math.floor((Date.now() - startedAt) / 1000)
      try { onLine?.(`${options.heartbeat}；已等待 ${seconds} 秒，pip 仍在检查镜像资源。`) } catch { /* progress observers cannot break the resolver */ }
    }, 8_000) : undefined
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (heartbeat) clearInterval(heartbeat)
    }
    const lineBuffers = { stdout: '', stderr: '' }
    const publish = (stream: keyof typeof lineBuffers, chunk: Buffer, flush = false) => {
      const parts = (lineBuffers[stream] + chunk.toString('utf8')).split(/[\r\n]+/u)
      const tail = parts.pop() ?? ''
      lineBuffers[stream] = flush ? '' : tail.slice(-4000)
      for (const line of flush ? [...parts, tail] : parts) {
        const safe = line.replace(/https?:\/\/[^\s]+/gu, '[package-url]').trim().slice(0, 500)
        if (safe) onLine?.(safe)
      }
    }
    child.stdout.on('data', chunk => { stdout = (stdout + chunk).slice(-512_000); publish('stdout', chunk) })
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-16_000); publish('stderr', chunk) })
    child.once('error', error => { finish(); publish('stdout', Buffer.alloc(0), true); publish('stderr', Buffer.alloc(0), true); reject(error) })
    child.once('exit', code => {
      finish()
      publish('stdout', Buffer.alloc(0), true); publish('stderr', Buffer.alloc(0), true)
      code === 0 ? accept(stdout) : reject(new Error((stderr || stdout).replace(/https?:\/\/[^\s]+/gu, '[package-url]').slice(-4000)))
    })
  })
}

export async function preparePackagePlan(root: string, context: Context, requested: string[], info: McpPythonInfo, onLine?: (line: string) => void): Promise<StoredPackagePlan> {
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
  const retained = info.packages.filter(pkg => !requestedNames.has(normalize(pkg.name)))
  // Existing distributions are user-owned. Pin them exactly during resolver
  // work so installing a missing package cannot silently upgrade or downgrade
  // another package as a transitive side effect. An explicit request for the
  // package itself can still carry its own version constraint.
  const minimums = retained.map(pkg => `${pkg.name}==${pkg.version}`)
  // A signed full-software sync resolves against the complete lock, including
  // pins that are not installed yet. This keeps the per-package fallback from
  // quietly selecting an unlisted transitive version without requesting every
  // missing package in every bisection group.
  const pinned = new Map<string, { name: string; version: string }>(retained.map(pkg => [normalize(pkg.name), pkg]))
  for (const pkg of context.dependencyManifest?.packages ?? []) pinned.set(normalize(pkg.name), pkg)
  const pins = [...pinned.values()].map(pkg => `${pkg.name}==${pkg.version}`)
  const effectiveRequested = packageResolutionRequirements(requested, info.packages, context.sourceWheels)
  await writeFile(requirementsPath, (context.dependencyManifest ? effectiveRequested : [...effectiveRequested, ...minimums]).join('\n'))
  const mirror = resolveMirror(context.mirror)
  let result: any
  try {
    await writeFile(constraintsPath, pins.join('\n'))
    // Signed manifests already contain the complete dependency closure. Do
    // not ask pip to solve transitive metadata or build an sdist during this
    // read-only preflight: both made one missing setuptools backend stall and
    // fail the full 529-package science plan even where a compatible wheel was
    // available. Install still uses the same signed exact package set below.
    const manifestFlags = context.dependencyManifest ? ['--no-deps', '--only-binary=:all:', '--timeout', '15', '--retries', '1'] : []
    const args = ['install', '--dry-run', '--progress-bar', 'off', '--upgrade-strategy', 'only-if-needed', ...manifestFlags, '--report', reportPath, '-r', requirementsPath, '-c', constraintsPath]
    const resolverOptions = context.dependencyManifest ? {
      timeoutMs: requested.length > 1 ? 90_000 : 30_000,
      heartbeat: requested.length > 1 ? `正在解析 ${requested.length} 个锁定包` : `正在检查 ${requested[0] ?? '依赖'} 的 wheel`,
    } : undefined
    try { await run(context.executable, args, [context.sitePackages], mirror, onLine, resolverOptions) }
    catch (strictError) {
      // A signed dependency sync must never relax its full lock to make a
      // resolver pass. Per-package isolation below identifies the bad pin.
      if (context.dependencyManifest) throw strictError
      // On conflict allow upward changes only, with the full change set shown before applying.
      await writeFile(constraintsPath, minimums.join('\n'))
      try { await run(context.executable, args, [context.sitePackages], mirror, onLine, resolverOptions) }
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
          return preparePackagePlan(root, { ...context, sourceWheels: [...(context.sourceWheels ?? []), source] }, requested, info)
        }
        if (!requirement || context.dependencyManifest || (context.sourceWheels?.length ?? 0) >= 30) throw resolutionError
        const missingName = normalize(requirement.match(/^[A-Za-z0-9_.-]+/u)?.[0] ?? '')
        if (!missingName || context.sourceWheels?.some(w => normalize(w.name) === missingName)) throw resolutionError
        const source = await prepareRequestedSourceWheel(root, context, requirement, mirror)
        return preparePackagePlan(root, { ...context, sourceWheels: [...(context.sourceWheels ?? []), source] }, requested, info)
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
  const plan: StoredPackagePlan = { planId, snapshotId: context.root, requested, wheels, changes: wheels.map(w => ({ name: w.name, from: versions.get(normalize(w.name)), to: w.version })) }
  await writeFile(join(directory, `${planId}.json`), JSON.stringify(plan))
  return plan
}

/** Resolve only absent manifest packages and bind the signed manifest to the plan.
 * Installed packages are preserved even when their version differs from the manifest. */
export interface ManifestPlanProgress { stage: string; message: string; progress?: (number) | undefined; completedPackages?: (number) | undefined; totalPackages?: (number) | undefined; currentPackage?: (string) | undefined; logLine?: (string) | undefined }

export async function prepareManifestPackagePlan(root: string, context: Context, manifest: PythonDependencyManifest, info: McpPythonInfo, report?: (progress: ManifestPlanProgress) => void, options: { includeVersionUpdates?: boolean } = {}): Promise<StoredPackagePlan> {
  const mirror = context.mirror ?? resolveMirror(manifest.index)
  const installedByName = new Map(info.packages.map(pkg => [normalize(pkg.name), pkg.version]))
  const pending = manifest.packages.filter(pkg => !installedByName.has(normalize(pkg.name)) || options.includeVersionUpdates === true && installedByName.get(normalize(pkg.name)) !== pkg.version)
  const directory = join(root, 'plans')
  await mkdir(directory, { recursive: true })
  const manifestInstalled = info.packages.map(pkg => ({ name: pkg.name, version: pkg.version }))
  const base = { planId: randomUUID(), snapshotId: context.root, requested: pending.map(pkg => `${pkg.name}==${pkg.version}`), wheels: [] as Wheel[], changes: pending.map(pkg => ({ name: pkg.name, from: info.packages.find(installed => normalize(installed.name) === normalize(pkg.name))?.version, to: pkg.version })), dependencyManifest: manifest, manifestInstalled, ...(options.includeVersionUpdates ? { replaceInstalled: true } : {}) }
  if (!pending.length) {
    const plan: StoredPackagePlan = { ...base, requested: [] }
    await writeFile(join(directory, `${plan.planId}.json`), JSON.stringify(plan))
    return plan
  }

  // Bind signed source archives into the plan, but defer PEP 517 builds until
  // the user starts installation. Building during a read-only preview caused
  // long silent waits and made missing build backends look like bad resources.
  const preparationFailures: PackageInstallFailure[] = []
  const wheels: Wheel[] = []
  for (const pkg of pending) {
    if (pkg.source !== 'sdist') {
      wheels.push({ name: pkg.name, version: pkg.version, deferredResolution: true, ...(pkg.sha256 ? { hash: pkg.sha256 } : {}) })
      continue
    }
    if (!pkg.filename || !pkg.sha256) {
      preparationFailures.push({ name: pkg.name, version: pkg.version, message: '签名清单中的源码文件名或 SHA-256 缺失。' })
      continue
    }
    wheels.push({ name: pkg.name, version: pkg.version, sourceArchiveSha256: pkg.sha256, sourceFilename: pkg.filename, deferredSourceBuild: true })
  }

  // No network-wide preflight. Each missing wheel is resolved immediately
  // before its own installation, so the first success appears promptly.
  const planId = base.planId
  const uniqueWheels = [...new Map(wheels.map(wheel => [normalize(wheel.name), wheel])).values()]
  const plan: StoredPackagePlan = { ...base, planId, wheels: uniqueWheels, preparationFailures }
  assertManifestWheels(manifest, plan.wheels, info.packages, preparationFailures.map(failure => failure.name), plan.replaceInstalled === true)
  await writeFile(join(directory, `${plan.planId}.json`), JSON.stringify(plan))
  report?.({ stage: 'preflight-complete', progress: 0, message: `缺包队列已就绪：${plan.wheels.length} 个包将逐一安装。`, completedPackages: 0, totalPackages: pending.length })
  return plan
}

async function python(executable: string, code: string, args: string[]): Promise<void> {
  await new Promise<void>((accept, reject) => {
    const child = spawn(windowsProcessPath(executable), ['-I', '-B', '-c', code, ...args], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'], env: sanitizePythonTlsEnvironment() })
    let error = ''; child.stderr.on('data', data => { error = (error + data).slice(-4000) })
    const timer = setTimeout(() => { child.kill(); reject(new Error('候选环境验证超时。')) }, 180_000)
    child.once('error', err => { clearTimeout(timer); reject(err) })
    child.once('exit', code => { clearTimeout(timer); code === 0 ? accept() : reject(new Error(error || `Python exit ${code}`)) })
  })
}

async function pythonOutput(executable: string, code: string, args: string[]): Promise<string> {
  return new Promise((accept, reject) => {
    const child = spawn(windowsProcessPath(executable), ['-I', '-B', '-c', code, ...args], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: sanitizePythonTlsEnvironment() })
    let stdout = ''; let stderr = ''
    child.stdout.on('data', chunk => { stdout = (stdout + chunk).slice(-2_000_000) })
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-16_000) })
    const timer = setTimeout(() => { child.kill(); reject(new Error('依赖文件清单校验超时。')) }, 120_000)
    child.once('error', error => { clearTimeout(timer); reject(error) })
    child.once('exit', code => { clearTimeout(timer); code === 0 ? accept(stdout) : reject(new Error(stderr || `Python exit ${code}`)) })
  })
}

export async function ownedDistributionFiles(executable: string, site: string, names: string[]): Promise<string[]> {
  const code = `import importlib.metadata as m,pathlib,sys,json,re
root=pathlib.Path(sys.argv[1]).resolve(); norm=lambda s:re.sub(r'[-_.]+','-',s).lower()
wanted=set(map(norm,json.loads(sys.argv[2])));selected=set();retained=set()
for d in m.distributions(path=[str(root)]):
 chosen=norm(d.metadata.get('Name','')) in wanted
 if chosen and d.files is None: raise RuntimeError('Missing RECORD for '+d.metadata.get('Name',''))
 for item in d.files or []:
  p=pathlib.Path(d.locate_file(item)).resolve()
  if p.is_relative_to(root) and p.is_file(): (selected if chosen else retained).add(p.relative_to(root).as_posix())
print(json.dumps(sorted(selected-retained)))`
  return JSON.parse(await pythonOutput(executable, code, [site, JSON.stringify(names)])) as string[]
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

async function installDistributionTransaction(executable: string, site: string, unpacked: string, packageName: string, version: string): Promise<string> {
  const before = await ownedDistributionFiles(executable, site, [packageName]).catch(error => {
    if (String(error).includes('No package metadata was found')) return []
    throw error
  })
  const after = await stagedFiles(unpacked)
  if (!after.length) throw new Error(`依赖 ${packageName} 的临时安装结果为空。`)
  const runtime = dirname(dirname(site))
  const prefix = relative(runtime, site)
  return commitFixedRuntime(runtime, unpacked, async () => {
    const verify = `import importlib.metadata as m,sys,re
norm=lambda s:re.sub(r'[-_.]+','-',s).lower()
d=next((d for d in m.distributions(path=[sys.argv[1]]) if norm(d.metadata.get('Name',''))==norm(sys.argv[2])),None)
assert d is not None and d.version==sys.argv[3], 'installed distribution version mismatch'`
    await python(executable, verify, [site, packageName, version])
  }, { prefix, removals: before.filter(path => !after.includes(path)).map(path => join(prefix, path)) })
}

/** Import one distribution from the fixed runtime immediately after its
 * transaction commits. Python -I does not add site-packages to sys.path, so
 * the selected fixed directory is inserted explicitly. Only an external
 * missing module with a declared dependency still queued may be deferred. */
export async function verifyPackageImport(executable: string, site: string, packageName: string, pendingNames: string[] = []): Promise<{ deferred: boolean; message?: string | undefined }> {
  const code = `import importlib,importlib.metadata as m,importlib.machinery,json,pathlib,re,sys,traceback
site=pathlib.Path(sys.argv[1]).resolve(); sys.path.insert(0,str(site))
norm=lambda s:re.sub(r'[-_.]+','-',s).lower()
name=sys.argv[2]; pending=set(map(norm,json.loads(sys.argv[3])))
d=next((item for item in m.distributions(path=[str(site)]) if norm(item.metadata.get('Name',''))==norm(name)),None)
if d is None: raise RuntimeError('缺少已安装的 distribution: '+name)
modules=[]
for raw in (d.read_text('top_level.txt') or '').splitlines():
  item=raw.strip()
  if item.isidentifier() and (site/(item+'.py')).is_file() or item.isidentifier() and (site/item/'__init__.py').is_file(): modules.append(item)
if not modules:
  for item in d.files or []:
    text=str(item).replace('\\\\','/')
    parts=text.split('/'); filename=parts[-1]
    if filename=='__init__.py': parts=parts[:-1]
    else:
      suffix=next((suffix for suffix in ['.py',*importlib.machinery.EXTENSION_SUFFIXES] if filename.endswith(suffix)),None)
      if suffix is None: continue
      parts[-1]=filename[:-len(suffix)]
    if parts and all(part.isidentifier() and part!='__pycache__' for part in parts): modules.append('.'.join(parts))
modules=sorted(set(modules),key=lambda value:(value.count('.'),value))
modules=[item for item in modules if not any(item.startswith(parent+'.') for parent in modules if parent!=item)]
if not modules: raise RuntimeError('缺少可验证的导入入口: '+name)
try:
 for module in modules:
  imported=importlib.import_module(module)
  origin=getattr(imported,'__file__',None)
  if origin and not pathlib.Path(origin).resolve().is_relative_to(site): raise RuntimeError('导入入口不在选定目录: '+module)
 checks={
  'numpy':"import numpy as n; assert n.linalg.det(n.eye(3)) == 1",
  'pandas':"import pandas as p; assert p.DataFrame({'x':[1,2]}).x.sum()==3",
  'scipy':"from scipy.integrate import quad; assert abs(quad(lambda x:x,0,1)[0]-.5)<1e-8",
  'opencv-python-headless':"import cv2,numpy as n; assert cv2.cvtColor(n.zeros((8,8,3),dtype=n.uint8),cv2.COLOR_BGR2GRAY).shape==(8,8)",
  'pillow':"from PIL import Image; assert Image.new('RGB',(8,8)).resize((4,4)).size==(4,4)",
  'imagehash':"import imagehash; from PIL import Image; assert imagehash.phash(Image.new('RGB',(8,8))) is not None",
  'pyzotero':"from pyzotero import zotero; z=zotero.Zotero('1','user',None); assert callable(z.items)",
 }
 if norm(name) in checks: exec(checks[norm(name)])
except ModuleNotFoundError as error:
 required={norm(match.group(0)) for value in d.requires or [] if (match:=re.match(r'[A-Za-z0-9_.-]+',value))}
 owned={value.split('.')[0] for value in modules}
 if not error.name or error.name.split('.')[0] in owned or not required.intersection(pending): raise
 print('\\nZEROWALL_IMPORT_RESULT:'+json.dumps({'deferred':True,'message':traceback.format_exc()}))
else: print('\\nZEROWALL_IMPORT_RESULT:'+json.dumps({'deferred':False}))
`
  try {
    const output = await pythonOutput(executable, code, [site, packageName, JSON.stringify(pendingNames)])
    const result = output.split(/\r?\n/u).reverse().find(line => line.startsWith('ZEROWALL_IMPORT_RESULT:'))
    if (!result) throw new Error('Python 未返回导入检测结果。')
    const parsed = JSON.parse(result.slice('ZEROWALL_IMPORT_RESULT:'.length)) as { deferred: boolean; message?: string }
    if (typeof parsed.deferred !== 'boolean') throw new Error('Python 导入检测结果无效。')
    return parsed
  } catch (error) { throw new PackageImportError(error instanceof Error ? error.message : String(error)) }
}

class PackageImportError extends Error {}

async function removeDistributionsTransaction(executable: string, site: string, names: string[]): Promise<void> {
  const runtime = dirname(dirname(site))
  const empty = join(runtime, '.zerowall', 'work', randomUUID())
  await mkdir(empty, { recursive: true })
  try {
    const owned = await ownedDistributionFiles(executable, site, names)
    await commitFixedRuntime(runtime, empty, async () => {
      await python(executable, `import importlib.metadata as m,sys,json,re
norm=lambda s:re.sub(r'[-_.]+','-',s).lower()
names=set(map(norm,json.loads(sys.argv[2])))
assert not any(norm(d.metadata.get('Name','')) in names for d in m.distributions(path=[sys.argv[1]])), 'uninstall verification failed'`, [site, JSON.stringify(names)])
    }, { prefix: relative(runtime, site), removals: owned.map(path => join(relative(runtime, site), path)) })
  } finally { await rm(empty, { recursive: true, force: true }) }
}

export async function snapshotPythonPaths(root: string, manifest: McpEnvironmentManifest, _legacyOverlayPath?: string): Promise<void> {
  const executable = join(root, manifest.python.relativeExecutable)
  const directory = dirname(executable)
  const staged = join(root, '.zerowall', 'work', randomUUID())
  let changed = false
  const stage = async (path: string, bytes: string) => {
    if (await readFile(path, 'utf8').then(value => value === bytes, () => false)) return
    const target = join(staged, relative(root, path))
    await mkdir(dirname(target), { recursive: true }); await writeFile(target, bytes); changed = true
  }
  try {
  for (const name of await readdir(directory)) if (name.endsWith('._pth')) {
    const path = join(directory, name)
    const canonical = relative(directory, join(root, manifest.python.relativeSitePackages)).replaceAll('\\', '/')
    const lines = (await readFile(path, 'utf8')).split(/\r?\n/u).filter(line => line && !line.includes('python-overlay') && !line.includes('user-overlay') && line !== canonical)
    lines.unshift(canonical)
    await stage(path, lines.join('\n') + '\n')
  }
  // The shipped 1.4.0 ZIP excluded public CA PEMs. Repair only the unactivated
  // candidate, with the same trusted roots used by this desktop's TLS stack.
  const site = join(root, manifest.python.relativeSitePackages)
  for (const module of ['certifi', 'pip/_vendor/certifi']) {
    const path = join(site, module, 'cacert.pem')
    if (await readFile(path).then(() => false, () => true)) {
      await stage(path, rootCertificates.join('\n'))
    }
  }
  if (changed) await commitFixedRuntime(root, staged, async () => undefined)
  } finally { await rm(staged, { recursive: true, force: true }) }
}

export async function applyPackagePlanFiles(root: string, context: Context, target: string, plan: StoredPackagePlan, progress?: ApplyProgress): Promise<ApplyOutcome> {
  if (plan.dependencyManifest) assertManifestWheels(plan.dependencyManifest, plan.wheels, plan.manifestInstalled, (plan.preparationFailures ?? []).map(failure => failure.name), plan.replaceInstalled === true)
  // Source build receipts are verified here; every downloaded wheel is also
  // checked against the plan digest below before any runtime file is changed.
  for (const wheel of plan.wheels) if (wheel.sourceArchiveSha256 && !wheel.deferredSourceBuild) await verifySourceWheel(root, wheel)
  const executable = context.executable
  const targetSite = join(target, context.manifest.python.relativeSitePackages)
  const canonicalSite = resolve(context.sitePackages) === resolve(join(context.root, context.manifest.python.relativeSitePackages)) ? targetSite : context.sitePackages
  await mkdir(canonicalSite, { recursive: true })
  await snapshotPythonPaths(target, context.manifest)
  if (plan.removals?.length) {
    await removeDistributionsTransaction(executable, canonicalSite, plan.removals)
  }
  const wheelDir = join(root, 'plans', `${plan.planId}-wheels`); await mkdir(wheelDir, { recursive: true })
  const total = plan.wheels.length + (plan.preparationFailures?.length ?? 0)
  // One package per pip invocation. The previous batch form meant any single
  // failure rolled the whole layer back; now each package is attempted on its
  // own and a failure is recorded instead of aborting the run.
  //
  // Each package keeps the signed version and the exact resolved artifact
  // digest. Source-only dependencies require a signed source-archive pin and
  // a verified local wheel or signed fallback wheel.
  const skipped: PackageInstallFailure[] = [...(plan.preparationFailures ?? [])]
  let completed = 0
  let installed = 0
  const recordFailure = async (failure: PackageInstallFailure) => {
    skipped.push(failure)
    await appendFile(join(root, 'plans', `${plan.planId}-skipped.jsonl`), JSON.stringify({ ...failure, at: new Date().toISOString() }) + '\n')
    progress?.({ completed, total, name: failure.name, stage: `安装失败 ${failure.name}`, logLine: failure.message })
  }
  for (const failure of skipped) {
    await appendFile(join(root, 'plans', `${plan.planId}-skipped.jsonl`), JSON.stringify({ ...failure, at: new Date().toISOString() }) + '\n')
    completed++
    progress?.({ completed, total, name: failure.name, stage: `跳过 ${failure.name}`, logLine: failure.message })
  }
  for (const [index, wheel] of plan.wheels.entries()) {
    checkPythonCancellation()
    progress?.({ completed, total, name: wheel.name, stage: `正在安装 ${wheel.name}` })
    try {
      const name = wheel.name.replace(/[^A-Za-z0-9_.-]/gu, '-')
      const itemDir = join(wheelDir, `${index}-${name}`)
      let installWheel: Wheel = wheel
      const mirror = resolveMirror(context.mirror)
      if (wheel.deferredResolution) {
        const source = plan.dependencyManifest?.packages.find(pkg => normalize(pkg.name) === normalize(wheel.name))
        if (!source || source.source === 'sdist') throw new Error('未找到签名清单中的依赖：' + wheel.name)
        const resolveOne = (selectedMirror: MirrorConfig) => preparePackagePlan(root,
          { ...context, dependencyManifest: { ...plan.dependencyManifest!, packages: [source] }, mirror: selectedMirror },
          [pinnedRequirement(wheel)], { ready: true, packages: [] },
          line => progress?.({ completed, total, name: wheel.name, stage: `正在获取 ${wheel.name}`, logLine: line }))
        let resolved = await resolveOne(mirror)
        checkPythonCancellation()
        if (resolved.error && mirror.indexUrl !== PYPI_INDEX_URL && /No matching distribution|Could not find a version|timed? ?out|connection|TLS|SSL/iu.test(resolved.error)) {
          resolved = await resolveOne({ indexUrl: PYPI_INDEX_URL })
        }
        if (resolved.error) throw new Error(resolved.error)
        assertManifestWheels({ ...plan.dependencyManifest!, packages: [source] }, resolved.wheels)
        if (resolved.wheels.length !== 1) throw new Error('单包资源解析结果无效：' + wheel.name)
        installWheel = resolved.wheels[0]!
      }
      if (wheel.deferredSourceBuild) {
        const source = plan.dependencyManifest?.packages.find(pkg => normalize(pkg.name) === normalize(wheel.name))
        if (!source || source.source !== 'sdist' || source.filename !== wheel.sourceFilename || source.sha256 !== wheel.sourceArchiveSha256) throw new Error(`依赖 ${wheel.name} 的源码锁定信息与已确认的安装清单不匹配。`)
        const sourcePackage = { name: source.name, version: source.version, filename: source.filename!, sha256: source.sha256! }
        progress?.({ completed, total, name: wheel.name, stage: `正在构建 ${wheel.name}`, logLine: '正在下载并校验签名清单锁定的源码归档。' })
        const onBuildLine = (line: string) => progress?.({ completed, total, name: wheel.name, stage: `正在构建 ${wheel.name}`, logLine: line })
        try {
          try {
            installWheel = await prepareSourceWheel(root, context, sourcePackage, mirror, onBuildLine)
          } catch (error) {
            checkPythonCancellation()
            if (!mayUseFallbackWheel(error)) throw error
            const official = new URL(mirror.indexUrl).hostname.toLowerCase() === new URL(PYPI_INDEX_URL).hostname.toLowerCase()
            if (official) throw error
            onBuildLine('镜像源码构建失败，正在使用官方 PyPI 重试相同签名源码。')
            installWheel = await prepareSourceWheel(root, context, sourcePackage, { indexUrl: PYPI_INDEX_URL }, onBuildLine)
          }
        } catch (error) {
          checkPythonCancellation()
          if (!mayUseFallbackWheel(error) || !plan.dependencyManifest?.fallbackWheels?.some(item => normalize(item.name) === normalize(wheel.name))) throw error
          onBuildLine('源码构建失败，正在下载并验证七牛签名 wheel。原始构建诊断：' + String(error).slice(-1500))
          try { installWheel = await prepareFallbackWheel(root, context.executable, plan.dependencyManifest, wheel.name) }
          catch (fallbackError) { throw new Error(String(error).slice(-2000) + '\n七牛 wheel 回退失败：' + String(fallbackError)) }
        }
      }
      // Download and install this one package to an isolated directory, then
      // merge only its files. Shared namespace directories already present in
      // site-packages survive, and pip cannot silently skip an existing dir.
      const unpacked = join(itemDir, 'unpacked')
      await withPackageDownloadRetries({ packageName: wheel.name, mirrorUrl: mirror.indexUrl, run: async () => {
        await mkdir(itemDir, { recursive: true })
        if (installWheel.sourceArchiveSha256 && installWheel.url) {
          const sourceWheel = fileURLToPath(installWheel.url)
          await cp(sourceWheel, join(itemDir, basename(sourceWheel)))
        } else await run(context.executable, ['download', '--no-deps', '--dest', itemDir, pinnedArtifactRequirement(installWheel)], [context.sitePackages], mirror,
          line => progress?.({ completed, total, name: wheel.name, stage: `正在下载 ${wheel.name}`, logLine: line }))
        await validateDownloadedWheel(context.executable, itemDir, installWheel)
        const installRequirement = installWheel.sourceArchiveSha256 && installWheel.url ? pinnedArtifactRequirement(installWheel) : pinnedRequirement(installWheel)
        await run(context.executable, ['install', '--no-index', '--find-links', itemDir, '--no-deps', '--target', unpacked, installRequirement], [context.sitePackages], undefined,
          line => progress?.({ completed, total, name: wheel.name, stage: `正在安装 ${wheel.name}`, logLine: line }))
        return unpacked
      }, validate: async directory => {
        const files = await readdir(directory).catch(() => [])
        if (!files.length) throw new Error('镜像返回空包或损坏的临时包。')
      }, clear: async () => { await rm(itemDir, { recursive: true, force: true }) } })
      // The candidate is complete before touching the live directory. Remove
      // only the previous distribution's RECORD files; a failed download or
      // wheel install therefore leaves the old package intact.
      // A dependency layer is installed as a complete closure, one wheel at a
      // time. Importing a parent before its children arrive rolled valid wheels
      // back and made the missing dependencies permanently unrepairable.
      await installDistributionTransaction(executable, canonicalSite, unpacked, wheel.name, wheel.version)
      installed++
      // Temporary-file cleanup cannot turn a verified commit into a skipped
      // package without restoring it. Keep a cleanup diagnostic separately.
      await rm(itemDir, { recursive: true, force: true }).catch(error => progress?.({ completed, total, name: wheel.name, logLine: `临时目录清理失败：${String(error)}` }))
      completed++
      progress?.({ completed, total, name: wheel.name, stage: `已安装 ${wheel.name}` })
    } catch (error) {
      checkPythonCancellation()
      const message = (error instanceof Error ? error.message : String(error)).slice(-1200)
      completed++
      await recordFailure({ name: wheel.name, version: wheel.version, message })
    }
  }
  // Keep explicit diagnostics available, but do not run environment-wide
  // import/pip checks as an installation gate. Actual wheel failures remain
  // durable retry items; unrelated optional packages cannot block this layer.
  return { installed, skipped, diagnosticsSkipped: true }
}

export async function replayCustomizations(target: string, manifest: McpEnvironmentManifest, sitePackages: string, customizations: Record<string, string>, removals: string[] = []): Promise<void> {
  await snapshotPythonPaths(target, manifest)
  const executable = join(target, manifest.python.relativeExecutable)
  const site = join(target, manifest.python.relativeSitePackages)
  if (removals.length) {
    const required = new Set(manifest.dependencies?.corePackages.map(pkg => normalize(pkg.name)) ?? [])
    if (removals.some(name => required.has(normalize(name)))) throw new Error('新版环境将已卸载包列为必需依赖，请审核后重新升级。')
    await removeDistributionsTransaction(executable, site, removals)
  }
  if (Object.keys(customizations).length) {
    // Resolve against the new official environment before touching the candidate.
    const info: McpPythonInfo = { ready: true, packages: (manifest.dependencies?.corePackages ?? []).map(p => ({ name: p.name, version: p.requiredVersion, source: 'core', health: 'locked' })) }
    // Replayed customizations resolve against the same manifest-provided index.
    const context: Context = { root: target, executable, sitePackages, manifest, mirror: resolveMirror(manifest.dependencies?.indexUrl) }
    const managementRoot = resolveManagementRoot(target)
    const plan = await preparePackagePlan(managementRoot, context, Object.entries(customizations).map(([name, version]) => `${name}==${version}`), info)
    if (plan.error) throw new Error('新版环境与本地定制不兼容：' + plan.error)
    await applyPackagePlanFiles(managementRoot, context, target, plan)
  }
  await run(executable, ['check'], [sitePackages])
}
function resolveManagementRoot(target: string): string { return dirname(dirname(target)) }
