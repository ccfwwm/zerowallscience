import { dirname, join, relative, isAbsolute } from 'node:path'

export interface PythonTerminalLaunch {
  cwd: string
  args: string[]
  env: NodeJS.ProcessEnv
}

export function managedPythonTerminalPaths(
  info: { runtimeRoot?: unknown; executable?: unknown } | null | undefined,
  fallbackRuntimeRoot: string,
): { runtimeRoot: string; executable: string } {
  const runtimeRoot = typeof info?.runtimeRoot === 'string' && info.runtimeRoot.trim() ? info.runtimeRoot : fallbackRuntimeRoot
  const executable = typeof info?.executable === 'string' && info.executable.trim() ? info.executable : join(runtimeRoot, 'python.exe')
  return { runtimeRoot, executable }
}

function powerShellLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

/** Start an interactive interpreter in a new Windows console. Quote paths as
 * PowerShell literals instead of depending on environment-variable expansion;
 * this keeps the launch reliable when a parent process has a sparse env. */
export function createPythonTerminalLaunch(runtimeRoot: string, executable: string, baseEnv: NodeJS.ProcessEnv): PythonTerminalLaunch {
  const relativeExecutable = relative(runtimeRoot, executable)
  if (!relativeExecutable || relativeExecutable.startsWith('..') || isAbsolute(relativeExecutable)) throw new Error('Python executable must be inside the managed runtime.')
  const executableDirectory = dirname(executable)
  const scriptsDirectory = join(executableDirectory, 'Scripts')
  const env: NodeJS.ProcessEnv = {
    ...baseEnv,
    PYTHONNOUSERSITE: '1',
    ZEROWALL_PYTHON_ROOT: runtimeRoot,
    ZEROWALL_PYTHON_EXECUTABLE: executable,
    PATH: [executableDirectory, scriptsDirectory, baseEnv.PATH].filter(Boolean).join(';'),
  }
  delete env.PYTHONHOME
  delete env.PYTHONPATH
  const rootLiteral = powerShellLiteral(runtimeRoot)
  const directoryLiteral = powerShellLiteral(executableDirectory)
  const executableLiteral = powerShellLiteral(executable)
  return {
    cwd: executableDirectory,
    args: [
      '-NoLogo',
      '-NoExit',
      '-Command',
      `$ErrorActionPreference = 'Stop'; $env:ZEROWALL_PYTHON_ROOT = ${rootLiteral}; $env:ZEROWALL_PYTHON_EXECUTABLE = ${executableLiteral}; $env:PYTHONNOUSERSITE = '1'; Remove-Item Env:PYTHONHOME -ErrorAction SilentlyContinue; Remove-Item Env:PYTHONPATH -ErrorAction SilentlyContinue; $currentPath = if ($null -eq $env:PATH) { '' } else { $env:PATH }; $env:PATH = ${directoryLiteral} + ';' + (${directoryLiteral} + '\\Scripts') + ';' + $currentPath; Set-Location -LiteralPath ${directoryLiteral}; Remove-Item Alias:python,Alias:pip,Alias:pip3 -ErrorAction SilentlyContinue; function global:python { & $env:ZEROWALL_PYTHON_EXECUTABLE @args }; function global:pip { & $env:ZEROWALL_PYTHON_EXECUTABLE -m pip @args }; function global:pip3 { & $env:ZEROWALL_PYTHON_EXECUTABLE -m pip @args }; function global:prompt { "[ZeroWall Python] $((Get-Location).Path)> " }; Write-Host ('ZeroWall Python environment: ' + $env:ZEROWALL_PYTHON_EXECUTABLE)`,
    ],
    env,
  }
}
