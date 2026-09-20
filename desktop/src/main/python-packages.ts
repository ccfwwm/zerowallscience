import { randomUUID } from 'node:crypto'
import { rootCertificates } from 'node:tls'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile, cp, readdir, rm } from 'node:fs/promises'
import { join, dirname, relative, resolve } from 'node:path'
import type { McpEnvironmentManifest } from './mcp-environment.js'
import type { McpPythonInfo, PythonPackagePlan } from '../shared/contracts.js'

interface Context { root: string; executable: string; sitePackages: string; overlayPath: string; manifest: McpEnvironmentManifest }
interface Wheel { name: string; version: string; url: string; hash: string }
export interface StoredPackagePlan extends PythonPackagePlan { wheels: Wheel[]; removals?: string[]; profile?: string }
const normalize = (name: string) => name.toLowerCase().replace(/[-_.]+/gu, '-')
let caFile: Promise<string> | undefined
function publicCAFile(): Promise<string> {
  return caFile ??= (async () => {
    const path = join(tmpdir(), `zerowall-public-ca-${process.pid}-${randomUUID()}.pem`)
    await writeFile(path, rootCertificates.join('\n')); return path
  })()
}

async function run(executable: string, args: string[], paths: string[] = []): Promise<string> {
  // 1.4.0 excluded all PEM files, including pip's public CA bundle. Use Node's
  // trusted Mozilla roots without changing the active environment or disabling TLS.
  const certificateFile = await publicCAFile()
  return new Promise((accept, reject) => {
    // The embeddable interpreter ignores PYTHONPATH: insert validated snapshot paths explicitly.
    const bootstrap = `import sys,runpy\nsys.path[:0]=${JSON.stringify(paths)}\nimport pip._vendor.certifi\npip._vendor.certifi.where=lambda: ${JSON.stringify(certificateFile)}\nsys.argv=${JSON.stringify(['pip', ...args])}\nrunpy.run_module('pip',run_name='__main__')`
    const child = spawn(executable, ['-I', '-B', '-c', bootstrap], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PYTHONNOUSERSITE: '1', PIP_DISABLE_PIP_VERSION_CHECK: '1', PIP_NO_INPUT: '1' } })
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
  if (requested.some(name => /^(?:opencv-python|opencv-contrib-python|opencv-contrib-python-headless|torch|torchvision|torchaudio|nvidia[-_])/iu.test(name) && !/^opencv-python-headless(?:$|[=<>!~])/iu.test(name))) throw new Error('该包属于独立图像／GPU 环境，不能加入公共科研环境。')
  const requirementsPath = join(directory, `${planId}.txt`)
  const constraintsPath = join(directory, `${planId}-constraints.txt`)
  // Retain existing distributions including locally built pure-Python wheels. Pip only
  // downloads wheels for changes; --ignore-installed would incorrectly reject those packages.
  const minimums = info.packages.filter(pkg => !requestedNames.has(normalize(pkg.name))).map(pkg => `${pkg.name}>=${pkg.version}`)
  const pins = info.packages.filter(pkg => !requestedNames.has(normalize(pkg.name))).map(pkg => `${pkg.name}==${pkg.version}`)
  const effectiveRequested = requested.map(spec => {
    const current = info.packages.find(pkg => normalize(pkg.name) === normalize(spec))
    return current ? `${spec}>${current.version}` : spec
  })
  await writeFile(requirementsPath, [...effectiveRequested, ...minimums].join('\n'))
  let result: any
  try {
    await writeFile(constraintsPath, pins.join('\n'))
    const args = ['install', '--dry-run', ...(profile ? ['--ignore-installed'] : []), '--upgrade-strategy', 'only-if-needed', '--only-binary=:all:', '--report', reportPath, '-r', requirementsPath, '-c', constraintsPath]
    try { await run(context.executable, args, [context.overlayPath, context.sitePackages]) }
    catch {
      // On conflict allow upward changes only, with the full change set shown before applying.
      await writeFile(constraintsPath, minimums.join('\n'))
      await run(context.executable, args, [context.overlayPath, context.sitePackages])
    }
    result = JSON.parse(await readFile(reportPath, 'utf8'))
  } catch (error) {
    const failed: StoredPackagePlan = { planId, snapshotId: context.root, requested, changes: [], wheels: [], error: error instanceof Error ? error.message : String(error) }
    await writeFile(join(directory, `${planId}.json`), JSON.stringify(failed)); return failed
  }
  const wheels: Wheel[] = result.install.map((row: any) => {
    if (/^(?:(?:opencv-python|opencv-contrib-python|opencv-contrib-python-headless|torch|torchvision|torchaudio)$|nvidia[-_])/iu.test(row.metadata.name)) throw new Error(`关联依赖 ${row.metadata.name} 需要独立环境。`)
    const hash = row.download_info?.archive_info?.hashes?.sha256
    const url = row.download_info?.url
    if (typeof url !== 'string' || !url.startsWith('https://') || !new URL(url).pathname.endsWith('.whl') || typeof hash !== 'string' || !/^[a-f0-9]{64}$/u.test(hash)) throw new Error('升级计划包含未经校验的文件或需要本地编译的依赖。')
    return { name: row.metadata.name, version: row.metadata.version, url, hash }
  })
  const versions = new Map(info.packages.map(pkg => [normalize(pkg.name), pkg.version]))
  const plan: StoredPackagePlan = { planId, snapshotId: context.root, requested, wheels, ...(profile ? { profile } : {}), changes: wheels.map(w => ({ name: w.name, from: versions.get(normalize(w.name)), to: w.version })) }
  await writeFile(join(directory, `${planId}.json`), JSON.stringify(plan))
  return plan
}

