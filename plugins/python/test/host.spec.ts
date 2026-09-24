import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveManagedPython, pythonChildEnvironment } from '../src/host/index.js'

const roots: string[] = []
const previous = process.env.ZEROWALL_MCP_ENVIRONMENT_ROOT
const previousPython = process.env.ZEROWALL_PYTHON_ROOT

afterEach(async () => {
  if (previous === undefined) delete process.env.ZEROWALL_MCP_ENVIRONMENT_ROOT
  else process.env.ZEROWALL_MCP_ENVIRONMENT_ROOT = previous
  if (previousPython === undefined) delete process.env.ZEROWALL_PYTHON_ROOT
  else process.env.ZEROWALL_PYTHON_ROOT = previousPython
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('managed Python runtime', () => {
  it('pins shared tasks to their snapshot and uses one package directory', async () => {
    const store = await mkdtemp(join(tmpdir(), 'zerowall-shared-')); roots.push(store)
    const installed = join(store, 'snapshots', 'candidate')
    const sitePackages = join(installed, 'Python', 'Lib', 'site-packages')
    await mkdir(sitePackages, { recursive: true }); await writeFile(join(installed, 'Python', 'python.exe'), 'fixture')
    const manifest = { python: { relativeExecutable: 'Python/python.exe', relativeSitePackages: 'Python/Lib/site-packages' } }
    await writeFile(join(store, 'current.json'), JSON.stringify({ root: installed, health: 'ready', manifest, overlayPath: 'obsolete' }))
    await writeFile(join(store, 'runtime.json'), JSON.stringify({ rootPath: 'untrusted', executablePath: process.execPath, sitePackagesPath: store }))
    process.env.ZEROWALL_PYTHON_ROOT = store
    await expect(resolveManagedPython()).resolves.toMatchObject({ root: installed, sitePackages, overlayPath: sitePackages })
  })
  it('uses the current snapshot CA for all Python aliases', async () => {
    const root = await mkdtemp(join(tmpdir(), 'python-ca-')); roots.push(root)
    await mkdir(join(root, 'certifi')); const ca = join(root, 'certifi', 'cacert.pem'); await writeFile(ca, 'certificate fixture')
    const env = pythonChildEnvironment(root)
    for (const key of ['SSL_CERT_FILE', 'REQUESTS_CA_BUNDLE', 'CURL_CA_BUNDLE', 'PIP_CERT']) expect(env[key]).toBe(ca)
  })
  it('returns a stable unavailable error before the MCP environment is ready', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zerowall-python-missing-'))
    roots.push(root)
    process.env.ZEROWALL_MCP_ENVIRONMENT_ROOT = root
    await expect(resolveManagedPython()).rejects.toThrow(/^PYTHON_ENVIRONMENT_UNAVAILABLE:/u)
  })

  it('prefers the ZeroWall Python root over the legacy compatibility variable', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zerowall-python-preferred-'))
    roots.push(root)
    process.env.ZEROWALL_PYTHON_ROOT = root
    process.env.ZEROWALL_MCP_ENVIRONMENT_ROOT = join(root, 'legacy')
    await expect(resolveManagedPython()).rejects.toThrow(/ZeroWall Python root is not configured|ZeroWall Python is not installed/u)
  })

  it('resolves only the manifest-relative executable inside the ready environment', async () => {
    const store = await mkdtemp(join(tmpdir(), 'zerowall-python-store-'))
    const installed = join(store, 'versions', '4.1.10')
    const executable = join(installed, 'bio-tools', 'python', 'python.exe')
    const sitePackages = join(installed, 'bio-tools', 'python', 'Lib', 'site-packages')
    roots.push(store)
    await mkdir(sitePackages, { recursive: true })
    await writeFile(executable, 'fixture')
    const manifest = { python: { relativeExecutable: 'bio-tools/python/python.exe', relativeSitePackages: 'bio-tools/python/Lib/site-packages' } }
    await writeFile(join(installed, 'manifest.json'), JSON.stringify(manifest))
    await writeFile(join(store, 'current.json'), JSON.stringify({ root: installed, health: 'ready', manifest }))
    process.env.ZEROWALL_MCP_ENVIRONMENT_ROOT = store
    await expect(resolveManagedPython()).resolves.toMatchObject({ executable, root: installed, sitePackages, overlayPath: join(store, 'python-overlay', 'python-3.12') })

    const escaped = { python: { relativeExecutable: '../system-python.exe', relativeSitePackages: 'bio-tools/python/Lib/site-packages' } }
    await writeFile(join(store, 'current.json'), JSON.stringify({ root: installed, health: 'ready', manifest: escaped }))
    await expect(resolveManagedPython()).rejects.toThrow(/^PYTHON_ENVIRONMENT_UNAVAILABLE:/u)
  })
})
