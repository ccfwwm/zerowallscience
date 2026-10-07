import { dirname } from 'node:path'

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
  return `$ErrorActionPreference = 'Stop'; $env:ZEROWALL_PYTHON_ROOT = ${root}; $env:ZEROWALL_PYTHON_EXECUTABLE = ${python}; $env:PYTHONNOUSERSITE = '1'; Remove-Item Env:PYTHONHOME -ErrorAction SilentlyContinue; Remove-Item Env:PYTHONPATH -ErrorAction SilentlyContinue; $currentPath = if ($null -eq $env:PATH) { '' } else { $env:PATH }; $env:PATH = ${directory} + ';' + (${directory} + '\\Scripts') + ';' + $currentPath; Set-Location -LiteralPath ${directory}; Remove-Item Alias:python,Alias:pip,Alias:pip3 -ErrorAction SilentlyContinue; function global:python { & $env:ZEROWALL_PYTHON_EXECUTABLE @args }; function global:pip { & $env:ZEROWALL_PYTHON_EXECUTABLE -m pip @args }; function global:pip3 { & $env:ZEROWALL_PYTHON_EXECUTABLE -m pip @args }; function global:prompt { "[ZeroWall Python] $((Get-Location).Path)> " }; Write-Host ('ZeroWall Python environment: ' + $env:ZEROWALL_PYTHON_EXECUTABLE)`
}

export function buildCmdPythonCommand(runtimeRoot, executable) {
  const quote = value => `"${String(value).replaceAll('"', '""')}` + '"'
  const executableDirectory = dirname(executable)
  const directory = quote(executableDirectory)
  const python = quote(executable)
  // `doskey` macros bind commands for this interactive cmd session. Do not
  // launch the REPL automatically; the user lands at a shell prompt where
  // `python` and `pip` both resolve to the managed runtime.
  return `set "ZEROWALL_PYTHON_ROOT=${String(runtimeRoot).replaceAll('"', '""')}" & set "ZEROWALL_PYTHON_EXECUTABLE=${String(executable).replaceAll('"', '""')}" & set "PYTHONNOUSERSITE=1" & set "PYTHONHOME=" & set "PYTHONPATH=" & set "PATH=${String(executableDirectory).replaceAll('"', '""')};${String(executableDirectory).replace(/[\\/]$/u, '')}\\Scripts;%PATH%" & cd /d ${directory} & prompt [ZeroWall Python] $P$G & doskey python=${python} $* & doskey pip=${python} -m pip $* & doskey pip3=${python} -m pip $* & echo ZeroWall Python environment: ${executable.replaceAll('"', '""')}`
}
