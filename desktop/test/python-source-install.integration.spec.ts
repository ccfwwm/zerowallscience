import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { expect, it } from 'vitest'
import { applyPackagePlanFiles, prepareManifestPackagePlan, preparePackagePlan } from '../src/main/python-packages.js'
import type { McpEnvironmentManifest } from '../src/main/mcp-environment.js'
import type { PythonDependencyManifest } from '../src/main/python-dependency-manifest.js'

const execute = promisify(execFile)
// Real network/PEP 517 integration against an isolated embedded Python copy.
// No process mocks, source fixtures, active environment writes or system Python.
it.skipIf(!process.env.ZEROWALL_TEST_SOURCE_PYTHON)('builds absent wheels during ordinary preview and applies a verified source plan', async () => {
  const configured = resolve(process.env.ZEROWALL_TEST_SOURCE_PYTHON!)
  const sourceExecutable = (await stat(configured).then(s => s.isDirectory(), () => false)) ? join(configured, 'python.exe') : configured
  const source = dirname(sourceExecutable)
  const root = await mkdtemp(join(tmpdir(), 'zerowall-source-install-'))
  const snapshot = join(root, 'snapshot'); const pythonRoot = join(snapshot, 'Python')
  const site = join(pythonRoot, 'Lib', 'site-packages')
  const receipt: Record<string, unknown> = { source, startedAt: new Date().toISOString() }
  try {
    await mkdir(site, { recursive: true })
    for (const entry of await readdir(source, { withFileTypes: true })) if (entry.isFile()) await cp(join(source, entry.name), join(pythonRoot, entry.name))
    for (const entry of await readdir(join(source, 'Lib', 'site-packages'))) if (/^(pip|packaging)(?:$|-)/u.test(entry)) await cp(join(source, 'Lib', 'site-packages', entry), join(site, entry), { recursive: true })
    for (const entry of await readdir(pythonRoot)) if (entry.endsWith('._pth')) await writeFile(join(pythonRoot, entry), 'python312.zip\n.\nLib/site-packages\nimport site\n')
    const executable = join(pythonRoot, 'python.exe')
    const manifest = { python: { version: '3.12.10', relativeExecutable: 'Python/python.exe', relativeSitePackages: 'Python/Lib/site-packages' } } as McpEnvironmentManifest
    const context = { root: snapshot, executable, sitePackages: site, overlayPath: site, manifest, mirror: { indexUrl: 'https://mirrors.ustc.edu.cn/pypi/simple' } }
    const info = { ready: true, packages: [] }
    console.log('source integration: resolving ordinary version range')
    const ordinary = await preparePackagePlan(root, context, ['flowio>=1.4,<1.5'], info)
    expect(ordinary.error).toBeUndefined()
    const sourceWheel = ordinary.wheels.find(wheel => wheel.name === 'flowio')!
    expect(sourceWheel).toMatchObject({ name: 'flowio', version: '1.4.0', sourceFilename: 'flowio-1.4.0.tar.gz', sourceArchiveSha256: 'c205efcecd1da7da29a1a55c30e09daa7fc132b997cd88910ef06a490755ecf7' })
    expect(sourceWheel.url).toMatch(/^file:/u)
    expect(ordinary.wheels.some(wheel => wheel.name === 'numpy')).toBe(true)
    expect(ordinary.wheels.filter(wheel => !wheel.sourceArchiveSha256).every(wheel => /^[a-f0-9]{64}$/u.test(wheel.hash ?? ''))).toBe(true)
    receipt.ordinary = ordinary
    // Keep a pristine isolated runtime for the separately authorized signed
    // source-manifest path; both runs install directly into their stable tree.
    const signedSnapshot = join(root, 'signed-snapshot'); await cp(snapshot, signedSnapshot, { recursive: true })
    const signedSite = join(signedSnapshot, 'Python', 'Lib', 'site-packages')
    const signedContext = { ...context, root: signedSnapshot, executable: join(signedSnapshot, 'Python', 'python.exe'), sitePackages: signedSite, overlayPath: signedSite }
    console.log('source integration: applying ordinary source plan directly to the isolated stable Python directory')
    const ordinaryOutcome = await applyPackagePlanFiles(root, context, snapshot, ordinary)
    expect(ordinaryOutcome.importCheckPassed).toBe(true)
    expect(ordinaryOutcome.pipCheckPassed).toBe(true)
    const installed = await execute(executable, ['-I', '-B', '-c', "import flowio,importlib.metadata as m; print(m.version('flowio')); print(flowio.__name__)"], { windowsHide: true })
    expect(installed.stdout).toContain('1.4.0')
    expect(installed.stdout).toContain('flowio')
    const sourceInventory = await execute(executable, ['-I', '-B', '-c', "import importlib.metadata as m,json,sys; print(json.dumps([{'name':d.metadata.get('Name'),'version':d.version} for d in m.distributions(path=[sys.argv[1]])]))", site], { windowsHide: true })
    const detected = JSON.parse(sourceInventory.stdout.trim()) as Array<{ name: string; version: string }>
    expect(detected.some(pkg => pkg.name.toLowerCase() === 'flowio' && pkg.version === '1.4.0')).toBe(true)
    console.log('source integration: confirming a second check sees the installed stable-directory package')
    const secondCheck = await preparePackagePlan(root, context, ['flowio>=1.4,<1.5'], { ready: true, packages: detected.map(pkg => ({ ...pkg, source: 'core' as const, health: 'healthy' as const })) })
    expect(secondCheck.error).toBeUndefined()
    expect(secondCheck.wheels.some(wheel => wheel.name.toLowerCase() === 'flowio')).toBe(false)
    const original = await execute(sourceExecutable, ['-I', '-B', '-c', "import importlib.util; print(importlib.util.find_spec('flowio'))"], { windowsHide: true })
    expect(original.stdout.trim()).toBe('None')
    const locked = { schema: 3, runtimeId: 'zerowall-science-python', platform: 'win32-x64', pythonVersion: '3.12.10', environmentVersion: 'test', revision: 'test', createdAt: new Date().toISOString(), index: context.mirror, compatibility: { minApplicationVersion: '7.0.4' }, signature: { algorithm: 'ed25519', keyId: 'test', value: 'host-verified-input' }, packages: ordinary.wheels.map(wheel => ({ name: wheel.name, version: wheel.version, sha256: wheel.sourceArchiveSha256 ?? wheel.hash, required: true, capabilities: ['test'] })) } as PythonDependencyManifest
    // A manifest missing the signed sdist authorization must fail rather than
    // silently build a different artifact under the signed wheel hash.
    const before = await readdir(join(root, 'plans', 'source-builds'))
    console.log('source integration: rejecting source absent from signed manifest')
    const denied = await prepareManifestPackagePlan(root, signedContext, locked, info)
    expect(denied.error).toMatch(/(?:No matching distribution found|BackendUnavailable: Cannot import)/u)
    expect(await readdir(join(root, 'plans', 'source-builds'))).toEqual(before)
    receipt.deniedUnsignedSource = denied.error
    const lockedSource = locked.packages.find(pkg => pkg.name === 'flowio')!
    lockedSource.source = 'sdist'; lockedSource.filename = 'flowio-1.4.0.tar.gz'
    console.log('source integration: building signed source plan')
    const signedSource = await prepareManifestPackagePlan(root, signedContext, locked, info)
    expect(signedSource.error).toBeUndefined()
    expect(signedSource.dependencyManifest).toEqual(locked)
    expect(signedSource.wheels.find(wheel => wheel.name === 'flowio')!.sourceArchiveSha256).toBe(lockedSource.sha256)
    await applyPackagePlanFiles(root, signedContext, signedSnapshot, signedSource)
    const signedInstalled = await execute(signedContext.executable, ['-I', '-B', '-c', "import flowio,importlib.metadata as m; print(m.version('flowio')); print(flowio.__name__)"], { windowsHide: true })
    expect(signedInstalled.stdout).toContain('1.4.0')
    console.log('source integration: signed source apply verified')
    receipt.signedSource = signedSource; receipt.installed = installed.stdout; receipt.signedInstalled = signedInstalled.stdout; receipt.ok = true
  } catch (error) { receipt.ok = false; receipt.error = String(error); throw error }
  finally {
    if (process.env.ZEROWALL_TEST_SOURCE_EVIDENCE) { const evidence = resolve(process.env.ZEROWALL_TEST_SOURCE_EVIDENCE); await mkdir(evidence, { recursive: true }); await writeFile(join(evidence, 'source-install-receipt.json'), JSON.stringify(receipt, null, 2)) }
    await rm(root, { recursive: true, force: true, maxRetries: 3 })
  }
}, 600_000)
