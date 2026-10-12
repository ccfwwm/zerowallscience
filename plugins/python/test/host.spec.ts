import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Python, { resolveManagedPython, pythonChildEnvironment } from '../src/host/index.js'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { ToolCallId } from '@deepseek-ai/dsh-llm'

const roots: string[] = []
const previous = process.env.ZEROWALL_MCP_ENVIRONMENT_ROOT
const previousPython = process.env.ZEROWALL_PYTHON_ROOT
beforeEach(() => { vi.stubEnv('ZEROWALL_PYTHON_RUNTIME_ROOT', ''); vi.stubEnv('ZEROWALL_PYTHON_MANAGEMENT_ROOT', '') })

afterEach(async () => {
  vi.unstubAllEnvs()
  if (previous === undefined) delete process.env.ZEROWALL_MCP_ENVIRONMENT_ROOT
  else process.env.ZEROWALL_MCP_ENVIRONMENT_ROOT = previous
  if (previousPython === undefined) delete process.env.ZEROWALL_PYTHON_ROOT
  else process.env.ZEROWALL_PYTHON_ROOT = previousPython
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('managed Python runtime', () => {
  it('accepts process cancellation metadata through the registered tool output contract', async () => {
    const ctx = new Context()
    try {
      await ctx.plugin(SystemPrompt); await ctx.plugin(ToolRuntime); await ctx.plugin(Python)
      vi.spyOn(ctx.zerowallPython, 'run').mockResolvedValue({ exitCode: 0, timedOut: false, cancelled: false, stdout: 'fixed Python', stderr: '', python: 'C:/installation/Python/python.exe' })
      const result = await ctx.tools.execute({ name: 'python', arguments: { code: 'print(1)', description: 'Probe' }, callId: ToolCallId('python-output-contract'), signal: new AbortController().signal, agent: { session: { header: {} } } as any })
      expect(result.isError, JSON.stringify(result.content)).toBe(false)
      expect(result.value).toMatchObject({ exitCode: 0, cancelled: false, stdout: 'fixed Python' })
    } finally { await ctx.fiber.dispose() }
  })
  it('never executes a legacy generation, even if its pointer claims health', async () => {
    const base = await mkdtemp(join(tmpdir(), 'python-task-generation-')); roots.push(base)
    const store = join(base, 'zerowall-python')
    const manifest = { python: { relativeExecutable: 'Python/python.exe', relativeSitePackages: 'Python/Lib/site-packages' } }
    const select = async (name: string) => {
      const root = join(store, 'slots', name)
      await mkdir(join(root, 'Python/Lib/site-packages'), { recursive: true })
      await writeFile(join(root, 'Python/python.exe'), name)
      await writeFile(join(store, 'current.json'), JSON.stringify({ root, runtimeRoot: root, generation: true, health: 'ready', manifest }))
      return root
    }
    process.env.ZEROWALL_PYTHON_ROOT = store
    await select('first')
    await expect(resolveManagedPython()).rejects.toThrow('PYTHON_ENVIRONMENT_UNAVAILABLE')
    const canonical = join(base, 'Python')
    await mkdir(join(canonical, 'Lib/site-packages'), { recursive: true })
    await writeFile(join(canonical, 'python.exe'), 'canonical')
    await select('second')
    expect((await resolveManagedPython()).executable).toBe(join(canonical, 'python.exe'))
  })
  it('pins shared tasks to their snapshot and uses one package directory', async () => {
    const base = await mkdtemp(join(tmpdir(), 'zerowall-shared-')); roots.push(base)
    const store = join(base, 'zerowall-python')
    await mkdir(store, { recursive: true })
    const installed = join(store, 'snapshots', 'candidate')
    const runtimeRoot = join(store, '..')
    const sitePackages = join(runtimeRoot, 'Python', 'Lib', 'site-packages')
    await mkdir(sitePackages, { recursive: true }); await writeFile(join(runtimeRoot, 'Python', 'python.exe'), 'fixture')
    const manifest = { python: { relativeExecutable: 'Python/python.exe', relativeSitePackages: 'Python/Lib/site-packages' } }
    await writeFile(join(store, 'current.json'), JSON.stringify({ root: installed, runtimeRoot, health: 'ready', manifest }))
    await writeFile(join(store, 'runtime.json'), JSON.stringify({ rootPath: 'untrusted', executablePath: process.execPath, sitePackagesPath: store }))
    process.env.ZEROWALL_PYTHON_ROOT = store
    await expect(resolveManagedPython()).resolves.toMatchObject({ root: join(runtimeRoot, 'Python'), sitePackages })
  })
  it('resolves the canonical single-directory runtime despite legacy runtimeLayout metadata', async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), 'zerowall-flat-python-')); roots.push(runtimeRoot)
    const manager = join(runtimeRoot, '.zerowall')
    const sitePackages = join(runtimeRoot, 'Lib', 'site-packages')
    await mkdir(sitePackages, { recursive: true })
    await mkdir(manager, { recursive: true })
    await writeFile(join(runtimeRoot, 'python.exe'), 'fixture')
    const manifest = { python: { version: '3.12.10', relativeExecutable: 'python.exe', relativeSitePackages: 'Lib/site-packages' } }
    await writeFile(join(manager, 'current.json'), JSON.stringify({
      root: runtimeRoot,
      runtimeRoot,
      health: 'ready',
      runtimeLayout: { relativeExecutable: 'Python/python.exe', relativeSitePackages: 'Python/Lib/site-packages' },
      manifest,
    }))
    process.env.ZEROWALL_PYTHON_ROOT = manager
    await expect(resolveManagedPython()).resolves.toMatchObject({
      executable: join(runtimeRoot, 'python.exe'),
      root: runtimeRoot,
      sitePackages,
      snapshotRoot: runtimeRoot,
    })
  })
  it('uses the Host projection without rewriting the signed archive manifest', async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), 'python-signed-projection-')); roots.push(runtimeRoot)
    const manager = join(runtimeRoot, '.zerowall')
    const sitePackages = join(runtimeRoot, 'Lib/site-packages')
    await mkdir(sitePackages, { recursive: true }); await mkdir(manager)
    await writeFile(join(runtimeRoot, 'python.exe'), 'fixture')
    const python = { relativeExecutable: 'Python/python.exe', relativeSitePackages: 'Python/Lib/site-packages' }
    const current = { root: runtimeRoot, runtimeRoot, health: 'ready', runtimeLayout: python, manifest: { python } }
    await writeFile(join(manager, 'current.json'), JSON.stringify(current))
    process.env.ZEROWALL_PYTHON_ROOT = manager
    await expect(resolveManagedPython()).resolves.toMatchObject({ executable: join(runtimeRoot, 'python.exe'), sitePackages, snapshotRoot: runtimeRoot })
    await writeFile(join(manager, 'current.json'), JSON.stringify({ ...current, runtimeLayout: undefined }))
    await expect(resolveManagedPython()).resolves.toMatchObject({ executable: join(runtimeRoot, 'python.exe') })
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
    await expect(resolveManagedPython()).rejects.toThrow(/fixed Python root is not configured/u)
  })

  it('rejects a legacy private Python layout', async () => {
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
    await expect(resolveManagedPython()).rejects.toThrow(/fixed Python root is not configured/u)

    const escaped = { python: { relativeExecutable: '../system-python.exe', relativeSitePackages: 'bio-tools/python/Lib/site-packages' } }
    await writeFile(join(store, 'current.json'), JSON.stringify({ root: installed, health: 'ready', manifest: escaped }))
    await expect(resolveManagedPython()).rejects.toThrow(/^PYTHON_ENVIRONMENT_UNAVAILABLE:/u)
  })
})
