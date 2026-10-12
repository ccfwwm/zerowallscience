import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { resolve } from 'node:path'
import { resolveFixedPythonRuntime } from '../shared/runtime-path.js'
import type { McpPythonInfo, McpPythonPackage } from '../shared/contracts.js'
import { sanitizePythonTlsEnvironment } from './python-mirror.js'
import { acquireRuntimeLease, ownsRuntimeWriter } from '../shared/runtime-leases.js'

const execute = promisify(execFile)
const normalize = (name: string) => name.toLowerCase().replace(/[-_.]+/gu, '-')

/** One bounded scan, independent of management records and online state. */
export async function scanFixedPython(root: string, requiredNames: string[] = [], scienceNames: string[] = []): Promise<McpPythonInfo> {
  const scannedAt = new Date().toISOString()
  const deadline = Date.now() + 45_000
  let release: (() => Promise<void>) | undefined
  try {
    const paths = await resolveFixedPythonRuntime(root)
    if (!ownsRuntimeWriter(root)) release = await acquireRuntimeLease(root)
    const env = sanitizePythonTlsEnvironment(process.env)
    for (const name of Object.keys(env)) if (/^(?:PYTHON|CONDA|VIRTUAL_ENV|PIP_)/u.test(name)) delete env[name]
    Object.assign(env, { PYTHONNOUSERSITE: '1', PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8', PIP_DISABLE_PIP_VERSION_CHECK: '1' })
    const run = async (args: string[]) => execute(paths.executable, ['-I', '-B', ...args], { cwd: paths.root, env, windowsHide: true, timeout: Math.max(1, deadline - Date.now()), maxBuffer: 16 * 1024 * 1024, encoding: 'utf8' })
    const probe = JSON.parse((await run(['-c', 'import json,sys,platform; print(json.dumps({"executable":sys.executable,"version":platform.python_version(),"architecture":platform.architecture()[0],"paths":sys.path}))'])).stdout)
    if (resolve(probe.executable).toLowerCase() !== resolve(paths.executable).toLowerCase() || probe.architecture !== '64bit') throw new Error('PYTHON_RUNTIME_MISMATCH: interpreter identity or architecture differs from the fixed target.')
    let rows: Array<{ name: string; version: string }>; let pipError: string | undefined
    try { rows = JSON.parse((await run(['-m', 'pip', 'list', '--format=json', '--disable-pip-version-check', '--path', paths.sitePackages])).stdout) }
    catch (error) {
      pipError = `PIP_UNAVAILABLE: ${error instanceof Error ? error.message : String(error)}`.replace(/https?:\/\/\S+/gu, '[resource-url]').slice(-1000)
      rows = JSON.parse((await run(['-c', 'import importlib.metadata as m,json,sys; print(json.dumps([{"name":d.metadata.get("Name") or d.name,"version":d.version} for d in m.distributions(path=[sys.argv[1]])]))', paths.sitePackages])).stdout)
    }
    const core = new Set(requiredNames.map(normalize)); const science = new Set(scienceNames.map(normalize))
    const packages = [...new Map(rows.filter(row => typeof row.name === 'string' && typeof row.version === 'string').map(row => [normalize(row.name), { ...row, location: paths.sitePackages, source: core.has(normalize(row.name)) ? 'core' : 'custom', health: 'healthy' } as McpPythonPackage])).values()].sort((a, b) => a.name.localeCompare(b.name))
    const present = new Set(packages.map(row => normalize(row.name)))
    const missingCorePackages = [...core].filter(name => !present.has(name))
    return { ready: true, coreReady: core.size > 0 && !missingCorePackages.length, missingCorePackages, scannedAt, inventoryComplete: true, version: probe.version, executable: paths.executable, sitePackages: paths.sitePackages, runtimeRoot: paths.root, runtimeExecutable: paths.executable, runtimeSitePackages: paths.sitePackages, snapshotId: paths.root, packageCount: packages.length, officialPackageCount: core.size, corePackageCount: [...core].filter(name => present.has(name)).length, sciencePackageCount: science.size, scienceInstalledPackageCount: [...science].filter(name => present.has(name)).length, packages, ...(pipError ? { pipReady: false, message: pipError } : { pipReady: true }) }
  } catch (error) { return { ready: false, coreReady: false, inventoryComplete: false, runtimeRoot: root, scannedAt, packages: [], message: (error instanceof Error ? error.message : String(error)).replace(/https?:\/\/\S+/gu, '[resource-url]').slice(-1500) } }
  finally { await release?.() }
}
