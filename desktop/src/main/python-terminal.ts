import { dirname, join, relative, isAbsolute, resolve } from 'node:path'

export interface PythonTerminalLaunch {
  cwd: string
  args: string[]
  env: NodeJS.ProcessEnv
}

export function managedPythonTerminalPaths(
  info: { runtimeRoot?: unknown; executable?: unknown } | null | undefined,
  fallbackRuntimeRoot: string,
): { runtimeRoot: string; executable: string } {
  const runtimeRoot = fallbackRuntimeRoot
  const executable = join(runtimeRoot, 'python.exe')
  if (typeof info?.executable === 'string' && resolve(info.executable) !== resolve(executable)) throw new Error('PYTHON_FIXED_PATH_REQUIRED: stale interpreter path.')
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
  if (resolve(executable) !== resolve(runtimeRoot, 'python.exe')) throw new Error('PYTHON_FIXED_PATH_REQUIRED: terminal must use the fixed interpreter.')
  const executableDirectory = dirname(executable)
  const scriptsDirectory = join(executableDirectory, 'Scripts')
  const env: NodeJS.ProcessEnv = {
    ...baseEnv,
    PYTHONNOUSERSITE: '1',
    ZEROWALL_PYTHON_ROOT: join(runtimeRoot, '.zerowall'),
    ZEROWALL_PYTHON_MANAGEMENT_ROOT: join(runtimeRoot, '.zerowall'),
    ZEROWALL_PYTHON_RUNTIME_ROOT: runtimeRoot,
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
      `$ErrorActionPreference = 'Stop'; $env:ZEROWALL_PYTHON_RUNTIME_ROOT = ${rootLiteral}; $env:ZEROWALL_PYTHON_ROOT = Join-Path ${rootLiteral} '.zerowall'; $env:ZEROWALL_PYTHON_MANAGEMENT_ROOT = $env:ZEROWALL_PYTHON_ROOT; $env:ZEROWALL_PYTHON_EXECUTABLE = ${executableLiteral}; $env:PYTHONNOUSERSITE = '1'; Remove-Item Env:PYTHONHOME -ErrorAction SilentlyContinue; Remove-Item Env:PYTHONPATH -ErrorAction SilentlyContinue; $currentPath = if ($null -eq $env:PATH) { '' } else { $env:PATH }; $env:PATH = ${directoryLiteral} + ';' + (${directoryLiteral} + '\\Scripts') + ';' + $currentPath; Set-Location -LiteralPath ${directoryLiteral}; Remove-Item Alias:python,Alias:pip,Alias:pip3 -ErrorAction SilentlyContinue;
function global:Invoke-ZeroWallPython {
  $manager = $env:ZEROWALL_PYTHON_MANAGEMENT_ROOT; $lock = Join-Path $manager 'write-lock.json'
  if (Test-Path -LiteralPath $lock) { throw 'PYTHON_RUNTIME_UPDATING' }
  $leases = Join-Path $manager 'leases'; [IO.Directory]::CreateDirectory($leases) | Out-Null
  $lease = Join-Path $leases ($PID.ToString() + '-' + [guid]::NewGuid().ToString() + '.json')
  try {
    $json = @{pid=$PID;kind='terminal';snapshot=$env:ZEROWALL_PYTHON_RUNTIME_ROOT} | ConvertTo-Json -Compress
    [IO.File]::WriteAllText($lease, $json, [Text.UTF8Encoding]::new($false))
    if (Test-Path -LiteralPath $lock) { throw 'PYTHON_RUNTIME_UPDATING' }
    & $env:ZEROWALL_PYTHON_EXECUTABLE @args
  } finally { [IO.File]::Delete($lease) }
}
function global:python { Invoke-ZeroWallPython @args }; function global:pip { Invoke-ZeroWallPython -m pip @args }; function global:pip3 { Invoke-ZeroWallPython -m pip @args }; function global:prompt { "[ZeroWall Python] $((Get-Location).Path)> " }; Write-Host ('ZeroWall Python environment: ' + $env:ZEROWALL_PYTHON_EXECUTABLE)`,
    ],
    env,
  }
}
