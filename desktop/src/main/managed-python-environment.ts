import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { lstat, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { delimiter, join } from 'node:path'

const PYTHON_SELECTOR_VARIABLES = new Set([
  'PYTHONHOME', 'PYTHONPATH', 'PYTHONUSERBASE', 'PYTHONEXECUTABLE', 'PYTHONSTARTUP',
  'VIRTUAL_ENV', 'VIRTUAL_ENV_PROMPT', 'CONDA_PREFIX', 'CONDA_DEFAULT_ENV', 'CONDA_SHLVL',
  'PYENV_ROOT', 'PYENV_VERSION',
])
const PYTHON_LAUNCHERS = [
  'python.exe', 'python3.exe', 'pythonw.exe', 'python.cmd', 'python.bat', 'python.ps1', 'python3.cmd', 'python3.bat', 'python3.ps1',
  'py.exe', 'py.cmd', 'py.bat', 'py.ps1', 'pip.exe', 'pip3.exe', 'pip.cmd', 'pip3.cmd', 'pip.bat', 'pip3.bat', 'pip.ps1', 'pip3.ps1',
] as const

/**
 * Windows commonly exposes a Python launcher through a directory whose name
 * does not contain the executable (for example WindowsApps or a virtualenv
 * Scripts directory).  Those directories must not survive into a managed
 * child environment: when the bundled interpreter is being bootstrapped a
 * bare `python` command must fail clearly instead of selecting the machine's
 * interpreter.
 */
const EXTERNAL_PYTHON_DIRECTORY = /(?:^|[\\/])(?:python(?:\d+(?:\.\d+)*)?|py(?:thon)?(?:\d+(?:\.\d+)*)?|(?:mini)?conda(?:\d+(?:\.\d+)*)?|(?:mini)?mamba(?:\d+(?:\.\d+)*)?|anaconda(?:\d+(?:\.\d+)*)?|miniforge(?:\d+(?:\.\d+)*)?|mambaforge(?:\d+(?:\.\d+)*)?|pyenv(?:-win)?|(?:\.?)venv|virtualenv|windowsapps)(?:[\\/]|$)/iu

/**
 * A bundled runtime is installed asynchronously.  During that short window
 * an inherited WindowsApps/Program Files entry must not silently win `python`
 * resolution.  Keep the entry only when it does not contain a Python launcher;
 * the fixed runtime and Scripts directory are added explicitly below.
 */
export function filterExternalPythonPath(pathValue: string | undefined): string | undefined {
  if (!pathValue) return pathValue
  const kept = pathValue.split(delimiter).filter(segment => {
    const candidate = segment.trim()
    if (!candidate) return false
    if (EXTERNAL_PYTHON_DIRECTORY.test(candidate)) return false
    return !PYTHON_LAUNCHERS.some(name => existsSync(join(candidate, name)))
  })
  return kept.join(delimiter)
}

const PYTHON_SHIMS: Readonly<Record<string, string>> = {
  'python.cmd': '@echo off\r\nREM ZeroWall managed Python command shim\r\nsetlocal\r\nif not defined ZEROWALL_PYTHON_EXECUTABLE (echo PYTHON_ENVIRONMENT_UNAVAILABLE: bundled ZeroWall Python is not configured. 1>&2 & exit /b 9009)\r\nif not exist "%ZEROWALL_PYTHON_EXECUTABLE%" (echo PYTHON_ENVIRONMENT_UNAVAILABLE: bundled ZeroWall Python is not ready. 1>&2 & exit /b 9009)\r\n"%ZEROWALL_PYTHON_EXECUTABLE%" %*\r\nexit /b %ERRORLEVEL%\r\n',
  'python3.cmd': '@echo off\r\nREM ZeroWall managed Python command shim\r\ncall "%~dp0python.cmd" %*\r\nexit /b %ERRORLEVEL%\r\n',
  'py.cmd': '@echo off\r\nREM ZeroWall managed Python command shim\r\ncall "%~dp0python.cmd" %*\r\nexit /b %ERRORLEVEL%\r\n',
  'pip.cmd': '@echo off\r\nREM ZeroWall managed Python command shim\r\nsetlocal\r\nif not defined ZEROWALL_PYTHON_EXECUTABLE (echo PYTHON_ENVIRONMENT_UNAVAILABLE: bundled ZeroWall Python is not configured. 1>&2 & exit /b 9009)\r\nif not exist "%ZEROWALL_PYTHON_EXECUTABLE%" (echo PYTHON_ENVIRONMENT_UNAVAILABLE: bundled ZeroWall Python is not ready. 1>&2 & exit /b 9009)\r\n"%ZEROWALL_PYTHON_EXECUTABLE%" -m pip %*\r\nexit /b %ERRORLEVEL%\r\n',
  'pip3.cmd': '@echo off\r\nREM ZeroWall managed Python command shim\r\ncall "%~dp0pip.cmd" %*\r\nexit /b %ERRORLEVEL%\r\n',
}

/**
 * Create a private PATH directory whose command shims always dispatch through
 * the fixed runtime variable. A missing runtime therefore fails explicitly
 * instead of falling through to a Python installation elsewhere on PATH.
 */
export async function prepareManagedPythonShims(parentDirectory: string): Promise<string> {
  if (process.platform !== 'win32') throw new Error('Managed Python command shims are available only on Windows.')
  const root = join(parentDirectory, 'python-shims')
  await mkdir(root, { recursive: true })
  const directory = await lstat(root)
  if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error('PYTHON_SHIM_DIRECTORY_UNSAFE: expected a real ZeroWall-owned directory.')

  const allowed = new Set(Object.keys(PYTHON_SHIMS))
  for (const name of await readdir(root)) {
    if (!allowed.has(name) && !/^\.python-[0-9a-f-]+\.tmp$/iu.test(name)) {
      throw new Error(`PYTHON_SHIM_DIRECTORY_UNSAFE: unexpected entry "${name}".`)
    }
    if (/^\.python-[0-9a-f-]+\.tmp$/iu.test(name)) await rm(join(root, name), { force: true })
  }

  for (const [name, content] of Object.entries(PYTHON_SHIMS)) {
    const path = join(root, name)
    const existing = await lstat(path).catch(error => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      throw error
    })
    if (existing) {
      if (!existing.isFile() || existing.isSymbolicLink()) throw new Error(`PYTHON_SHIM_DIRECTORY_UNSAFE: "${name}" is not a regular file.`)
      const current = await readFile(path, 'utf8')
      if (current === content) continue
      if (!current.startsWith('@echo off\r\nREM ZeroWall managed Python command shim\r\n')) throw new Error(`PYTHON_SHIM_DIRECTORY_UNSAFE: refusing to replace unowned file "${name}".`)
    }
    const temporary = join(root, `.python-${randomUUID()}.tmp`)
    try {
      await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' })
      await rename(temporary, path)
    } finally { await rm(temporary, { force: true }).catch(() => undefined) }
  }
  return root
}

