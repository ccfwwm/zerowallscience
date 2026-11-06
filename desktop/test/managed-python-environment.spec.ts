import { afterEach, describe, expect, it } from 'vitest'
import { join, resolve } from 'node:path'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { applyManagedPythonEnvironment, createManagedPythonEnvironment, prepareManagedPythonShims, verifyManagedPythonShims } from '../src/main/managed-python-environment.js'
import { buildHarnessSpawnOptions } from '../src/main/runtime/harness-runtime.js'

const temporaryRoots: string[] = []
afterEach(async () => { await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

describe('managed Python child environment', () => {
  it('prefers the fixed runtime and strips inherited interpreter overrides', () => {
    const source = {
      Path: 'C:/Windows/System32;C:/system-tools',
      PYTHONHOME: 'C:/Program Files/Python312',
      PYTHONPATH: 'C:/system/site-packages',
      PYTHONUSERBASE: 'C:/system/user-site',
      VIRTUAL_ENV: 'C:/venv',
      CONDA_PREFIX: 'C:/conda',
      CONDA_SHLVL: '1',
      PYENV_ROOT: 'C:/pyenv',
      CUSTOM_SETTING: 'kept',
    }
    const env = createManagedPythonEnvironment(source, 'C:/ZeroWall/Python')
    expect(env.Path?.split(';').slice(0, 2)).toEqual(['C:/ZeroWall/Python', join('C:/ZeroWall/Python', 'Scripts')])
    expect(env.Path).toContain('C:/system-tools')
    expect(env.ZEROWALL_PYTHON_RUNTIME_ROOT).toBe('C:/ZeroWall/Python')
    expect(env.ZEROWALL_PYTHON_EXECUTABLE).toBe(join('C:/ZeroWall/Python', 'python.exe'))
    expect(env.PYTHONHOME).toBeUndefined()
    expect(env.PYTHONPATH).toBeUndefined()
    expect(env.PYTHONUSERBASE).toBeUndefined()
    expect(env.VIRTUAL_ENV).toBeUndefined()
    expect(env.CONDA_PREFIX).toBeUndefined()
    expect(env.CONDA_SHLVL).toBeUndefined()
    expect(env.PYENV_ROOT).toBeUndefined()
    expect(env.CUSTOM_SETTING).toBe('kept')
    expect(source.PYTHONHOME).toBe('C:/Program Files/Python312')
  })

  it('applies the fixed runtime environment to later internal child processes', () => {
    const env: NodeJS.ProcessEnv = { PATH: 'C:/Windows', PYTHONHOME: 'C:/system-python' }
    applyManagedPythonEnvironment(env, 'C:/ZeroWall/Python')
    const pathKey = Object.keys(env).find(key => key.toUpperCase() === 'PATH')!
    expect(env[pathKey]?.split(';').slice(0, 2)).toEqual(['C:/ZeroWall/Python', join('C:/ZeroWall/Python', 'Scripts')])
    expect(env.ZEROWALL_PYTHON_EXECUTABLE).toBe(join('C:/ZeroWall/Python', 'python.exe'))
    expect(env.PYTHONHOME).toBeUndefined()
    expect(env.PYTHONNOUSERSITE).toBe('1')
  })

  it('removes inherited directories that can resolve an external Python launcher', async () => {
    const root = await mkdtemp(join(tmpdir(), 'managed-python-path-')); temporaryRoots.push(root)
    const external = join(root, 'unmarked-tools'); const tools = join(root, 'tools')
    await writeFile(join(root, 'marker.txt'), 'fixture')
    await mkdir(external, { recursive: true })
    await mkdir(tools, { recursive: true })
    await writeFile(join(external, 'python.exe'), 'external')
    const env = createManagedPythonEnvironment({ PATH: [external, tools].join(';') }, join(root, 'managed'))
    expect(env.PATH).toContain(tools)
    expect(env.PATH).not.toContain(external)
  })

  it('removes common Windows Python, WindowsApps, and virtualenv PATH entries while retaining Windows and Node paths', () => {
    if (process.platform !== 'win32') return
    const inherited = [
      'C:\\Program Files\\Python312',
      'C:\\Users\\tester\\AppData\\Local\\Microsoft\\WindowsApps',
      'C:\\work\\.venv\\Scripts',
      'C:\\Windows\\System32',
      'C:\\softworks\\nodejs',
    ].join(';')
    const env = createManagedPythonEnvironment({ Path: inherited }, 'C:\\ZeroWall\\Python')
    const entries = env.Path?.split(';') ?? []
    expect(entries.slice(0, 2)).toEqual(['C:\\ZeroWall\\Python', 'C:\\ZeroWall\\Python\\Scripts'])
    expect(entries).toContain('C:\\Windows\\System32')
    expect(entries).toContain('C:\\softworks\\nodejs')
    expect(entries.join(';')).not.toMatch(/Python312|WindowsApps|\\.venv\\/iu)
    expect(Object.keys(env).filter(key => key.toUpperCase() === 'PATH')).toHaveLength(1)
  })

  it('resolves PowerShell python to the managed runtime and never falls back when it is absent', async () => {
    if (process.platform !== 'win32') return
    const root = await mkdtemp(join(tmpdir(), 'managed-python-pwsh-')); temporaryRoots.push(root)
    const managedRoot = join(root, 'ZeroWall', 'Python')
    const externalRoot = join(root, 'unmarked-system-tools')
    const shimRoot = await prepareManagedPythonShims(root)
    await mkdir(managedRoot, { recursive: true })
    await mkdir(externalRoot, { recursive: true })
    await writeFile(join(managedRoot, 'python.exe'), 'managed fixture')
    await writeFile(join(externalRoot, 'python.exe'), 'system fixture')

    const powershell = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    const launch = (runtimePath: string) => {
      const env = createManagedPythonEnvironment({
        ...process.env,
        PATH: [externalRoot, process.env.PATH].filter(Boolean).join(';'),
      }, runtimePath, shimRoot)
      return spawnSync(powershell, [
        '-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
        "(Get-Command python -ErrorAction Stop).Source",
      ], { env, encoding: 'utf8', windowsHide: true })
    }

    const managed = launch(managedRoot)
    expect(managed.error).toBeUndefined()
    expect(managed.status).toBe(0)
    expect(managed.stdout.trim()).toBe(join(managedRoot, 'python.exe'))

    const unavailable = launch(join(root, 'missing-runtime'))
    expect(unavailable.error).toBeUndefined()
    expect(unavailable.status).toBe(0)
    expect(unavailable.stdout.trim()).toBe(join(shimRoot, 'python.cmd'))
    const missingEnv = createManagedPythonEnvironment({ ...process.env, PATH: [externalRoot, process.env.PATH].filter(Boolean).join(';') }, join(root, 'missing-runtime'), shimRoot)
    const missingRun = spawnSync(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', 'python --version'], { env: missingEnv, encoding: 'utf8', windowsHide: true })
    expect(missingRun.error, JSON.stringify(missingRun)).toBeUndefined()
    expect(`${missingRun.stdout}\n${missingRun.stderr}`, JSON.stringify(missingRun)).toContain('PYTHON_ENVIRONMENT_UNAVAILABLE')
    expect(`${missingRun.stdout}\n${missingRun.stderr}`).not.toContain('system fixture')
  })

  it('carries the fixed interpreter through the actual desktop Host launch environment', async () => {
    if (process.platform !== 'win32') return
    const root = await mkdtemp(join(tmpdir(), 'managed-python-host-launch-')); temporaryRoots.push(root)
    const managedRoot = join(root, 'Program Files', 'ZeroWallScience', 'Python')
    const externalRoot = join(root, 'system-tools')
    const userData = join(root, 'user-data')
    const shimRoot = await prepareManagedPythonShims(userData)
    await mkdir(managedRoot, { recursive: true })
    await mkdir(externalRoot, { recursive: true })
    await writeFile(join(managedRoot, 'python.exe'), 'managed fixture')
    await writeFile(join(externalRoot, 'python.exe'), 'system fixture')
    const inheritedPath = [externalRoot, process.env.PATH].filter(Boolean).join(';')
    const launch = buildHarnessSpawnOptions(root, {
      dshEntryPath: join(root, 'dsh.mjs'),
      runAsNode: false,
      userDataPath: userData,
      dshHome: join(userData, 'harness'),
      userSkillsPath: join(userData, 'harness', 'skills'),
      researchDbPath: join(userData, 'research.sqlite'),
      bundledSkillsPath: join(root, 'skills'),
      mcpEnvironmentRoot: join(managedRoot, '.zerowall'),
      pythonRuntimeRoot: managedRoot,
      pythonShimRoot: shimRoot,
    }, { ...process.env, Path: inheritedPath, PYTHONHOME: join(root, 'system-python') })
    const powershell = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    const checked = spawnSync(powershell, [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
      "Get-Command python,node -ErrorAction Stop | ForEach-Object { $_.Source }",
    ], { env: launch.env, encoding: 'utf8', windowsHide: true })
    expect(checked.error).toBeUndefined()
    expect(checked.status).toBe(0)
    const [pythonSource, nodeSource] = checked.stdout.trim().split(/\r?\n/u)
    expect(pythonSource).toBe(join(managedRoot, 'python.exe'))
    expect(nodeSource?.toLowerCase()).toBe(process.execPath.toLowerCase())
    expect(launch.env?.PYTHONHOME).toBeUndefined()
  })

})

it('uses verified read-only installer shims when user shim maintenance is unavailable', async () => {
  const bundled = resolve(import.meta.dirname, '../build/python-shims')
  expect(await verifyManagedPythonShims(bundled)).toBe(bundled)
  const root = await mkdtemp(join(tmpdir(), 'shim-reject-')); temporaryRoots.push(root)
  await writeFile(join(root, 'python.cmd'), 'unowned launcher')
  await expect(verifyManagedPythonShims(root)).rejects.toThrow(/PYTHON_SHIM_DIRECTORY_UNSAFE/)
})
