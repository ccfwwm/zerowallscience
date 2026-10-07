import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { defaultSciencePythonExecutable, resolveManagedSciencePython } from '../src/host/managed-python.js'

it('pins scientific runners to the selected generation and retains a live Host lease across updates', async () => {
  const root = await mkdtemp(join(tmpdir(), 'science-generations-'))
  const manager = join(root, 'zerowall-python')
  vi.stubEnv('ZEROWALL_PYTHON_ROOT', manager)
  try {
    const select = async (name: string) => {
      const snapshot = join(manager, 'slots', name)
      await mkdir(join(snapshot, 'Python/Lib/site-packages'), { recursive: true })
      await writeFile(join(snapshot, 'Python/python.exe'), 'fixture')
      await writeFile(join(manager, 'current.json'), JSON.stringify({ root: snapshot, runtimeRoot: snapshot, generation: true, health: 'ready', manifest: { python: { relativeExecutable: 'Python/python.exe', relativeSitePackages: 'Python/Lib/site-packages' } } }))
      return snapshot
    }
    const first = await select('a-fixture')
    const task = await resolveManagedSciencePython()
    const second = await select('b-fixture')
    expect(task?.executable).toBe(join(first, 'Python/python.exe'))
    expect((await resolveManagedSciencePython())?.executable).toBe(join(second, 'Python/python.exe'))
    expect(defaultSciencePythonExecutable()).toBe(join(second, 'Python/python.exe'))
    const leases = await Promise.all((await readdir(join(manager, 'leases'))).map(async name => JSON.parse(await readFile(join(manager, 'leases', name), 'utf8'))))
    expect(new Set(leases.map(item => item.snapshot))).toEqual(new Set([first, second]))
    expect(leases.every(item => item.pid === process.pid)).toBe(true)
  } finally {
    vi.unstubAllEnvs()
    await rm(root, { recursive: true, force: true })
  }
})

it('resolves the canonical single-directory Python projected in current.json', async () => {
  const root = await mkdtemp(join(tmpdir(), 'science-canonical-python-'))
  const runtime = join(root, 'ZeroWall Science', 'Python')
  const manager = join(runtime, '.zerowall')
  vi.stubEnv('ZEROWALL_PYTHON_ROOT', manager)
  try {
    await mkdir(manager, { recursive: true })
    await mkdir(join(runtime, 'Lib', 'site-packages'), { recursive: true })
    await writeFile(join(runtime, 'python.exe'), 'fixture')
    await writeFile(join(manager, 'current.json'), JSON.stringify({
      root: runtime,
      runtimeRoot: runtime,
      health: 'ready',
      // Older metadata can coexist with the projected manifest after the
      // single-directory bootstrap. It must not redirect engines back into
      // a nested Python/ directory.
      runtimeLayout: { relativeExecutable: 'Python/python.exe', relativeSitePackages: 'Python/Lib/site-packages' },
      manifest: { python: { version: '3.12.10', relativeExecutable: 'python.exe', relativeSitePackages: 'Lib/site-packages' } },
    }))
    await expect(resolveManagedSciencePython()).resolves.toMatchObject({
      root: runtime,
      executable: join(runtime, 'python.exe'),
      sitePackages: join(runtime, 'Lib', 'site-packages'),
    })
    expect(defaultSciencePythonExecutable()).toBe(join(runtime, 'python.exe'))
  } finally {
    vi.unstubAllEnvs()
    await rm(root, { recursive: true, force: true })
  }
})

it('resolves a flat runtime when current.json keeps the signed archive layout', async () => {
  const root = await mkdtemp(join(tmpdir(), 'science-signed-layout-python-'))
  const runtime = join(root, 'ZeroWall Science', 'Python')
  const manager = join(runtime, '.zerowall')
  vi.stubEnv('ZEROWALL_PYTHON_ROOT', manager)
  try {
    await mkdir(join(runtime, 'Lib', 'site-packages'), { recursive: true })
    await mkdir(manager, { recursive: true })
    await writeFile(join(runtime, 'python.exe'), 'fixture')
    await writeFile(join(manager, 'current.json'), JSON.stringify({
      // The signed manifest deliberately retains archive-relative paths.
      root: runtime,
      runtimeRoot: runtime,
      runtimeLayout: { relativeExecutable: 'Python/python.exe', relativeSitePackages: 'Python/Lib/site-packages' },
      health: 'ready',
      manifest: { python: { version: '3.12.10', relativeExecutable: 'Python/python.exe', relativeSitePackages: 'Python/Lib/site-packages' } },
    }))
    await expect(resolveManagedSciencePython()).resolves.toMatchObject({
      root: runtime,
      executable: join(runtime, 'python.exe'),
      sitePackages: join(runtime, 'Lib', 'site-packages'),
    })
  } finally {
    vi.unstubAllEnvs()
    await rm(root, { recursive: true, force: true })
  }
})