/** Return a child environment that resolves Python to the fixed bundled runtime. */
export function createManagedPythonEnvironment(base: NodeJS.ProcessEnv, runtimeRoot: string, shimRoot = base.ZEROWALL_PYTHON_SHIM_ROOT): NodeJS.ProcessEnv {
  const env = { ...base }
  const pathKey = Object.keys(env).find(key => key.toUpperCase() === 'PATH') ?? 'PATH'
  const inheritedPath = filterExternalPythonPath(env[pathKey])
  for (const key of Object.keys(env)) {
    const normalized = key.toUpperCase()
    if (normalized === 'PATH' || PYTHON_SELECTOR_VARIABLES.has(normalized)) delete env[key]
  }
  // Put the real bundled executable first so command discovery reports the
  // product runtime. The shims remain before inherited PATH as a fail-closed
  // fallback when the bundled runtime has not finished installing.
  env[pathKey] = [runtimeRoot, join(runtimeRoot, 'Scripts'), shimRoot, inheritedPath].filter(Boolean).join(delimiter)
  env.ZEROWALL_PYTHON_RUNTIME_ROOT = runtimeRoot
  env.ZEROWALL_PYTHON_EXECUTABLE = join(runtimeRoot, 'python.exe')
  if (shimRoot) env.ZEROWALL_PYTHON_SHIM_ROOT = shimRoot
  env.ZEROWALL_PYTHON_ROOT = join(runtimeRoot, '.zerowall')
  env.ZEROWALL_PYTHON_MANAGEMENT_ROOT = env.ZEROWALL_PYTHON_ROOT
  env.ZEROWALL_MCP_ENVIRONMENT_ROOT = env.ZEROWALL_PYTHON_ROOT
  env.PYTHONNOUSERSITE = '1'
  env.PYTHONUTF8 = '1'
  env.PYTHONIOENCODING = 'utf-8'
  return env
}

/** Make all later internal processes inherit the same fixed Python boundary. */
export function applyManagedPythonEnvironment(target: NodeJS.ProcessEnv, runtimeRoot: string, shimRoot?: string): void {
  const env = createManagedPythonEnvironment(target, runtimeRoot, shimRoot)
  for (const key of Object.keys(target)) if (!(key in env)) delete target[key]
  Object.assign(target, env)
}

/** Read-only fallback from the installer; never uses a system interpreter. */
export async function verifyManagedPythonShims(root: string): Promise<string> {
  const info = await lstat(root)
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('PYTHON_SHIM_DIRECTORY_UNSAFE')
  for (const [name, content] of Object.entries(PYTHON_SHIMS)) {
    const file = join(root, name), entry = await lstat(file)
    if (!entry.isFile() || entry.isSymbolicLink() || await readFile(file, 'utf8') !== content) throw new Error('PYTHON_SHIM_DIRECTORY_UNSAFE: ' + file)
  }
  return root
}
