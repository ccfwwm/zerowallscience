import { dirname, join, resolve } from 'node:path'

export function fixedPythonShellPaths(info) {
  const runtimeRoot = typeof info?.runtimeRoot === 'string' && info.runtimeRoot.trim() ? resolve(info.runtimeRoot) : undefined
  if (!runtimeRoot || /(?:^|[\\/])(?:\.zerowall|slots)(?:[\\/]|$)/iu.test(runtimeRoot)) throw new Error('PYTHON_FIXED_PATH_REQUIRED: fixed runtime is not configured.')
  const executable = join(runtimeRoot, 'python.exe')
  for (const reported of [info.executable, info.runtimeExecutable]) if (reported && resolve(reported) !== executable) throw new Error('PYTHON_FIXED_PATH_REQUIRED: stale interpreter path.')
  return { runtimeRoot, executable, managementRoot: join(runtimeRoot, '.zerowall') }
}

function powerShellLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

export function buildPowerShellPythonCommand(runtimeRoot, executable) {
  const executableDirectory = dirname(executable)
  const directory = powerShellLiteral(executableDirectory)
  const python = powerShellLiteral(executable)
  const root = powerShellLiteral(runtimeRoot)
  // Enter a clearly-labelled managed shell. Starting Python immediately is
  // misleading: when the REPL exits, users see an indistinguishable parent
  // PowerShell where `pip` resolves to the system installation. The branded
  // prompt makes the scope visible, and both pip commands always use this
  // interpreter instead of a pip.exe launcher with a stale shebang.
  return `$ErrorActionPreference = 'Stop'; $env:ZEROWALL_PYTHON_RUNTIME_ROOT = ${root}; $env:ZEROWALL_PYTHON_ROOT = Join-Path ${root} '.zerowall'; $env:ZEROWALL_PYTHON_MANAGEMENT_ROOT = $env:ZEROWALL_PYTHON_ROOT; $env:ZEROWALL_PYTHON_EXECUTABLE = ${python}; $env:PYTHONNOUSERSITE = '1'; Remove-Item Env:PYTHONHOME -ErrorAction SilentlyContinue; Remove-Item Env:PYTHONPATH -ErrorAction SilentlyContinue; $currentPath = if ($null -eq $env:PATH) { '' } else { $env:PATH }; $env:PATH = ${directory} + ';' + (${directory} + '\\Scripts') + ';' + $currentPath; Set-Location -LiteralPath ${directory}; Remove-Item Alias:python,Alias:pip,Alias:pip3 -ErrorAction SilentlyContinue; function global:Invoke-ZeroWallPython {
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
}; function global:python { Invoke-ZeroWallPython @args }; function global:pip { Invoke-ZeroWallPython -m pip @args }; function global:pip3 { Invoke-ZeroWallPython -m pip @args }; function global:prompt { "[ZeroWall Python] $((Get-Location).Path)> " }; Write-Host ('ZeroWall Python environment: ' + $env:ZEROWALL_PYTHON_EXECUTABLE)`
}

export function buildCmdPythonCommand(runtimeRoot, executable) {
  const quote = value => `"${String(value).replaceAll('"', '""')}` + '"'
  const executableDirectory = dirname(executable)
  const directory = quote(executableDirectory)
  const python = `powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File ${quote(join(import.meta.dirname, "python-exec.ps1"))}`
  // `doskey` macros bind commands for this interactive cmd session. Do not
  // launch the REPL automatically; the user lands at a shell prompt where
  // `python` and `pip` both resolve to the managed runtime.
  return `set "ZEROWALL_PYTHON_RUNTIME_ROOT=${String(runtimeRoot).replaceAll('"', '""')}" & set "ZEROWALL_PYTHON_ROOT=${join(runtimeRoot, '.zerowall').replaceAll('"', '""')}" & set "ZEROWALL_PYTHON_MANAGEMENT_ROOT=${join(runtimeRoot, '.zerowall').replaceAll('"', '""')}" & set "ZEROWALL_PYTHON_EXECUTABLE=${String(executable).replaceAll('"', '""')}" & set "PYTHONNOUSERSITE=1" & set "PYTHONHOME=" & set "PYTHONPATH=" & set "PATH=${String(executableDirectory).replaceAll('"', '""')};${String(executableDirectory).replace(/[\\/]$/u, '')}\\Scripts;%PATH%" & cd /d ${directory} & prompt [ZeroWall Python] $P$G & doskey python=${python} $* & doskey pip=${python} -m pip $* & doskey pip3=${python} -m pip $* & echo ZeroWall Python environment: ${executable.replaceAll('"', '""')}`
}