export async function applyIsolatedProfile(root: string, context: Context, plan: StoredPackagePlan): Promise<string> {
  if (!plan.profile || !/^[a-z][a-z0-9-]{0,39}$/u.test(plan.profile)) throw new Error('Invalid dependency profile')
  const parent = join(root, 'profiles', plan.profile)
  const target = join(parent, plan.planId)
  const active = await readFile(join(parent, 'current.json'), 'utf8').then(JSON.parse, () => undefined)
  if (active?.planId === plan.planId && active.snapshotId === context.root) return active.root
  // A crashed attempt has never been activated; retry from clean owned output.
  await rm(target, { recursive: true, force: true })
  try {
  await mkdir(target, { recursive: true })
  const lock = join(target, 'requirements.lock')
  await writeFile(lock, plan.wheels.map(w => `${w.name} @ ${w.url} --hash=sha256:${w.hash}`).join('\n'))
  const site = join(target, 'site-packages')
  await run(context.executable, ['install', '--ignore-installed', '--only-binary=:all:', '--require-hashes', '--no-deps', '--target', site, '-r', lock], [context.sitePackages])
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
    const child = spawn(executable, ['-I', '-B', '-c', code, ...args], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
    let error = ''; child.stderr.on('data', data => { error = (error + data).slice(-4000) })
    const timer = setTimeout(() => { child.kill(); reject(new Error('候选环境验证超时。')) }, 180_000)
    child.once('error', err => { clearTimeout(timer); reject(err) })
    child.once('exit', code => { clearTimeout(timer); code === 0 ? accept() : reject(new Error(error || `Python exit ${code}`)) })
  })
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

export async function applyPackagePlanFiles(root: string, context: Context, target: string, plan: StoredPackagePlan): Promise<void> {
  const executable = join(target, context.manifest.python.relativeExecutable)
  const site = join(target, context.manifest.python.relativeSitePackages)
  const overlay = join(target, 'user-overlay')
  await mkdir(overlay, { recursive: true })
  if (resolve(context.overlayPath) !== resolve(overlay)) await cp(context.overlayPath, overlay, { recursive: true })
  await snapshotPythonPaths(target, context.manifest, overlay)
  if (plan.removals?.length) {
    await python(executable, REMOVE_DISTRIBUTIONS, [site, JSON.stringify(plan.removals)])
    await python(executable, REMOVE_DISTRIBUTIONS, [overlay, JSON.stringify(plan.removals)])
  }
  const wheelDir = join(root, 'plans', `${plan.planId}-wheels`); await mkdir(wheelDir, { recursive: true })
  const lock = join(root, 'plans', `${plan.planId}-wheels.txt`)
  await writeFile(lock, plan.wheels.map(w => `${w.name} @ ${w.url} --hash=sha256:${w.hash}`).join('\n'))
  if (plan.wheels.length) {
    await run(context.executable, ['download', '--require-hashes', '--no-deps', '--only-binary=:all:', '-r', lock, '--dest', wheelDir], [context.sitePackages])
    await python(context.executable, REMOVE_DISTRIBUTIONS, [site, JSON.stringify(plan.wheels.map(w => normalize(w.name)))])
    await python(context.executable, REMOVE_DISTRIBUTIONS, [overlay, JSON.stringify(plan.wheels.map(w => normalize(w.name)))])
    const offlineLock = join(root, 'plans', `${plan.planId}-offline.txt`)
    await writeFile(offlineLock, plan.wheels.map(w => `${w.name}==${w.version} --hash=sha256:${w.hash}`).join('\n'))
    const unpacked = join(root, 'plans', `${plan.planId}-installed-${randomUUID()}`)
    await run(context.executable, ['install', '--no-index', '--find-links', wheelDir, '--require-hashes', '--no-deps', '--target', unpacked, '-r', offlineLock], [context.sitePackages])
    // Merge only the new files after removing the old RECORD entries. Shared
    // namespace directories survive, and pip cannot silently skip existing dirs.
    await cp(unpacked, site, { recursive: true })
  }
  await run(executable, ['check'], [overlay, site])
  await python(executable, `import importlib,importlib.metadata as m,sys,json,pathlib
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
`, [JSON.stringify(plan.wheels.map(wheel => wheel.name))])
  await python(executable, `import json,sys,importlib.util
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
`, [JSON.stringify(plan.wheels.map(wheel => normalize(wheel.name)))])
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
    const context = { root: target, executable, sitePackages: site, overlayPath, manifest }
    const managementRoot = resolveManagementRoot(target)
    const plan = await preparePackagePlan(managementRoot, context, Object.entries(customizations).map(([name, version]) => `${name}==${version}`), info)
    if (plan.error) throw new Error('新版环境与本地定制不兼容：' + plan.error)
    await applyPackagePlanFiles(managementRoot, context, target, plan)
  }
  await run(executable, ['check'], [overlayPath, site])
}
function resolveManagementRoot(target: string): string { return dirname(dirname(target)) }
